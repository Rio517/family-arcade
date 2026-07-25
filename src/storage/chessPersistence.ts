/**
 * localStorage persistence for online chess games.
 *
 * Chess-namespaced keys (so a chess code never collides with a Ship Battle
 * code) let a refresh or a dropped link resume an in-progress online game.
 * Local (same-device) games are ephemeral and not stored. Every read is
 * defensive: bad JSON degrades to null rather than throwing.
 */

import { createOnlineSession, type SessionState } from '../game/chess/session';
import { isGameOver, replay, status } from '../game/chess/rules';
import type { GameLog, Side } from '../game/chess/types';

const SESSION_PREFIX = 'chess:session:v1:';
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
