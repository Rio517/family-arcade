/**
 * The connection layer for two-player Rainbow Racer.
 *
 * Wraps the shared `GameConnection` (same code-based WebRTC link Battleship
 * uses) and adds the racer's tiny handshake: both sides send `hello`, the host
 * answers a fresh guest with `go`, and then the race is live. On every channel
 * (re)open the host also re-sends its full authoritative world — mirroring how
 * the other games re-sync on open — so a guest that missed packets (even the
 * one that said the race was over) catches up instead of staying stuck.
 *
 * High-frequency data (the other kart's position, the guest's mirror of the
 * host's world, kept current by folding in snapshots and deltas) lands in
 * refs, not React state, so the animation loop can read it every frame without
 * re-rendering.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { GameConnection, generateCode, type ConnStatus } from '@shared/net/peer';
import { isRacerMsg, type RacerMsg } from './protocol';
import {
  applyWorldDelta,
  applyWorldSnapshot,
  type MirrorWorld,
  type RemoteKartPos,
  type WorldDelta,
  type WorldSnapshot,
} from '../domain/race';

export type Role = 'host' | 'guest';

export interface RacerNet {
  status: ConnStatus;
  statusDetail?: string;
  code: string;
  role: Role | null;
  connected: boolean;
  /** Bumps each time the race should (re)start — initial "go" and every rematch. */
  startNonce: number;
  theirName: string;
  theirDriver: string | null;
  host: () => void;
  join: (code: string) => void;
  leave: () => void;
  sendPos: (p: RemoteKartPos) => void;
  /** Host only: broadcast the full world (race start; reopens are automatic). */
  sendWorld: (snap: WorldSnapshot) => void;
  /** Host only: broadcast what changed since the last world message. */
  sendWorldDelta: (delta: WorldDelta) => void;
  /** Host only: start (or restart) the race for both sides. */
  hostRestart: () => void;
  /** Guest: ask the host to run it back. */
  requestRematch: () => void;
  remotePosRef: React.MutableRefObject<RemoteKartPos | null>;
  remoteWorldRef: React.MutableRefObject<MirrorWorld | null>;
}

