import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearSession,
  loadProfile,
  loadResumableSession,
  loadSession,
  saveProfile,
  saveSession,
  sessionToStored,
  storedToSession,
  type GameSession,
} from './persistence';
import { createSession, type SessionState } from '../game/session';
import { defaultProfile } from '../state/profile';
import type { GameLog } from '../game/types';

function sampleSession(overrides: Partial<GameSession> = {}): GameSession {
  const log: GameLog = [{ type: 'start', first: 'host' }];
  return {
    code: 'WXYZ',
    side: 'host',
    myName: 'Rio',
    mySkinId: 'aqua',
    oppName: 'Kid',
    oppSkinId: 'ember',
    myFleet: [],
    myReady: true,
    oppReady: false,
    log,
    finished: false,
    updatedAt: 123,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('profile persistence', () => {
  it('round-trips a profile', () => {
    const p = { ...defaultProfile(), name: 'Rio', points: 350 };
    saveProfile(p);
    expect(loadProfile()).toEqual(p);
  });

  it('returns a default profile when nothing is stored', () => {
    expect(loadProfile()).toEqual(defaultProfile());
  });

  it('recovers from corrupt JSON', () => {
    localStorage.setItem('bship:profile:v1', '{not json');
    expect(loadProfile()).toEqual(defaultProfile());
  });
});

describe('session persistence', () => {
  it('round-trips a session by code', () => {
    const s = sampleSession();
    saveSession(s);
    expect(loadSession('WXYZ')).toEqual(s);
  });

  it('offers the last session as resumable while unfinished', () => {
    saveSession(sampleSession());
    expect(loadResumableSession()?.code).toBe('WXYZ');
  });

  it('does not offer a finished session for resume', () => {
    saveSession(sampleSession({ finished: true }));
    expect(loadResumableSession()).toBeNull();
  });

  it('clears a session and its resume pointer', () => {
    saveSession(sampleSession());
    clearSession('WXYZ');
    expect(loadSession('WXYZ')).toBeNull();
    expect(loadResumableSession()).toBeNull();
  });

  it('returns null for a malformed session blob', () => {
    localStorage.setItem('bship:session:v1:BAD', '{"nope":true}');
    expect(loadSession('BAD')).toBeNull();
  });
});

describe('session <-> stored mapping', () => {
  it('round-trips the persisted fields', () => {
    const live: SessionState = {
      ...createSession('guest', 'ABCD', 'Kid', 'ember'),
      oppName: 'Rio',
      oppSkinId: 'aqua',
      myReady: true,
      log: [{ type: 'start', first: 'host' }],
    };
    const restored = storedToSession(sessionToStored(live, 123));
    expect(restored.code).toBe('ABCD');
    expect(restored.side).toBe('guest');
    expect(restored.oppName).toBe('Rio');
    expect(restored.myReady).toBe(true);
    expect(restored.log).toEqual(live.log);
  });

  it('derives the setup phase from readiness and clears volatile flags', () => {
    const notReady = storedToSession(sessionToStored({ ...createSession('host', 'C', 'N', 'aqua') }, 1));
    expect(notReady.setupPhase).toBe('placing');

    const ready = storedToSession(sessionToStored({ ...createSession('host', 'C', 'N', 'aqua'), myReady: true }, 1));
    expect(ready.setupPhase).toBe('waiting');
    expect(ready.iWantRematch).toBe(false);
    expect(ready.pendingFire).toBeNull();
  });

  it('marks a session finished once someone has won', () => {
    const won: SessionState = {
      ...createSession('host', 'C', 'N', 'aqua'),
      log: [
        { type: 'start', first: 'host' },
        { type: 'shot', by: 'host', row: 0, col: 0, hit: true, sunk: 'destroyer', allSunk: true },
      ],
    };
    expect(sessionToStored(won, 1).finished).toBe(true);
  });
});
