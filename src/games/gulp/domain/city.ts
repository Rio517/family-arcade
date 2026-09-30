/**
 * Gulp City's maps: a square grid of blocks between roads, on an island.
 *
 * Four maps, each bigger than the last and each with bigger things to aim
 * for. A map is built in rings from the middle: the tallest buildings at the
 * centre, then town, then suburbs, and (on the Region map) countryside with
 * farms, forests, wind farms, an airport and mountains at the corners. Every
 * map keeps plenty of small things everywhere so a new hole always has food.
 *
 * Each block kind fills its own lot, pavements carry street things, roads
 * carry parked vehicles, so nothing overlaps. Everything comes from the
 * `rng` passed in (ADR 0005).
 */
import { KINDS, makeProp, type Prop, type PropKind } from './catalog';

type Rng = () => number;

export type MapId = 'town' | 'city' | 'mega' | 'region';

export const MAPS: Record<MapId, { blocks: number; label: string; rivals: number; minutes: number }> = {
  town: { blocks: 4, label: 'Town', rivals: 3, minutes: 2 },
  city: { blocks: 6, label: 'City', rivals: 4, minutes: 3 },
  mega: { blocks: 9, label: 'Megalopolis', rivals: 5, minutes: 4 },
  region: { blocks: 13, label: 'Region', rivals: 7, minutes: 5 },
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
  | 'mountain';

/** Blocks out of town: green verges instead of pavements full of street things. */
const RURAL: ReadonlySet<BlockKind> = new Set(['farm', 'forest', 'windfarm', 'mountain']);

export interface Block {
  kind: BlockKind;
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
}

/** Road width, block size (pavement included) and pavement width. */
export const ROAD = 14;
export const BLOCK = 40;
export const SIDEWALK = 3;
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
  const blockList: Block[] = [];
  for (let bx = 0; bx < blocks; bx++) {
    for (let bz = 0; bz < blocks; bz++) {
      const x = -half + ROAD + bx * PITCH;
      const z = -half + ROAD + bz * PITCH;
      const block: Block = { kind: kinds[bx][bz], x, z, size: BLOCK };
      blockList.push(block);
      const big = interior(block, tools);
      if (!big) (RURAL.has(block.kind) ? verge : sidewalk)(block, tools);
    }
  }
  roadside(roads, half, tools);
  return { map, blocks, half, roads, blockList, props };
}

// -------------------------------------------------------------------------
// Which block goes where
// -------------------------------------------------------------------------

