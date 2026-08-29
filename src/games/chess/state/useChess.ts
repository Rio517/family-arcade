/**
 * useChess — the React adapter over the pure chess session state machine.
 *
 * Like useBattleship, this hook holds no rules. It owns the P2P connection (in
 * online mode) and the current SessionState, turns UI actions + inbound
 * messages into session transitions, applies each transition's result (state,
 * outgoing messages, one-shot `finished`/`error`), and persists online games so
 * they resume after a refresh or a dropped link. Local (hotseat) games need no
 * connection at all — the same transitions just run with no messages to send.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { GameConnection, type ConnStatus } from '@shared/net/peer';
import { isChessMessage, type ChessMessage } from '@games/chess/domain/protocol';
import * as Session from '@games/chess/domain/session';
import type { FinishInfo, LocalPlayer, Outcome, Phase as GamePhase, SessionState } from '@games/chess/domain/session';
import { boardState, canIMove, turnColor } from '@games/chess/domain/session';
import {
  chessToStored,
  clearChessGame,
  clearLocalChessGame,
  loadChessGame,
  loadLocalChessGame,
  saveChessGame,
  saveLocalChessGame,
  storedToChess,
  storedToLocalChess,
} from '@games/chess/storage/chessPersistence';
import type { Color, GameLog, GameState, Ply, Side } from '@games/chess/domain/types';

const CHESS_PREFIX = 'chess-v1-';
/** An unoccupied chair — the lobby's placeholder board is nobody's game. */
const NOBODY: LocalPlayer = { name: '', userId: null };

export type Phase = 'lobby' | GamePhase;

/** Sitting down at an online table: which end of the code, and as whom. */
export interface StartTableOptions {
  role: Side;
  /** The game code — minted by the page (or handed across by the party). */
  code: string;
  /** The signed-in ticket taking this chair; null if nobody is. */
  seatedUserId: string | null;
  /** The colour the host chose; White when unsaid. Both ends pass the same value. */
  hostSide?: Color;
}

export interface UseChessResult {
  phase: Phase;
  mode: Session.Mode | null;
  side: Side | null;
  myColor: Color | null;
  code: string;
  status: ConnStatus;
  statusDetail: string | undefined;
  myName: string;
  oppName: string;
  /** Online: the ticket that sat down at this device for the game. Local or lobby: null. */
  seatedUserId: string | null;
  oppConnected: boolean;
  iWantRematch: boolean;
  oppWantsRematch: boolean;
  log: GameLog;
  board: GameState;
  /** Custom starting position (free-play game), or null for the standard opening. */
  start: GameState | null;
  turn: Color;
  canMove: boolean;
  /** Local (hotseat) only: is there a move to take back? */
  canUndo: boolean;
  // actions
  /**
   * Start a hotseat game — from the standard opening, or from `start`. Each
   * chair brings its name and its ticket (null for a bot or nobody); the
   * tickets are what the result credits when the game ends.
   */
  startLocal: (white: LocalPlayer, black: LocalPlayer, start?: GameState) => void;
  /** Host or join an online game under `code`, as the hook's `name` (your ticket). */
  startTable: (opts: StartTableOptions) => void;
  resumeGame: (code: string) => void;
  /** Resume the saved same-device (hotseat) game. */
  resumeLocal: () => void;
  move: (ply: Ply) => void;
  undo: () => void;
  /** Local only: rewind to the position after ply `n` (keep the first `n` plies). */
  goToPly: (n: number) => void;
  requestRematch: () => void;
  leave: () => void;
}

interface UseChessOptions {
  /** The signed-in ticket's name — what the opponent sees. The gate guarantees one. */
  name: string;
  onFinish: (info: FinishInfo) => void;
}

