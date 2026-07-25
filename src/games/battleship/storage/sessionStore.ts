/**
 * localStorage persistence for in-progress Ship Battle games, keyed by game
 * code, so a refresh or a crash never loses a game. Combined with the log
 * reconciliation in the protocol this is what powers "step away and resume".
 */

import type { Fleet, GameLog, Side } from '../domain/types';
import { winner } from '../domain/engine';
import type { SessionState } from '../domain/session';
import { safeGet, safeRemove, safeSet } from '@shared/storage/kv';

const SESSION_PREFIX = 'bship:session:v1:';
const LAST_SESSION_KEY = 'bship:lastSession:v1';

/** A snapshot of an in-progress (or finished) game, enough to fully resume. */
export interface GameSession {
  code: string;
  side: Side;
  myName: string;
  mySkinId: string;
  oppName: string | null;
  oppSkinId: string | null;
  myFleet: Fleet;
  myReady: boolean;
  oppReady: boolean;
  log: GameLog;
  finished: boolean;
  updatedAt: number;
}

/** Serialize a live session for storage. `now` is injected so this stays pure. */
export function sessionToStored(s: SessionState, now: number): GameSession {
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
    updatedAt: now,
  };
}

/**
 * Rebuild a session from storage. The setup phase is derived from readiness;
 * rematch flags and the fire lock always start clear on a fresh restore.
 */
export function storedToSession(g: GameSession): SessionState {
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

function sessionKey(code: string): string {
  return SESSION_PREFIX + code;
}

export function saveSession(session: GameSession): void {
  safeSet(sessionKey(session.code), JSON.stringify(session));
  safeSet(LAST_SESSION_KEY, session.code);
}

export function loadSession(code: string): GameSession | null {
  const raw = safeGet(sessionKey(code));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GameSession;
    if (!parsed || typeof parsed.code !== 'string' || !Array.isArray(parsed.log)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession(code: string): void {
  safeRemove(sessionKey(code));
  if (safeGet(LAST_SESSION_KEY) === code) safeRemove(LAST_SESSION_KEY);
}

/**
 * The most recent *resumable* session (has a code, isn't finished). Used by the
 * menu to offer a one-tap "Resume game" prompt.
 */
export function loadResumableSession(): GameSession | null {
  const code = safeGet(LAST_SESSION_KEY);
  if (!code) return null;
  const session = loadSession(code);
  if (!session || session.finished) return null;
  return session;
}
