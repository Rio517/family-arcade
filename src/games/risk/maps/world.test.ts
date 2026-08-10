import { describe, expect, it } from 'vitest';
import { geoNaturalEarth1 } from 'd3-geo';
import { worldMap } from './world';

const map = worldMap.build();
const topo = map.topology;

/** Every x (or [x,y]) coordinate pair in a path string. */
const points = (d: string): [number, number][] =>
  [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [parseFloat(m[1]), parseFloat(m[2])]);
const pathOf = (id: string) => map.territories.find((t) => t.id === id)!.path;

describe('world map', () => {
  it('renders every territory with a non-empty path and an in-bounds label', () => {
    expect(map.territories).toHaveLength(topo.territoryIds.length);
    expect(map.territories.length).toBeGreaterThanOrEqual(30);
    for (const t of map.territories) {
      expect(t.path.length).toBeGreaterThan(0);
      expect(t.labelX).toBeGreaterThanOrEqual(0);
      expect(t.labelX).toBeLessThanOrEqual(map.width);
      expect(t.labelY).toBeGreaterThanOrEqual(0);
      expect(t.labelY).toBeLessThanOrEqual(map.height);
    }
  });

  it('has a symmetric adjacency graph referencing only real territories', () => {
    const ids = new Set(topo.territoryIds);
    for (const [a, neighbours] of Object.entries(topo.adjacency)) {
      expect(ids.has(a)).toBe(true);
      for (const b of neighbours) {
        expect(ids.has(b)).toBe(true);
        expect(topo.adjacency[b]).toContain(a); // undirected
      }
    }
  });

  it('is one connected landmass (every territory reachable)', () => {
    const seen = new Set<string>([topo.territoryIds[0]]);
    const stack = [topo.territoryIds[0]];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const n of topo.adjacency[cur]) if (!seen.has(n)) { seen.add(n); stack.push(n); }
    }
    expect(seen.size).toBe(topo.territoryIds.length);
  });

  it('keeps Western Europe on its own side of the Atlantic', () => {
    // world-atlas ships France as one geometry that includes French Guiana —
    // an ocean away. Europe must not paint a patch in South America, and the
    // Guianas territory must pick that coast up instead.
    const projection = geoNaturalEarth1().fitSize([map.width, map.height], { type: 'Sphere' });
    const guianaX = projection([-53, 4])![0];

    const europeMinX = Math.min(...points(pathOf('westeurope')).map(([x]) => x));
    expect(europeMinX).toBeGreaterThan(guianaX + 40);

    const guianasMaxX = Math.max(...points(pathOf('venezuela')).map(([x]) => x));
    expect(guianasMaxX).toBeGreaterThanOrEqual(guianaX);
  });

  it('every divider line runs the full height of the land it divides', () => {
    // The drawn Risk lines are clipped to the country outline, so they must
    // span at least the land's own extent along the divide — a hand-shortened
    // line stops mid-country (the old half-line through the United States).
    for (const dv of map.dividers) {
      const outline = points(dv.clip);
      for (const [x1, y1, x2, y2] of dv.lines) {
        expect(x1).toBe(x2); // the world map's divides are all vertical
        const nearby = outline.filter(([px]) => Math.abs(px - x1) < 8).map(([, py]) => py);
        if (nearby.length === 0) continue;
        expect(Math.min(y1, y2)).toBeLessThanOrEqual(Math.min(...nearby) + 1);
        expect(Math.max(y1, y2)).toBeGreaterThanOrEqual(Math.max(...nearby) - 1);
      }
    }
  });

  it('assigns every territory to exactly one continent', () => {
    const counts = new Map<string, number>();
    for (const c of topo.continents) for (const t of c.territoryIds) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const t of topo.territoryIds) expect(counts.get(t)).toBe(1);
    expect([...counts.keys()].sort()).toEqual([...topo.territoryIds].sort());
  });
});
