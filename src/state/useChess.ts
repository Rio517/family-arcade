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
import { GameConnection, generateCode, type ConnStatus } from '../net/peer';
import { isChessMessage, type ChessMessage } from '../game/chess/protocol';
import * as Session from '../game/chess/session';
import type { FinishInfo, Outcome, Phase as GamePhase, SessionState } from '../game/chess/session';
import { boardState, canIMove, turnColor } from '../game/chess/session';
import {
  chessToStored,
  clearChessGame,
  loadChessGame,
  saveChessGame,
  storedToChess,
} from '../storage/chessPersistence';
import type { Color, GameLog, GameState, Ply, Side } from '../game/chess/types';

const CHESS_PREFIX = 'chess-v1-';

export type Phase = 'lobby' | GamePhase;

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
  oppConnected: boolean;
  iWantRematch: boolean;
  oppWantsRematch: boolean;
  log: GameLog;
  board: GameState;
  turn: Color;
  canMove: boolean;
  // actions
  startLocal: (whiteName: string, blackName: string) => void;
  hostGame: (name: string) => void;
  joinGame: (code: string, name: string) => void;
  resumeGame: (code: string) => void;
  move: (ply: Ply) => void;
  requestRematch: () => void;
  leave: () => void;
}

interface UseChessOptions {
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

  const setSessionState = useCallback((s: SessionState) => {
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
          if (s) applyOutcome(Session.applyMessage(s, msg));
        },
      },
      { prefix: CHESS_PREFIX, isMessage: isChessMessage },
    );
    return connRef.current;
  }, [applyOutcome]);

  // Persist online games after every change (powers resume). Local games are
  // ephemeral, so chessToStored returns null and nothing is written.
  useEffect(() => {
    if (!session) return;
    const stored = chessToStored(session, Date.now());
    if (stored) saveChessGame(stored);
  }, [session]);

  // Tear down the connection on unmount.
  useEffect(() => {
    return () => {
      connRef.current?.destroy();
      connRef.current = null;
    };
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────────
  const startLocal = useCallback((whiteName: string, blackName: string) => {
    setStatus('idle');
    setSessionState(Session.createLocalSession(whiteName.trim() || 'White', blackName.trim() || 'Black'));
  }, [setSessionState]);

  const hostGame = useCallback((name: string) => {
    const code = generateCode();
    const conn = ensureConn();
    setSessionState(Session.createOnlineSession('host', code, name.trim() || 'Player'));
    conn.host(code);
  }, [ensureConn, setSessionState]);

  const joinGame = useCallback((code: string, name: string) => {
    const conn = ensureConn();
    setSessionState(Session.createOnlineSession('guest', code, name.trim() || 'Player'));
    conn.join(code);
  }, [ensureConn, setSessionState]);

  const resumeGame = useCallback((code: string) => {
    const stored = loadChessGame(code);
    if (!stored) return;
    const conn = ensureConn();
    setSessionState(storedToChess(stored));
    if (stored.side === 'host') conn.host(stored.code);
    else conn.join(stored.code);
  }, [ensureConn, setSessionState]);

  const move = useCallback((ply: Ply) => {
    const s = sessionRef.current;
    if (!s) return;
    applyOutcome(Session.makeMove(s, ply));
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
  }, []);

  // ── Derived view ─────────────────────────────────────────────────────────
  const s = session;
  const board = s ? boardState(s) : Session.boardState(Session.createLocalSession('', ''));
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
    oppConnected: status === 'connected',
    iWantRematch: s?.iWantRematch ?? false,
    oppWantsRematch: s?.oppWantsRematch ?? false,
    log: s?.log ?? [],
    board,
    turn: s ? turnColor(s) : 'w',
    canMove: s ? canIMove(s) : false,
    startLocal,
    hostGame,
    joinGame,
    resumeGame,
    move,
    requestRematch,
    leave,
  };
}
