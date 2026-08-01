/**
 * Peer-to-peer voice + optional video, riding the same WebRTC/PeerJS stack the
 * game data uses (see ADR 0003 / 0007). No media server: the two devices pair on
 * the **same game code** as the data link, on a media-specific broker id, and
 * stream directly to each other.
 *
 * Model:
 *   • Voice is the default; the camera is opt-in (we only `getUserMedia` video
 *     when the player turns it on, so the camera permission is requested only
 *     then).
 *   • The guest always dials; the host always answers. Mute is a cheap track
 *     toggle. Turning the camera on/off swaps the local stream and re-opens the
 *     call (PeerJS media calls don't renegotiate tracks in place), which the
 *     guest-dials / host-answers reconnect path handles for either side.
 *
 * This module is deliberately dumb about games — it moves media and reports
 * status. A game opts in by constructing a link with its code + role.
 */
import Peer, { type MediaConnection } from 'peerjs';

export type CallStatus = 'idle' | 'requesting' | 'connecting' | 'live' | 'denied' | 'error';

export type Role = 'host' | 'guest';

export interface MediaHandlers {
  onStatus: (status: CallStatus, detail?: string) => void;
  onLocalStream: (stream: MediaStream | null) => void;
  onRemoteStream: (stream: MediaStream | null) => void;
}

const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
};

const DIAL_RETRY_MS = 2500;

