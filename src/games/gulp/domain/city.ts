/**
 * Gulp Universe's maps: a square grid of blocks between roads, on an island.
 *
 * Four maps, each bigger than the last and each with bigger things to aim
 * for. A map is built in rings from the middle: the tallest buildings at the
 * centre, then town, then suburbs, and (on the Region map) countryside with
 * farms, forests, wind farms, an airport and mountains at the corners.
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

export const MAPS: Record<MapId, { blocks: number; label: string; rivals: number; minutes: number }> = {
  town: { blocks: 7, label: 'Town', rivals: 4, minutes: 3 },
  city: { blocks: 9, label: 'City', rivals: 5, minutes: 4 },
  mega: { blocks: 12, label: 'Megalopolis', rivals: 6, minutes: 5 },
  region: { blocks: 16, label: 'Region', rivals: 8, minutes: 6 },
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
  | 'apron'
  | 'mountain'
  | 'wonder';

/** Blocks out of town: green verges instead of pavements full of street things. */
const RURAL: ReadonlySet<BlockKind> = new Set(['farm', 'forest', 'windfarm', 'mountain']);

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
  /** Land spans [-half, half] on both axes; water beyond. */
  half: number;
  /** Where each road's centre line runs (the same values on x and z). */
  roads: number[];
  blockList: Block[];
  props: Prop[];
  /** Land beyond the main square: the wonder islet and the bridge out to it. */
  extraLand: Array<{ kind: 'islet' | 'bridge'; x0: number; z0: number; x1: number; z1: number }>;
}

/**
 * The wonders each map holds (the Liberty Statue always stands on its own
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
const PITCH = ROAD + BLOCK;

export function createCity(rng: Rng, map: MapId = 'city'): City {
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
    rng,
    add,
    pick: (list) => list[Math.floor(rng() * list.length)],
    variant: () => Math.floor(rng() * 8),
    turn: () => Math.floor(rng() * 4) * (Math.PI / 2),
  };

  const kinds = layout(map, rng);
  const wonderAt = placeWonders(map, kinds, rng);
  const blockList: Block[] = [];
  for (let bx = 0; bx < blocks; bx++) {
    for (let bz = 0; bz < blocks; bz++) {
      const x = -half + ROAD + bx * PITCH;
      const z = -half + ROAD + bz * PITCH;
      const block: Block = { kind: kinds[bx][bz], x, z, size: BLOCK };
      if (block.kind === 'wonder') block.wonder = wonderAt.get(`${bx}:${bz}`);
      blockList.push(block);
      const big = interior(block, tools);
      if (!big) (RURAL.has(block.kind) ? verge : sidewalk)(block, tools);
    }
  }
  roadside(roads, half, tools);
  // The Liberty Statue's islet off the north shore, a bridge across to it.
  const ix = roads[Math.floor(blocks / 2)];
  const bridgeZ = -half - BRIDGE;
  const islet = { kind: 'islet' as const, x0: ix - ISLET / 2, z0: bridgeZ - ISLET, x1: ix + ISLET / 2, z1: bridgeZ };
  // The bridge's drivable strip reaches well into town, so a big hole (which
  // keeps half its radius back from the shore) can still get on to it.
  const bridge = { kind: 'bridge' as const, x0: ix - ROAD / 2, z0: bridgeZ - 1, x1: ix + ROAD / 2, z1: -half + BLOCK };
  add('liberty', ix, bridgeZ - ISLET / 2 - 2, 0);
  for (const [dx, dz] of [
    [-11, -11],
    [11, -11],
    [-11, 11],
    [11, 11],
  ]) {
    add(dz < 0 ? 'tree' : 'bench', ix + dx, bridgeZ - ISLET / 2 + dz, dz < 0 ? 0 : Math.PI, 1);
  }
  return { map, blocks, half, roads, blockList, props, extraLand: [bridge, islet] };
}

// -------------------------------------------------------------------------
// Which block goes where
// -------------------------------------------------------------------------

/** Rings from the middle, as a fraction: 0 is the centre, 1 the edge. */
/**
 * Put the map's wonders on blocks of their own: the tall spire near the
 * middle, the rest spread across town (never side by side with each other).
 */
