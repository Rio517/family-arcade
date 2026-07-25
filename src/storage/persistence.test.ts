import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearSession,
  loadProfile,
  loadResumableSession,
  loadSession,
  saveProfile,
  saveSession,
  type GameSession,
} from './persistence';
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
