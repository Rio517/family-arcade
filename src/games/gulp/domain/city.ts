/**
 * Gulp Universe's maps: a square grid of blocks between roads.
 *
 * Four maps, each bigger than the last and each with bigger things to aim
 * for. The street grid is built in rings from the middle: the tallest
 * buildings at the centre, then town, then suburbs. The Town is an island;
 * the bigger maps have open countryside round the grid (farmland, then
 * forests and wind farms, and on the Region mountains at the far edge), with
 * a country road running out each way.
 *
 * Blocks are small and packed like a real town: buildings stand shoulder to
 * shoulder along the streets, facing out, around a little courtyard; squares
 * and parks are the exception, and they are crowded too. Pavements carry
 * street things and roads carry parked vehicles, so a new hole always has
 * food. Everything comes from the `rng` passed in (ADR 0005).
 */
import { KINDS, makeProp, type Prop, type PropKind } from './catalog';
import {
  BLOCK,
  PITCH,
  ROAD,
  SIDEWALK,
  inside,
  type Add,
  type MapId,
  type PlayArea,
  type Rect,
  type Rng,
  type Side,
  type Tools,
} from './city/common';
import { countryLanes, countryside } from './city/countryside';
import { airport, harbour, pick3, type Airfield, type AirportSite } from './city/ports';

export { BLOCK, MOUNTAIN_FOOT, ROAD, SIDEWALK } from './city/common';
export type { MapId, PlayArea, Rect, Side } from './city/common';
export type { Airfield } from './city/ports';

export const MAPS: Record<MapId, { blocks: number; label: string; rivals: number; minutes: number; country: number }> = {
  town: { blocks: 9, label: 'Town', rivals: 4, minutes: 3, country: 0 },
  city: { blocks: 11, label: 'City', rivals: 5, minutes: 4, country: 60 },
  mega: { blocks: 13, label: 'Megalopolis', rivals: 6, minutes: 5, country: 90 },
  region: { blocks: 14, label: 'Region', rivals: 8, minutes: 6, country: 145 },
};

export type BlockKind =
  | 'skyline'
  | 'downtown'
  | 'town'
  | 'suburb'
  | 'park'
  | 'plaza'
  | 'landmark'
  | 'industrial'
  | 'forest'
  | 'windfarm'
  | 'airport'
  | 'mountain'
  | 'wonder'
  | 'military'
  | 'helipad'
  | 'playpark'
  | 'dogpark'
  | 'arena'
  | 'parking';

/** Blocks out of town: green verges instead of pavements full of street things. */
const RURAL: ReadonlySet<BlockKind> = new Set(['forest', 'windfarm', 'mountain', 'military', 'helipad']);

export interface Block {
  kind: BlockKind;
  /** On a wonder block, which wonder stands there. */
  wonder?: PropKind;
  /** The block's south-west corner and size (pavement included). */
  x: number;
  z: number;
  size: number;
}

export interface City {
  map: MapId;
  /** Blocks per side. */
  blocks: number;
  /** The street grid spans [-half, half] on both axes. */
  half: number;
  /** The land (grid and countryside) spans [-land, land]; water beyond. */
  land: number;
  /** Stretches of street built over to join two blocks into one big lot. */
  lots: Rect[];
  /** Country roads out through the countryside, and the fields beside them. */
  countryRoads: Rect[];
  fields: Rect[];
  /** Where each road's centre line runs (the same values on x and z). */
  roads: number[];
  blockList: Block[];
  props: Prop[];
  /** Land beyond the main square: the wonder islet and the bridge out to it. */
  extraLand: Array<{ kind: 'islet' | 'bridge'; x0: number; z0: number; x1: number; z1: number }>;
  /** Where the military base's army sets out from (Region only). */
  base: { x: number; z: number } | null;
  /** The airport's ground (Region only): see `Airfield`. */
  airfield: Airfield | null;
  /**
   * The sides of the land that meet the sea. Every other side carries on as
   * countryside past the edge of play, as scenery. The north is always sea:
   * the Statue of Liberty's islet stands off it.
   */
  shores: Side[];
  /** The port on a bigger map's shore: its quay, and the side it faces. */
  port: { quay: Rect; side: Side } | null;
  /** Soft play surfaces under playgrounds, and ball courts, for the ground to draw. */
  play: PlayArea[];
}

/**
 * The wonders each map holds (the Statue of Liberty always stands on its own
 * islet off the north shore). The bigger the map, the more of them.
 */
const MAP_WONDERS: Record<MapId, PropKind[]> = {
  town: ['leaning', 'clocktower', 'stonecircle', 'moai'],
  city: ['leaning', 'clocktower', 'stonecircle', 'moai', 'buddha', 'opera', 'onion', 'reichstag'],
  mega: ['megaspire', 'irontower', 'pyramid', 'pearlpalace', 'buddha', 'reichstag', 'opera', 'onion', 'clocktower', 'leaning', 'stonecircle', 'moai'],
  region: ['megaspire', 'irontower', 'pyramid', 'pearlpalace', 'buddha', 'reichstag', 'opera', 'onion', 'clocktower', 'leaning', 'stonecircle', 'moai'],
};
const ISLET = 30;
const BRIDGE = 16;

/** A park's cross of paths (their width) and the round plaza at its middle (its radius). */
export const PARK_PATH = 5;
export const PARK_PLAZA = 8;

/** How many wonders a round on each map gets (the menu's backdrop shows every one it can). */
export const WONDER_COUNT: Record<MapId, number> = { town: 0, city: 1, mega: 2, region: 3 };

/**
 * `wonders` are the wonders this round was dealt (see domain/wonders.ts);
 * left out, the city shows its whole set, as the menu's backdrop does.
 */
