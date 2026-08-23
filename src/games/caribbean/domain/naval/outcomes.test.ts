import { describe, expect, it } from 'vitest';

import { evaluateOutcome } from './outcomes';
import { fixture } from './testFixtures';
import type { NavalShipState } from './types';

const BOARDING_FAILURES: ReadonlyArray<[
  string,
  { player?: Partial<NavalShipState>; opponent?: Partial<NavalShipState> },
]> = [
  ['distance', { opponent: { position: { x: 7.01, z: 0 } } }],
  ['relative speed', { player: { speed: 1.51 } }],
  ['target sails', { opponent: { sails: 31 } }],
  ['target crew', { opponent: { crew: 19 } }],
  ['crew advantage', { player: { crew: 17 } }],
];

describe('naval battle outcomes', () => {
  it('makes a disabled close prize boarding-ready without swordplay', () => {
    const state = fixture({
      player: { position: { x: 0, z: 0 }, speed: 0.8, crew: 52 },
      opponent: { position: { x: 5.5, z: 0 }, speed: 0, sails: 25, crew: 14 },
    });
    expect(evaluateOutcome(state)).toEqual({ kind: 'boarding-ready', victorShipId: 'player' });
  });

  it.each([
    ['same direction at equal high speed', 3, 0, 3, 0, true],
    ['head-on at the relative-speed boundary', 0.75, 0, 0.75, Math.PI, true],
    ['head-on beyond the relative-speed boundary', 0.751, 0, 0.751, Math.PI, false],
    ['perpendicular within the relative-speed boundary', 1.06, 0, 1.06, Math.PI / 2, true],
    ['perpendicular beyond the relative-speed boundary', 1.061, 0, 1.061, Math.PI / 2, false],
  ] as const)(
    'uses vector-relative velocity when ships move %s',
    (_label, playerSpeed, playerHeading, opponentSpeed, opponentHeading, boardingReady) => {
      const state = fixture({
        player: { position: { x: 0, z: 0 }, speed: playerSpeed, heading: playerHeading, crew: 52 },
        opponent: {
          position: { x: 5.5, z: 0 },
          speed: opponentSpeed,
          heading: opponentHeading,
          sails: 25,
          crew: 14,
        },
      });
      expect(evaluateOutcome(state)).toEqual(
        boardingReady ? { kind: 'boarding-ready', victorShipId: 'player' } : null,
      );
    },
  );

  it.each(BOARDING_FAILURES)('does not declare boarding-ready beyond the %s gate', (_label, change) => {
    const state = fixture({
      player: { position: { x: 0, z: 0 }, speed: 0, crew: 52, ...change.player },
      opponent: { position: { x: 5.5, z: 0 }, speed: 0, sails: 25, crew: 14, ...change.opponent },
    });
    expect(evaluateOutcome(state)).toBeNull();
  });

  it.each([
    ['player', 'opponent'],
    ['opponent', 'player'],
  ] as const)('declares %s sunk at zero hull with %s victorious', (shipId, victorShipId) => {
    expect(evaluateOutcome(fixture({ [shipId]: { hull: 0 } }))).toEqual({ kind: 'sunk', victorShipId });
  });

  it.each([
    ['hull', { hull: 20 }],
    ['crew', { crew: 8 }],
  ] as const)('accepts surrender when the opponent reaches the %s threshold', (_label, opponent) => {
    expect(evaluateOutcome(fixture({ opponent }))).toEqual({ kind: 'surrender', victorShipId: 'player' });
  });

  it('prioritizes sinking over surrender and boarding conditions', () => {
    const state = fixture({
      player: { position: { x: 0, z: 0 }, crew: 52 },
      opponent: { position: { x: 5, z: 0 }, hull: 0, sails: 20, crew: 8 },
    });
    expect(evaluateOutcome(state)).toEqual({ kind: 'sunk', victorShipId: 'player' });
  });

  it('lets a ship escape only beyond the arena while moving outward', () => {
    const outward = fixture({ opponent: { position: { x: 93, z: 0 }, heading: Math.PI / 2, speed: 1 } });
    const inward = fixture({ opponent: { position: { x: 93, z: 0 }, heading: -Math.PI / 2, speed: 1 } });
    expect(evaluateOutcome(outward)).toEqual({ kind: 'escaped', shipId: 'opponent' });
    expect(evaluateOutcome(inward)).toBeNull();
  });

  it('separates the encounter at the integer tick limit', () => {
    const before = fixture({ input: { timeLimitTicks: 12 }, tick: 11 });
    const atLimit = fixture({ input: { timeLimitTicks: 12 }, tick: 12 });
    expect(evaluateOutcome(before)).toBeNull();
    expect(evaluateOutcome(atLimit)).toEqual({ kind: 'separated', shipId: 'player' });
  });
});
