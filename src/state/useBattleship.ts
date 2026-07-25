/**
 * useBattleship — the React adapter over the pure session state machine.
 *
 * All game rules and lifecycle logic live in game/session.ts (which in turn
 * builds on engine.ts/protocol.ts). This hook holds no rules of its own; it
 * just:
 *   • owns the P2P connection and the current SessionState,
 *   • turns UI actions and inbound messages into session transitions,
 *   • applies each transition's result — new state, outgoing messages, and the
 *     one-shot `finished`/`error` signals,
 *   • persists after every change (which is what powers resume).
 *
 * Because the session module is pure and fully tested (including a real
 * two-peer game through a disconnect), the risky glue is verified without a
 * live network, and the previous run-once latch refs are gone: "author the
 * start" and "report the finish once" are now properties of the transitions.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { GameConnection, generateCode, type ConnStatus } from '../net/peer';
import * as Session from '../game/session';
import type { FinishInfo, Outcome, Phase as GamePhase, SessionState } from '../game/session';
import { currentTurn, winner } from '../game/engine';
import { clearSession, loadSession, saveSession, type GameSession } from '../storage/persistence';
import type { Coord, Fleet, GameLog, Side } from '../game/types';

/** How long to wait for a fire to be answered before releasing the board lock. */
const FIRE_TIMEOUT_MS = 8000;

export type Phase = 'lobby' | GamePhase;

export interface UseBattleshipResult {
  phase: Phase;
  side: Side | null;
  code: string;
  status: ConnStatus;
  statusDetail: string | undefined;
  myName: string;
  mySkinId: string;
  myFleet: Fleet;
  myReady: boolean;
  oppName: string | null;
  oppSkinId: string | null;
  oppReady: boolean;
  oppConnected: boolean;
  iWantRematch: boolean;
  oppWantsRematch: boolean;
  log: GameLog;
  myTurn: boolean;
  pendingFire: Coord | null;
  winnerSide: Side | null;
  // actions
  hostGame: (name: string) => void;
  joinGame: (code: string, name: string) => void;
  resumeGame: (code: string) => void;
  chooseSkin: (skinId: string) => void;
  confirmSkin: () => void;
  setFleet: (fleet: Fleet) => void;
  confirmReady: () => void;
  fire: (coord: Coord) => void;
  requestRematch: () => void;
  leave: () => void;
}

interface UseBattleshipOptions {
  name: string;
  skinId: string;
  onFinish: (info: FinishInfo) => void;
}

function sessionToStored(s: SessionState): GameSession {
  return {
    code: s.code,
    side: s.side,
    myName: s.myName,
    mySkinId: s.mySkinId,
    oppName: s.oppName,
    oppSkinId: s.oppSkinId,
    myFleet: s.myFleet,
    myReady: s.myReady,
    oppReady: s.oppReady,
    log: s.log,
    finished: winner(s.log) !== null,
    updatedAt: Date.now(),
  };
}

function storedToSession(g: GameSession): SessionState {
  return {
    side: g.side,
    code: g.code,
    myName: g.myName,
    mySkinId: g.mySkinId,
    oppName: g.oppName,
    oppSkinId: g.oppSkinId,
    myFleet: g.myFleet,
    myReady: g.myReady,
    oppReady: g.oppReady,
    iWantRematch: false,
    oppWantsRematch: false,
    log: g.log,
    pendingFire: null,
    setupPhase: g.myReady ? 'waiting' : 'placing',
  };
}

