import { describe, expect, it } from 'vitest';
import { SKY_CEILING, SKY_FLOOR } from './flight';
import { CLOUD_SEA_Y, ROAD_CLEARANCE, cloudBanksInCell, islandsInCell, roadDistance } from './scenery';
import { CELL, cellOf, trailPoint } from './sky';

describe("the sky's scenery", () => {
  it('is the same sky every time: a cell always holds the same islands', () => {
    for (const [cx, cz] of [[3, -7], [-40, 12], [100, 100], [0, 2]]) {
      expect(islandsInCell(cx, cz)).toEqual(islandsInCell(cx, cz));
    }
  });

  it('keeps every island and cloud bank off the road', () => {
    for (let cx = -12; cx < 12; cx++) {
      for (let cz = -4; cz < 20; cz++) {
        for (const isl of islandsInCell(cx, cz)) {
          expect(roadDistance(isl.x, isl.z)).toBeGreaterThanOrEqual(isl.radius + ROAD_CLEARANCE);
        }
        for (const bank of cloudBanksInCell(cx, cz)) {
          if (bank.y <= CLOUD_SEA_Y || bank.y > SKY_CEILING) continue;
          expect(roadDistance(bank.x, bank.z)).toBeGreaterThanOrEqual(bank.length / 2 + ROAD_CLEARANCE);
        }
      }
    }
  });

  it('keeps the start clear, where the racers line up and the camera waits', () => {
    for (let cx = -2; cx <= 1; cx++) {
      for (let cz = -2; cz <= 1; cz++) {
        for (const isl of islandsInCell(cx, cz)) {
          expect(Math.hypot(isl.x, isl.z)).toBeGreaterThan(isl.radius + ROAD_CLEARANCE);
        }
      }
    }
  });

  it('puts islands at every depth: under the road, level with the racers and above them', () => {
    const tops: number[] = [];
    for (let cx = -10; cx < 10; cx++) {
      for (let cz = -10; cz < 10; cz++) for (const isl of islandsInCell(cx, cz)) tops.push(isl.y);
    }
    const share = (pick: (y: number) => boolean) => tops.filter(pick).length / tops.length;
    expect(tops.length).toBeGreaterThan(400 * 1.1);
    expect(share((y) => y < 0)).toBeGreaterThan(0.2);
    expect(share((y) => y >= SKY_FLOOR && y <= 45)).toBeGreaterThan(0.25);
    expect(share((y) => y > 45)).toBeGreaterThan(0.08);
  });

  it('lines the road with islands close beside it', () => {
    let near = 0;
    for (let i = 10; i < 110; i += 5) {
      const p = trailPoint(i);
      const cx = cellOf(p.x);
      const cz = cellOf(p.z);
      const close = islandsInCell(cx, cz).some((isl) => roadDistance(isl.x, isl.z) < isl.radius + ROAD_CLEARANCE + 40);
      if (close) near++;
    }
    expect(near).toBeGreaterThan(14);
  });

  it("never stacks two of a cell's islands into each other", () => {
    for (let cx = -8; cx < 8; cx++) {
      for (let cz = -8; cz < 8; cz++) {
        const list = islandsInCell(cx, cz);
        for (let a = 0; a < list.length; a++) {
          for (let b = a + 1; b < list.length; b++) {
            expect(Math.hypot(list[a].x - list[b].x, list[a].z - list[b].z)).toBeGreaterThan(list[a].radius + list[b].radius);
          }
        }
      }
    }
  });

  it('sets cloud banks on the cloud sea, beside the road and high above the racers', () => {
    const banks: ReturnType<typeof cloudBanksInCell> = [];
    for (let cx = -6; cx < 6; cx++) for (let cz = -6; cz < 6; cz++) banks.push(...cloudBanksInCell(cx, cz));
    expect(cloudBanksInCell(4, -3)).toEqual(cloudBanksInCell(4, -3));
    expect(banks.some((b) => b.y <= CLOUD_SEA_Y)).toBe(true);
    expect(banks.some((b) => b.y > CLOUD_SEA_Y && b.y < SKY_CEILING)).toBe(true);
    expect(banks.some((b) => b.y > SKY_CEILING)).toBe(true);
    for (const b of banks) expect(b.length).toBeLessThan(CELL);
  });

  it('measures how far a point is from the road', () => {
    expect(roadDistance(trailPoint(30).x, trailPoint(30).z)).toBeCloseTo(0, 5);
    // Beside the straight out of the start.
    const p = trailPoint(2);
    const side = 25;
    expect(roadDistance(p.x + Math.cos(p.heading) * side, p.z - Math.sin(p.heading) * side)).toBeCloseTo(side, 0);
  });

});

describe('island sizes', () => {
  /** The size class of an island, read back from its radius. */
  const sizeOf = (radius: number) => (radius < 17 ? 'small' : radius < 29 ? 'medium' : 'large');
  const all = () => {
    const out: Array<{ cx: number; cz: number; size: string; d: number }> = [];
    for (let cx = -14; cx < 14; cx++) {
      for (let cz = -4; cz < 24; cz++) {
        for (const isl of islandsInCell(cx, cz)) out.push({ cx, cz, size: sizeOf(isl.radius), d: roadDistance(isl.x, isl.z) - isl.radius });
      }
    }
    return out;
  };

  it('makes small islands common and medium ones commoner', () => {
    const list = all();
    const share = (f: string) => list.filter((i) => i.size === f).length / list.length;
    expect(share('small')).toBeGreaterThan(0.1);
    expect(share('medium')).toBeGreaterThan(share('small'));
    expect(share('large')).toBeGreaterThan(0.05);
  });

  it('keeps large islands further from the road than small ones, on average', () => {
    const list = all();
    const mean = (f: string) => {
      const xs = list.filter((i) => i.size === f).map((i) => i.d);
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    expect(mean('large')).toBeGreaterThan(mean('small'));
  });
});
