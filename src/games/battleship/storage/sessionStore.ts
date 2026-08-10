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
  /** Which game of the session this is (rematches bump it). Absent in blobs
   * written before epochs existed — treated as 0 on restore. */
  epoch?: number;
  /** Present for games against a computer captain (ADR 0009): everything the
   * loopback peer needs to sail again after a reload. */
  solo?: { personaId: string; botFleet: Fleet; botReady: boolean };
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
    epoch: s.epoch,
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
    epoch: typeof g.epoch === 'number' ? g.epoch : 0,
  };
}

function sessionKey(code: string): string {
  return SESSION_PREFIX + code;
}

export function saveSession(session: GameSession): void {
  safeSet(sessionKey(session.code), JSON.stringify(session));
  safeSet(LAST_SESSION_KEY, session.code);
  // Piggyback housekeeping on the write path so abandoned games (each ~10 kB)
  // don't pile up in localStorage forever. Never touch the game being saved —
  // a just-finished game must survive its own save (rematch/result screen).
  sweepStaleSessions(session.code);
}

/**
 * Remove stored sessions that are finished or unparseable. Best-effort: any
 * storage failure is swallowed — sweeping must never break a save or a resume.
 */
function sweepStaleSessions(keepCode?: string): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(SESSION_PREFIX)) continue;
      const code = key.slice(SESSION_PREFIX.length);
      if (code === keepCode) continue;
      const session = loadSession(code); // null ⇒ missing or unparseable
      if (!session || session.finished) stale.push(code);
    }
    // Remove after the scan — deleting while indexing localStorage skips keys.
    for (const code of stale) clearSession(code);
  } catch {
    /* storage unavailable — non-fatal */
  }
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
  sweepStaleSessions(); // menu-time housekeeping: drop finished/broken saves
  const code = safeGet(LAST_SESSION_KEY);
  if (!code) return null;
  const session = loadSession(code);
  if (!session || session.finished) return null;
  return session;
}