export function useBattleship(opts: UseBattleshipOptions): UseBattleshipResult {
  const [session, setSession] = useState<SessionState | null>(null);
  const [status, setStatus] = useState<ConnStatus>('idle');
  const [statusDetail, setStatusDetail] = useState<string | undefined>(undefined);

  const connRef = useRef<GameConnection | null>(null);
  const sessionRef = useRef<SessionState | null>(null);
  // Keep refs current so connection callbacks and chained actions see the
  // freshest state/identity/onFinish without stale closures.
  const onFinishRef = useRef(opts.onFinish);
  onFinishRef.current = opts.onFinish;
  const identityRef = useRef({ name: opts.name, skinId: opts.skinId });
  identityRef.current = { name: opts.name, skinId: opts.skinId };

  const setSessionState = useCallback((s: SessionState) => {
    sessionRef.current = s;
    setSession(s);
  }, []);

  // Apply a session transition: commit the state, send its messages, and act on
  // the one-shot signals. This is the single place effects leave the pure core.
  const applyOutcome = useCallback((o: Outcome) => {
    setSessionState(o.state);
    for (const msg of o.outgoing) connRef.current?.send(msg);
    if (o.error) {
      setStatus('error');
      setStatusDetail(o.error);
    }
    if (o.finished) onFinishRef.current(o.finished);
  }, [setSessionState]);

  const ensureConn = useCallback((): GameConnection => {
    if (connRef.current) return connRef.current;
    connRef.current = new GameConnection({
      onStatus: (s, detail) => {
        setStatus(s);
        setStatusDetail(detail);
      },
      onOpen: () => {
        const s = sessionRef.current;
        if (s) for (const msg of Session.connectHandshake(s)) connRef.current?.send(msg);
      },
      onMessage: (msg) => {
        const s = sessionRef.current;
        if (s) applyOutcome(Session.applyMessage(s, msg));
      },
    });
    return connRef.current;
  }, [applyOutcome]);

  // ── Persist after every change (powers resume) ──────────────────────────
  useEffect(() => {
    if (session) saveSession(sessionToStored(session));
  }, [session]);

  // ── Fire watchdog: release the board lock if a fire goes unanswered and it's
  //    still our turn, so the player can retry. ─────────────────────────────
  const pendingFire = session?.pendingFire ?? null;
  useEffect(() => {
    if (!pendingFire) return;
    const timer = setTimeout(() => {
      const s = sessionRef.current;
      if (s?.pendingFire && currentTurn(s.log) === s.side) {
        setSessionState({ ...s, pendingFire: null });
      }
    }, FIRE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pendingFire, setSessionState]);

  // ── Tear down the connection on unmount ─────────────────────────────────
  useEffect(() => {
    return () => {
      connRef.current?.destroy();
      connRef.current = null;
    };
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────
  const hostGame = useCallback((name: string) => {
    const code = generateCode();
    const conn = ensureConn();
    setSessionState(Session.createSession('host', code, name.trim() || 'Captain', identityRef.current.skinId));
    conn.host(code);
  }, [ensureConn, setSessionState]);

  const joinGame = useCallback((code: string, name: string) => {
    const conn = ensureConn();
    setSessionState(Session.createSession('guest', code, name.trim() || 'Captain', identityRef.current.skinId));
    conn.join(code);
  }, [ensureConn, setSessionState]);

  const resumeGame = useCallback((code: string) => {
    const stored = loadSession(code);
    if (!stored) return;
    const conn = ensureConn();
    setSessionState(storedToSession(stored));
    if (stored.side === 'host') conn.host(stored.code);
    else conn.join(stored.code);
  }, [ensureConn, setSessionState]);

  // Transitions that only mutate local state need the latest session via ref.
  const withSession = useCallback((fn: (s: SessionState) => SessionState) => {
    const s = sessionRef.current;
    if (s) setSessionState(fn(s));
  }, [setSessionState]);
  const withOutcome = useCallback((fn: (s: SessionState) => Outcome) => {
    const s = sessionRef.current;
    if (s) applyOutcome(fn(s));
  }, [applyOutcome]);

  const chooseSkin = useCallback((skinId: string) => withSession((s) => Session.chooseSkin(s, skinId)), [withSession]);
  const confirmSkin = useCallback(() => withSession(Session.toPlacing), [withSession]);
  const setFleet = useCallback((fleet: Fleet) => withSession((s) => Session.setFleet(s, fleet)), [withSession]);
  const confirmReady = useCallback(() => withOutcome((s) => Session.confirmReady(s)), [withOutcome]);
  const fire = useCallback((coord: Coord) => withOutcome((s) => Session.fireAt(s, coord)), [withOutcome]);
  const requestRematch = useCallback(() => withOutcome(Session.proposeRematch), [withOutcome]);

  const leave = useCallback(() => {
    const s = sessionRef.current;
    if (s?.code) clearSession(s.code);
    connRef.current?.destroy();
    connRef.current = null;
  }, []);

  // ── Derived view ─────────────────────────────────────────────────────────
  const s = session;
  return {
    phase: s ? Session.phase(s) : 'lobby',
    side: s?.side ?? null,
    code: s?.code ?? '',
    status,
    statusDetail,
    myName: s?.myName ?? opts.name,
    mySkinId: s?.mySkinId ?? opts.skinId,
    myFleet: s?.myFleet ?? [],
    myReady: s?.myReady ?? false,
    oppName: s?.oppName ?? null,
    oppSkinId: s?.oppSkinId ?? null,
    oppReady: s?.oppReady ?? false,
    oppConnected: status === 'connected',
    iWantRematch: s?.iWantRematch ?? false,
    oppWantsRematch: s?.oppWantsRematch ?? false,
    log: s?.log ?? [],
    myTurn: s ? Session.isMyTurn(s) : false,
    pendingFire: s?.pendingFire ?? null,
    winnerSide: s ? Session.winnerSide(s) : null,
    hostGame,
    joinGame,
    resumeGame,
    chooseSkin,
    confirmSkin,
    setFleet,
    confirmReady,
    fire,
    requestRematch,
    leave,
  };
}
