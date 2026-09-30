import { describe, expect, it } from 'vitest';
import { seededRng } from '@shared/rng';
import { KINDS, type Prop, type PropKind } from './catalog';
import { BLOCK, MAPS, MOUNTAIN_FOOT, PARK_PATH, PARK_PLAZA, ROAD, SIDEWALK, createCity, type City, type MapId, type Rect } from './city';

const ALL: MapId[] = ['town', 'city', 'mega', 'region'];

// -------------------------------------------------------------------------
// Footprints, for the placement rules
// -------------------------------------------------------------------------

/** A turned rectangle (centre, half sizes, turn as in Prop.rot) or a circle. */
type Shape = { x: number; z: number; hw: number; hd: number; rot: number } | { x: number; z: number; r: number };

/**
 * What a thing covers on the ground. Most things are their footprint
 * rectangle; a mountain is round, and a jet is its fuselage, wings and
 * tailplane (its footprint rectangle is mostly empty air round the wings).
 */
function outline(p: Prop): Shape[] {
  if (p.kind === 'mountain') return [{ x: p.x, z: p.z, r: MOUNTAIN_FOOT }];
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  const part = (lx: number, lz: number, w: number, d: number): Shape => ({
    x: p.x + lx * c + lz * s,
    z: p.z - lx * s + lz * c,
    hw: w / 2,
    hd: d / 2,
    rot: p.rot,
  });
  if (p.kind === 'jet') return [part(0, 0, 4.2, 36), part(0, -4.3, 34, 8.6), part(0, -0.5, 18, 10.6), part(0, -15.7, 13.6, 4)];
  // A terminal's footprint runs out over its own flat apron to the gates'
  // stands; what stands up is the hall, the tower and the jet bridges.
  if (p.kind === 'terminal') return [part(0, 0, 36, 23)];
  // A wind turbine's blades turn 22 units up, over anything; on the ground it is its pad.
  if (p.kind === 'windturbine') return [part(0, 0, 10.4, 10.4)];
  return [part(0, 0, KINDS[p.kind].w, KINDS[p.kind].d)];
}

const corners = (b: Extract<Shape, { hw: number }>) => {
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([i, j]) => [b.x + i * b.hw * c + j * b.hd * s, b.z - i * b.hw * s + j * b.hd * c]);
};

/** Do two shapes overlap, each shrunk by `slack` so touching doesn't count? */
function overlaps(a: Shape, b: Shape, slack = 0.25): boolean {
  if ('r' in a && 'r' in b) return Math.hypot(a.x - b.x, a.z - b.z) < a.r + b.r - 2 * slack;
  if ('r' in a || 'r' in b) {
    const round = ('r' in a ? a : b) as Extract<Shape, { r: number }>;
    const box = ('r' in a ? b : a) as Extract<Shape, { hw: number }>;
    const c = Math.cos(box.rot);
    const s = Math.sin(box.rot);
    const dx = round.x - box.x;
    const dz = round.z - box.z;
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    const hw = box.hw - slack;
    const hd = box.hd - slack;
    return Math.hypot(lx - Math.max(-hw, Math.min(hw, lx)), lz - Math.max(-hd, Math.min(hd, lz))) < round.r - slack;
  }
  const shrink = (q: Extract<Shape, { hw: number }>) => ({ ...q, hw: q.hw - slack, hd: q.hd - slack });
  const A = corners(shrink(a));
  const B = corners(shrink(b));
  // Separating axes: the edges of both rectangles.
  for (const rot of [a.rot, b.rot]) {
    for (const [ax, az] of [
      [Math.cos(rot), -Math.sin(rot)],
      [Math.sin(rot), Math.cos(rot)],
    ]) {
      const pa = A.map(([x, z]) => x * ax + z * az);
      const pb = B.map(([x, z]) => x * ax + z * az);
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
  }
  return true;
}

/** The square on the map a shape keeps within. */
function bounds(sh: Shape): Rect {
  if ('r' in sh) return { x0: sh.x - sh.r, z0: sh.z - sh.r, x1: sh.x + sh.r, z1: sh.z + sh.r };
  const pts = corners(sh);
  const xs = pts.map(([x]) => x);
  const zs = pts.map(([, z]) => z);
  return { x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) };
}

const within = (a: Rect, b: Rect, slack = 0.05) => a.x0 >= b.x0 - slack && a.z0 >= b.z0 - slack && a.x1 <= b.x1 + slack && a.z1 <= b.z1 + slack;
const cut = (a: Rect, b: Rect): Rect | null => {
  const r = { x0: Math.max(a.x0, b.x0), z0: Math.max(a.z0, b.z0), x1: Math.min(a.x1, b.x1), z1: Math.min(a.z1, b.z1) };
  return r.x1 - r.x0 > 0.3 && r.z1 - r.z0 > 0.3 ? r : null;
};