export function createCity(rng: Rng, map: MapId = 'city', wonders?: readonly PropKind[]): City {
  const list = wonders ?? [...MAP_WONDERS[map], 'liberty'];
  const blocks = MAPS[map].blocks;
  const span = blocks * PITCH + ROAD;
  const half = span / 2;
  const roads = Array.from({ length: blocks + 1 }, (_, i) => -half + ROAD / 2 + i * PITCH);
  const props: Prop[] = [];
  let nextId = 1;
  const add: Add = (kind, x, z, rot = 0, variant = 0, hScale = 1) => {
    props.push(makeProp(nextId++, kind, x, z, rot, variant, hScale));
  };
  const play: PlayArea[] = [];
  const tools: Tools = {
    map,
    play,
    rng,
    add,
    pick: (list) => list[Math.floor(rng() * list.length)],
    variant: () => Math.floor(rng() * 8),
    turn: () => Math.floor(rng() * 4) * (Math.PI / 2),
  };

  const { grid: kinds, airport: site } = layout(map, rng);
  const { at: wonderAt, east: wonderEast } = placeWonders(list.filter((k) => k !== 'liberty'), kinds, rng);
  const blockList: Block[] = [];
  for (let bx = 0; bx < blocks; bx++) {
    for (let bz = 0; bz < blocks; bz++) {
      const x = -half + ROAD + bx * PITCH;
      const z = -half + ROAD + bz * PITCH;
      const block: Block = { kind: kinds[bx][bz], x, z, size: BLOCK };
      if (block.kind === 'wonder') block.wonder = wonderAt.get(`${bx}:${bz}`);
      blockList.push(block);
      const mid = (blocks - 1) / 2;
      const ring = Math.max(Math.abs(bx - mid), Math.abs(bz - mid)) / Math.max(1, mid);
      const big = interior(block, tools, ring, wonderEast.has(`${bx}:${bz}`));
      if (!big) (RURAL.has(block.kind) ? verge : sidewalk)(block, tools);
    }
  }
  // Big lots: the street between an arena and its car park is built over,
  // and so are the airport's inner streets.
  const lots: Rect[] = [];
  for (const b of blockList) {
    if (b.kind === 'arena' || (b.wonder && double(b.wonder) && blockList.some((o) => o.wonder === b.wonder && o.x > b.x))) {
      lots.push({ x0: b.x + BLOCK - 0.5, z0: b.z, x1: b.x + PITCH + 0.5, z1: b.z + BLOCK });
    }
  }
  const field = site ? airport(site, half, tools, lots) : null;
  roadside(roads, half, tools, lots);
  const land = half + MAPS[map].country;
  const mid = roads[Math.floor(blocks / 2)];
  // The sea: always to the north; the bigger maps have a second shore, and
  // Megalopolis and Region a port on it.
  const shores: Side[] = ['n'];
  if (map !== 'town' && (map !== 'city' || rng() < 0.5)) shores.push(pick3(rng));
  const port = map === 'mega' || map === 'region' ? harbour(shores[1], land, mid, tools) : null;
  const countryRoads: Rect[] = [];
  const fields: Rect[] = [];
  if (land > half) {
    countryRoads.push(
      { x0: mid - ROAD / 2, z0: -land, x1: mid + ROAD / 2, z1: -half },
      { x0: mid - ROAD / 2, z0: half, x1: mid + ROAD / 2, z1: land },
      { x0: -land, z0: mid - ROAD / 2, x1: -half, z1: mid + ROAD / 2 },
      { x0: half, z0: mid - ROAD / 2, x1: land, z1: mid + ROAD / 2 },
    );
    const lanes = countryLanes(half, land, mid, port?.side ?? null);
    countryRoads.push(...lanes.map((l) => l.rect));
    countryside(map, half, land, countryRoads, fields, tools, port ? [port.yard] : [], lanes);
  }
  // The Statue of Liberty's islet off the north shore, a bridge across to it.
  const ix = mid;
  const bridgeZ = -land - BRIDGE;
  const islet = { kind: 'islet' as const, x0: ix - ISLET / 2, z0: bridgeZ - ISLET, x1: ix + ISLET / 2, z1: bridgeZ };
  // The bridge's drivable strip reaches well into town, so a big hole (which
  // keeps half its radius back from the shore) can still get on to it.
  const bridge = { kind: 'bridge' as const, x0: ix - ROAD / 2, z0: bridgeZ - 1, x1: ix + ROAD / 2, z1: -land + BLOCK };
  const liberty = list.includes('liberty');
  if (liberty) {
    add('liberty', ix, bridgeZ - ISLET / 2 - 2, 0);
    for (const [dx, dz] of [
      [-11, -11],
      [11, -11],
      [-11, 11],
      [11, 11],
    ]) {
      add(dz < 0 ? 'tree' : 'bench', ix + dx, bridgeZ - ISLET / 2 + dz, dz < 0 ? 0 : Math.PI, 1);
    }
  }
  const baseBlock = blockList.find((b) => b.kind === 'military');
  const base = baseBlock ? { x: baseBlock.x + baseBlock.size / 2, z: baseBlock.z + baseBlock.size / 2 } : null;
  return {
    map,
    blocks,
    half,
    land,
    lots,
    countryRoads,
    fields,
    roads,
    blockList,
    props,
     extraLand: liberty ? [bridge, islet] : [],
    base,
    airfield: field,
    shores,
    port: port ? { quay: port.quay, side: port.side } : null,
    play,
  };
}

// -------------------------------------------------------------------------
// Which block goes where
// -------------------------------------------------------------------------

/** Rings from the middle, as a fraction: 0 is the centre, 1 the edge. */
/**
 * Put the map's wonders on blocks of their own: the tall spire near the
 * middle, the rest spread across town (never side by side with each other).
 */
