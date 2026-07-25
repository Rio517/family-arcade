/**
 * useBattleship — the orchestration hook.
 *
 * It owns the connection and the reactive game state, translating between the
 * pure engine/protocol layer and the React UI. All *rules* live in the pure
 * modules (engine.ts, protocol.ts); this hook is the wiring: it sends the
 * right message at the right time, persists after every change, and derives the
 * screen the player should see.
 *
 * The setup wizard phase (lobby → fleet → placing → waiting) is stored; the
 * playing phase (battle / over) is *derived from the log*, so a resume lands
 * you exactly where the game actually is regardless of local UI state.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { GameConnection, generateCode, type ConnStatus } from '../net/peer';
import {
  PROTOCOL_VERSION,
  reconcileLogs,
  type Message,
} from '../game/protocol';
import {
  currentTurn,
  hasStarted,
  resolveIncomingFire,
  shotsBy,
  survivingCells,
  winner,
} from '../game/engine';
import type { Coord, Fleet, GameLog, Side } from '../game/types';
import {
  clearSession,
  loadSession,
  saveSession,
  type GameSession,
} from '../storage/persistence';

/** How long to wait for a fire to be answered before releasing the board lock. */
const FIRE_TIMEOUT_MS = 8000;

export type SetupPhase = 'lobby' | 'fleet' | 'placing' | 'waiting';
export type Phase = SetupPhase | 'battle' | 'over';

export interface State {
  side: Side | null;
  code: string;
  setupPhase: SetupPhase;
  status: ConnStatus;
  statusDetail: string | undefined;
  myName: string;
  mySkinId: string;
  myFleet: Fleet;
  myReady: boolean;
  oppName: string | null;
  oppSkinId: string | null;
  oppReady: boolean;
  iWantRematch: boolean;
  oppWantsRematch: boolean;
  log: GameLog;
  pendingFire: Coord | null;
}

export type Action =
  | { type: 'resume'; session: GameSession }
  | { type: 'host'; code: string; name: string; skinId: string }
  | { type: 'join'; code: string; name: string; skinId: string }
  | { type: 'status'; status: ConnStatus; detail?: string }
  | { type: 'setSkin'; skinId: string }
  | { type: 'toPlacing' }
  | { type: 'setFleet'; fleet: Fleet }
  | { type: 'ready' }
  | { type: 'oppHello'; name: string; skinId: string }
  | { type: 'oppReady'; ready: boolean }
  | { type: 'setLog'; log: GameLog }
  | { type: 'pendingFire'; coord: Coord | null }
  | { type: 'iRematch' }
  | { type: 'oppRematch' }
  | { type: 'restart' };

export function initialState(name: string, skinId: string): State {
  return {
    side: null,
    code: '',
    setupPhase: 'lobby',
    status: 'idle',
    statusDetail: undefined,
    myName: name,
    mySkinId: skinId,
    myFleet: [],
    myReady: false,
    oppName: null,
    oppSkinId: null,
    oppReady: false,
    iWantRematch: false,
    oppWantsRematch: false,
    log: [],
    pendingFire: null,
  };
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'resume': {
      const s = action.session;
      return {
        ...state,
        side: s.side,
        code: s.code,
        setupPhase: s.myReady ? 'waiting' : 'placing',
        myName: s.myName,
        mySkinId: s.mySkinId,
        myFleet: s.myFleet,
        myReady: s.myReady,
        oppName: s.oppName,
        oppSkinId: s.oppSkinId,
        oppReady: s.oppReady,
        log: s.log,
        pendingFire: null,
      };
    }
    case 'host':
      return { ...state, side: 'host', code: action.code, myName: action.name, mySkinId: action.skinId, setupPhase: 'fleet' };
    case 'join':
      return { ...state, side: 'guest', code: action.code, myName: action.name, mySkinId: action.skinId, setupPhase: 'fleet' };
    case 'status':
      return { ...state, status: action.status, statusDetail: action.detail };
    case 'setSkin':
      return { ...state, mySkinId: action.skinId };
    case 'toPlacing':
      return { ...state, setupPhase: 'placing' };
    case 'setFleet':
      return { ...state, myFleet: action.fleet };
    case 'ready':
      return { ...state, myReady: true, setupPhase: 'waiting' };
    case 'oppHello':
      return { ...state, oppName: action.name, oppSkinId: action.skinId };
    case 'oppReady':
      return { ...state, oppReady: action.ready };
    case 'setLog':
      // Any log advance clears the fire lock (see hook notes on lost fires).
      return { ...state, log: action.log, pendingFire: null };
    case 'pendingFire':
      return { ...state, pendingFire: action.coord };
    case 'iRematch':
      return { ...state, iWantRematch: true };
    case 'oppRematch':
      return { ...state, oppWantsRematch: true };
    case 'restart':
      return {
        ...state,
        setupPhase: 'placing',
        myFleet: [],
        myReady: false,
        oppReady: false,
        iWantRematch: false,
        oppWantsRematch: false,
        log: [],
        pendingFire: null,
      };
    default:
      return state;
  }
}

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
  onFinish: (info: { won: boolean; survivingCells: number; code: string; opponent: string }) => void;
}

