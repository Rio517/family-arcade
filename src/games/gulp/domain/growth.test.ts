import { describe, expect, it } from 'vitest';
import { START_R, levelOf, levelProgress, massFor, nextLabel, radiusFor, speedOf } from './growth';

describe('growing', () => {
  it('starts at level 1 able to eat cones, benches and trees, not cars', () => {
    expect(levelOf(START_R)).toBe(1);
    expect(nextLabel(START_R)).toBe('Cars');
    expect(levelProgress(START_R)).toBe(0);
  });

  it('opens a tier per level all the way to mountains, and keeps going', () => {
    const seen: string[] = [];
    let last = 1;
    for (let mass = 1; mass < 400000; mass *= 1.01) {
      const lv = levelOf(radiusFor(mass));
      if (lv > last && lv <= 13) {
        last = lv;
        seen.push(nextLabel(radiusFor(mass)) ?? 'Everything');
      }
    }
    // By footprint, a skyscraper is narrower than a stadium, so it comes first.
    expect(seen).toEqual([
      'Vans',
      'Little houses',
      'Buses',
      'Houses',
      'Big houses',
      'Towers',
      'Office blocks',
      'Factories',
      'Skyscrapers',
      'Stadiums',
      'Mountains',
      'Everything',
    ]);
    expect(nextLabel(radiusFor(400000))).toBeNull();
    // No ceiling: past the mountains, levels keep coming.
    expect(levelOf(radiusFor(4e6))).toBeGreaterThan(levelOf(radiusFor(400000)));
    expect(radiusFor(4e6)).toBeGreaterThan(100);
    expect(massFor(radiusFor(1234))).toBeCloseTo(1234, 6);
  });

  it('a giant is a little faster than a small hole, but nowhere near in step with its size', () => {
    const small = speedOf(START_R);
    const giant = speedOf(60);
    expect(giant).toBeGreaterThan(small * 2);
    expect(giant).toBeLessThan(small * 5);
    // Measured in its own width, the giant is much slower: it feels heavy.
    expect(giant / 60).toBeLessThan(small / START_R / 5);
  });
});
