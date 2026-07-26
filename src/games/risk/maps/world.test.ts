import { describe, expect, it } from 'vitest';
import { worldMap } from './world';

const map = worldMap.build();
const topo = map.topology;

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

  it('assigns every territory to exactly one continent', () => {
    const counts = new Map<string, number>();
    for (const c of topo.continents) for (const t of c.territoryIds) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const t of topo.territoryIds) expect(counts.get(t)).toBe(1);
    expect([...counts.keys()].sort()).toEqual([...topo.territoryIds].sort());
  });
});