function placeWonders(wonders: readonly PropKind[], grid: BlockKind[][], rng: Rng): { at: Map<string, PropKind>; east: Set<string> } {
  const n = grid.length;
  const mid = (n - 1) / 2;
  const at = new Map<string, PropKind>();
  const east = new Set<string>();
  const open = (bx: number, bz: number) => bx < n && !SPECIAL.has(grid[bx][bz]) && grid[bx][bz] !== 'wonder';
  const taken = (bx: number, bz: number) => {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (at.has(`${bx + dx}:${bz + dz}`)) return true;
    return false;
  };
  for (const kind of wonders) {
    const spire = kind === 'megaspire';
    const wide = double(kind);
    const pool: Array<[number, number]> = [];
    for (let bx = 0; bx < n; bx++) {
      for (let bz = 0; bz < n; bz++) {
        const f = Math.max(Math.abs(bx - mid), Math.abs(bz - mid)) / Math.max(1, mid);
        const ok = spire ? f < 0.35 : f > 0.15 && f < 0.85;
        if (ok && open(bx, bz) && !taken(bx, bz) && (!wide || (open(bx + 1, bz) && !taken(bx + 1, bz)))) pool.push([bx, bz]);
      }
    }
    if (!pool.length) continue;
    const [bx, bz] = pool[Math.floor(rng() * pool.length)];
    grid[bx][bz] = 'wonder';
    at.set(`${bx}:${bz}`, kind);
    if (wide) {
      // Too wide for one block: it takes the block to the east too, the
      // street between built over.
      grid[bx + 1][bz] = 'wonder';
      at.set(`${bx + 1}:${bz}`, kind);
      east.add(`${bx + 1}:${bz}`);
    }
  }
  return { at, east };
}

/** A wonder wider than a block's inside stands across two blocks. */
const double = (kind: PropKind) => Math.max(KINDS[kind].w, KINDS[kind].d) > BLOCK - 2 * SIDEWALK;

function layout(map: MapId, rng: Rng): { grid: BlockKind[][]; airport: AirportSite | null } {
  const n = MAPS[map].blocks;
  const mid = (n - 1) / 2;
  const grid: BlockKind[][] = [];
  const rings: number[][] = [];
  for (let bx = 0; bx < n; bx++) {
    grid.push([]);
    rings.push([]);
    for (let bz = 0; bz < n; bz++) {
      const f = Math.max(Math.abs(bx - mid), Math.abs(bz - mid)) / Math.max(1, mid);
      rings[bx].push(f);
      grid[bx].push(ringKind(map, f, rng));
    }
  }
  // Specials: a few of each, dropped on blocks of the right ring.
  const cells = (want: (f: number) => boolean) => {
    const out: Array<[number, number]> = [];
    for (let bx = 0; bx < n; bx++) for (let bz = 0; bz < n; bz++) if (want(rings[bx][bz])) out.push([bx, bz]);
    return out;
  };
  const place = (kind: BlockKind, count: number, want: (f: number) => boolean) => {
    const pool = cells(want).filter(([bx, bz]) => !SPECIAL.has(grid[bx][bz]));
    for (let i = 0; i < count && pool.length; i++) {
      const [bx, bz] = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      grid[bx][bz] = kind;
    }
  };
  let airport: AirportSite | null = null;
  switch (map) {
    case 'town':
      place('industrial', 2, (f) => f > 0.8);
      place('park', 2, (f) => f > 0.2);
      place('playpark', 1, (f) => f > 0.2);
      place('dogpark', 1, (f) => f > 0.2);
      place('plaza', 2, (f) => f < 0.7);
      break;
    case 'city':
      place('landmark', 3, (f) => f > 0.2 && f < 0.7);
      place('industrial', 3, (f) => f > 0.8);
      place('park', 3, (f) => f > 0.2);
      place('playpark', 2, (f) => f > 0.2);
      place('dogpark', 1, (f) => f > 0.2);
      place('plaza', 3, (f) => f > 0.1 && f < 0.8);
      break;
    case 'mega':
      place('landmark', 6, (f) => f > 0.3 && f < 0.75);
      place('industrial', 4, (f) => f > 0.8);
      place('park', 4, (f) => f > 0.2);
      place('playpark', 2, (f) => f > 0.2);
      place('dogpark', 2, (f) => f > 0.2);
      place('plaza', 4, (f) => f > 0.1 && f < 0.8);
      break;
    case 'region': {
      // The airport first: it needs a 4×4 square on the edge of town.
      airport = airportSite(n, rng);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) grid[airport.bx + i][airport.bz + j] = 'airport';
      place('landmark', 6, (f) => f > 0.25 && f < 0.7);
      place('industrial', 6, (f) => f > 0.55 && f < 0.9);
      // The military base: two blocks side by side, out past the suburbs.
      {
        const spots = cells((f) => f > 0.62 && f < 0.8).filter(([bx, bz]) => bx + 1 < n && !SPECIAL.has(grid[bx][bz]) && !SPECIAL.has(grid[bx + 1][bz]));
        if (spots.length) {
          const [bx, bz] = spots[Math.floor(rng() * spots.length)];
          grid[bx][bz] = 'military';
          grid[bx + 1][bz] = 'helipad';
        }
      }
      place('park', 5, (f) => f > 0.1 && f < 0.7);
      place('playpark', 3, (f) => f > 0.1 && f < 0.7);
      place('dogpark', 2, (f) => f > 0.1 && f < 0.7);
      place('plaza', 5, (f) => f > 0.1 && f < 0.6);
      break;
    }
  }
  // Each landmark takes the block to its east too, for a car park: a
  // stadium or a mall on a double lot. One with no room becomes a plaza.
  for (let bx = 0; bx < n; bx++) {
    for (let bz = 0; bz < n; bz++) {
      if (grid[bx][bz] !== 'landmark') continue;
      const ok = bx + 1 < n && !SPECIAL.has(grid[bx + 1][bz]);
      grid[bx][bz] = ok ? 'arena' : 'plaza';
      if (ok) grid[bx + 1][bz] = 'parking';
    }
  }
  return { grid, airport };
}

