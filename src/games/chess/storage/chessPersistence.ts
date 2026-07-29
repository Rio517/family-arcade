/**
 * localStorage persistence for chess games.
 *
 * Chess-namespaced keys (so a chess code never collides with a Ship Battle
 * code) let a refresh or a dropped link resume an in-progress online game.
 * Same-device (hotseat) games get one autosave slot of their own — family
 * games stop for dinner, and the board should still be there tomorrow.
 * Every read is defensive: bad JSON degrades to null rather than throwing.
 */

import { createLocalSession, createOnlineSession, type SessionState } from '@games/chess/domain/session';
import { isGameOver, replay, status } from '@games/chess/domain/rules';
import type { GameLog, GameState, Side } from '@games/chess/domain/types';

const SESSION_PREFIX = 'chess:session:v1:';
const LOCAL_KEY = 'chess:local:v1';
const LAST_SESSION_KEY = 'chess:lastSession:v1';

/** A snapshot of an in-progress (or finished) online chess game. */
export interface StoredChessGame {
  code: string;
  side: Side;
  myName: string;
  oppName: string;
  log: GameLog;
  finished: boolean;
  updatedAt: number;
}

/** Serialize a live online session for storage. `now` is injected to stay pure. */
export function chessToStored(s: SessionState, now: number): StoredChessGame | null {
  if (s.mode !== 'online' || !s.side) return null;
  return {
    code: s.code,
    side: s.side,
    myName: s.myName,
    oppName: s.oppName,
    log: s.log,
    finished: isGameOver(status(replay(s.log))),
    updatedAt: now,
  };
}

/** Rebuild a session from storage. Rematch flags start clear on restore. */
export function storedToChess(g: StoredChessGame): SessionState {
  return { ...createOnlineSession(g.side, g.code, g.myName), oppName: g.oppName, log: g.log };
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage full or unavailable — non-fatal */
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function sessionKey(code: string): string {
  return SESSION_PREFIX + code;
}

export function saveChessGame(game: StoredChessGame): void {
  safeSet(sessionKey(game.code), JSON.stringify(game));
  safeSet(LAST_SESSION_KEY, game.code);
}

export function loadChessGame(code: string): StoredChessGame | null {
  const raw = safeGet(sessionKey(code));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredChessGame;
    if (!parsed || typeof parsed.code !== 'string' || !Array.isArray(parsed.log)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearChessGame(code: string): void {
  safeRemove(sessionKey(code));
  if (safeGet(LAST_SESSION_KEY) === code) safeRemove(LAST_SESSION_KEY);
}

/** The most recent resumable online game (has a code, isn't finished). */
export function loadResumableChessGame(): StoredChessGame | null {
  const code = safeGet(LAST_SESSION_KEY);
  if (!code) return null;
  const game = loadChessGame(code);
  if (!game || game.finished) return null;
  return game;
}

// ── The same-device (hotseat) autosave slot ────────────────────────────────

/** A saved hotseat game: names, the move log, and any custom start. */
export interface StoredLocalChess {
  v: 1;
  whiteName: string;
  blackName: string;
  log: GameLog;
  /** Present when the game began from a free-play setup (incl. king hunts). */
  start?: GameState;
  updatedAt: number;
}

/** Autosave the live hotseat session (callers skip finished/empty games). */
export function saveLocalChessGame(s: SessionState, now: number): void {
  if (s.mode !== 'local') return;
  const stored: StoredLocalChess = {
    v: 1,
    whiteName: s.myName,
    blackName: s.oppName,
    log: s.log,
    ...(s.start ? { start: s.start } : {}),
    updatedAt: now,
  };
  safeSet(LOCAL_KEY, JSON.stringify(stored));
}

/** The saved hotseat game, or null if none / finished / unreadable. */
export function loadLocalChessGame(): StoredLocalChess | null {
  const raw = safeGet(LOCAL_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredLocalChess;
    if (parsed?.v !== 1 || !Array.isArray(parsed.log)) return null;
    // Prove the log still replays (guards against corrupt or stale saves).
    const state = replay(parsed.log, parsed.start);
    if (isGameOver(status(state))) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Rebuild a live hotseat session from the autosave. */
export function storedToLocalChess(g: StoredLocalChess): SessionState {
  return { ...createLocalSession(g.whiteName, g.blackName, g.start), log: g.log };
}

export function clearLocalChessGame(): void {
  safeRemove(LOCAL_KEY);
}
