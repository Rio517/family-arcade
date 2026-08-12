/**
 * Peer-to-peer transport built on PeerJS (WebRTC).
 *
 * Two devices connect with nothing but a short shared *game code*:
 *   • The host registers a peer whose id is derived from the code, then waits.
 *   • The guest dials that same id.
 *
 * PeerJS's free public broker handles only the initial handshake; game data
 * then flows directly device-to-device. This class is deliberately dumb about
 * game rules — it moves opaque `Message`s and reports connection status. All
 * the resume/replay intelligence lives in the game layer, so when a link drops
 * and re-opens the app just re-runs its sync handshake over the new channel.
 *
 * Connections are opened with `reliable: true` (SCTP reliable, ordered). The
 * game layer relies on that guarantee: a message is never silently lost while
 * the channel stays open — a real failure closes the channel, which surfaces as
 * a reconnect and a full log resync. That is why the protocol only ever has to
 * reconcile prefix-compatible logs.
 */

import Peer, { type DataConnection } from 'peerjs';

export type ConnStatus =
  | 'idle'
  | 'hosting' // host is registered and waiting for a guest
  | 'dialing' // guest is trying to reach the host
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface ConnectionHandlers<TMessage> {
  onStatus: (status: ConnStatus, detail?: string) => void;
  onMessage: (msg: TMessage) => void;
  /** Fires each time a data channel freshly opens — the cue to (re)sync. */
  onOpen: () => void;
}

/**
 * Per-game transport configuration. Each game supplies its own broker-id
 * `prefix` (so two games' 4-char codes never collide on the same peer id) and
 * an `isMessage` guard that validates inbound data before it reaches the game
 * layer — the single choke point that keeps malformed/forged wire data out.
 */
export interface ConnectionConfig<TMessage> {
  prefix: string;
  isMessage: (value: unknown) => value is TMessage;
}

const DIAL_RETRY_MS = 2500;
const DIAL_TIMEOUT_MS = 20000;