/**
 * Where the Region's airport goes: 4×4 blocks against one edge of the grid,
 * never across the street the country road comes in on (it stays a street).
 */
function airportSite(n: number, rng: Rng): AirportSite {
  const road = Math.floor(n / 2);
  const along = Array.from({ length: n - 3 }, (_, o) => o).filter((o) => road < o + 1 || road > o + 3);
  const side = (['n', 's', 'e', 'w'] as const)[Math.floor(rng() * 4)];
  const o = along[Math.floor(rng() * along.length)];
  const far = n - 4;
  if (side === 'w') return { bx: 0, bz: o, side };
  if (side === 'e') return { bx: far, bz: o, side };
  if (side === 'n') return { bx: o, bz: 0, side };
  return { bx: o, bz: far, side };
}

const SPECIAL: ReadonlySet<BlockKind> = new Set([
  'landmark',
  'industrial',
  'airport',
  'mountain',
  'military',
  'helipad',
  'arena',
  'parking',
]);

function ringKind(map: MapId, f: number, rng: Rng): BlockKind {
  const r = rng();
  switch (map) {
    case 'town':
      if (f < 0.34) return r < 0.35 ? 'downtown' : r < 0.85 ? 'town' : 'plaza';
      if (f < 0.67) return r < 0.6 ? 'town' : 'suburb';
      return r < 0.75 ? 'suburb' : 'town';
    case 'city':
      if (f < 0.25) return 'downtown';
      if (f < 0.5) return r < 0.5 ? 'downtown' : 'town';
      if (f < 0.8) return r < 0.6 ? 'town' : 'suburb';
      return r < 0.75 ? 'suburb' : 'town';
    case 'mega':
      if (f < 0.2) return 'skyline';
      if (f < 0.4) return r < 0.5 ? 'skyline' : 'downtown';
      if (f < 0.6) return r < 0.6 ? 'downtown' : 'town';
      if (f < 0.8) return r < 0.6 ? 'town' : 'suburb';
      return r < 0.7 ? 'suburb' : 'town';
    case 'region':
      if (f < 0.15) return 'skyline';
      if (f < 0.3) return r < 0.4 ? 'skyline' : 'downtown';
      if (f < 0.45) return r < 0.6 ? 'downtown' : 'town';
      if (f < 0.6) return r < 0.5 ? 'town' : 'suburb';
      return r < 0.75 ? 'suburb' : 'town';
  }
}

// -------------------------------------------------------------------------
// What stands where
// -------------------------------------------------------------------------

/** Lamps and trees at a steady beat round the block, street things between them. */
function sidewalk(b: Block, { add: put, rng, pick, variant }: Tools): void {
  const street: PropKind[] = ['hydrant', 'bin', 'mailbox', 'planter', 'bench', 'bike', 'cone', 'bin', 'planter'];
  alongEdges(b, 2.6, (x, z, rot, beat, t) => {
    // A park's paths come out in the middle of each side: nothing stands
    // there (the spot is still drawn for, so the rest of the city is as it was).
    const add: Add = b.kind === 'park' && Math.abs(t - b.size / 2) < PARK_PATH / 2 + 1 ? () => {} : put;
    if (beat % 5 === 0) add(beat % 10 === 0 ? 'lamp' : 'tree', x, z, rot, variant());
    else if (rng() < 0.7) {
      const kind = pick(street);
      const turn = rot + (rng() < 0.5 ? 0 : Math.PI);
      add(kind, x, z, turn, variant());
      if (kind === 'bench' && rng() < 0.45) add('sitter', x, z, turn, variant());
    }
  });
}

/** Country verges: hay, rocks, the odd tree. */
function verge(b: Block, { add, rng, pick, variant }: Tools): void {
  const kinds: PropKind[] = ['rock', 'bush', 'pine', 'tree'];
  alongEdges(b, 4, (x, z, rot) => {
    if (rng() < 0.55) add(pick(kinds), x, z, rot, variant());
  });
}

function alongEdges(b: Block, step: number, each: (x: number, z: number, rot: number, beat: number, t: number) => void): void {
  // A little in from the middle of the pavement, so a tree's crown clears the road.
  const inset = SIDEWALK / 2 + 0.2;
  const edges = [
    { x0: b.x, z0: b.z + inset, dx: 1, dz: 0, rot: 0 },
    { x0: b.x + b.size - inset, z0: b.z, dx: 0, dz: 1, rot: Math.PI / 2 },
    { x0: b.x + b.size, z0: b.z + b.size - inset, dx: -1, dz: 0, rot: Math.PI },
    { x0: b.x + inset, z0: b.z + b.size, dx: 0, dz: -1, rot: -Math.PI / 2 },
  ];
  for (const e of edges) {
    // Both ends stop 3 or more short of the corner, so the last thing on one
    // side and the first on the next don't meet there.
    for (let t = 3, beat = 0; t < b.size - 3.5; t += step, beat++) each(e.x0 + e.dx * t, e.z0 + e.dz * t, e.rot, beat, t);
  }
}

/** The inside of a block, inside its pavement ring: corner and size. */
interface Lot {
  x0: number;
  z0: number;
  s: number;
}

/**
 * A terrace of buildings along one side of a lot, shoulder to shoulder and
 * facing the street. `side` names the street the fronts face; `from` and
 * `to` are how far along that side to fill. Returns how deep it is.
 */
