import { describe, expect, it } from 'vitest';
import { seededRng } from '@shared/rng';
import { createCity, type MapId } from '../domain/city';
import { HORIZON, countryGrass, grassTint, runwayMarks, scenery } from './ground';

describe('the grass', () => {
  it('changes colour smoothly everywhere: no step between two spots side by side', () => {
    let worst = 0;
    for (let x = -500; x < 500; x += 3.7) {
      for (let z = -500; z < 500; z += 3.7) {
        const a = grassTint(x, z);
        const b = grassTint(x + 0.1, z);
        const c = grassTint(x, z + 0.1);
        for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(a[k] - b[k]), Math.abs(a[k] - c[k]));
      }
    }
    expect(worst).toBeLessThan(0.002);
  });

  it('lays the countryside as one meadow round the street grid and on to the horizon, never over the sea, with no joins or cracks', () => {
    for (const map of ['town', 'city', 'mega', 'region'] as MapId[]) {
      const city = createCity(seededRng(1), map);
      const g = countryGrass(city);
      const pos = g.attributes.position;
      const index = g.index!.array;
      let ring = 0;
      const edges = new Map<string, number>();
      for (let t = 0; t < index.length; t += 3) {
        const [a, b, c] = [index[t], index[t + 1], index[t + 2]];
        const ux = pos.getX(b) - pos.getX(a);
        const uz = pos.getZ(b) - pos.getZ(a);
        const vx = pos.getX(c) - pos.getX(a);
        const vz = pos.getZ(c) - pos.getZ(a);
        const up = uz * vx - ux * vz;
        expect(up).toBeGreaterThan(0);
        const mx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
        const mz = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
        if (Math.abs(mx) < city.land && Math.abs(mz) < city.land) ring += up / 2;
        // Nothing out over the sea.
        const sea = { n: mz < -city.land, s: mz > city.land, w: mx < -city.land, e: mx > city.land };
        for (const side of city.shores) expect(sea[side]).toBe(false);
        for (const [p, q] of [
          [a, b],
          [b, c],
          [c, a],
        ]) {
          const k = p < q ? `${p}:${q}` : `${q}:${p}`;
          edges.set(k, (edges.get(k) ?? 0) + 1);
        }
      }
      // Inside the edge of play: exactly the ring round the grid.
      expect(ring).toBeCloseTo((2 * city.land) ** 2 - (2 * city.half) ** 2, 0);
      // An edge with one triangle runs along the grid, a shore or the horizon.
      for (const [k, count] of edges) {
        if (count === 2) continue;
        expect(count).toBe(1);
        const [p, q] = k.split(':').map(Number);
        const x = (pos.getX(p) + pos.getX(q)) / 2;
        const z = (pos.getZ(p) + pos.getZ(q)) / 2;
        const m = Math.max(Math.abs(x), Math.abs(z));
        const rim = [city.half, city.land, HORIZON].some((e) => Math.abs(m - e) < 1e-3) || Math.abs(Math.abs(x) - city.land) < 1e-3 || Math.abs(Math.abs(z) - city.land) < 1e-3;
        expect(rim, `${x},${z}`).toBe(true);
      }
    }
  });
});

describe('the airport', () => {
  it('paints the runway inside its edges, with a number at each end', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const f = createCity(seededRng(seed), 'region').airfield!;
      const marks = runwayMarks(f);
      for (const m of marks) {
        expect(m.x0).toBeGreaterThanOrEqual(f.runway.x0);
        expect(m.x1).toBeLessThanOrEqual(f.runway.x1);
        expect(m.z0).toBeGreaterThanOrEqual(f.runway.z0);
        expect(m.z1).toBeLessThanOrEqual(f.runway.z1);
      }
      // Edge lines, 12 threshold stripes, some dashes and two two-digit numbers.
      expect(marks.length).toBeGreaterThan(2 + 12 + 5 + 8);
    }
  });
});

describe('the land past the edge of play', () => {
  it('puts its fields and trees on the green sides, never on the playable land or over the sea', () => {
    for (const map of ['town', 'city', 'mega', 'region'] as MapId[]) {
      const city = createCity(seededRng(2), map);
      const { fields, trees } = scenery(city);
      expect(trees.length).toBeGreaterThan(50);
      const spots = [...trees, ...fields.map((f) => ({ x: (f.x0 + f.x1) / 2, z: (f.z0 + f.z1) / 2 }))];
      for (const { x, z } of spots) {
        expect(Math.max(Math.abs(x), Math.abs(z))).toBeGreaterThan(city.land);
        const sea = { n: z < -city.land, s: z > city.land, w: x < -city.land, e: x > city.land };
        for (const side of city.shores) expect(sea[side]).toBe(false);
      }
    }
  });
});
