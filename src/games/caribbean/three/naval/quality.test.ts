import { describe, expect, it } from 'vitest';

import { QUALITY_TIERS, QualityController, qualitySettings } from './quality';

function repeat(count: number, sample: () => void): void {
  for (let index = 0; index < count; index += 1) sample();
}

describe('adaptive naval scene quality', () => {
  it('drops after five slow seconds and raises only after twenty fast seconds', () => {
    const quality = new QualityController('high');

    repeat(5, () => quality.sample(47, 1));
    expect(quality.tier).toBe('medium');

    repeat(19, () => quality.sample(59, 1));
    expect(quality.tier).toBe('medium');
    quality.sample(59, 1);
    expect(quality.tier).toBe('high');
  });

  it('requires consecutive threshold time and drops at most one tier per slow window', () => {
    const quality = new QualityController('high');

    repeat(4, () => quality.sample(40, 1));
    quality.sample(52, 1);
    repeat(4, () => quality.sample(40, 1));
    expect(quality.tier).toBe('high');

    quality.sample(40, 1);
    expect(quality.tier).toBe('medium');
    expect(quality.sample(40, 4.9)).toBe(false);
    expect(quality.tier).toBe('medium');
    expect(quality.sample(40, 0.1)).toBe(true);
    expect(quality.tier).toBe('low');
  });

  it('raises at most once per battle even after a later drop', () => {
    const quality = new QualityController('low');

    expect(quality.sample(60, 20)).toBe(true);
    expect(quality.tier).toBe('medium');
    expect(quality.sample(40, 5)).toBe(true);
    expect(quality.tier).toBe('low');
    expect(quality.sample(60, 40)).toBe(false);
    expect(quality.tier).toBe('low');
  });

  it('maps exact DPR, shadow, and bounded effect budgets for each tier', () => {
    expect(QUALITY_TIERS).toEqual({
      low: { dprCap: 1, shadows: false, shadowMapSize: 0, effectCapacity: 32 },
      medium: { dprCap: 1.4, shadows: true, shadowMapSize: 512, effectCapacity: 64 },
      high: { dprCap: 1.75, shadows: true, shadowMapSize: 1024, effectCapacity: 96 },
    });
    expect(qualitySettings('low', 2)).toMatchObject({ dpr: 1, effectCapacity: 32 });
    expect(qualitySettings('medium', 1.25)).toMatchObject({ dpr: 1.25, effectCapacity: 64 });
    expect(qualitySettings('high', 3)).toMatchObject({ dpr: 1.75, effectCapacity: 96 });
  });
});