function terrace(
  t: Tools,
  lot: Lot,
  side: 'n' | 's' | 'e' | 'w',
  from: number,
  to: number,
  kinds: readonly PropKind[],
  gap: number,
  heights: () => number,
): number {
  const { add, pick, variant } = t;
  let depth = 0;
  let u = from;
  while (u < to - 3) {
    let kind = pick(kinds);
    // The last building is swapped for one that fits, if there is one.
    if (u + KINDS[kind].w > to) {
      const fits = kinds.filter((k) => u + KINDS[k].w <= to);
      if (!fits.length) break;
      kind = fits[0];
    }
    const w = KINDS[kind].w;
    const d = KINDS[kind].d;
    depth = Math.max(depth, d);
    const c = u + w / 2;
    const { x0, z0, s } = lot;
    // Fronts face +z when rot = 0 (see three/props.ts).
    if (side === 's') add(kind, x0 + c, z0 + d / 2, Math.PI, variant(), heights());
    else if (side === 'n') add(kind, x0 + c, z0 + s - d / 2, 0, variant(), heights());
    else if (side === 'w') add(kind, x0 + d / 2, z0 + c, -Math.PI / 2, variant(), heights());
    else add(kind, x0 + s - d / 2, z0 + c, Math.PI / 2, variant(), heights());
    u += w + gap;
  }
  return depth;
}

/**
 * What stands inside the pavement ring. Returns true when one thing fills
 * the whole block (a stadium, a mountain), which then has no pavement things.
 * `ring` is how far out the block is: 0 at the centre, 1 on the edge of town.
 * `eastHalf` marks the second block of a wonder that stands across two.
 */