function placeWonders(map: MapId, grid: BlockKind[][], rng: Rng): Map<string, PropKind> {
  const n = grid.length;
  const mid = (n - 1) / 2;
  const at = new Map<string, PropKind>();
  const taken = (bx: number, bz: number) => {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (at.has(`${bx + dx}:${bz + dz}`)) return true;
    return false;
  };
  for (const kind of MAP_WONDERS[map]) {
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

function layout(map: MapId, rng: Rng): BlockKind[][] {
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
  switch (map) {
    case 'town':
      place('industrial', 2, (f) => f > 0.8);
      place('farm', 2, (f) => f > 0.8);
      place('park', 3, (f) => f > 0.2);
      place('plaza', 2, (f) => f < 0.7);
      break;
    case 'city':
      place('landmark', 3, (f) => f > 0.2 && f < 0.7);
      place('industrial', 3, (f) => f > 0.8);
      place('park', 4, (f) => f > 0.2);
      place('plaza', 3, (f) => f > 0.1 && f < 0.8);
      break;
    case 'mega':
      place('landmark', 6, (f) => f > 0.3 && f < 0.75);
      place('industrial', 4, (f) => f > 0.8);
      place('park', 6, (f) => f > 0.2);
      place('plaza', 4, (f) => f > 0.1 && f < 0.8);
      break;
    case 'region': {
      place('landmark', 8, (f) => f > 0.25 && f < 0.6);
      place('industrial', 7, (f) => f > 0.5 && f < 0.75);
      place('park', 9, (f) => f > 0.1 && f < 0.7);
      place('plaza', 5, (f) => f > 0.1 && f < 0.6);
      // An airport: the terminal with its apron beside it, out of town.
      const spots = cells((f) => f > 0.8 && f < 0.95).filter(([bx, bz]) => !SPECIAL.has(grid[bx][bz]));
      const [ax, az] = spots[Math.floor(rng() * spots.length)];
      grid[ax][az] = 'airport';
      grid[ax + (ax < mid ? -1 : 1)][az] = 'apron';
      // Mountains in the four corners.
      for (const [cx, cz] of [
        [0, 0],
        [0, n - 1],
        [n - 1, 0],
        [n - 1, n - 1],
      ]) {
        grid[cx][cz] = 'mountain';
        const nx = cx + (cx ? -1 : 1);
        if (rng() < 0.6 && grid[nx][cz] !== 'apron' && grid[nx][cz] !== 'airport') grid[nx][cz] = 'mountain';
      }
      break;
    }
  }
  return grid;
}

const SPECIAL: ReadonlySet<BlockKind> = new Set(['landmark', 'industrial', 'airport', 'apron', 'mountain']);

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
      if (f < 0.7) return r < 0.8 ? 'suburb' : 'park';
      return r < 0.4 ? 'farm' : r < 0.75 ? 'forest' : 'windfarm';
  }
}

// -------------------------------------------------------------------------
// What stands where
// -------------------------------------------------------------------------

type Add = (kind: PropKind, x: number, z: number, rot?: number, variant?: number, hScale?: number) => void;

interface Tools {
  rng: Rng;
  add: Add;
  pick: <T>(list: readonly T[]) => T;
  variant: () => number;
  turn: () => number;
}

/** Lamps and trees at a steady beat round the block, street things between them. */
function sidewalk(b: Block, { add, rng, pick, variant }: Tools): void {
  const street: PropKind[] = ['hydrant', 'bin', 'mailbox', 'planter', 'bench', 'bike', 'cone', 'bin', 'planter'];
  alongEdges(b, 2.6, (x, z, rot, beat) => {
    if (beat % 5 === 0) add(beat % 10 === 0 ? 'lamp' : 'tree', x, z, rot, variant());
    else if (rng() < 0.7) add(pick(street), x, z, rot + (rng() < 0.5 ? 0 : Math.PI), variant());
  });
}

/** Country verges: hay, rocks, the odd tree. */
function verge(b: Block, { add, rng, pick, variant }: Tools): void {
  const kinds: PropKind[] = b.kind === 'farm' ? ['haybale', 'haybale', 'bush', 'rock'] : ['rock', 'bush', 'pine', 'tree'];
  alongEdges(b, 4, (x, z, rot) => {
    if (rng() < 0.55) add(pick(kinds), x, z, rot, variant());
  });
}