export function useBattleship(opts: UseBattleshipOptions): UseBattleshipResult {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(opts.name, opts.skinId));
  const connRef = useRef<GameConnection | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  // Two run-once latches guarding side-effects that must fire exactly once per
  // game. They are refs, not reducer state, on purpose: they gate an effect
  // against the render lag between "dispatch the state change" and "state
  // reflects it", which a state flag would suffer from too. Their lifecycle:
  //   • startSentRef  — host authored the opening event. Set in the host-start
  //     effect; reset on rematch (restart) and re-primed by resumeGame.
  //   • finishedRef   — the result was reported to the profile. Set in the
  //     finish effect; reset on rematch; re-primed by resumeGame.
  const finishedRef = useRef(false);
  const startSentRef = useRef(false);
  // Always-current identity, so create/join use the freshest name/skin even if
  // the player edits the name field the same tick they tap Create.
  const identityRef = useRef({ name: opts.name, skinId: opts.skinId });
  identityRef.current = { name: opts.name, skinId: opts.skinId };

  // Keep a live connection object for the lifetime of the hook.
  const ensureConn = useCallback((): GameConnection => {
    if (connRef.current) return connRef.current;
    const conn = new GameConnection({
      onStatus: (status, detail) => dispatch({ type: 'status', status, detail }),
      onOpen: () => sync(),
      onMessage: (msg) => handleMessage(msg),
    });
    connRef.current = conn;
    return conn;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Send our identity + full log so the peer can catch up (resume). Sends here
  // (and elsewhere) are best-effort: if one is dropped, the next onOpen re-runs
  // this handshake and reconciles logs, so no message is critical on its own.
  const sync = useCallback(() => {
    const s = stateRef.current;
    const conn = connRef.current;
    if (!conn || !s.side) return;
    conn.send({ t: 'hello', v: PROTOCOL_VERSION, side: s.side, name: s.myName, skinId: s.mySkinId });
    conn.send({ t: 'sync', log: s.log, ready: s.myReady });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMessage = useCallback((msg: Message) => {
    const s = stateRef.current;
    const conn = connRef.current;
    if (!conn || !s.side) return;

    switch (msg.t) {
      case 'hello':
        // With an auto-updating PWA the two devices can end up on different
        // app versions; refuse to play rather than exchange incompatible logs.
        if (msg.v !== PROTOCOL_VERSION) {
          dispatch({ type: 'status', status: 'error', detail: 'Different app versions — both players refresh the page.' });
          return;
        }
        dispatch({ type: 'oppHello', name: msg.name.slice(0, 24), skinId: msg.skinId });
        break;

      case 'ready':
        dispatch({ type: 'oppReady', ready: msg.ready });
        break;

      case 'sync': {
        const merged = reconcileLogs(s.log, msg.log);
        if (merged !== s.log) dispatch({ type: 'setLog', log: merged });
        dispatch({ type: 'oppReady', ready: msg.ready });
        break;
      }

      case 'start': {
        // Guest adopts the host's opening event.
        if (!hasStarted(s.log)) {
          dispatch({ type: 'setLog', log: [{ type: 'start', first: msg.first }, ...s.log] });
        }
        break;
      }

      case 'fire': {
        // We are the defender: resolve against our own fleet and broadcast the
        // settled shot. On a resend (our earlier reply was lost while the channel
        // stayed open) we re-transmit the same event without re-appending it, so
        // the attacker unlocks instead of soft-locking on a shot we already saw.
        const { event, isResend } = resolveIncomingFire(s.log, s.myFleet, s.side, { row: msg.row, col: msg.col });
        if (!isResend) dispatch({ type: 'setLog', log: [...s.log, event] });
        conn.send({ t: 'shot', event });
        break;
      }

      case 'shot': {
        // We are the attacker (or catching up): append if new.
        const ev = msg.event;
        const already = shotsBy(s.log, ev.by).some((e) => e.row === ev.row && e.col === ev.col);
        if (!already) dispatch({ type: 'setLog', log: [...s.log, ev] });
        else dispatch({ type: 'pendingFire', coord: null });
        break;
      }

      case 'rematch':
        dispatch({ type: 'oppRematch' });
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Host authors the opening event once both fleets are ready ───────────
  useEffect(() => {
    if (state.side !== 'host') return;
    if (startSentRef.current) return;
    if (state.myReady && state.oppReady && !hasStarted(state.log)) {
      startSentRef.current = true;
      const first: Side = Math.random() < 0.5 ? 'host' : 'guest';
      const log: GameLog = [{ type: 'start', first }];
      dispatch({ type: 'setLog', log });
      connRef.current?.send({ t: 'start', first });
    }
  }, [state.side, state.myReady, state.oppReady, state.log]);

  // ── Persist the session after every change (powers resume) ──────────────
  useEffect(() => {
    if (!state.side || !state.code) return;
    const session: GameSession = {
      code: state.code,
      side: state.side,
      myName: state.myName,
      mySkinId: state.mySkinId,
      oppName: state.oppName,
      oppSkinId: state.oppSkinId,
      myFleet: state.myFleet,
      myReady: state.myReady,
      oppReady: state.oppReady,
      log: state.log,
      finished: winner(state.log) !== null,
      updatedAt: Date.now(),
    };
    saveSession(session);
  }, [state]);

  // ── Report the finished game exactly once ───────────────────────────────
  useEffect(() => {
    const w = winner(state.log);
    if (!w || finishedRef.current || !state.side) return;
    finishedRef.current = true;
    const won = w === state.side;
    opts.onFinish({
      won,
      survivingCells: survivingCells(state.log, state.myFleet, state.side),
      code: state.code,
      opponent: state.oppName ?? 'Opponent',
    });
  }, [state.log, state.side, state.myFleet, state.code, state.oppName, opts]);

  // ── Fire watchdog: if a fire goes unanswered and it's still our turn,
  //    release the lock so the player can retry. ───────────────────────────
  useEffect(() => {
    if (!state.pendingFire) return;
    const timer = setTimeout(() => {
      const s = stateRef.current;
      if (s.pendingFire && currentTurn(s.log) === s.side) {
        dispatch({ type: 'pendingFire', coord: null });
      }
    }, FIRE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [state.pendingFire, state.log, state.side]);

  // ── Rematch: when both sides ask, reset (host re-authors start) ──────────
  useEffect(() => {
    if (state.iWantRematch && state.oppWantsRematch && winner(state.log) !== null) {
      // both asked — reset locally; the ready handshake will restart the game.
      startSentRef.current = false;
      finishedRef.current = false;
      dispatch({ type: 'restart' });
    }
  }, [state.iWantRematch, state.oppWantsRematch, state.log]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────
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
    dispatch({ type: 'host', code, name: name.trim() || 'Captain', skinId: identityRef.current.skinId });
    conn.host(code);
  }, [ensureConn]);

  const joinGame = useCallback((rawCode: string, name: string) => {
    const conn = ensureConn();
    dispatch({ type: 'join', code: rawCode, name: name.trim() || 'Captain', skinId: identityRef.current.skinId });
    conn.join(rawCode);
  }, [ensureConn]);

  const resumeGame = useCallback((code: string) => {
    const session = loadSession(code);
    if (!session) return;
    const conn = ensureConn();
    dispatch({ type: 'resume', session });
    finishedRef.current = session.finished;
    startSentRef.current = hasStarted(session.log);
    if (session.side === 'host') conn.host(session.code);
    else conn.join(session.code);
  }, [ensureConn]);

  const chooseSkin = useCallback((skinId: string) => dispatch({ type: 'setSkin', skinId }), []);
  const confirmSkin = useCallback(() => dispatch({ type: 'toPlacing' }), []);
  const setFleet = useCallback((fleet: Fleet) => dispatch({ type: 'setFleet', fleet }), []);

  const confirmReady = useCallback(() => {
    dispatch({ type: 'ready' });
    connRef.current?.send({ t: 'ready', ready: true });
  }, []);

  const fire = useCallback((coord: Coord) => {
    const s = stateRef.current;
    if (currentTurn(s.log) !== s.side) return;
    if (s.pendingFire) return;
    const mine = shotsBy(s.log, s.side!);
    if (mine.some((e) => e.row === coord.row && e.col === coord.col)) return;
    // Only lock the board if the fire actually went out. If the channel is down,
    // stay unlocked so the player can retry once the link recovers.
    const sent = connRef.current?.send({ t: 'fire', row: coord.row, col: coord.col });
    if (sent) dispatch({ type: 'pendingFire', coord });
  }, []);

  const requestRematch = useCallback(() => {
    dispatch({ type: 'iRematch' });
    connRef.current?.send({ t: 'rematch' });
  }, []);

  const leave = useCallback(() => {
    const s = stateRef.current;
    if (s.code) clearSession(s.code);
    connRef.current?.destroy();
    connRef.current = null;
  }, []);

  // ── Derived view ─────────────────────────────────────────────────────────
  const winnerSide = winner(state.log);
  const phase: Phase = useMemo(() => {
    if (winnerSide) return 'over';
    if (hasStarted(state.log)) return 'battle';
    return state.setupPhase;
  }, [winnerSide, state.log, state.setupPhase]);

  const myTurn = state.side !== null && currentTurn(state.log) === state.side && !state.pendingFire;
  const oppConnected = state.status === 'connected';

  return {
    phase,
    side: state.side,
    code: state.code,
    status: state.status,
    statusDetail: state.statusDetail,
    myName: state.myName,
    mySkinId: state.mySkinId,
    myFleet: state.myFleet,
    myReady: state.myReady,
    oppName: state.oppName,
    oppSkinId: state.oppSkinId,
    oppReady: state.oppReady,
    oppConnected,
    iWantRematch: state.iWantRematch,
    oppWantsRematch: state.oppWantsRematch,
    log: state.log,
    myTurn,
    pendingFire: state.pendingFire,
    winnerSide,
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