function interior(b: Block, t: Tools, ring: number, eastHalf = false): boolean {
  const { add, rng, pick, variant, turn } = t;
  const x0 = b.x + SIDEWALK + 0.4;
  const z0 = b.z + SIDEWALK + 0.4;
  const s = b.size - 2 * (SIDEWALK + 0.4);
  const lot: Lot = { x0, z0, s };
  const cx = x0 + s / 2;
  const cz = z0 + s / 2;
  const fills = (kind: PropKind) => Math.max(KINDS[kind].w, KINDS[kind].d) > s;
  /** Small things on a grid in whatever space is left in the middle. */
  const courtyard = (kinds: readonly PropKind[], nx: number, nz: number, ix0: number, iz0: number, iw: number, id: number) => {
    if (iw < 2 || id < 2) return;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) add(pick(kinds), ix0 + ((i + 0.5) * iw) / nx, iz0 + ((j + 0.5) * id) / nz, turn(), variant());
    }
  };

  switch (b.kind) {
    case 'skyline': {
      // One supertall tower (now and then the TV tower), a bench or planter
      // in each corner just clear of it.
      const kind: PropKind = rng() < 0.12 ? 'tvtower' : 'skyscraper';
      add(kind, cx, cz, turn(), variant(), 0.8 + rng() * 0.6);
      const c = s / 2 - 0.9;
      for (const [dx, dz] of [
        [-c, -c],
        [c, -c],
        [-c, c],
        [c, c],
      ]) {
        add(pick(['planter', 'bench'] as const), cx + dx, cz + dz, 0, variant());
      }
      return false;
    }
    case 'downtown': {
      // Tall blocks two by two with a narrow gap, each an apartment block, a
      // tower or (now and then) an office block: the size between a tower and
      // a factory, so there is always something to grow into there.
      const faces = [Math.PI, Math.PI, 0, 0];
      const at = (k: number) => (k === 0 ? KINDS.office.w / 2 + 0.05 : s - KINDS.office.w / 2 - 0.05);
      for (let j = 0; j < 2; j++) {
        for (let i = 0; i < 2; i++) {
          const r = rng();
          const kind: PropKind = r < 0.3 ? 'office' : r < 0.6 ? 'tower' : 'apartment';
          add(kind, x0 + at(i), z0 + at(j), faces[i + j * 2], variant(), kind === 'office' ? 0.9 + rng() * 0.5 : 0.8 + rng() * 0.7);
        }
      }
      return false;
    }
    case 'town': {
      // Shops along the high street front and back, homes at the ends, and
      // a little courtyard in the middle.
      const tall = () => 0.9 + rng() * 0.4;
      const ends: PropKind[] = t.map === 'town' ? ['cottage', 'house', 'cottage'] : ['house', 'cottage', 'house'];
      const front: PropKind[] = ['shop', 'shop', t.map === 'town' ? 'cottage' : 'house'];
      const ds = terrace(t, lot, 's', 0, s, front, 0.3, tall);
      const dn = terrace(t, lot, 'n', 0, s, front, 0.3, tall);
      const dw = terrace(t, lot, 'w', ds + 0.3, s - dn - 0.3, ends, 0.3, tall);
      const de = terrace(t, lot, 'e', ds + 0.3, s - dn - 0.3, ends, 0.3, tall);
      courtyard(['bush', 'planter', 'bench', 'fruitstand', 'tree'], 2, 1, x0 + dw + 0.5, z0 + ds + 0.5, s - dw - de - 1, s - ds - dn - 1);
      return false;
    }
    case 'suburb': {
      // On the edge of town, now and then, four big houses with a car in
      // each drive and a garden behind.
      if (ring > 0.75 && rng() < 0.5) {
        for (const [row, rot] of [
          [9.5 / 2, Math.PI],
          [s - 9.5 / 2, 0],
        ] as const) {
          for (const u of [5.4, s - 5.4]) add('villa', x0 + u, z0 + row, rot, variant());
          if (rng() < 0.8) add(pick(['car', 'car', 'taxi', 'van'] as const), cx, z0 + (rot === 0 ? s - 3 : 3), rot, variant());
        }
        courtyard(['tree', 'tree', 'pine', 'bush', 'planter'], 4, 1, x0 + 0.5, z0 + 9.8, s - 1, s - 19.6);
        return false;
      }
      // Houses in rows front and back, one at each end, gardens in between:
      // little houses and houses mixed, more little ones in a small town.
      const homes = () => 0.85 + rng() * 0.3;
      const kinds: PropKind[] = t.map === 'town' ? ['cottage', 'cottage', 'house'] : ['house', 'cottage', 'house'];
      const ds = terrace(t, lot, 's', 0, s, kinds, 1.4, homes);
      const dn = terrace(t, lot, 'n', 0, s, kinds, 1.4, homes);
      const dw = terrace(t, lot, 'w', ds + 1, s - dn - 1, kinds, 1.4, homes);
      const de = terrace(t, lot, 'e', ds + 1, s - dn - 1, kinds, 1.4, homes);
      courtyard(['tree', 'bush', 'pine', 'planter', 'bike'], 2, 2, x0 + dw + 0.5, z0 + ds + 0.5, s - dw - de - 1, s - ds - dn - 1);
      return false;
    }
    case 'park': {
      add('fountain', cx, cz, 0);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const bx = cx + Math.cos(a) * 5.5;
        const bz = cz + Math.sin(a) * 5.5;
        add('bench', bx, bz, -a + Math.PI / 2, variant());
        if (rng() < 0.5) add('sitter', bx, bz, -a + Math.PI / 2, variant());
      }
      // Trees packed close: a proper little wood round the fountain, kept
      // off the cross of paths and the round plaza (see three/ground.ts).
      // A spot on a path or the plaza is left out; one near their edges is
      // nudged back on to the grass, a tree's width clear.
      const room = 1.5;
      // Nudged trees can bunch up: each keeps a tree's width from the last ones.
      const trees: Array<[number, number]> = [];
      scatter(t, x0, z0, s, 7, (px, pz) => {
        let dx = px - cx;
        let dz = pz - cz;
        if (Math.min(Math.abs(dx), Math.abs(dz)) < room) return;
        const edge = PARK_PATH / 2 + room;
        dx = Math.sign(dx) * Math.max(Math.abs(dx), edge);
        dz = Math.sign(dz) * Math.max(Math.abs(dz), edge);
        // Corner to corner a tree needs a little more room from the round plaza.
        const d = Math.hypot(dx, dz);
        if (d < PARK_PLAZA) return;
        const out = Math.max(1, (PARK_PLAZA + room * 1.4) / d);
        const r = rng();
        const [x, z] = [cx + dx * out, cz + dz * out];
        if (trees.some(([ox, oz]) => Math.max(Math.abs(ox - x), Math.abs(oz - z)) < 2.9)) return;
        trees.push([x, z]);
        add(r < 0.5 ? 'tree' : r < 0.7 ? 'pine' : r < 0.9 ? 'bush' : 'planter', x, z, turn(), variant());
      });
      return false;
    }
    case 'plaza': {
      // A small square: shops along the back, cafe tables and stalls in
      // front, and a little playground at the east end.
      const dn = terrace(t, lot, 'n', 0, s, ['shop', 'shop', 'house'], 0.3, () => 0.9 + rng() * 0.4);
      const deep = s - dn - 1;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          add((i + j) % 4 === 3 ? 'fruitstand' : 'cafe', x0 + 3 + i * 5.5, z0 + 2.5 + (j * (deep - 5)) / 2, 0, variant());
        }
      }
      // The play corner: slide, seesaw and sandpit together on one soft
      // surface, and now and then a pair of picnic tables beside it.
      const e = x0 + s;
      t.play.push({ kind: 'soft', x0: e - 9.7, z0: z0 + 1.5, x1: e - 0.5, z1: z0 + 8.5 });
      add('slide', e - 7.6, z0 + 5, 0, variant());
      add('seesaw', e - 4.9, z0 + 5, 0, variant());
      add('sandbox', e - 2.3, z0 + 5, 0);
      if (rng() < 0.5) for (const u of [7.4, 2.8]) add('picnic', e - u, z0 + 12.5, 0, variant());
      return false;
    }
    case 'playpark': {
      // A kids' park: the playground together on one soft surface, parents
      // on benches at its edge, and beside it a little basketball court,
      // picnic tables, or open lawn. An ice-cream cart and shady trees.
      t.play.push({ kind: 'soft', x0: x0 + 1.5, z0: z0 + 1.5, x1: x0 + 14.8, z1: z0 + 15.5 });
      const kit: Array<[PropKind, number, number]> = [
        ['swings', 4.5, 3.8],
        ['slide', 9, 4.5],
        ['seesaw', 12.8, 4.5],
        ['climber', 4.5, 11.5],
        ['carousel', 9, 11.5],
        ['sandbox', 12.8, 12],
      ];
      for (const [kind, u, v] of kit) add(kind, x0 + u, z0 + v, 0, variant());
      for (const u of [4.5, 11]) {
        add('bench', x0 + u, z0 + 17.3, Math.PI, variant());
        if (rng() < 0.6) add('sitter', x0 + u, z0 + 17.3, Math.PI, variant());
      }
      add('cart', x0 + 7.5, z0 + 23.5, Math.PI / 2, variant());
      for (const u of [2, 13]) add('tree', x0 + u, z0 + s - 2, turn(), variant());
      const beside = pick(['court', 'court', 'picnic', 'lawn'] as const);
      if (beside === 'court') {
        // Long side along z; a hoop at each end, its backboard facing in.
        const court = { kind: 'court' as const, x0: x0 + 16.2, z0: z0 + 1.5, x1: x0 + s - 0.6, z1: z0 + s - 1.5 };
        t.play.push(court);
        const mid = (court.x0 + court.x1) / 2;
        add('hoop', mid, court.z0 + 1.1, 0);
        add('hoop', mid, court.z1 - 1.1, Math.PI);
      } else if (beside === 'picnic') {
        for (const [u, v] of [
          [18.5, 5],
          [s - 2.5, 5],
          [18.5, 12],
          [s - 2.5, 12],
        ]) {
          add('picnic', x0 + u, z0 + v, 0, variant());
        }
        for (const [u, v] of [
          [18.5, s - 5],
          [s - 2, s - 2],
        ]) {
          add(pick(['tree', 'tree', 'pine'] as const), x0 + u, z0 + v, turn(), variant());
        }
      } else add('tree', x0 + s - 2.5, z0 + s - 2.5, turn(), variant());
      return false;
    }
    case 'dogpark': {
      // A dog park: grass, jumps and a tunnel, benches, trees round the
      // edge. The dogs and their people walk round it (see domain/world.ts).
      for (let i = 0; i < 4; i++) add('agility', x0 + 7 + (i % 2) * (s - 14), z0 + 8 + Math.floor(i / 2) * (s - 17), (i % 2) * (Math.PI / 2), i % 2);
      for (const [dx, dz] of [
        [2, 2],
        [s - 2, 2],
        [2, s - 2],
        [s - 2, s - 2],
      ]) {
        add(pick(['tree', 'pine'] as const), x0 + dx, z0 + dz, 0, variant());
      }
      for (let i = 0; i < 2; i++) {
        const bx = x0 + 10 + i * 8;
        add('bench', bx, z0 + s - 1.2, Math.PI, variant());
        if (rng() < 0.6) add('sitter', bx, z0 + s - 1.2, Math.PI, variant());
      }
      add('dog', cx + 3, cz, turn(), variant());
      return false;
    }
    case 'landmark': {
      const kind = pick(['stadium', 'mall', 'powerplant', 'stadium', 'mall'] as const);
      add(kind, cx, cz, rng() < 0.5 ? 0 : Math.PI, variant());
      return fills(kind);
    }
    case 'industrial': {
      // A factory (or a chemical works) at the back, a yard of containers,
      // a tanker and a van at the front; now and then a water tower.
      if (rng() < 0.4) chemWorks(t, lot);
      else add('factory', cx, z0 + s - KINDS.factory.d / 2 - 0.4, 0, variant());
      for (let i = 0; i < 4; i++) add('container', x0 + 1.6 + i * 3, z0 + 3.3, 0, variant());
      add('tanker', x0 + 15, z0 + 4.2, 0);
      if (rng() < 0.5) add('watertower', x0 + s - 5, z0 + 4.5, 0, variant());
      else {
        add('van', x0 + s - 9, z0 + 3, 0, variant());
        for (let i = 0; i < 3; i++) add('cone', x0 + s - 5 + i * 1.8, z0 + 2, 0);
      }
      return false;
    }
    case 'forest': {
      scatter(t, x0, z0, s, 7, (px, pz) => {
        const r = rng();
        add(r < 0.55 ? 'pine' : r < 0.8 ? 'tree' : r < 0.9 ? 'rock' : 'bush', px, pz, turn(), variant());
      });
      return false;
    }
    case 'windfarm': {
      if (rng() < 0.25) {
        add('powerplant', cx, cz, 0);
        return fills('powerplant');
      }
      add('windturbine', cx, cz - 7, 0);
      add('windturbine', cx, cz + 7, 0);
      for (const [dx, dz] of [
        [-12, -12],
        [12, 12],
        [-12, 12],
        [12, -12],
      ]) {
        add(pick(['rock', 'bush', 'haybale'] as const), cx + dx, cz + dz, 0, variant());
      }
      return false;
    }
    case 'airport':
      // The airport is laid out as a whole (see `airport`).
      return true;
    case 'mountain':
      add('mountain', cx, cz, turn(), variant());
      return fills('mountain');
    case 'military': {
      // The hangar at the back; barracks and two tanks along the front;
      // lookouts down the side by the hangar (the radar is on the helipad).
      add('hangar', x0 + 11, z0 + s - 9, 0);
      add('barracks', x0 + 6.2, z0 + 3.6, Math.PI, variant());
      add('tank', x0 + 14.6, z0 + 3.4, 0, 0);
      add('tank', x0 + 18.6, z0 + 3.4, 0, 1);
      add('watchtower', x0 + s - 2, z0 + 3, 0);
      add('watchtower', x0 + s - 2, z0 + s - 2, 0);
      return false;
    }
    case 'helipad': {
      add('helicopter', x0 + 6, z0 + 7, 0);
      add('helicopter', x0 + 18, z0 + 7, 0);
      add('radar', x0 + 5, z0 + s - 5, 0);
      add('tank', x0 + 15, z0 + s - 4, Math.PI / 2, 1);
      add('watchtower', x0 + s - 2, z0 + s - 2, 0);
      return false;
    }
    case 'arena': {
      // A stadium or a mall, reaching over the built-over street towards the
      // car park next door. Both lie long side east-west: the lot is only
      // longer that way, and a mall turned the other way ran over the
      // pavements to the kerb.
      const kind: PropKind = rng() < 0.55 ? 'stadium' : 'mall';
      add(kind, b.x + 19, b.z + BLOCK / 2, 0, variant());
      return true;
    }
    case 'parking': {
      // Rows of parked cars facing a middle aisle, a lamp at each end.
      const px0 = b.x + 3;
      for (let i = 0; i < 8; i++) {
        for (const [row, rot] of [
          [b.z + 5, 0],
          [b.z + BLOCK - 5, Math.PI],
        ] as const) {
          if (rng() < 0.75) add(pick(['car', 'car', 'taxi', 'van'] as const), px0 + i * 3.4, row, rot, variant());
        }
      }
      add('lamp', b.x + 2, b.z + BLOCK / 2, 0);
      add('lamp', b.x + BLOCK - 2, b.z + BLOCK / 2, Math.PI);
      add('cart', b.x + BLOCK / 2, b.z + BLOCK / 2, Math.PI / 2, variant());
      return true;
    }
    case 'wonder': {
      const kind = b.wonder ?? 'stonecircle';
      if (double(kind)) {
        // Across the built-over street to the east, a lawn and trees at
        // each outer end.
        if (!eastHalf) add(kind, b.x + BLOCK + ROAD / 2, cz, 0);
        const u = eastHalf ? x0 + s - 3 : x0 + 3;
        for (const dz of [-10, -3.5, 3.5, 10]) add(pick(['tree', 'tree', 'bench', 'planter'] as const), u, cz + dz, eastHalf ? -Math.PI / 2 : Math.PI / 2, variant());
        return true;
      }
      if (kind === 'moai') {
        // Four heads in a loose arc on the grass, facing the street to the
        // south, ends a little forward; two with the red topknot. Rocks behind.
        const tops = rng() < 0.5 ? [0, 1, 1, 0] : [1, 0, 0, 1];
        [-9.6, -3.2, 3.2, 9.6].forEach((dx, i) => {
          add('moai', cx + dx + (rng() - 0.5) * 0.2, cz + 2 + dx * dx * 0.05, (rng() - 0.5) * 0.3, tops[i]);
        });
        for (const [dx, dz] of [
          [-10, -9],
          [-2, -10],
          [7, -9],
          [11, -3],
        ]) {
          add('rock', cx + dx + (rng() - 0.5) * 2, cz + dz + (rng() - 0.5) * 2, turn(), variant());
        }
        return true;
      }
      add(kind, cx, cz, 0);
      // Small wonders get a little garden round them.
      if (!fills(kind) && Math.max(KINDS[kind].w, KINDS[kind].d) < 16) {
        for (const [dx, dz] of [
          [-11, -11],
          [11, -11],
          [-11, 11],
          [11, 11],
        ]) {
          add(pick(['tree', 'bench', 'planter', 'fruitstand'] as const), cx + dx, cz + dz, 0, variant());
        }
      }
      return fills(kind);
    }
  }
}

