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

type Rng = () => number;

export type MapId = 'town' | 'city' | 'mega' | 'region';

export const MAPS: Record<MapId, { blocks: number; label: string; rivals: number; minutes: number; country: number }> = {
  town: { blocks: 7, label: 'Town', rivals: 4, minutes: 3, country: 0 },
  city: { blocks: 9, label: 'City', rivals: 5, minutes: 4, country: 50 },
  mega: { blocks: 12, label: 'Megalopolis', rivals: 6, minutes: 5, country: 75 },
  region: { blocks: 13, label: 'Region', rivals: 8, minutes: 6, country: 130 },
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
  | 'farm'
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
const RURAL: ReadonlySet<BlockKind> = new Set(['farm', 'forest', 'windfarm', 'mountain', 'military', 'helipad']);

export interface Block {
  kind: BlockKind;
  /** On a wonder block, which wonder stands there. */
  wonder?: PropKind;
  /** The block's south-west corner and size (pavement included). */
  x: number;
  z: number;
  size: number;
}

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
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
}

/**
 * The airport: a 4×4 square of blocks on one edge of town, its inner streets
 * built over (they are in `City.lots`). The runway runs along the outer
 * edge; a taxiway parallel to it leads across the grass to the apron, where
 * the terminal, its jets and the hangars stand. The ground draws these; the things on them
 * are ordinary props.
 */
export interface Airfield {
  area: Rect;
  runway: Rect;
  /** Which way the runway runs. */
  along: 'x' | 'z';
  taxiways: Rect[];
  apron: Rect;
  /** Yellow lines painted on the taxiways and the apron: centrelines and lead-ins to the stands. */
  lines: Rect[];
}

/** The side of town the airport stands on, and its south-west block. */
interface AirportSite {
  bx: number;
  bz: number;
  side: 'n' | 's' | 'e' | 'w';
}

/**
 * The wonders each map holds (the Statue of Liberty always stands on its own
 * islet off the north shore). The bigger the map, the more of them.
 */
const MAP_WONDERS: Record<MapId, PropKind[]> = {
  town: ['leaning', 'clocktower', 'stonecircle', 'moai'],
  city: ['leaning', 'clocktower', 'stonecircle', 'moai', 'colosseum', 'opera', 'onion'],
  mega: ['megaspire', 'irontower', 'pyramid', 'pearlpalace', 'colosseum', 'opera', 'onion', 'clocktower', 'leaning', 'stonecircle', 'moai'],
  region: ['megaspire', 'irontower', 'pyramid', 'pearlpalace', 'colosseum', 'opera', 'onion', 'clocktower', 'leaning', 'stonecircle', 'moai'],
};
const ISLET = 30;
const BRIDGE = 16;

/** Road width, block size (pavement included) and pavement width. */
export const ROAD = 10;
export const BLOCK = 34;
export const SIDEWALK = 2.5;
/** A park's cross of paths (their width) and the round plaza at its middle (its radius). */
export const PARK_PATH = 5;
export const PARK_PLAZA = 8;
/** A mountain is round: the radius of its foot, a little inside its square footprint. */
export const MOUNTAIN_FOOT = 18;
const PITCH = ROAD + BLOCK;

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
  const tools: Tools = {
    map,
    rng,
    add,
    pick: (list) => list[Math.floor(rng() * list.length)],
    variant: () => Math.floor(rng() * 8),
    turn: () => Math.floor(rng() * 4) * (Math.PI / 2),
  };

  const { grid: kinds, airport: site } = layout(map, rng);
  const wonderAt = placeWonders(list.filter((k) => k !== 'liberty'), kinds, rng);
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
      const big = interior(block, tools, ring);
      if (!big) (RURAL.has(block.kind) ? verge : sidewalk)(block, tools);
    }
  }
  // Big lots: the street between an arena and its car park is built over,
  // and so are the airport's inner streets.
  const lots: Rect[] = [];
  for (const b of blockList) {
    if (b.kind === 'arena') lots.push({ x0: b.x + BLOCK - 0.5, z0: b.z, x1: b.x + PITCH + 0.5, z1: b.z + BLOCK });
  }
  const field = site ? airport(site, half, tools, lots) : null;
  roadside(roads, half, tools, lots);
  const land = half + MAPS[map].country;
  const mid = roads[Math.floor(blocks / 2)];
  const countryRoads: Rect[] = [];
  const fields: Rect[] = [];
  if (land > half) {
    countryRoads.push(
      { x0: mid - ROAD / 2, z0: -land, x1: mid + ROAD / 2, z1: -half },
      { x0: mid - ROAD / 2, z0: half, x1: mid + ROAD / 2, z1: land },
      { x0: -land, z0: mid - ROAD / 2, x1: -half, z1: mid + ROAD / 2 },
      { x0: half, z0: mid - ROAD / 2, x1: land, z1: mid + ROAD / 2 },
    );
    countryside(map, half, land, countryRoads, fields, tools);
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
  return { map, blocks, half, land, lots, countryRoads, fields, roads, blockList, props, extraLand: liberty ? [bridge, islet] : [], base, airfield: field };
}