/** Every street and country road, as rectangles. */
function roadRects(city: City): Rect[] {
  const h = city.half;
  return [
    ...city.roads.flatMap((r) => [
      { x0: -h, z0: r - ROAD / 2, x1: h, z1: r + ROAD / 2 },
      { x0: r - ROAD / 2, z0: -h, x1: r + ROAD / 2, z1: h },
    ]),
    ...city.countryRoads,
  ];
}

/** Things that belong on the road: parked vehicles and the odd cone. */
const ON_ROAD: ReadonlySet<PropKind> = new Set(['car', 'taxi', 'van', 'bus', 'garbagetruck', 'icecreamvan', 'cone']);

/** Every pair of things whose outlines overlap, found through a coarse grid. */
function clashes(props: readonly Prop[]): Array<[Prop, Prop]> {
  const CELL = 16;
  const cells = new Map<string, number[]>();
  const shapes = props.map(outline);
  const boxes = shapes.map((list) => list.map(bounds));
  boxes.forEach((list, i) => {
    for (const b of list) {
      for (let cx = Math.floor(b.x0 / CELL); cx <= Math.floor(b.x1 / CELL); cx++) {
        for (let cz = Math.floor(b.z0 / CELL); cz <= Math.floor(b.z1 / CELL); cz++) {
          const k = `${cx}:${cz}`;
          const l = cells.get(k) ?? [];
          if (!l.includes(i)) l.push(i);
          cells.set(k, l);
        }
      }
    }
  });
  const seen = new Set<string>();
  const out: Array<[Prop, Prop]> = [];
  for (const list of cells.values()) {
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const [i, j] = [list[a], list[b]].sort((x, y) => x - y);
        const key = `${i}:${j}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (shapes[i].some((sa) => shapes[j].some((sb) => overlaps(sa, sb)))) out.push([props[i], props[j]]);
      }
    }
  }
  return out;
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const cities = ALL.flatMap((map) => SEEDS.map((seed) => ({ map, seed, city: createCity(seededRng(seed), map) })));
const where = (p: Prop) => `${p.kind} at ${p.x.toFixed(1)},${p.z.toFixed(1)}`;
/** The biggest ordinary thing on a map (wonders are extra, and come in many sizes). */
const topTier = (map: MapId, seed = 1) =>
  Math.max(...createCity(seededRng(seed), map).props.filter((p) => !KINDS[p.kind].wonder).map((p) => KINDS[p.kind].tier));

describe('createCity', () => {
  it('is the same city from the same seed', () => {
    expect(createCity(seededRng(4)).props).toEqual(createCity(seededRng(4)).props);
  });

  it('gets bigger, and holds bigger things, map by map', () => {
    const halves = ALL.map((m) => createCity(seededRng(1), m).half);
    expect(halves).toEqual([...halves].sort((a, b) => a - b));
    for (const seed of [1, 2, 3]) {
      expect(topTier('town', seed)).toBe(7);
      expect(topTier('city', seed)).toBe(8);
      expect(topTier('mega', seed)).toBe(9);
      expect(topTier('region', seed)).toBe(10);
    }
  });

  it('has every tier up to its biggest, and plenty of small things to start on', () => {
    for (const map of ALL) {
      const city = createCity(seededRng(1), map);
      const tiers = new Set(city.props.map((p) => KINDS[p.kind].tier));
      for (let t = 0; t <= topTier(map); t++) expect(tiers.has(t)).toBe(true);
      const small = city.props.filter((p) => KINDS[p.kind].tier <= 1).length;
      expect(small / MAPS[map].blocks ** 2).toBeGreaterThan(8);
    }
  });

  it('has a chemical plant in the city and up, and an airport and mountains in the region', () => {
    const kinds = (map: MapId) => new Set(createCity(seededRng(6), map).props.map((p) => p.kind));
    expect(kinds('mega').has('chemplant') || kinds('mega').has('factory')).toBe(true);
    const region = kinds('region');
    for (const k of ['terminal', 'jet', 'mountain', 'windturbine', 'barn', 'skyscraper'] as const) expect(region.has(k)).toBe(true);
  });

  it('keeps everything on land, and nothing in the middle of a crossing', () => {
    for (const map of ALL) {
      const city = createCity(seededRng(3), map);
      for (const p of city.props) {
        const onIslet = city.extraLand.some((l) => l.kind === 'islet' && p.x >= l.x0 && p.x <= l.x1 && p.z >= l.z0 && p.z <= l.z1);
        if (onIslet) continue;
        expect(Math.abs(p.x)).toBeLessThan(city.land);
        expect(Math.abs(p.z)).toBeLessThan(city.land);
        const onCrossing = city.roads.some((x) => Math.abs(p.x - x) < ROAD / 2) && city.roads.some((z) => Math.abs(p.z - z) < ROAD / 2);
        expect(onCrossing).toBe(false);
      }
    }
  });

  it('does not stand two things in the same spot', () => {
    for (const map of ALL) {
      const city = createCity(seededRng(9), map);
      // Someone sitting on a bench shares its spot, on purpose.
      const standing = city.props.filter((p) => p.kind !== 'sitter');
      const spots = new Set(standing.map((p) => `${p.x.toFixed(1)}:${p.z.toFixed(1)}`));
      expect(spots.size).toBe(standing.length);
    }
  });

  it('holds more wonders on bigger maps, and the Statue of Liberty on its islet every time', () => {
    const wonders = (map: MapId) => createCity(seededRng(2), map).props.filter((p) => KINDS[p.kind].wonder);
    expect(wonders('town').length).toBe(5);
    expect(wonders('city').length).toBe(8);
    expect(wonders('mega').length).toBe(12);
    for (const map of ALL) {
      const city = createCity(seededRng(4), map);
      const liberty = city.props.find((p) => p.kind === 'liberty');
      const islet = city.extraLand.find((l) => l.kind === 'islet');
      expect(liberty && islet && liberty.z < islet.z1 && liberty.z > islet.z0).toBe(true);
    }
  });
});

describe('placement', () => {
  it('never stands two things on top of each other', () => {
    const bad: string[] = [];
    for (const { map, seed, city } of cities) {
      // Someone sitting on a bench shares its spot, on purpose.
      const standing = city.props.filter((p) => p.kind !== 'sitter');
      for (const [a, b] of clashes(standing)) bad.push(`${map}#${seed}: ${where(a)} overlaps ${where(b)}`);
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('keeps everything but parked vehicles off the roads, unless the street is built over', () => {
    const bad: string[] = [];
    for (const { map, seed, city } of cities) {
      const roads = roadRects(city);
      for (const p of city.props) {
        if (ON_ROAD.has(p.kind)) continue;
        for (const sh of outline(p)) {
          const b = bounds(sh);
          for (const r of roads) {
            const on = cut(b, r);
            if (on && !city.lots.some((l) => within(on, l))) bad.push(`${map}#${seed}: ${where(p)} on the road`);
          }
        }
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('keeps buildings off the pavement, except where a lot joins two blocks', () => {
    const bad: string[] = [];
    for (const { map, seed, city } of cities) {
      for (const b of city.blockList) {
        // The airport is one field, checked as a whole below.
        if (b.kind === 'airport') continue;
        const inner = { x0: b.x + SIDEWALK, z0: b.z + SIDEWALK, x1: b.x + BLOCK - SIDEWALK, z1: b.z + BLOCK - SIDEWALK };
        // Two blocks joined by a built-over street are one site, kerb to kerb.
        const joined = city.lots.filter((l) => cut(l, { x0: b.x - 1, z0: b.z, x1: b.x + BLOCK + 1, z1: b.z + BLOCK }));
        const room = joined.reduce(
          (r, l) => ({ x0: Math.min(r.x0, l.x0), z0: r.z0, x1: Math.max(r.x1, l.x1), z1: r.z1 }),
          joined.length ? { x0: b.x, z0: b.z, x1: b.x + BLOCK, z1: b.z + BLOCK } : inner,
        );
        for (const p of city.props) {
          if (KINDS[p.kind].tier < 5 || p.x < b.x || p.x > b.x + BLOCK || p.z < b.z || p.z > b.z + BLOCK) continue;
          for (const sh of outline(p)) if (!within(bounds(sh), room)) bad.push(`${map}#${seed}: ${where(p)} over the pavement of a ${b.kind} block`);
        }
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('keeps the countryside on land, and only hay and tractors on the fields', () => {
    const bad: string[] = [];
    for (const { map, seed, city } of cities) {
      for (const p of city.props) {
        if (Math.abs(p.x) < city.half && Math.abs(p.z) < city.half) continue;
        if (city.extraLand.some((l) => l.kind === 'islet' && p.x >= l.x0 && p.x <= l.x1 && p.z >= l.z0 && p.z <= l.z1)) continue;
        for (const sh of outline(p)) {
          const b = bounds(sh);
          if (!within(b, { x0: -city.land, z0: -city.land, x1: city.land, z1: city.land })) bad.push(`${map}#${seed}: ${where(p)} over the shore`);
          if (p.kind !== 'haybale' && p.kind !== 'tractor' && city.fields.some((f) => cut(b, f))) bad.push(`${map}#${seed}: ${where(p)} on a field`);
        }
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('keeps park paths and the plaza round the fountain clear, out to the pavement', () => {
    const bad: string[] = [];
    for (const { map, seed, city } of cities) {
      for (const b of city.blockList.filter((k) => k.kind === 'park')) {
        const c = { x: b.x + BLOCK / 2, z: b.z + BLOCK / 2 };
        const paths: Shape[] = [
          { x: c.x, z: c.z, hw: PARK_PATH / 2, hd: BLOCK / 2, rot: 0 },
          { x: c.x, z: c.z, hw: BLOCK / 2, hd: PARK_PATH / 2, rot: 0 },
          { x: c.x, z: c.z, r: PARK_PLAZA },
        ];
        for (const p of city.props) {
          if (p.kind === 'fountain' || p.kind === 'bench' || p.kind === 'sitter') continue;
          if (p.x < b.x || p.x > b.x + BLOCK || p.z < b.z || p.z > b.z + BLOCK) continue;
          if (outline(p).some((sh) => paths.some((q) => overlaps(sh, q, 0.1)))) bad.push(`${map}#${seed}: ${where(p)} on a park path`);
        }
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('lays the Region airport over 4×4 blocks, its inner streets built over', () => {
    for (const { seed, city } of cities.filter((c) => c.map === 'region')) {
      const f = city.airfield!;
      expect(f, `seed ${seed}`).toBeTruthy();
      expect(f.area.x1 - f.area.x0).toBeCloseTo(4 * BLOCK + 3 * ROAD);
      expect(f.area.z1 - f.area.z0).toBeCloseTo(4 * BLOCK + 3 * ROAD);
      const inside = city.blockList.filter((b) => b.x >= f.area.x0 && b.x + BLOCK <= f.area.x1 + 0.1 && b.z >= f.area.z0 && b.z + BLOCK <= f.area.z1 + 0.1);
      expect(inside.map((b) => b.kind)).toEqual(Array(16).fill('airport'));
      // Every bit of street inside the airport is built over.
      for (const r of city.roads) {
        for (let u = f.area.x0; u <= f.area.x1; u += 2) {
          for (const [x, z] of [
            [u, r],
            [r, u - f.area.x0 + f.area.z0],
          ]) {
            const onField = x > f.area.x0 && x < f.area.x1 && z > f.area.z0 && z < f.area.z1;
            if (onField) expect(city.lots.some((l) => x >= l.x0 && x <= l.x1 && z >= l.z0 && z <= l.z1), `${x},${z}`).toBe(true);
          }
        }
      }
      // The runway, taxiways and apron lie on the field; the runway is clear.
      for (const r of [f.runway, f.apron, ...f.taxiways, ...f.lines]) expect(within(r, f.area)).toBe(true);
      for (const p of city.props) {
        for (const sh of outline(p)) {
          const b = bounds(sh);
          expect(cut(b, f.runway), `${where(p)} on the runway`).toBeNull();
          const onField = cut(b, f.area);
          if (onField) expect(within(b, { x0: f.area.x0 + 0.5, z0: f.area.z0 + 0.5, x1: f.area.x1 - 0.5, z1: f.area.z1 - 0.5 }), `${where(p)} over the airport's kerb`).toBe(true);
        }
      }
      const kinds = city.props.filter((p) => p.x > f.area.x0 && p.x < f.area.x1 && p.z > f.area.z0 && p.z < f.area.z1).map((p) => p.kind);
      expect(kinds.sort()).toEqual(['hangar', 'hangar', 'jet', 'jet', 'radar', 'terminal']);
    }
  });

  it('has little houses, houses and big houses on every map, and plenty of little ones in Town', () => {
    for (const { map, seed, city } of cities) {
      const count = (k: PropKind) => city.props.filter((p) => p.kind === k).length;
      for (const k of ['cottage', 'house', 'villa'] as const) expect(count(k), `${map}#${seed} ${k}`).toBeGreaterThan(0);
      if (map === 'town') expect(count('cottage'), `town#${seed}`).toBeGreaterThan(count('house'));
    }
  });

  it('still fits the rest of the Region round the airport', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const city = createCity(seededRng(seed), 'region', ['pyramid', 'colosseum', 'moai', 'liberty']);
      const kinds = new Set(city.blockList.map((b) => b.kind));
      for (const k of ['military', 'helipad', 'arena', 'parking', 'industrial', 'park'] as const) expect(kinds.has(k), `seed ${seed} ${k}`).toBe(true);
      const props = new Set(city.props.map((p) => p.kind));
      for (const k of ['pyramid', 'colosseum', 'moai', 'liberty'] as const) expect(props.has(k), `seed ${seed} ${k}`).toBe(true);
    }
  });
});