/** Rings from the middle: ring 0 is the centre, the last ring is the edge. */
function layout(map: MapId, rng: Rng): BlockKind[][] {
  const n = MAPS[map].blocks;
  const mid = (n - 1) / 2;
  const edge = Math.floor(mid);
  const grid: BlockKind[][] = [];
  const rings: number[][] = [];
  for (let bx = 0; bx < n; bx++) {
    grid.push([]);
    rings.push([]);
    for (let bz = 0; bz < n; bz++) {
      const ring = Math.floor(Math.max(Math.abs(bx - mid), Math.abs(bz - mid)));
      rings[bx].push(ring);
      grid[bx].push(ringKind(map, ring, edge, rng));
    }
  }
  // Specials: a few of each, dropped on blocks of the right ring.
  const cells = (want: (ring: number) => boolean) => {
    const out: Array<[number, number]> = [];
    for (let bx = 0; bx < n; bx++) for (let bz = 0; bz < n; bz++) if (want(rings[bx][bz])) out.push([bx, bz]);
    return out;
  };
  const place = (kind: BlockKind, count: number, want: (ring: number) => boolean) => {
    const pool = cells(want).filter(([bx, bz]) => !SPECIAL.has(grid[bx][bz]));
    for (let i = 0; i < count && pool.length; i++) {
      const [bx, bz] = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      grid[bx][bz] = kind;
    }
  };
  switch (map) {
    case 'town':
      place('industrial', 1, (r) => r === edge);
      place('farm', 1, (r) => r === edge);
      place('park', 2, () => true);
      break;
    case 'city':
      place('landmark', 2, (r) => r === 1 || r === 2);
      place('industrial', 2, (r) => r === edge);
      place('park', 2, (r) => r >= 1);
      place('plaza', 1, (r) => r >= 1);
      break;
    case 'mega':
      place('landmark', 4, (r) => r === 2 || r === 3);
      place('industrial', 3, (r) => r === edge);
      place('park', 4, (r) => r >= 1);
      place('plaza', 2, (r) => r >= 1);
      break;
    case 'region': {
      place('landmark', 5, (r) => r === 2 || r === 3);
      place('industrial', 5, (r) => r === 4 || r === 5);
      place('park', 6, (r) => r >= 1 && r <= 4);
      place('plaza', 3, (r) => r >= 1 && r <= 4);
      // An airport: the terminal with its apron beside it, out of town.
      const spots = cells((r) => r === edge - 1).filter(([bx, bz]) => !SPECIAL.has(grid[bx][bz]));
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

function ringKind(map: MapId, ring: number, edge: number, rng: Rng): BlockKind {
  const r = rng();
  switch (map) {
    case 'town':
      // A little high street in the middle: a few taller blocks among the shops.
      if (ring === 0) return r < 0.5 ? 'downtown' : r < 0.8 ? 'town' : 'plaza';
      return r < 0.7 ? 'suburb' : 'town';
    case 'city':
      if (ring === 0) return 'downtown';
      if (ring === 1) return r < 0.6 ? 'downtown' : 'town';
      if (ring === edge) return r < 0.75 ? 'suburb' : 'town';
      return r < 0.7 ? 'town' : 'suburb';
    case 'mega':
      if (ring === 0) return 'skyline';
      if (ring === 1) return r < 0.6 ? 'skyline' : 'downtown';
      if (ring === 2) return r < 0.7 ? 'downtown' : 'town';
      if (ring === edge) return r < 0.7 ? 'suburb' : 'town';
      return r < 0.6 ? 'town' : 'suburb';
    case 'region':
      if (ring === 0) return 'skyline';
      if (ring === 1) return r < 0.5 ? 'skyline' : 'downtown';
      if (ring === 2) return r < 0.65 ? 'downtown' : 'town';
      if (ring === 3) return r < 0.6 ? 'town' : 'suburb';
      if (ring === 4) return r < 0.7 ? 'suburb' : 'park';
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

/** Lamps at a steady beat round the block, and street things between them. */
function sidewalk(b: Block, { add, rng, pick, variant }: Tools): void {
  const street: PropKind[] = ['hydrant', 'bin', 'mailbox', 'planter', 'bench', 'bike', 'cone', 'bin', 'planter'];
  alongEdges(b, 3.4, (x, z, rot, beat) => {
    if (beat % 4 === 0) add(beat % 8 === 0 ? 'lamp' : 'tree', x, z, rot, variant());
    else if (rng() < 0.55) add(pick(street), x, z, rot + (rng() < 0.5 ? 0 : Math.PI), variant());
  });
}

/** Country verges: hay, rocks, the odd tree. */
function verge(b: Block, { add, rng, pick, variant }: Tools): void {
  const kinds: PropKind[] = b.kind === 'farm' ? ['haybale', 'haybale', 'bush', 'rock'] : ['rock', 'bush', 'pine', 'tree'];
  alongEdges(b, 4.5, (x, z, rot) => {
    if (rng() < 0.5) add(pick(kinds), x, z, rot, variant());
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
    for (let t = 4, beat = 0; t < b.size - 3; t += step, beat++) each(e.x0 + e.dx * t, e.z0 + e.dz * t, e.rot, beat);
  }
}

/**
 * What stands inside the pavement ring. Returns true when one thing fills
 * the whole block (a stadium, a mountain), which then has no pavement things.
 */
function interior(b: Block, t: Tools): boolean {
  const { add, rng, pick, variant, turn } = t;
  const x0 = b.x + SIDEWALK + 1;
  const z0 = b.z + SIDEWALK + 1;
  const s = b.size - 2 * (SIDEWALK + 1);
  const cx = x0 + s / 2;
  const cz = z0 + s / 2;
  const fills = (kind: PropKind) => Math.max(KINDS[kind].w, KINDS[kind].d) > s;

  switch (b.kind) {
    case 'skyline': {
      // One supertall tower, or the TV tower, with planters at its feet.
      const kind: PropKind = rng() < 0.12 ? 'tvtower' : 'skyscraper';
      add(kind, cx, cz, turn(), variant(), 0.8 + rng() * 0.6);
      for (const [dx, dz] of [
        [-14, -14],
        [14, -14],
        [-14, 14],
        [14, 14],
      ]) {
        add(pick(['planter', 'bench', 'tree'] as const), cx + dx, cz + dz, 0, variant());
      }
      return false;
    }
    case 'downtown': {
      // Four big lots; a tower or an apartment block on most of them.
      const q = s / 2;
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          const lx = x0 + q * i + q / 2;
          const lz = z0 + q * j + q / 2;
          if (rng() < 0.85) {
            add(rng() < 0.45 ? 'tower' : 'apartment', lx, lz, turn(), variant(), 0.8 + rng() * 0.7);
          } else {
            add('kiosk', lx, lz, turn(), variant());
            add('planter', lx - 4, lz + 3.5, 0, variant());
            add('planter', lx + 4, lz + 3.5, 0, variant());
          }
        }
      }
      return false;
    }
    case 'town': {
      // Shops along one side, houses behind, a bush or two between.
      for (let i = 0; i < 3; i++) add('shop', x0 + 5.5 + i * 11, z0 + 5, 0, variant(), 0.9 + rng() * 0.4);
      for (let i = 0; i < 3; i++) add('house', x0 + 5.5 + i * 11, z0 + s - 5.5, Math.PI, variant(), 0.9 + rng() * 0.3);
      for (let i = 0; i < 4; i++) add(pick(['bush', 'planter', 'bench'] as const), x0 + 3 + i * 9, cz, 0, variant());
      return false;
    }
    case 'suburb': {
      // Houses with gardens: a tree and bushes by each.
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          const hx = x0 + 7 + i * 17;
          const hz = z0 + 7 + j * 17;
          add('house', hx, hz, turn(), variant(), 0.85 + rng() * 0.3);
          add(pick(['tree', 'pine'] as const), hx + 6, hz + 6, 0, variant());
          add('bush', hx - 5.5, hz + 5.5, 0, variant());
          if (rng() < 0.5) add('bike', hx + 5.5, hz - 5, 0, variant());
        }
      }
      return false;
    }
    case 'park': {
      add('fountain', cx, cz, 0);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        add('bench', cx + Math.cos(a) * 7, cz + Math.sin(a) * 7, -a + Math.PI / 2, variant());
      }
      scatter(t, x0, z0, s, 5, (px, pz) => {
        if (Math.hypot(px - cx, pz - cz) < 11) return;
        const r = rng();
        add(r < 0.45 ? 'tree' : r < 0.65 ? 'pine' : r < 0.85 ? 'bush' : 'planter', px, pz, turn(), variant());
      });
      add('cart', cx + 10, cz - 12, Math.PI / 2, variant());
      return false;
    }
    case 'plaza': {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) add('cafe', x0 + 7 + i * 7, z0 + 10 + j * 7, 0, variant());
      add('kiosk', x0 + 5, z0 + 3.5, 0, variant());
      add('kiosk', x0 + s - 5, z0 + 3.5, 0, variant());
      add('cart', x0 + 4, z0 + s - 4, Math.PI / 2, variant());
      add('cart', x0 + s - 4, z0 + s - 4, -Math.PI / 2, variant());
      for (let i = 0; i < 5; i++) add(pick(['planter', 'bin', 'bench', 'bike'] as const), x0 + 3 + i * 7, z0 + s - 1, 0, variant());
      return false;
    }
    case 'landmark': {
      const kind = pick(['stadium', 'mall', 'powerplant', 'stadium', 'mall'] as const);
      add(kind, cx, cz, rng() < 0.5 ? 0 : Math.PI, variant());
      return fills(kind);
    }
    case 'industrial': {
      // A factory (or the chemical plant), a warehouse or water tower, and a
      // yard of containers, a tanker and a van.
      add(rng() < 0.4 ? 'chemplant' : 'factory', x0 + 11, z0 + 9.5, 0, variant());
      add(rng() < 0.3 ? 'watertower' : 'warehouse', x0 + s - 12, z0 + s - 7.5, 0, variant());
      for (let i = 0; i < 3; i++) add('container', x0 + 24.5 + i * 3, z0 + 5, 0, variant());
      add('tanker', x0 + 3, z0 + s - 6, 0);
      add('van', x0 + 6, z0 + s - 6, 0, variant());
      for (let i = 0; i < 4; i++) add('cone', x0 + 2 + i * 2, z0 + 20, 0);
      return false;
    }
    case 'farm': {
      // The barn in one corner, hay in rows, a tractor in the field.
      add('barn', x0 + 8, z0 + 6, 0, variant());
      for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) add('haybale', x0 + 5 + i * 5.5, z0 + 17 + j * 5, 0);
      add('tractor', x0 + s - 5, z0 + 6, turn(), variant());
      add(pick(['tree', 'pine'] as const), x0 + s - 3, z0 + s - 3, 0, variant());
      return false;
    }
    case 'forest': {
      scatter(t, x0, z0, s, 6, (px, pz) => {
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
      // Two turbines one behind the other: their rotors span the block's width.
      add('windturbine', cx, cz - 9, 0);
      add('windturbine', cx, cz + 9, 0);
      add('rock', cx - 13, cz, 0);
      add('bush', cx + 13, cz, 0, variant());
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
  }
}

/** A loose grid over a square, `n` × `n`, each spot nudged a little. */
function scatter(t: Tools, x0: number, z0: number, s: number, n: number, each: (x: number, z: number) => void): void {
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      each(x0 + 2 + (i * (s - 4)) / (n - 1) + (t.rng() - 0.5) * 2, z0 + 2 + (j * (s - 4)) / (n - 1) + (t.rng() - 0.5) * 2);
    }
  }
}