export class MediaLink {
  private peer: Peer | null = null;
  private call: MediaConnection | null = null;
  private local: MediaStream | null = null;
  private role: Role = 'guest';
  private code = '';
  private cameraOn = false;
  private muted = false;
  private destroyed = false;
  private cameraBusy = false;
  private dialTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private handlers: MediaHandlers,
    private prefix = 'racall-v1-',
  ) {}

  get isCameraOn(): boolean {
    return this.cameraOn;
  }
  get isMuted(): boolean {
    return this.muted;
  }

  private mediaId(): string {
    return this.prefix + this.code;
  }

  /**
   * Ask for the mic (and camera if `withCamera`), then open the call. Requires a
   * user gesture upstream so the browser allows capture + autoplay.
   */
  async start(code: string, role: Role, withCamera = false): Promise<void> {
    this.code = code;
    this.role = role;
    this.cameraOn = withCamera;
    this.destroyed = false;
    this.handlers.onStatus('requesting');
    try {
      this.local = await this.capture(withCamera);
    } catch {
      this.handlers.onStatus('denied', 'Microphone/camera permission was blocked.');
      return;
    }
    if (this.destroyed) {
      this.stopLocal();
      return;
    }
    this.applyMute();
    this.handlers.onLocalStream(this.local);
    this.handlers.onStatus('connecting');
    this.createPeer();
  }

  /** Mute/unmute my microphone. Returns the new muted state. */
  toggleMute(): boolean {
    this.muted = !this.muted;
    this.applyMute();
    return this.muted;
  }

  /** Turn my camera on or off (re-opens the call with/without a video track). */
  async setCamera(on: boolean): Promise<void> {
    if (on === this.cameraOn || !this.code) return;
    // Ignore a second toggle while one is still capturing — otherwise two
    // getUserMedia calls race and can leave stream/track state inconsistent.
    if (this.cameraBusy) return;
    this.cameraBusy = true;
    try {
      let next: MediaStream;
      try {
        next = await this.capture(on);
      } catch {
        // A blocked camera must NOT drop the voice call. Report a non-fatal
        // status (not 'denied', which upstream treats as a full teardown) and
        // stay on whatever the call is currently doing, camera simply off.
        this.handlers.onStatus(this.call?.open ? 'live' : 'connecting', 'Camera permission was blocked.');
        return;
      }
      if (this.destroyed) {
        next.getTracks().forEach((t) => t.stop());
        return;
      }
      this.cameraOn = on;
      this.stopLocal();
      this.local = next;
      this.applyMute();
      this.handlers.onLocalStream(this.local);
      // Re-establish so the new track set actually reaches the other side.
      this.reopenCall();
    } finally {
      this.cameraBusy = false;
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.dialTimer) clearTimeout(this.dialTimer);
    this.dialTimer = null;
    this.call?.close();
    this.peer?.destroy();
    this.stopLocal();
    this.call = null;
    this.peer = null;
    this.handlers.onRemoteStream(null);
    this.handlers.onLocalStream(null);
  }

  // ── internals ──────────────────────────────────────────────────────────

  private capture(withCamera: boolean): Promise<MediaStream> {
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia) return Promise.reject(new Error('no getUserMedia'));
    return md.getUserMedia({ audio: true, video: withCamera });
  }

  private applyMute(): void {
    this.local?.getAudioTracks().forEach((t) => (t.enabled = !this.muted));
  }

  private stopLocal(): void {
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
  }

  private createPeer(): void {
    const id = this.role === 'host' ? this.mediaId() : undefined;
    const peer = id ? new Peer(id, { config: ICE }) : new Peer({ config: ICE });
    this.peer = peer;

    peer.on('open', () => {
      if (this.destroyed) return;
      if (this.role === 'guest') this.dial();
    });

    // Host answers a caller with its current local stream. Only ONE guest at a
    // time: while a call is already live, a second caller (someone else who
    // learned the code) is refused rather than silently handed the A/V.
    peer.on('call', (incoming) => {
      if (this.destroyed) return;
      if (this.call && this.call.open) {
        incoming.close();
        return;
      }
      incoming.answer(this.local ?? undefined);
      this.bindCall(incoming);
    });

    peer.on('disconnected', () => {
      if (this.destroyed) return;
      try {
        peer.reconnect();
      } catch {
        /* already gone */
      }
    });

    peer.on('error', (err: { type?: string }) => {
      if (this.destroyed) return;
      // Host not registered yet (or link blip) — keep retrying quietly.
      if (err.type === 'peer-unavailable') {
        if (this.role === 'guest') this.scheduleDial();
        return;
      }
      if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
        this.handlers.onStatus('connecting', 'Reconnecting…');
        return;
      }
      // 'unavailable-id' etc. — non-fatal for media; the game still plays.
      this.handlers.onStatus('error', 'Couldn’t start the call.');
    });
  }

  private dial(): void {
    if (this.destroyed || !this.peer || !this.local) return;
    const call = this.peer.call(this.mediaId(), this.local);
    if (call) this.bindCall(call);
    this.scheduleDial();
  }

  private scheduleDial(): void {
    if (this.role !== 'guest' || this.destroyed) return;
    if (this.dialTimer) clearTimeout(this.dialTimer);
    this.dialTimer = setTimeout(() => {
      if (!this.call || !this.call.open) this.dial();
    }, DIAL_RETRY_MS);
  }

  private bindCall(call: MediaConnection): void {
    if (this.call && this.call !== call) {
      try {
        this.call.removeAllListeners();
        this.call.close();
      } catch {
        /* ignore */
      }
    }
    this.call = call;
    const isCurrent = () => !this.destroyed && this.call === call;

    call.on('stream', (remote: MediaStream) => {
      if (!isCurrent()) return;
      if (this.dialTimer) clearTimeout(this.dialTimer);
      this.dialTimer = null;
      this.handlers.onStatus('live');
      this.handlers.onRemoteStream(remote);
    });

    call.on('close', () => {
      if (!isCurrent()) return;
      this.handlers.onRemoteStream(null);
      // Guest keeps trying so a re-open (e.g. a camera toggle) reconnects.
      if (this.role === 'guest') this.scheduleDial();
    });

    call.on('error', () => {
      if (!isCurrent()) return;
      this.handlers.onStatus('connecting', 'Reconnecting…');
    });
  }

  /** Drop the current call so it re-forms with the current local stream. */
  private reopenCall(): void {
    const call = this.call;
    this.call = null;
    try {
      call?.removeAllListeners();
      call?.close();
    } catch {
      /* ignore */
    }
    if (this.role === 'guest') this.dial();
    // Host: the guest will re-dial on its 'close', and our 'call' handler
    // answers with the new local stream.
  }
}
