import { describe, expect, it } from 'vitest';
import { seededRng } from '@shared/rng';
import { createCity, type MapId } from '../domain/city';
import { countryGrass, grassTint, runwayMarks } from './ground';

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

  it('lays the countryside as one meadow round the street grid, with no joins or cracks', () => {
    expect(countryGrass(createCity(seededRng(1), 'town'))).toBeNull();
    for (const map of ['city', 'mega', 'region'] as MapId[]) {
      const city = createCity(seededRng(1), map);
      const g = countryGrass(city)!;
      const pos = g.attributes.position;
      const index = g.index!.array;
      let area = 0;
      // Each inside edge belongs to exactly two triangles; an edge with only
      // one runs along the grid's edge or the shore, never across the meadow.
      const edges = new Map<string, number>();
      for (let t = 0; t < index.length; t += 3) {
        const [a, b, c] = [index[t], index[t + 1], index[t + 2]];
        const ux = pos.getX(b) - pos.getX(a);
        const uz = pos.getZ(b) - pos.getZ(a);
        const vx = pos.getX(c) - pos.getX(a);
        const vz = pos.getZ(c) - pos.getZ(a);
        const up = uz * vx - ux * vz;
        expect(up).toBeGreaterThan(0);
        area += up / 2;
        for (const [p, q] of [
          [a, b],
          [b, c],
          [c, a],
        ]) {
          const k = p < q ? `${p}:${q}` : `${q}:${p}`;
          edges.set(k, (edges.get(k) ?? 0) + 1);
        }
      }
      expect(area).toBeCloseTo((2 * city.land) ** 2 - (2 * city.half) ** 2, 1);
      for (const [k, count] of edges) {
        if (count === 2) continue;
        expect(count).toBe(1);
        const [p, q] = k.split(':').map(Number);
        const x = (pos.getX(p) + pos.getX(q)) / 2;
        const z = (pos.getZ(p) + pos.getZ(q)) / 2;
        const onRim = [city.half, city.land].some((e) => Math.abs(Math.max(Math.abs(x), Math.abs(z)) - e) < 1e-3);
        expect(onRim).toBe(true);
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
