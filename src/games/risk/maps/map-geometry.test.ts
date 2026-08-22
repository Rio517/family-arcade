/**
 * Geometry ⇄ topology invariants for the world map, born from a family audit:
 * an army number rendered over the neighbouring province (Eastern Canada's
 * label sat outside its clip band) and several visibly-touching territories
 * couldn't attack each other (seven missing borders, Colombia–Brazil among
 * them). These tests re-derive both facts from the rendered geometry so a
 * future map edit can't quietly reintroduce either bug.
 */
import { describe, expect, it } from 'vitest';
import { worldMap } from './world';

type Pt = [number, number];
type Rect = [number, number, number, number];

/** Parse a d3-geoPath polygon string into rings of points. */
function rings(d: string): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt[] = [];
  const re = /([MLZ])([^MLZ]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    const [, cmd, rest] = m;
    if (cmd === 'Z') {
      if (cur.length) out.push(cur);
      cur = [];
      continue;
    }
    const nums = rest.split(/[ ,]+/).filter(Boolean).map(Number);
    if (cmd === 'M') {
      if (cur.length) out.push(cur);
      cur = [];
    }
    for (let i = 0; i + 1 < nums.length; i += 2) cur.push([nums[i], nums[i + 1]]);
  }
  if (cur.length) out.push(cur);
  return out;
}

function inRing(p: Pt, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Even-odd rule: inside an odd number of rings. */
const inPoly = (p: Pt, rs: Pt[][]) => rs.filter((r) => inRing(p, r)).length % 2 === 1;

const inClip = (p: Pt, clip?: Rect[]) =>
  !clip || clip.some(([x, y, w, h]) => p[0] >= x && p[0] <= x + w && p[1] >= y && p[1] <= y + h);

/**
 * Island-group territories whose label deliberately floats on the water
 * between their islands, like the name plates on an antique chart.
 */
const SEA_LABELS = new Set(['caribbean', 'britain', 'indonesia']);

/**
 * Pairs that graze on screen but stay deliberately un-attackable:
 * - centraleurope~ural: Russia's Kaliningrad exclave is a few pixels wide
 *   here — an attack lane through it would read as nonsense.
 * - japan~yakutsk: the 17 km Korea–Russia border is sub-pixel at map scale.
 * - easternus~westerncanada / centralcanada~westernus corner contacts at the
 *   four-corners seam (only the classic central↔western-US diagonal is kept).
 */
const IGNORED_TOUCHES = new Set(['centraleurope~ural', 'japan~yakutsk', 'easternus~westerncanada']);

const map = worldMap.build();
const terrs = map.territories.map((t) => ({
  id: t.id,
  label: [t.labelX, t.labelY] as Pt,
  rings: rings(t.path),
  clip: (t as { clip?: Rect[] }).clip,
}));
describe('world map geometry', () => {
  it('every army number renders on its own territory', () => {
    for (const t of terrs) {
      if (SEA_LABELS.has(t.id)) {
        // May float on water, but never on top of someone else's land.
        const host = terrs.find((o) => o.id !== t.id && inPoly(t.label, o.rings) && inClip(t.label, o.clip));
        expect(host?.id ?? null, `${t.id} label sits on ${host?.id}`).toBeNull();
        continue;
      }
      expect(
        inPoly(t.label, t.rings) && inClip(t.label, t.clip),
        `${t.id} label (${t.label}) renders off its own territory`,
      ).toBe(true);
    }
  });

  it('territories that touch on screen can attack each other', () => {
    const pts = new Map(
      terrs.map((t) => [t.id, t.rings.flat().filter((_, i) => i % 2 === 0).filter((p) => inClip(p, t.clip))]),
    );
    const minDist = (a: string, b: string) => {
      let best = Infinity;
      for (const p of pts.get(a)!) {
        for (const q of pts.get(b)!) {
          const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
          if (d < best) best = d;
          if (best === 0) return 0;
        }
      }
      return best;
    };
    for (let i = 0; i < terrs.length; i++) {
      for (let j = i + 1; j < terrs.length; j++) {
        const a = terrs[i].id;
        const b = terrs[j].id;
        if (map.topology.adjacency[a]?.includes(b)) continue;
        if (IGNORED_TOUCHES.has(`${a}~${b}`) || IGNORED_TOUCHES.has(`${b}~${a}`)) continue;
        const d = minDist(a, b);
        expect(d, `${a} and ${b} touch on screen (${d.toFixed(1)}px) but cannot attack`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('Alaska stands alone, bordering only Western Canada and Kamchatka', () => {
    expect(map.topology.territoryIds).toContain('alaska');
    expect([...(map.topology.adjacency.alaska ?? [])].sort()).toEqual(['kamchatka', 'westerncanada']);
    // And the old shortcut is gone: the lower 48 no longer reach Kamchatka.
    expect(map.topology.adjacency.westernus).not.toContain('kamchatka');
  });
});
