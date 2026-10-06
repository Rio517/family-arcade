import { describe, expect, it } from 'vitest';
import { SKY_CEILING, SKY_FLOOR } from './flight';
import { FIRST_RING, RING_RADIUS, TRAIL_RING_EVERY, TRAIL_STEP, nearestTrailIndex, ringAt, trailPoint, trailRing } from './sky';

describe('the sky', () => {
  it('puts a ring straight ahead of the start, on the road', () => {
    const r = trailRing(FIRST_RING)!;
    expect(r.x).toBeCloseTo(0, 5);
    expect(r.z).toBeGreaterThan(0);
    expect(trailRing(0)).toBeNull();
    expect(trailRing(1)).toBeNull();
  });

  it('hangs every ring over the road, and nowhere else', () => {
    for (let i = 0; i < 300; i++) {
      const r = trailRing(i);
      const expected = i === FIRST_RING || (i > 0 && i % TRAIL_RING_EVERY === 0);
      expect(!!r).toBe(expected);
      if (!r) continue;
      const p = trailPoint(i);
      expect([r.x, r.y, r.z]).toEqual([p.x, p.y, p.z]);
    }
    // Well off the road, the sky holds no ring to fly through.
    const p = trailPoint(TRAIL_RING_EVERY * 4);
    for (const [dx, dz] of [[60, 0], [-90, 40], [0, 150]]) {
      expect(ringAt(p.x + dx, p.y, p.z + dz)).toBeNull();
    }
  });

  it('knows when a racer is flying through a ring', () => {
    const r = trailRing(FIRST_RING)!;
    expect(ringAt(r.x, r.y, r.z)?.id).toBe(r.id);
    expect(ringAt(r.x + RING_RADIUS * 0.8, r.y, r.z)?.id).toBe(r.id);
    expect(ringAt(r.x + RING_RADIUS * 2, r.y, r.z)).toBeNull();
  });
});

describe('the rainbow road', () => {
  it('starts at the start line and runs straight, level, through the first ring', () => {
    const start = trailRing(FIRST_RING)!;
    for (let i = 0; i <= 3; i++) {
      const p = trailPoint(i);
      expect(p.x).toBeCloseTo(0, 5);
      expect(p.y).toBeCloseTo(start.y, 5);
    }
  });

  it('winds on forever in even steps, inside the flying band, the same every time', () => {
    for (let i = 1; i < 400; i++) {
      const a = trailPoint(i - 1);
      const b = trailPoint(i);
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(TRAIL_STEP, 5);
      expect(b.y).toBeGreaterThanOrEqual(SKY_FLOOR);
      expect(b.y).toBeLessThanOrEqual(SKY_CEILING);
      // Sweeps, never a hairpin.
      expect(Math.abs(b.heading - a.heading)).toBeLessThan(0.5);
    }
    const headings = Array.from({ length: 400 }, (_, i) => trailPoint(i).heading);
    expect(Math.max(...headings) - Math.min(...headings)).toBeGreaterThan(0.8);
  });

  it('finds the nearest road point from a hint or from nothing at all', () => {
    const p = trailPoint(150);
    expect(nearestTrailIndex(p.x + 3, p.z - 2, 140)).toBe(150);
    expect(nearestTrailIndex(p.x + 3, p.z - 2, 0)).toBe(150);
  });

  it('hangs a ring over the road at regular points, and flying through it counts', () => {
    const r = trailRing(TRAIL_RING_EVERY * 5)!;
    expect(r.id).toBe(`t:${TRAIL_RING_EVERY * 5}`);
    expect(trailRing(TRAIL_RING_EVERY * 5 + 1)).toBeNull();
    expect(ringAt(r.x, r.y, r.z)?.id).toBe(r.id);
  });
});