/** Parked vehicles along the kerbs, and the odd cone in the road. */
function roadside(roads: number[], half: number, { add, rng, pick, variant }: Tools): void {
  const vehicles: PropKind[] = ['car', 'car', 'car', 'taxi', 'van', 'car', 'bus'];
  const kerb = ROAD / 2 - 1.6;
  for (const line of roads) {
    // Runs along x (a road at z = line), then along z (a road at x = line).
    for (const alongX of [true, false]) {
      for (let t = -half + ROAD + 3; t < half - ROAD; t += 7) {
        // Stay clear of crossings.
        if (roads.some((r) => Math.abs(r - t) < ROAD / 2 + 4)) continue;
        const r = rng();
        if (r < 0.34) {
          const side = rng() < 0.5 ? -1 : 1;
          const kind = pick(vehicles);
          // A bus needs the room of two spots.
          if (kind === 'bus') t += 4;
          const rot = alongX ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : side > 0 ? 0 : Math.PI;
          if (alongX) add(kind, t, line + side * kerb, rot, variant());
          else add(kind, line + side * kerb, t, rot, variant());
        } else if (r < 0.4) {
          if (alongX) add('cone', t, line + (rng() - 0.5) * 4, 0);
          else add('cone', line + (rng() - 0.5) * 4, t, 0);
        }
      }
    }
  }
}
