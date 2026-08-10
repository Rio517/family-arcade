import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearSession,
  loadResumableSession,
  loadSession,
  saveSession,
  sessionToStored,
  storedToSession,
  type GameSession,
} from './sessionStore';
import { createSession, type SessionState } from '../domain/session';
import type { GameLog } from '../domain/types';

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
    epoch: 0,
    finished: false,
    updatedAt: 123,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
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

  it('round-trips the solo-opponent extras for computer games', () => {
    const s = sampleSession({
      code: 'SOLO',
      solo: { personaId: 'grimtide', botFleet: [], botReady: true },
    });
    saveSession(s);
    expect(loadSession('SOLO')?.solo?.personaId).toBe('grimtide');
    // Old blobs without the field still load and derive a normal session.
    const older = sampleSession();
    saveSession(older);
    expect(loadSession('WXYZ')?.solo).toBeUndefined();
    expect(storedToSession(older).code).toBe('WXYZ');
  });

  it('returns null for a malformed session blob', () => {
    localStorage.setItem('bship:session:v1:BAD', '{"nope":true}');
    expect(loadSession('BAD')).toBeNull();
  });
});

describe('stale session sweep', () => {
  it('saving prunes finished and unparseable sessions, keeping live ones', () => {
    saveSession(sampleSession({ code: 'DONE', finished: true }));
    saveSession(sampleSession({ code: 'LIVE' }));
    localStorage.setItem('bship:session:v1:JUNK', 'not json at all');
    localStorage.setItem('bship:session:v1:SHAPE', '{"nope":true}');

    saveSession(sampleSession({ code: 'WXYZ' }));

    expect(loadSession('DONE')).toBeNull();
    expect(localStorage.getItem('bship:session:v1:JUNK')).toBeNull();
    expect(localStorage.getItem('bship:session:v1:SHAPE')).toBeNull();
    expect(loadSession('LIVE')).not.toBeNull();
    expect(loadSession('WXYZ')).not.toBeNull();
  });

  it('never sweeps the session being saved, even when it just finished', () => {
    saveSession(sampleSession({ code: 'WXYZ', finished: true }));
    expect(loadSession('WXYZ')).not.toBeNull();
  });

  it('loadResumableSession prunes stale sessions and their resume pointer', () => {
    saveSession(sampleSession({ code: 'DONE', finished: true }));
    expect(loadResumableSession()).toBeNull();
    // The finished game and its last-session pointer are gone from storage.
    expect(localStorage.getItem('bship:session:v1:DONE')).toBeNull();
    expect(localStorage.getItem('bship:lastSession:v1')).toBeNull();
  });

  it('sweeping leaves an unfinished last session resumable', () => {
    saveSession(sampleSession({ code: 'DONE', finished: true }));
    saveSession(sampleSession({ code: 'LIVE' }));
    expect(loadResumableSession()?.code).toBe('LIVE');
    expect(loadSession('DONE')).toBeNull();
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
      epoch: 2,
    };
    const restored = storedToSession(sessionToStored(live, 123));
    expect(restored.code).toBe('ABCD');
    expect(restored.side).toBe('guest');
    expect(restored.oppName).toBe('Rio');
    expect(restored.myReady).toBe(true);
    expect(restored.log).toEqual(live.log);
    expect(restored.epoch).toBe(2);
  });

  it('restores epoch 0 from a blob written before epochs existed', () => {
    const { epoch: _dropped, ...legacy } = sampleSession();
    expect(storedToSession(legacy as GameSession).epoch).toBe(0);
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
