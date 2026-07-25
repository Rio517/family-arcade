import { describe, expect, it } from 'vitest';
import { initialState, reducer, type State } from './useBattleship';
import type { GameSession } from '../storage/persistence';
import type { GameLog } from '../game/types';

/**
 * Direct tests of the shipped reducer. The integration test exercises an
 * equivalent hand-rolled peer; these lock down the actual state machine the
 * hook dispatches into.
 */

const base = (): State => initialState('Rio', 'aqua');

describe('useBattleship reducer', () => {
  it('starts in the lobby with empty game state', () => {
    const s = base();
    expect(s.setupPhase).toBe('lobby');
    expect(s.side).toBeNull();
    expect(s.log).toEqual([]);
  });

  it('host/join set the side and advance to fleet selection', () => {
    const host = reducer(base(), { type: 'host', code: 'ABCD', name: 'Rio', skinId: 'ember' });
    expect(host.side).toBe('host');
    expect(host.code).toBe('ABCD');
    expect(host.setupPhase).toBe('fleet');

    const guest = reducer(base(), { type: 'join', code: 'WXYZ', name: 'Kid', skinId: 'aqua' });
    expect(guest.side).toBe('guest');
  });

  it('ready marks the player ready and moves to waiting', () => {
    const s = reducer(base(), { type: 'ready' });
    expect(s.myReady).toBe(true);
    expect(s.setupPhase).toBe('waiting');
  });

  it('any log advance clears the fire lock', () => {
    const withPending: State = { ...base(), pendingFire: { row: 1, col: 1 } };
    const log: GameLog = [{ type: 'start', first: 'host' }];
    const s = reducer(withPending, { type: 'setLog', log });
    expect(s.log).toBe(log);
    expect(s.pendingFire).toBeNull();
  });

  it('resume adopts a saved session (waiting when already ready)', () => {
    const session: GameSession = {
      code: 'GAME',
      side: 'guest',
      myName: 'Kid',
      mySkinId: 'ember',
      oppName: 'Rio',
      oppSkinId: 'aqua',
      myFleet: [],
      myReady: true,
      oppReady: false,
      log: [{ type: 'start', first: 'host' }],
      finished: false,
      updatedAt: 1,
    };
    const s = reducer(base(), { type: 'resume', session });
    expect(s.side).toBe('guest');
    expect(s.code).toBe('GAME');
    expect(s.myReady).toBe(true);
    expect(s.setupPhase).toBe('waiting');
    expect(s.log).toEqual(session.log);
  });

  it('restart clears the board and rematch flags back to placing', () => {
    const dirty: State = {
      ...base(),
      myReady: true,
      oppReady: true,
      iWantRematch: true,
      oppWantsRematch: true,
      myFleet: [{ shipId: 'destroyer', row: 0, col: 0, orientation: 'H' }],
      log: [{ type: 'start', first: 'host' }],
      pendingFire: { row: 2, col: 2 },
    };
    const s = reducer(dirty, { type: 'restart' });
    expect(s.setupPhase).toBe('placing');
    expect(s.myFleet).toEqual([]);
    expect(s.myReady).toBe(false);
    expect(s.oppReady).toBe(false);
    expect(s.iWantRematch).toBe(false);
    expect(s.oppWantsRematch).toBe(false);
    expect(s.log).toEqual([]);
    expect(s.pendingFire).toBeNull();
  });

  it('tracks opponent hello and readiness', () => {
    let s = reducer(base(), { type: 'oppHello', name: 'Kid', skinId: 'void' });
    expect(s.oppName).toBe('Kid');
    expect(s.oppSkinId).toBe('void');
    s = reducer(s, { type: 'oppReady', ready: true });
    expect(s.oppReady).toBe(true);
  });
});
