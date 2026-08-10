import { describe, expect, it } from 'vitest';
import { paperGrainDataUrl } from './paperGrain';

/**
 * The parchment grain is baked to a bitmap once instead of living as an
 * feTurbulence filter — the live filter re-generated its noise on every
 * zoom-scale change (~430ms per pinch frame at tablet resolution). jsdom has
 * no 2D canvas, so here the bake must degrade to null (plain parchment, no
 * grain) rather than crash — the same guard covers any browser where canvas
 * is unavailable.
 */
describe('paperGrainDataUrl', () => {
  it('returns null gracefully when the canvas 2D context is unavailable', () => {
    expect(paperGrainDataUrl()).toBeNull();
  });

  it('memoizes: repeated calls return the identical result', () => {
    expect(paperGrainDataUrl()).toBe(paperGrainDataUrl());
  });
});
