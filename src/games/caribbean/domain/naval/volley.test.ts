import { describe, expect, it } from 'vitest';

import { nextSeed } from './rng';
import { accuracyFor, damageFor, resolveVolley } from './volley';

describe('deterministic naval volleys', () => {
  it('advances the unsigned LCG by one literal sample', () => {
    expect(nextSeed(1702)).toBe(3_846_925_773);
    expect(nextSeed(3_846_925_773)).toBe(2_819_110_088);
  });

  it('resolves one volley independently of visual cannonballs', () => {
    expect(resolveVolley({
      seed: 1702,
      volleyId: 7,
      side: 'port',
      ammunition: 'chain',
      cannon: 4,
      accuracy: 0.66,
      damagePerHit: { hull: 1, sails: 9, crew: 1, cannon: 0 },
    })).toEqual({
      volleyId: 7,
      side: 'port',
      ammunition: 'chain',
      fired: 4,
      hits: 2,
      misses: 2,
      damage: { hull: 2, sails: 18, crew: 2, cannon: 0 },
      seedAfter: 2_876_432_698,
      samples: [
        { index: 0, normalizedSpread: 0.7913644076324999, hit: false },
        { index: 1, normalizedSpread: 0.3127504326403141, hit: true },
        { index: 2, normalizedSpread: -0.6139734354801476, hit: true },
        { index: 3, normalizedSpread: 0.3394433530047536, hit: false },
      ],
    });
  });

  it.each([
    ['round', 0, { hull: 12, sails: 1, crew: 1, cannon: 2 }],
    ['chain', 0, { hull: 2, sails: 14, crew: 2, cannon: 0 }],
    ['grape', 0, { hull: 1, sails: 0, crew: 12, cannon: 0 }],
    ['round', 1, { hull: 9, sails: 1, crew: 1, cannon: 2 }],
    ['chain', 1, { hull: 1, sails: 6, crew: 1, cannon: 0 }],
    ['grape', 1, { hull: 0, sails: 0, crew: 2, cannon: 0 }],
  ] as const)('%s has the intended profile at normalized range %d', (ammo, range, want) => {
    expect(damageFor(ammo, range)).toEqual(want);
  });

  it('clamps range and damage-aware accuracy at their documented bounds', () => {
    expect(damageFor('round', -1)).toEqual({ hull: 12, sails: 1, crew: 1, cannon: 2 });
    expect(damageFor('grape', 2)).toEqual({ hull: 0, sails: 0, crew: 2, cannon: 0 });
    expect(accuracyFor(0, 50, 100)).toBeCloseTo(0.78, 10);
    expect(accuracyFor(1, 50, 100)).toBeCloseTo(0.42, 10);
    expect(accuracyFor(1, 0, 0)).toBe(0.12);
  });
});