export function useChess(opts: UseChessOptions): UseChessResult {
  const [session, setSession] = useState<SessionState | null>(null);
  const [status, setStatus] = useState<ConnStatus>('idle');
  const [statusDetail, setStatusDetail] = useState<string | undefined>(undefined);

  const connRef = useRef<GameConnection<ChessMessage> | null>(null);
  const sessionRef = useRef<SessionState | null>(null);
  const onFinishRef = useRef(opts.onFinish);
  onFinishRef.current = opts.onFinish;

  const setSessionState = useCallback((s: SessionState | null) => {
    sessionRef.current = s;
    setSession(s);
  }, []);

  const applyOutcome = useCallback((o: Outcome) => {
    setSessionState(o.state);
    for (const msg of o.outgoing) connRef.current?.send(msg);
    if (o.error) {
      setStatus('error');
      setStatusDetail(o.error);
    }
    if (o.finished) onFinishRef.current(o.finished);
  }, [setSessionState]);

  const ensureConn = useCallback((): GameConnection<ChessMessage> => {
    if (connRef.current) return connRef.current;
    connRef.current = new GameConnection<ChessMessage>(
      {
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
          if (!s) return;
          try {
            applyOutcome(Session.applyMessage(s, msg));
          } catch (err) {
            // A structurally valid message can still carry an illegal game
            // continuation (replay throws). Drop it — never let a hostile or
            // buggy peer take the app down.
            console.error('Rejected peer message', err);
          }
        },
      },
      { prefix: CHESS_PREFIX, isMessage: isChessMessage },
    );
    return connRef.current;
  }, [applyOutcome]);

  // Persist games after every change (powers resume). Online games save under
  // their code; hotseat games autosave into the one local slot — cleared once
  // the game finishes, or while it's an untouched standard opening (nothing
  // worth resuming yet).
  useEffect(() => {
    if (!session) return;
    const stored = chessToStored(session, Date.now());
    if (stored) saveChessGame(stored);
    if (session.mode === 'local') {
      const finished = Session.phase(session) === 'over';
      if (finished || (session.log.length === 0 && !session.start)) clearLocalChessGame();
      else saveLocalChessGame(session, Date.now());
    }
  }, [session]);

  // Tear down the connection on unmount.
  useEffect(() => {
    return () => {
      connRef.current?.destroy();
      connRef.current = null;
    };
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────────
  const startLocal = useCallback((white: LocalPlayer, black: LocalPlayer, start?: GameState) => {
    setStatus('idle');
    setSessionState(
      Session.createLocalSession(
        { name: white.name.trim() || 'White', userId: white.userId },
        { name: black.name.trim() || 'Black', userId: black.userId },
        start,
      ),
    );
  }, [setSessionState]);

  // My name is the ticket's name, verbatim: the gate guarantees there is one.
  const name = opts.name;
  const startTable = useCallback(({ role, code, seatedUserId, hostSide }: StartTableOptions) => {
    const conn = ensureConn();
    // A reload mid-game: the party seats the guest again under the same code,
    // and a fresh session here would overwrite the save. The same code from
    // the same chair picks that game back up instead. A finished save is a
    // game that is over — it starts fresh, and the sync settles the rest.
    const stored = loadChessGame(code);
    if (stored && stored.side === role && !stored.finished) {
      setSessionState(storedToChess(stored));
    } else {
      setSessionState({ ...Session.createOnlineSession(role, code, name, hostSide), seatedUserId });
    }
    if (role === 'host') conn.host(code);
    else conn.join(code);
  }, [ensureConn, name, setSessionState]);

  const resumeGame = useCallback((code: string) => {
    const stored = loadChessGame(code);
    if (!stored) return;
    const conn = ensureConn();
    setSessionState(storedToChess(stored));
    if (stored.side === 'host') conn.host(stored.code);
    else conn.join(stored.code);
  }, [ensureConn, setSessionState]);

  /** Resume the saved same-device game, if one exists. */
  const resumeLocal = useCallback(() => {
    const stored = loadLocalChessGame();
    if (!stored) return;
    setStatus('idle');
    setSessionState(storedToLocalChess(stored));
  }, [setSessionState]);

  const move = useCallback((ply: Ply) => {
    const s = sessionRef.current;
    if (!s) return;
    applyOutcome(Session.makeMove(s, ply));
  }, [applyOutcome]);

  const undo = useCallback(() => {
    const s = sessionRef.current;
    if (s) applyOutcome(Session.undoMove(s));
  }, [applyOutcome]);

  const goToPly = useCallback((n: number) => {
    const s = sessionRef.current;
    if (s) applyOutcome(Session.truncateLog(s, n));
  }, [applyOutcome]);

  const requestRematch = useCallback(() => {
    const s = sessionRef.current;
    if (s) applyOutcome(Session.proposeRematch(s));
  }, [applyOutcome]);

  const leave = useCallback(() => {
    const s = sessionRef.current;
    if (s?.mode === 'online' && s.code) clearChessGame(s.code);
    connRef.current?.destroy();
    connRef.current = null;
    // Back to the lobby with the link idle: hanging up a dial must not leave
    // a dead board — and a stale "dialing" badge — on screen.
    setSessionState(null);
    setStatus('idle');
    setStatusDetail(undefined);
  }, [setSessionState]);

  // ── Derived view ─────────────────────────────────────────────────────────
  const s = session;
  const board = s ? boardState(s) : Session.boardState(Session.createLocalSession(NOBODY, NOBODY));
  return {
    phase: s ? Session.phase(s) : 'lobby',
    mode: s?.mode ?? null,
    side: s?.side ?? null,
    myColor: s?.myColor ?? null,
    code: s?.code ?? '',
    status,
    statusDetail,
    myName: s?.myName ?? opts.name,
    oppName: s?.oppName ?? '',
    seatedUserId: s?.seatedUserId ?? null,
    oppConnected: status === 'connected',
    iWantRematch: s?.iWantRematch ?? false,
    oppWantsRematch: s?.oppWantsRematch ?? false,
    log: s?.log ?? [],
    board,
    start: s?.start ?? null,
    turn: s ? turnColor(s) : 'w',
    canMove: s ? canIMove(s) : false,
    canUndo: s?.mode === 'local' && s.log.length > 0,
    startLocal,
    startTable,
    resumeGame,
    resumeLocal,
    move,
    undo,
    goToPly,
    requestRematch,
    leave,
  };
}