// -------------------------------------------------------------------------
// Which block goes where
// -------------------------------------------------------------------------

/** Rings from the middle, as a fraction: 0 is the centre, 1 the edge. */
/**
 * Put the map's wonders on blocks of their own: the tall spire near the
 * middle, the rest spread across town (never side by side with each other).
 */
function placeWonders(wonders: readonly PropKind[], grid: BlockKind[][], rng: Rng): Map<string, PropKind> {
  const n = grid.length;
  const mid = (n - 1) / 2;
  const at = new Map<string, PropKind>();
  const taken = (bx: number, bz: number) => {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (at.has(`${bx + dx}:${bz + dz}`)) return true;
    return false;
  };
  for (const kind of wonders) {
    const spire = kind === 'megaspire';
    const pool: Array<[number, number]> = [];
    for (let bx = 0; bx < n; bx++) {
      for (let bz = 0; bz < n; bz++) {
        const f = Math.max(Math.abs(bx - mid), Math.abs(bz - mid)) / Math.max(1, mid);
        const ok = spire ? f < 0.35 : f > 0.15 && f < 0.85;
        if (ok && !SPECIAL.has(grid[bx][bz]) && grid[bx][bz] !== 'wonder' && !taken(bx, bz)) pool.push([bx, bz]);
      }
    }
    if (!pool.length) continue;
    const [bx, bz] = pool[Math.floor(rng() * pool.length)];
    grid[bx][bz] = 'wonder';
    at.set(`${bx}:${bz}`, kind);
  }
  return at;
}

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
      place('farm', 2, (f) => f > 0.8);
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
      return r < 0.8 ? 'suburb' : 'park';
  }
}

// -------------------------------------------------------------------------
// What stands where
// -------------------------------------------------------------------------

type Add = (kind: PropKind, x: number, z: number, rot?: number, variant?: number, hScale?: number) => void;

interface Tools {
  map: MapId;
  rng: Rng;
  add: Add;
  pick: <T>(list: readonly T[]) => T;
  variant: () => number;
  turn: () => number;
}

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
  const kinds: PropKind[] = b.kind === 'farm' ? ['haybale', 'haybale', 'bush', 'rock'] : ['rock', 'bush', 'pine', 'tree'];
  alongEdges(b, 4, (x, z, rot) => {
    if (rng() < 0.55) add(pick(kinds), x, z, rot, variant());
  });
}

