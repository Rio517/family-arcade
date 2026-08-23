import { describe, expect, it } from 'vitest';

import { BATTLE_LAB_INPUT } from '../../content/naval';
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
});
