import { describe, expect, it } from 'vitest';
import { SKY_CEILING, SKY_FLOOR } from './flight';
import { CELL, RING_RADIUS, cellOf, islandsInCell, ringAt, ringInCell, ringsNear } from './sky';

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
    // Plenty, not a wall of them.
    expect(rings / 900).toBeGreaterThan(0.3);
    expect(rings / 900).toBeLessThan(0.55);
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
