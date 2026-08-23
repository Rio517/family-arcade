import { describe, expect, it } from 'vitest';

import { BATTLE_LAB_INPUT } from '../../content/naval';
import { bearingSide } from './geometry';
import { captureCaptain, pressureCaptain, simulateCaptain } from './testFixtures';

describe('normal naval duel pacing', () => {
  it.each([
    ['pressure-and-surrender', pressureCaptain, 'surrender'],
    ['disable-and-board', captureCaptain, 'boarding-ready'],
  ] as const)('%s is viable in a two-to-four-minute normal duel', (_name, captain, outcomeKind) => {
    const result = simulateCaptain(BATTLE_LAB_INPUT, captain);

    expect(result.outcome).toEqual({ kind: outcomeKind, victorShipId: 'player' });
    expect(result.tick).toBeGreaterThanOrEqual(7_200);
    expect(result.tick).toBeLessThanOrEqual(14_400);
  });

  it('submits every opponent fire request once and only from a loaded legal broadside', () => {
    let fireRequests = 0;
    const result = simulateCaptain(BATTLE_LAB_INPUT, pressureCaptain, (state, opponentCommand) => {
      const side = opponentCommand.fire;
      if (!side) return;

      fireRequests += 1;
      const ship = state.ships.opponent;
      const target = state.ships.player;
      expect(Number.isInteger(ship.cannon)).toBe(true);
      expect(ship.cannon).toBeGreaterThan(0);
      expect(ship.reload[side].loaded).toBe(true);
      expect(Math.hypot(target.position.x - ship.position.x, target.position.z - ship.position.z)).toBeLessThanOrEqual(42);
      expect(bearingSide(ship.position, ship.heading, target.position)).toBe(side);
    });
    const opponentVolleys = result.events.filter(
      (event) => event.kind === 'volley' && event.shipId === 'opponent',
    );

    expect(fireRequests).toBe(8);
    expect(fireRequests).toBe(opponentVolleys.length);
  });
});