function alongEdges(b: Block, step: number, each: (x: number, z: number, rot: number, beat: number) => void): void {
  const inset = SIDEWALK / 2;
  const edges = [
    { x0: b.x, z0: b.z + inset, dx: 1, dz: 0, rot: 0 },
    { x0: b.x + b.size - inset, z0: b.z, dx: 0, dz: 1, rot: Math.PI / 2 },
    { x0: b.x + b.size, z0: b.z + b.size - inset, dx: -1, dz: 0, rot: Math.PI },
    { x0: b.x + inset, z0: b.z + b.size, dx: 0, dz: -1, rot: -Math.PI / 2 },
  ];
  for (const e of edges) {
    for (let t = 3, beat = 0; t < b.size - 2.5; t += step, beat++) each(e.x0 + e.dx * t, e.z0 + e.dz * t, e.rot, beat);
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
 */
function interior(b: Block, t: Tools): boolean {
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
      // One supertall tower (now and then the TV tower), stalls at its feet.
      const kind: PropKind = rng() < 0.12 ? 'tvtower' : 'skyscraper';
      add(kind, cx, cz, turn(), variant(), 0.8 + rng() * 0.6);
      for (const [dx, dz] of [
        [-12.2, -12.2],
        [12.2, -12.2],
        [-12.2, 12.2],
        [12.2, 12.2],
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
      // Shops along the high street front and back, houses at the ends, and
      // a little courtyard in the middle.
      const tall = () => 0.9 + rng() * 0.4;
      const ds = terrace(t, lot, 's', 0, s, ['shop', 'shop', 'house'], 0.3, tall);
      const dn = terrace(t, lot, 'n', 0, s, ['shop', 'shop', 'house'], 0.3, tall);
      const dw = terrace(t, lot, 'w', ds + 0.3, s - dn - 0.3, ['house'], 0.3, tall);
      const de = terrace(t, lot, 'e', ds + 0.3, s - dn - 0.3, ['house'], 0.3, tall);
      courtyard(['bush', 'planter', 'bench', 'fruitstand', 'tree'], 2, 1, x0 + dw + 0.5, z0 + ds + 0.5, s - dw - de - 1, s - ds - dn - 1);
      return false;
    }
    case 'suburb': {
      // Houses in rows front and back, one at each end, gardens in between.
      const homes = () => 0.85 + rng() * 0.3;
      const ds = terrace(t, lot, 's', 0, s, ['house'], 1.4, homes);
      const dn = terrace(t, lot, 'n', 0, s, ['house'], 1.4, homes);
      const dw = terrace(t, lot, 'w', ds + 1, s - dn - 1, ['house'], 1.4, homes);
      const de = terrace(t, lot, 'e', ds + 1, s - dn - 1, ['house'], 1.4, homes);
      courtyard(['tree', 'bush', 'pine', 'planter', 'bike'], 2, 2, x0 + dw + 0.5, z0 + ds + 0.5, s - dw - de - 1, s - ds - dn - 1);
      return false;
    }
    case 'park': {
      add('fountain', cx, cz, 0);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        add('bench', cx + Math.cos(a) * 5.5, cz + Math.sin(a) * 5.5, -a + Math.PI / 2, variant());
      }
      // Trees packed close: a proper little wood round the fountain.
      scatter(t, x0, z0, s, 7, (px, pz) => {
        if (Math.hypot(px - cx, pz - cz) < 7.5) return;
        const r = rng();
        add(r < 0.5 ? 'tree' : r < 0.7 ? 'pine' : r < 0.9 ? 'bush' : 'planter', px, pz, turn(), variant());
      });
      return false;
    }
    case 'plaza': {
      // A small square: shops along the back, cafe tables and stalls in front.
      const dn = terrace(t, lot, 'n', 0, s, ['shop', 'shop', 'house'], 0.3, () => 0.9 + rng() * 0.4);
      const deep = s - dn - 1;
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 3; j++) {
          add((i + j) % 5 === 4 ? 'fruitstand' : 'cafe', x0 + 3.5 + i * 7, z0 + 2.5 + (j * (deep - 5)) / 2, 0, variant());
        }
      }
      add('cart', x0 + s - 1.2, z0 + 2, 0, variant());
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
      add('terminal', cx, cz, 0);
      return fills('terminal');
    case 'apron':
      add('jet', cx, cz, turn(), variant());
      return fills('jet');
    case 'mountain':
      add('mountain', cx, cz, turn(), variant());
      return fills('mountain');
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
function roadside(roads: number[], half: number, { add, rng, pick, variant }: Tools): void {
  const vehicles: PropKind[] = ['car', 'car', 'car', 'taxi', 'van', 'car', 'bus'];
  const kerb = ROAD / 2 - 1.4;
  for (const line of roads) {
    // Runs along x (a road at z = line), then along z (a road at x = line).
    for (const alongX of [true, false]) {
      for (let t = -half + ROAD + 3; t < half - ROAD; t += 6.5) {
        // Stay clear of crossings.
        if (roads.some((r) => Math.abs(r - t) < ROAD / 2 + 4)) continue;
        const r = rng();
        if (r < 0.5) {
          const side = rng() < 0.5 ? -1 : 1;
          const kind = pick(vehicles);
          // A bus needs the room of two spots.
          if (kind === 'bus') t += 4;
          const rot = alongX ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : side > 0 ? 0 : Math.PI;
          if (alongX) add(kind, t, line + side * kerb, rot, variant());
          else add(kind, line + side * kerb, t, rot, variant());
        } else if (r < 0.56) {
          if (alongX) add('cone', t, line + (rng() - 0.5) * 3, 0);
          else add('cone', line + (rng() - 0.5) * 3, t, 0);
        }
      }
    }
  }
}