function alongEdges(b: Block, step: number, each: (x: number, z: number, rot: number, beat: number, t: number) => void): void {
  const inset = SIDEWALK / 2;
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
 */
function interior(b: Block, t: Tools, ring: number): boolean {
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
      // One supertall tower (now and then the TV tower), stalls at its feet,
      // in the corners just clear of it.
      const kind: PropKind = rng() < 0.12 ? 'tvtower' : 'skyscraper';
      add(kind, cx, cz, turn(), variant(), 0.8 + rng() * 0.6);
      for (const [dx, dz] of [
        [-12.6, -12.6],
        [12.6, -12.6],
        [-12.6, 12.6],
        [12.6, 12.6],
      ]) {
        add(pick(['kiosk', 'planter', 'tree', 'bench'] as const), cx + dx, cz + dz, 0, variant());
      }
      return false;
    }
    case 'downtown': {
      // Tall blocks two by two with a narrow gap, a stall in the middle.
      const faces = [Math.PI, Math.PI, 0, 0];
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          add(rng() < 0.45 ? 'tower' : 'apartment', x0 + 6.4 + i * 15.8, z0 + 6.4 + j * 15.8, faces[i + j * 2], variant(), 0.8 + rng() * 0.7);
        }
      }
      add(pick(['kiosk', 'fruitstand', 'cafe'] as const), cx, cz, 0, variant());
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
        add(r < 0.5 ? 'tree' : r < 0.7 ? 'pine' : r < 0.9 ? 'bush' : 'planter', cx + dx * out, cz + dz * out, turn(), variant());
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
          add((i + j) % 4 === 3 ? 'fruitstand' : 'cafe', x0 + 3.5 + i * 6.5, z0 + 2.5 + (j * (deep - 5)) / 2, 0, variant());
        }
      }
      add('slide', x0 + s - 4.5, z0 + 3.5, 0, variant());
      add('seesaw', x0 + s - 1.2, z0 + 4, 0, variant());
      add('sandbox', x0 + s - 3, z0 + deep - 2.5, 0);
      return false;
    }
    case 'playpark': {
      // A kids' park: a playground in the middle, parents on the benches
      // round it, trees in the corners and an ice-cream cart.
      const kit: PropKind[] = ['swings', 'slide', 'climber', 'carousel', 'sandbox', 'seesaw'];
      kit.forEach((kind, i) => {
        add(kind, x0 + 5.5 + (i % 3) * 8.5, z0 + 7 + Math.floor(i / 3) * 9, 0, variant());
      });
      for (let i = 0; i < 4; i++) {
        const bx = x0 + 3 + i * 7.3;
        add('bench', bx, z0 + s - 1.2, Math.PI, variant());
        if (rng() < 0.6) add('sitter', bx, z0 + s - 1.2, Math.PI, variant());
      }
      for (const [dx, dz] of [
        [1.8, 1.8],
        [s - 1.8, 1.8],
      ]) {
        add('tree', x0 + dx, z0 + dz, turn(), variant());
      }
      add('cart', x0 + s - 2, z0 + s - 6, Math.PI / 2, variant());
      return false;
    }
    case 'dogpark': {
      // A dog park: grass, jumps and a tunnel, benches, trees round the
      // edge. The dogs and their people walk round it (see domain/world.ts).
      for (let i = 0; i < 4; i++) add('agility', x0 + 7 + (i % 2) * 14, z0 + 9 + Math.floor(i / 2) * 10, (i % 2) * (Math.PI / 2), i % 2);
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
      // A factory (or the chemical plant) at the back, a yard of containers,
      // a tanker and a van at the front; now and then a water tower.
      add(rng() < 0.4 ? 'chemplant' : 'factory', cx, z0 + s - 9.5, 0, variant());
      for (let i = 0; i < 4; i++) add('container', x0 + 1.6 + i * 3, z0 + 3.3, 0, variant());
      add('tanker', x0 + 15, z0 + 4.2, 0);
      if (rng() < 0.5) add('watertower', x0 + s - 5, z0 + 5, 0, variant());
      else {
        add('van', x0 + 19, z0 + 3, 0, variant());
        for (let i = 0; i < 3; i++) add('cone', x0 + s - 5 + i * 1.8, z0 + 2, 0);
      }
      return false;
    }
    case 'farm': {
      add('barn', x0 + 7.5, z0 + 5.5, 0, variant());
      add('fruitstand', x0 + 17.5, z0 + 2, 0, variant());
      add('tractor', x0 + s - 3, z0 + 5, 0, variant());
      for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) add('haybale', x0 + 3 + i * 5.5, z0 + 15 + j * 5, 0);
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
      // The hangar at the back; barracks, two tanks and the radar along the
      // front; lookouts down the side by the hangar.
      add('hangar', x0 + 11, z0 + s - 9, 0);
      add('barracks', x0 + 6.2, z0 + 3.6, Math.PI, variant());
      add('tank', x0 + 14.3, z0 + 3.4, 0, 0);
      add('tank', x0 + 18, z0 + 3.4, 0, 1);
      add('radar', x0 + s - 4.1, z0 + 4.8, 0);
      add('watchtower', x0 + s - 2, z0 + 13, 0);
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
      add(kind, b.x + 20, b.z + BLOCK / 2, 0, variant());
      return true;
    }
    case 'parking': {
      // Rows of parked cars facing a middle aisle, a lamp at each end.
      const px0 = b.x + 3;
      for (let i = 0; i < 9; i++) {
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
      each(x0 + 1.5 + (i * (s - 3)) / (n - 1) + (t.rng() - 0.5) * 1.2, z0 + 1.5 + (j * (s - 3)) / (n - 1) + (t.rng() - 0.5) * 1.2);
    }
  }
}

