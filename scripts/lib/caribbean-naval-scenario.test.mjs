import { describe, expect, it } from 'vitest';

import { boardingScenario } from '../caribbean-naval-check.mjs';
import { createNavalBattle } from '../../src/games/caribbean/domain/naval/createBattle';
import { evaluateOutcome } from '../../src/games/caribbean/domain/naval/outcomes';
import {
  advanceOpponentController,
  initialOpponentController,
} from '../../src/games/caribbean/domain/naval/opponent';
import { stepBattle } from '../../src/games/caribbean/domain/naval/stepBattle';

describe('boarding browser scenario', () => {
  it('starts valid and unresolved, then reaches boarding-ready through real ticks within 15 seconds', () => {
    const input = boardingScenario();
    let state = createNavalBattle(input);
    let controller = initialOpponentController();
    expect(evaluateOutcome(state)).toBeNull();

    for (let tick = 0; tick < 900 && !state.outcome; tick += 1) {
      const opponent = advanceOpponentController(state, controller);
      controller = opponent.controller;
      state = stepBattle(state, {
        player: { rudder: 0, sail: 'full', ammunition: 'round', fire: null },
        opponent: opponent.command,
      });
    }

    expect(state.tick).toBeLessThan(900);
    expect(state.outcome).toEqual({ kind: 'boarding-ready', victorShipId: 'player' });
  });
});