/** Characters chosen to avoid look-alikes (no O/0, I/1, L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateCode(rng: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  return s;
}

export function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .split('')
    .filter((ch) => CODE_ALPHABET.includes(ch))
    .join('')
    .slice(0, 4);
}

const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
};

export class GameConnection<TMessage> {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private handlers: ConnectionHandlers<TMessage>;
  private prefix: string;
  private isMessage: (value: unknown) => value is TMessage;
  private role: 'host' | 'guest' = 'host';
  private code = '';
  private dialTimer: ReturnType<typeof setTimeout> | null = null;
  private dialDeadline = 0;
  private destroyed = false;

  constructor(handlers: ConnectionHandlers<TMessage>, config: ConnectionConfig<TMessage>) {
    this.handlers = handlers;
    this.prefix = config.prefix;
    this.isMessage = config.isMessage;
  }

  private peerIdForCode(code: string): string {
    return this.prefix + code;
  }

  /** Host a new game. Returns the code the guest must enter. */
  host(code: string): void {
    this.role = 'host';
    this.code = code;
    this.destroyed = false;
    this.handlers.onStatus('hosting');
    this.createPeer(this.peerIdForCode(code));
  }

  /** Join an existing game by code. */
  join(code: string): void {
    this.role = 'guest';
    this.code = code;
    this.destroyed = false;
    this.handlers.onStatus('dialing');
    this.dialDeadline = Date.now() + DIAL_TIMEOUT_MS;
    this.createPeer(undefined);
  }

  send(msg: TMessage): boolean {
    if (this.conn && this.conn.open) {
      this.conn.send(msg);
      return true;
    }
    return false;
  }

  destroy(): void {
    this.destroyed = true;
    if (this.dialTimer) clearTimeout(this.dialTimer);
    this.dialTimer = null;
    this.conn?.close();
    this.peer?.destroy();
    this.conn = null;
    this.peer = null;
  }

  // ── internals ─────────────────────────────────────────────────────────

  private createPeer(id: string | undefined): void {
    const peer = id ? new Peer(id, { config: ICE }) : new Peer({ config: ICE });
    this.peer = peer;

    peer.on('open', () => {
      if (this.destroyed) return;
      if (this.role === 'guest') this.dial();
    });

    peer.on('connection', (conn) => {
      if (this.destroyed) return;
      // One guest at a time. While a channel is live, a NEW incoming
      // connection is a stranger who learned the code (the ids are guessable
      // on the public broker) — refuse it rather than adopt it, or they'd be
      // handed the hello + full log sync and kick the real guest off. The
      // legitimate guest reconnecting only ever arrives after their old
      // channel closed, so this never blocks a resume.
      if (this.conn && this.conn.open && this.conn !== conn) {
        try {
          conn.on('open', () => conn.close());
          conn.close();
        } catch {
          /* refusing a stranger must never hurt the live game */
        }
        return;
      }
      // Host accepts the (re)connecting guest, replacing any stale channel.
      this.bindConnection(conn);
    });

    peer.on('disconnected', () => {
      if (this.destroyed) return;
      this.handlers.onStatus('reconnecting', 'Broker link dropped');
      try {
        peer.reconnect();
      } catch {
        /* peer already destroyed */
      }
    });

    peer.on('error', (err: { type?: string; message?: string }) => {
      if (this.destroyed) return;
      if (err.type === 'peer-unavailable') {
        // Host isn't online yet (or wrong code) — keep retrying until timeout.
        if (this.role === 'guest') this.scheduleDial();
        return;
      }
      if (err.type === 'unavailable-id') {
        this.handlers.onStatus('error', 'That code is already in use — start a new game.');
        return;
      }
      if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
        this.handlers.onStatus('reconnecting', 'Network hiccup — retrying…');
        return;
      }
      this.handlers.onStatus('error', err.message ?? 'Connection error');
    });
  }

  private dial(): void {
    if (this.destroyed || !this.peer) return;
    if (Date.now() > this.dialDeadline) {
      this.handlers.onStatus('error', 'Could not reach that game. Check the code and that the host is online.');
      return;
    }
    const conn = this.peer.connect(this.peerIdForCode(this.code), { reliable: true });
    this.bindConnection(conn);
    // If it doesn't open promptly, try again.
    this.scheduleDial();
  }

  private scheduleDial(): void {
    if (this.role !== 'guest' || this.destroyed) return;
    if (this.dialTimer) clearTimeout(this.dialTimer);
    this.dialTimer = setTimeout(() => {
      if (!this.conn || !this.conn.open) this.dial();
    }, DIAL_RETRY_MS);
  }

  private bindConnection(conn: DataConnection): void {
    // Drop any previous channel in favour of this one. Detach its listeners
    // first so a late 'close'/'error' from the stale conn can't fire after we've
    // already switched — otherwise it could stomp the new conn's 'connected'
    // status and schedule spurious re-dials.
    if (this.conn && this.conn !== conn) {
      try {
        this.conn.removeAllListeners();
        this.conn.close();
      } catch {
        /* ignore */
      }
    }
    this.conn = conn;

    // Every handler also verifies it's still the active connection, guarding
    // against events that were already queued when we swapped conns.
    const isCurrent = () => !this.destroyed && this.conn === conn;

    conn.on('open', () => {
      if (!isCurrent()) return;
      if (this.dialTimer) clearTimeout(this.dialTimer);
      this.dialTimer = null;
      this.handlers.onStatus('connected');
      this.handlers.onOpen();
    });

    conn.on('data', (data: unknown) => {
      if (!isCurrent()) return;
      if (this.isMessage(data)) this.handlers.onMessage(data);
    });

    conn.on('close', () => {
      if (!isCurrent()) return;
      this.handlers.onStatus('reconnecting', 'Opponent link closed');
      if (this.role === 'guest') {
        this.dialDeadline = Date.now() + DIAL_TIMEOUT_MS;
        this.scheduleDial();
      }
      // Host simply waits for the guest's peer to re-connect.
    });

    conn.on('error', () => {
      if (!isCurrent()) return;
      this.handlers.onStatus('reconnecting');
    });
  }
}