/** Parked vehicles along the kerbs, and the odd cone in the road. */
const inside = (rects: readonly Rect[], x: number, z: number, pad = 0) =>
  rects.some((r) => x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad);

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

// -------------------------------------------------------------------------
// The airport
// -------------------------------------------------------------------------

/**
 * Lay out the airport on its 4×4 blocks and build over its inner streets
 * (added to `lots`). Worked out in the airport's own frame: `u` runs along
 * the edge of town, `v` inward from it, both 0 to 166. From the edge in:
 * grass, the runway, grass, the taxiway, grass, then the apron with the jets at
 * their stands and, at the back, the hangars, the terminal and the radar.
 */
function airport(site: AirportSite, half: number, t: Tools, lots: Rect[]): Airfield {
  const { add, variant } = t;
  const S = 4 * BLOCK + 3 * ROAD;
  const x0 = -half + ROAD + site.bx * PITCH;
  const z0 = -half + ROAD + site.bz * PITCH;
  const x1 = x0 + S;
  const z1 = z0 + S;
  const { side } = site;
  /** From the airport's frame to the map. */
  const at = (u: number, v: number): [number, number] =>
    side === 'w' ? [x0 + v, z0 + u] : side === 'e' ? [x1 - v, z0 + u] : side === 'n' ? [x0 + u, z0 + v] : [x0 + u, z1 - v];
  const uOf = (x: number, z: number) => (side === 'w' || side === 'e' ? z - z0 : x - x0);
  const rect = (u0: number, v0: number, u1: number, v1: number): Rect => {
    const [ax, az] = at(u0, v0);
    const [bx, bz] = at(u1, v1);
    return { x0: Math.min(ax, bx), z0: Math.min(az, bz), x1: Math.max(ax, bx), z1: Math.max(az, bz) };
  };
  /** The turn that faces a thing's front along (du, dv). */
  const facing = (du: number, dv: number) => {
    const [ax, az] = at(0, 0);
    const [bx, bz] = at(du, dv);
    return Math.atan2(bx - ax, bz - az);
  };

  // The inner streets, built over.
  for (let k = 1; k < 4; k++) {
    const a = k * PITCH - ROAD;
    lots.push({ x0: x0 + a - 0.5, z0, x1: x0 + a + ROAD + 0.5, z1 });
    lots.push({ x0, z0: z0 + a - 0.5, x1, z1: z0 + a + ROAD + 0.5 });
  }

  // The terminal at the back, its gates towards the runway, one jet at the
  // middle gate (nose up to the jet bridge) and one on a stand of its own.
  const [tx, tz] = at(83, 147);
  const tRot = facing(0, -1);
  add('terminal', tx, tz, tRot);
  const fx = Math.sin(tRot);
  const fz = Math.cos(tRot);
  const nose: [number, number] = [tx - 3.5 * fz + 12.5 * fx, tz + 3.5 * fx + 12.5 * fz];
  const jets: Array<[number, number]> = [[nose[0] + 18 * fx, nose[1] + 18 * fz], at(135, 116.5)];
  for (const [x, z] of jets) add('jet', x, z, tRot + Math.PI, variant());
  // Hangars beside the terminal, doors to the apron, and the radar in the far corner.
  for (const u of [20, 46]) add('hangar', ...at(u, 150), facing(0, -1));
  add('radar', ...at(152, 152), facing(0, -1));

  // Yellow lines: down the taxiway and its links, and in to each stand.
  const w = 0.35;
  // The links to the runway join it just past the numbers at each end.
  const lines = [rect(36, 44 - w, 130, 44 + w), rect(36 - w, 28, 36 + w, 44), rect(130 - w, 28, 130 + w, 44)];
  // A taxiway from the parallel one across the grass to each stand.
  const taxiways = [rect(32, 40, 134, 48), rect(32, 28, 40, 40), rect(126, 28, 134, 40)];
  for (const [x, z] of jets) {
    const u = uOf(x, z);
    lines.push(rect(u - w, 44, u + w, 134));
    taxiways.push(rect(u - 4, 48, u + 4, 92));
  }
  return {
    area: { x0, z0, x1, z1 },
    runway: rect(8, 12, 158, 28),
    along: side === 'n' || side === 's' ? 'x' : 'z',
    taxiways,
    apron: rect(2.5, 92, 163.5, 163.5),
    lines,
  };
}