export function useRacerNet(opts: {
  name: string;
  driver: string;
  target: number;
  /** Does this device have a live race right now? (Said in `hello`.) */
  inRace?: () => boolean;
  /** Host: the current authoritative world, re-sent on every channel open. */
  getWorld?: () => WorldSnapshot | null;
}): RacerNet {
  const [status, setStatus] = useState<ConnStatus>('idle');
  const [statusDetail, setStatusDetail] = useState<string | undefined>();
  const [code, setCode] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [connected, setConnected] = useState(false);
  const [startNonce, setStartNonce] = useState(0);
  const [theirName, setTheirName] = useState('Friend');
  const [theirDriver, setTheirDriver] = useState<string | null>(null);

  const connRef = useRef<GameConnection<RacerMsg> | null>(null);
  const roleRef = useRef<Role | null>(null);
  const sentGoRef = useRef(false);
  const identityRef = useRef(opts);
  identityRef.current = opts;

  const remotePosRef = useRef<RemoteKartPos | null>(null);
  const remoteWorldRef = useRef<MirrorWorld | null>(null);

  // Host → both: begin (or restart) the race.
  const doGo = useCallback(() => {
    remotePosRef.current = null;
    remoteWorldRef.current = null;
    connRef.current?.send({ t: 'go', target: identityRef.current.target });
    setStartNonce((n) => n + 1);
  }, []);

  const ensureConn = useCallback((): GameConnection<RacerMsg> => {
    if (connRef.current) return connRef.current;
    connRef.current = new GameConnection<RacerMsg>(
      {
        onStatus: (s, detail) => {
          setStatus(s);
          setStatusDetail(detail);
          if (s === 'connected') setConnected(true);
        },
        onOpen: () => {
          // (Re)introduce ourselves on every fresh channel…
          sentGoRef.current = false;
          const { name, driver, inRace, getWorld } = identityRef.current;
          connRef.current?.send({ t: 'hello', name, driver, inRace: inRace?.() ?? false });
          // …and the host re-syncs the guest with the authoritative world, so
          // even a finished race survives a dropped final packet + reconnect.
          if (roleRef.current === 'host') {
            const snap = getWorld?.();
            if (snap) connRef.current?.send({ t: 'world', ...snap });
          }
        },
        onMessage: (msg) => {
          switch (msg.t) {
            case 'hello': {
              setTheirName(msg.name.slice(0, 24) || 'Friend');
              setTheirDriver(msg.driver);
              // The host kicks the race off for a FRESH guest. A guest that is
              // already mid-race (a reconnect blip) is re-synced by the world
              // snapshot instead — restarting would throw the family's race away.
              if (roleRef.current === 'host' && !sentGoRef.current && !msg.inRace) {
                sentGoRef.current = true;
                doGo();
              }
              break;
            }
            case 'go':
              // A fresh race: forget everything from the previous one before
              // the world messages that follow (the channel is ordered).
              remotePosRef.current = null;
              remoteWorldRef.current = null;
              setStartNonce((n) => n + 1);
              break;
            case 'pos':
              remotePosRef.current = { x: msg.x, z: msg.z, heading: msg.heading, speed: msg.speed };
              break;
            case 'world':
              // Only the guest mirrors — the host is the authority and ignores
              // world claims a hostile peer might send.
              if (roleRef.current === 'guest') {
                remoteWorldRef.current = applyWorldSnapshot(remoteWorldRef.current, msg);
              }
              break;
            case 'worldDelta':
              if (roleRef.current === 'guest') {
                remoteWorldRef.current = applyWorldDelta(remoteWorldRef.current, msg);
              }
              break;
            case 'rematch':
              // Only the host can authoritatively (re)start; it echoes a "go".
              if (roleRef.current === 'host') doGo();
              break;
          }
        },
      },
      { prefix: 'racer-v1-', isMessage: isRacerMsg },
    );
    return connRef.current;
  }, [doGo]);

  const host = useCallback(() => {
    const c = generateCode();
    setCode(c);
    setRole('host');
    roleRef.current = 'host';
    ensureConn().host(c);
  }, [ensureConn]);

  const join = useCallback(
    (c: string) => {
      setCode(c);
      setRole('guest');
      roleRef.current = 'guest';
      ensureConn().join(c);
    },
    [ensureConn],
  );

  const leave = useCallback(() => {
    connRef.current?.destroy();
    connRef.current = null;
    roleRef.current = null;
    sentGoRef.current = false;
    remotePosRef.current = null;
    remoteWorldRef.current = null;
    setStatus('idle');
    setConnected(false);
    setStartNonce(0);
    setRole(null);
    setTheirDriver(null);
    setCode('');
  }, []);

  const sendPos = useCallback((p: RemoteKartPos) => {
    connRef.current?.send({ t: 'pos', ...p });
  }, []);

  const sendWorld = useCallback((snap: WorldSnapshot) => {
    connRef.current?.send({ t: 'world', ...snap });
  }, []);

  const sendWorldDelta = useCallback((delta: WorldDelta) => {
    connRef.current?.send({ t: 'worldDelta', ...delta });
  }, []);

  const requestRematch = useCallback(() => {
    connRef.current?.send({ t: 'rematch' });
  }, []);

  // Tidy up the peer if the component using this unmounts.
  useEffect(() => () => connRef.current?.destroy(), []);

  return {
    status,
    statusDetail,
    code,
    role,
    connected,
    startNonce,
    theirName,
    theirDriver,
    host,
    join,
    leave,
    sendPos,
    sendWorld,
    sendWorldDelta,
    hostRestart: doGo,
    requestRematch,
    remotePosRef,
    remoteWorldRef,
  };
}
