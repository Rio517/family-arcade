import { describe, expect, it } from 'vitest';

import { BATTLE_LAB_INPUT } from '../../content/naval';
import { createNavalBattle } from './createBattle';
import { broadsideVector } from './geometry';
import { moveShipsOneTick } from './movement';
import { command, fixture } from './testFixtures';
import type { NavalCommand, NavalState, Point } from './types';

function expectPoint(actual: Point, expected: Point): void {
  expect(actual.x).toBeCloseTo(expected.x, 10);
  expect(actual.z).toBeCloseTo(expected.z, 10);
}

function moveForTicks(state: NavalState, playerCommand: NavalCommand, ticks: number) {
  const start = { ...state.ships.player.position };
  let next = structuredClone(state);
  next.ships.player.reload.port = {
    ...next.ships.player.reload.port,
    progress: 0,
    loaded: false,
  };

  for (let tick = 0; tick < ticks; tick++) {
    next = moveShipsOneTick(next, { player: playerCommand });
  }

  const player = next.ships.player;
  return {
    heading: player.heading,
    distanceTravelled: Math.hypot(player.position.x - start.x, player.position.z - start.z),
    reloadProgress: player.reload.port.progress,
  };
}

describe('fixed-tick naval movement', () => {
  it('binds heading zero, controls, and physical turn signs together', () => {
    const state = createNavalBattle(BATTLE_LAB_INPUT);
    const afterPort = moveShipsOneTick(state, { player: command({ rudder: -1 }) });
    const afterStarboard = moveShipsOneTick(state, { player: command({ rudder: 1 }) });
    expectPoint(broadsideVector(0, 'port'), { x: 1, z: 0 });
    expectPoint(broadsideVector(0, 'starboard'), { x: -1, z: 0 });
    expect(afterPort.ships.player.heading).toBeGreaterThan(0);
    expect(afterStarboard.ships.player.heading).toBeLessThan(0);
  });

  it('trades speed for turn authority when reefed', () => {
    const full = moveForTicks(fixture({ player: { heading: Math.PI / 2 } }), command({ rudder: 1, sail: 'full' }), 60);
    const reefed = moveForTicks(fixture({ player: { heading: Math.PI / 2 } }), command({ rudder: 1, sail: 'reefed' }), 60);
    expect(Math.abs(reefed.heading - Math.PI / 2)).toBeGreaterThan(Math.abs(full.heading - Math.PI / 2));
    expect(reefed.distanceTravelled).toBeLessThan(full.distanceTravelled);
  });

  it('makes sail and crew damage reduce the systems they operate', () => {
    const healthy = moveForTicks(fixture(), command(), 60);
    const damaged = moveForTicks(fixture({ player: { sails: 25, crew: 12 } }), command(), 60);
    expect(damaged.distanceTravelled).toBeLessThan(healthy.distanceTravelled * 0.55);
    expect(damaged.reloadProgress).toBeLessThan(healthy.reloadProgress);
  });

  it('adds integer reload work to an unloaded battery', () => {
    const afterOneTick = moveForTicks(fixture(), command(), 1);
    expect(afterOneTick.reloadProgress).toBe(1_000);
  });

  it('returns a fresh state without changing the supplied canonical snapshot', () => {
    const state = fixture();
    const before = structuredClone(state);
    const next = moveShipsOneTick(state, { player: command({ rudder: 1, sail: 'reefed', ammunition: 'chain' }) });

    expect(next).not.toBe(state);
    expect(state).toEqual(before);
    expect(next.tick).toBe(state.tick + 1);
    expect(next.ships.player.ammunition).toBe('chain');
  });
});