// -------------------------------------------------------------------------
// The countryside round the bigger maps
// -------------------------------------------------------------------------

/**
 * The open land between the street grid and the shore, in rings: farmland
 * nearest town, then woods and (on the bigger maps) wind farms on the open
 * meadows, and on the Region mountains along the far edge. Things keep off
 * the country roads, and fields are recorded so the ground can plough them.
 */
function countryside(map: MapId, half: number, land: number, roads: readonly Rect[], fields: Rect[], t: Tools): void {
  const { rng, pick, variant, turn } = t;
  const margin = land - half;
  const CELL = 26;
  const n = Math.ceil((land * 2) / CELL);
  const winds = map === 'mega' || map === 'region';
  const peaks = map === 'region';
  // Ground the big things stand on: nothing else goes there. Each entry says
  // whether a spot (with `pad` of room round it) is on that ground.
  const taken: Array<(x: number, z: number, pad: number) => boolean> = [];
  const block = (x: number, z: number, w: number, d: number) =>
    taken.push((px, pz, pad) => Math.abs(px - x) < w / 2 + pad && Math.abs(pz - z) < d / 2 + pad);
  const round = (x: number, z: number, r: number) => taken.push((px, pz, pad) => Math.hypot(px - x, pz - z) < r + pad);
  // Small things already put down, by 8-unit square, so scattered trees,
  // rocks and bales never land on one another (two squares round a spot
  // cover the widest pair, a barn and its neighbour).
  const small = new Map<string, Array<{ x: number; z: number; r: number }>>();
  const SQ = 8;
  const crowded = (x: number, z: number, r: number) => {
    for (let i = Math.floor(x / SQ) - 2; i <= Math.floor(x / SQ) + 2; i++) {
      for (let j = Math.floor(z / SQ) - 2; j <= Math.floor(z / SQ) + 2; j++) {
        if (small.get(`${i}:${j}`)?.some((o) => Math.max(Math.abs(o.x - x), Math.abs(o.z - z)) < o.r + r)) return true;
      }
    }
    return false;
  };
  const free = (x: number, z: number, pad: number) => !taken.some((on) => on(x, z, pad));
  /** A small thing, only where nothing else stands. */
  const add: Add = (kind, x, z, rot, variant, hScale) => {
    const r = Math.max(KINDS[kind].w, KINDS[kind].d) / 2;
    if (!free(x, z, r) || crowded(x, z, r)) return;
    t.add(kind, x, z, rot, variant, hScale);
    const key = `${Math.floor(x / SQ)}:${Math.floor(z / SQ)}`;
    small.set(key, [...(small.get(key) ?? []), { x, z, r }]);
  };

  // One power plant out on the Region's countryside, on its own ground.
  if (map === 'region') {
    const px = land - margin * 0.45;
    const pz = -land + margin * 0.5;
    t.add('powerplant', px, pz, 0);
    block(px, pz, KINDS.powerplant.w + 4, KINDS.powerplant.d + 4);
  }

  // Which cells of open land get what (all drawn from the rng first, so the
  // big things can claim their ground before anything small is put down).
  const cells: Array<{ i: number; j: number; cx: number; cz: number; u: number; r: number }> = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const cx = -land + (i + 0.5) * CELL;
      const cz = -land + (j + 0.5) * CELL;
      const d = Math.max(Math.abs(cx), Math.abs(cz)) - half;
      // Only the countryside ring, clear of the shore and the roads.
      if (d < CELL * 0.6 || Math.max(Math.abs(cx), Math.abs(cz)) > land - CELL * 0.55) continue;
      if (inside(roads, cx, cz, CELL / 2)) continue;
      cells.push({ i, j, cx, cz, u: d / margin, r: rng() });
    }
  }
  // Mountains along the Region's far edge, and wind turbines on the open
  // meadows, where they have room: clear of the roads and the power plant.
  const TURBINE_PAD = 7;
  const big = new Set<(typeof cells)[number]>();
  const mountain = (c: (typeof cells)[number]) => peaks && c.u > 0.72 && c.r < 0.5 && (c.i + c.j) % 2 === 0;
  for (const c of cells) {
    if (!mountain(c) || !free(c.cx, c.cz, MOUNTAIN_FOOT) || inside(roads, c.cx, c.cz, MOUNTAIN_FOOT + 2)) continue;
    t.add('mountain', c.cx, c.cz, turn(), variant());
    round(c.cx, c.cz, MOUNTAIN_FOOT);
    big.add(c);
  }
  for (const c of cells) {
    const { cx, cz, u, r } = c;
    if (!winds || (peaks && u > 0.72) || u < 0.4 || r >= 0.3 || !free(cx, cz, TURBINE_PAD)) continue;
    t.add('windturbine', cx, cz, 0);
    round(cx, cz, TURBINE_PAD);
    big.add(c);
    if (rng() < 0.5) add('rock', cx + 9, cz + 8, 0);
  }
  // Everything else, round them.
  for (const c of cells) {
    if (big.has(c)) continue;
    const { cx, cz, u, r } = c;
    if (peaks && u > 0.72) {
      // Pines at the mountains' feet.
      for (let k = 0; k < 5; k++) add('pine', cx + (rng() - 0.5) * CELL * 0.8, cz + (rng() - 0.5) * CELL * 0.8, 0, variant());
    } else if (u < 0.4) {
      // Farmland: fields of hay or crops, now and then a farmyard.
      if (r < 0.2) {
        // A farmyard: the barn, the tractor, a stall and the farmer's little house.
        add('barn', cx - 4, cz - 4, turn(), variant());
        add('tractor', cx + 7, cz + 6, turn(), variant());
        add('fruitstand', cx + 7, cz - 8, 0, variant());
        add('cottage', cx - 5, cz + 8, Math.PI, variant());
      } else if (r < 0.8) {
        if (!free(cx, cz, CELL / 2)) continue;
        fields.push({ x0: cx - CELL / 2 + 1, z0: cz - CELL / 2 + 1, x1: cx + CELL / 2 - 1, z1: cz + CELL / 2 - 1 });
        for (let a = 0; a < 4; a++) for (let b = 0; b < 3; b++) if (rng() < 0.55) add('haybale', cx - 8 + a * 5.5, cz - 6 + b * 6, 0);
        // The tractor at the end of the rows, clear of the bales.
        if (rng() < 0.3) add('tractor', cx + 8.5, cz + 9.6, turn(), variant());
      } else if (rng() < 0.5) {
        // A big house out in the country: trees round its garden, a car in the drive.
        add('villa', cx - 2, cz, turn(), variant());
        add(pick(['car', 'car', 'van'] as const), cx + 6, cz, 0, variant());
        for (const [dx, dz] of [
          [7, -7],
          [7, 7],
          [-9, 8],
          [-9, -8],
        ]) {
          add(pick(['tree', 'tree', 'pine', 'bush'] as const), cx + dx, cz + dz, turn(), variant());
        }
      } else {
        for (let k = 0; k < 4; k++) add(pick(['tree', 'bush', 'rock'] as const), cx + (rng() - 0.5) * CELL * 0.8, cz + (rng() - 0.5) * CELL * 0.8, turn(), variant());
      }
    } else if (r < 0.75) {
      // Woods.
      for (let k = 0; k < 9; k++) {
        const kind = rng() < 0.6 ? 'pine' : rng() < 0.8 ? 'tree' : 'bush';
        add(kind, cx - CELL / 2 + 2 + (k % 3) * 8 + rng() * 3, cz - CELL / 2 + 2 + Math.floor(k / 3) * 8 + rng() * 3, turn(), variant());
      }
    } else {
      for (let k = 0; k < 3; k++) add(pick(['rock', 'bush', 'haybale'] as const), cx + (rng() - 0.5) * CELL * 0.7, cz + (rng() - 0.5) * CELL * 0.7, 0, variant());
    }
  }
}
