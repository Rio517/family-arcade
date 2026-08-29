import { describe, expect, it } from 'vitest';
import { GAMES } from './registry';

describe('the registry', () => {
  it('every game says how many chairs it seats on this device', () => {
    expect(GAMES.length).toBeGreaterThan(1);
    for (const game of GAMES) {
      expect(game.seats.min, game.id).toBeGreaterThanOrEqual(1);
      expect(game.seats.max, game.id).toBeGreaterThanOrEqual(game.seats.min);
      // A device never seats more people than the game admits at all.
      expect(game.seats.max, game.id).toBeLessThanOrEqual(game.players.max);
    }
  });
});