/** A loose grid over a square, `n` × `n`, each spot nudged a little. */
function scatter(t: Tools, x0: number, z0: number, s: number, n: number, each: (x: number, z: number) => void): void {
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      each(x0 + 1.5 + (i * (s - 3)) / (n - 1) + (t.rng() - 0.5) * 0.9, z0 + 1.5 + (j * (s - 3)) / (n - 1) + (t.rng() - 0.5) * 0.9);
    }
  }
}

/**
 * A chemical works on the back of an industrial lot, where a factory would
 * stand: two or three chemical tanks, a flare stack, the control shed, and
 * containers when there is room for them. All of it is hazardous to eat.
 */
function chemWorks({ add, rng, variant }: Tools, { x0, z0, s }: Lot): void {
  const cx = x0 + s / 2;
  const back = z0 + s;
  add('gastank', cx - 6.5, back - 5, 0, variant());
  add('gastank', cx + 2.5, back - 5, 0, variant());
  add('flarestack', cx + 9, back - 2.7, 0);
  add('plantshed', cx - 5.5, back - 14, 0);
  if (rng() < 0.5) add('gastank', cx + 5.5, back - 13.5, 0, variant());
  else for (const dx of [3, 6.2]) add('container', cx + dx, back - 13.5, 0, variant());
}

