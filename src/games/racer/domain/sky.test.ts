import { describe, expect, it } from 'vitest';
import { SKY_CEILING, SKY_FLOOR } from './flight';
import {
  CELL,
  RING_RADIUS,
  TRAIL_RING_EVERY,
  TRAIL_STEP,
  cellOf,
  islandsInCell,
  nearestTrailIndex,
  ringAt,
  ringInCell,
  ringsNear,
  trailPoint,
  trailRing,
} from './sky';

describe('the sky', () => {
  it('is the same sky every time: a cell always holds the same ring and islands', () => {
    for (const [cx, cz] of [[3, -7], [-40, 12], [100, 100]]) {
      expect(ringInCell(cx, cz)).toEqual(ringInCell(cx, cz));
      expect(islandsInCell(cx, cz)).toEqual(islandsInCell(cx, cz));
    }
  });

  it('puts a ring straight ahead of the start', () => {
    const r = ringInCell(0, 0)!;
    expect(r.x).toBe(0);
    expect(r.z).toBeGreaterThan(0);
  });

  it('keeps rings inside their cell and inside the flying band', () => {
    let rings = 0;
    for (let cx = -15; cx < 15; cx++) {
      for (let cz = -15; cz < 15; cz++) {
        const r = ringInCell(cx, cz);
        if (!r) continue;
        rings++;
        expect(cellOf(r.x)).toBe(cx);
        expect(cellOf(r.z)).toBe(cz);
        expect(r.y).toBeGreaterThanOrEqual(SKY_FLOOR);
        expect(r.y).toBeLessThanOrEqual(SKY_CEILING);
      }
    }
    // Loose rings are a scattering; the road carries its own.
    expect(rings / 900).toBeGreaterThan(0.15);
    expect(rings / 900).toBeLessThan(0.35);
  });

  it('keeps islands below the racers', () => {
    for (let cx = -10; cx < 10; cx++) {
      for (let cz = -10; cz < 10; cz++) {
        for (const isl of islandsInCell(cx, cz)) expect(isl.y).toBeLessThan(SKY_FLOOR);
      }
    }
  });

  it('knows when a racer is flying through a ring, even across a cell edge', () => {
    const r = ringInCell(0, 0)!;
    expect(ringAt(r.x, r.y, r.z)?.id).toBe(r.id);
    expect(ringAt(r.x + RING_RADIUS * 0.8, r.y, r.z)?.id).toBe(r.id);
    expect(ringAt(r.x + RING_RADIUS * 2, r.y, r.z)).toBeNull();
    expect(ringsNear(r.x, r.z, CELL * 2).some((x) => x.id === r.id)).toBe(true);
  });
});

describe('the rainbow road', () => {
  it('starts at the start line and runs straight, level, through the first ring', () => {
    const start = ringInCell(0, 0)!;
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
