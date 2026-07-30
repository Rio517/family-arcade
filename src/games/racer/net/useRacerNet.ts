/**
 * The connection layer for two-player Rainbow Racer.
 *
 * Wraps the shared `GameConnection` (same code-based WebRTC link Battleship
 * uses) and adds the racer's tiny handshake: both sides send `hello`, the host
 * answers with `go`, and then the race is live. High-frequency data (the other
 * kart's position, the host's coin/score world) lands in refs, not React state,
 * so the animation loop can read it every frame without re-rendering.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { GameConnection, generateCode, type ConnStatus } from '@shared/net/peer';
import { isRacerMsg, type RacerMsg } from './protocol';
import type { Coin } from '../domain/kart';

export type Role = 'host' | 'guest';

export interface RemotePos {
  x: number;
  z: number;
  heading: number;
  speed: number;
}

export interface RemoteWorld {
  coins: Coin[];
  scores: [number, number];
  status: 'racing' | 'over';
  winner: number | null;
  elapsed: number;
}

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
  sendPos: (p: RemotePos) => void;
  sendWorld: (w: RemoteWorld) => void;
  /** Host only: start (or restart) the race for both sides. */
  hostRestart: () => void;
  /** Guest: ask the host to run it back. */
  requestRematch: () => void;
  remotePosRef: React.MutableRefObject<RemotePos | null>;
  remoteWorldRef: React.MutableRefObject<RemoteWorld | null>;
  /** Bumps when the opponent taps "race again". */
  rematchRef: React.MutableRefObject<number>;
}

export function useRacerNet(opts: { name: string; driver: string; target: number }): RacerNet {
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

  const remotePosRef = useRef<RemotePos | null>(null);
  const remoteWorldRef = useRef<RemoteWorld | null>(null);
  const rematchRef = useRef(0);

  // Host → both: begin (or restart) the race.
  const doGo = useCallback(() => {
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
          // (Re)introduce ourselves on every fresh channel.
          sentGoRef.current = false;
          const { name, driver } = identityRef.current;
          connRef.current?.send({ t: 'hello', name, driver });
        },
        onMessage: (msg) => {
          switch (msg.t) {
            case 'hello': {
              setTheirName(msg.name.slice(0, 24) || 'Friend');
              setTheirDriver(msg.driver);
              // The host kicks the race off once it knows who joined.
              if (roleRef.current === 'host' && !sentGoRef.current) {
                sentGoRef.current = true;
                doGo();
              }
              break;
            }
            case 'go':
              setStartNonce((n) => n + 1);
              break;
            case 'pos':
              remotePosRef.current = { x: msg.x, z: msg.z, heading: msg.heading, speed: msg.speed };
              break;
            case 'world':
              remoteWorldRef.current = {
                coins: msg.coins,
                scores: msg.scores,
                status: msg.status,
                winner: msg.winner,
                elapsed: msg.elapsed,
              };
              break;
            case 'rematch':
              rematchRef.current += 1;
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

  const sendPos = useCallback((p: RemotePos) => {
    connRef.current?.send({ t: 'pos', ...p });
  }, []);

  const sendWorld = useCallback((w: RemoteWorld) => {
    connRef.current?.send({ t: 'world', ...w });
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
    hostRestart: doGo,
    requestRematch,
    remotePosRef,
    remoteWorldRef,
    rematchRef,
  };
}