/** Parked vehicles along the kerbs, and the odd cone in the road. */
function roadside(roads: number[], half: number, { add, rng, pick, variant }: Tools, lots: readonly Rect[]): void {
  // Mostly cars; a garbage truck or an ice-cream van now and then.
  const vehicles: PropKind[] = [
    ...(Array(14).fill('car') as PropKind[]),
    'taxi',
    'taxi',
    'van',
    'van',
    'bus',
    'bus',
    'garbagetruck',
    'icecreamvan',
  ];
  const kerb = ROAD / 2 - 1.4;
  const SPOT = 6.5;
  const end = half - ROAD;
  for (const line of roads) {
    // Runs along x (a road at z = line), then along z (a road at x = line).
    for (const alongX of [true, false]) {
      // A spot is free when it is clear of crossings and of built-over streets.
      const free = (t: number) =>
        t < end && !roads.some((r) => Math.abs(r - t) < ROAD / 2 + 4) && !inside(lots, alongX ? t : line, alongX ? line : t, 3);
      for (let t = -half + ROAD + 3; t < end; t += SPOT) {
        if (!free(t)) continue;
        const r = rng();
        if (r < 0.5) {
          const side = rng() < 0.5 ? -1 : 1;
          let kind = pick(vehicles);
          let at = t;
          // A bus or a garbage truck takes two spots, when the next is free too.
          if (KINDS[kind].d > SPOT - 0.8) {
            if (free(t + SPOT)) {
              at = t + SPOT / 2;
              t += SPOT;
            } else kind = 'car';
          }
          const rot = alongX ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : side > 0 ? 0 : Math.PI;
          if (alongX) add(kind, at, line + side * kerb, rot, variant());
          else add(kind, line + side * kerb, at, rot, variant());
        } else if (r < 0.56) {
          if (alongX) add('cone', t, line + (rng() - 0.5) * 3, 0);
          else add('cone', line + (rng() - 0.5) * 3, t, 0);
        }
      }
    }
  }
}

