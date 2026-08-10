import { describe, expect, it } from 'vitest';
import { seededRng } from './rng';

describe('seededRng', () => {
  it('is deterministic: the same seed yields the same sequence', () => {
    const a = seededRng(42);
    const b = seededRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('different seeds diverge', () => {
    expect(seededRng(1)()).not.toBe(seededRng(2)());
  });

  it('yields values in [0, 1)', () => {
    const rng = seededRng(7);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
