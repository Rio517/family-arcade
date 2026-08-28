import { describe, expect, it } from 'vitest';

import { NAVAL_WATER_PRESENTATION } from './waterPresentation';

describe('NAVAL_WATER_PRESENTATION', () => {
  it('keeps the open sea calm enough for board-scale ships to read as heavy', () => {
    expect(NAVAL_WATER_PRESENTATION.waveAAmplitude).toBe(0.07);
    expect(NAVAL_WATER_PRESENTATION.waveBAmplitude).toBe(0.05);
    expect(NAVAL_WATER_PRESENTATION.waveAAmplitude + NAVAL_WATER_PRESENTATION.waveBAmplitude).toBeCloseTo(0.12);
    expect(NAVAL_WATER_PRESENTATION.waveASpeed).toBeLessThanOrEqual(0.45);
    expect(NAVAL_WATER_PRESENTATION.waveBSpeed).toBeLessThanOrEqual(0.36);
  });

  it('limits idle hull motion and removes the redundant surface wind streaks', () => {
    expect(NAVAL_WATER_PRESENTATION.shipHeave).toBe(0.06);
    expect(NAVAL_WATER_PRESENTATION.shipPitch).toBe(0.01);
    expect(NAVAL_WATER_PRESENTATION.shipAmbientRoll).toBe(0.006);
    expect(NAVAL_WATER_PRESENTATION.renderWindLines).toBe(false);
    expect(Object.isFrozen(NAVAL_WATER_PRESENTATION)).toBe(true);
  });
});
