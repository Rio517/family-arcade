/**
 * The countryside round the bigger maps: lanes across the country roads
 * with hamlets where they cross, farmland, woods, wind farms and (on the
 * Region) mountains, and a cottage wherever a stretch would otherwise have
 * nothing for a middling hole to eat.
 */
import { KINDS, type PropKind } from '../catalog';
import { MOUNTAIN_FOOT, ROAD, inside, localFrame, type Add, type MapId, type Rect, type Side, type Tools } from './common';

/** A country lane across a country road, and the hamlet at the crossing. */
export interface Lane {
  rect: Rect;
  /** Where it crosses its country road. */
  x: number;
  z: number;
  /** Along the lane, and out along the country road towards the shore (unit vectors). */
  along: [number, number];
  out: [number, number];
  /** How far the lane runs each way from the crossing. */
  len: number;
  /** Room along the country road: back to the street grid, and out to the shore. */
  back: number;
  ahead: number;
}

const LANE = 8;
/** A meal for a middling hole, by swallow size: a van up to a little house (see catalog.ts `footSize`). */
const MEAL: [number, number] = [2.5, 5.5];
/** What may stand on a country road: cars and vans parked at its edge. */
const PARKS: ReadonlySet<PropKind> = new Set(['car', 'van', 'bus', 'taxi']);

/**
 * One lane across each country road, a little under halfway out (nearer
 * town on the port's side, so it keeps clear of the docks).
 */
export function countryLanes(half: number, land: number, mid: number, portSide: Side | null): Lane[] {
  const margin = land - half;
  const len = Math.min(half - 30, 40 + margin * 0.8);
  return (['n', 's', 'e', 'w'] as const).map((side) => {
    const d = side === portSide ? Math.min(margin * 0.45, margin - 66) : margin * 0.45;
    const sign = side === 's' || side === 'e' ? 1 : -1;
    const alongX = side === 'n' || side === 's';
    const c = sign * (half + d);
    const [x, z] = alongX ? [mid, c] : [c, mid];
    const rect = alongX
      ? { x0: mid - len, z0: c - LANE / 2, x1: mid + len, z1: c + LANE / 2 }
      : { x0: c - LANE / 2, z0: mid - len, x1: c + LANE / 2, z1: mid + len };
    return {
      rect,
      x,
      z,
      along: alongX ? [1, 0] : [0, 1],
      out: alongX ? [0, sign] : [sign, 0],
      len,
      back: d,
      ahead: margin - d,
    };
  });
}

/**
 * A hamlet where a lane crosses its country road: four to six little houses
 * facing the roads, a barn, a stall, trees, a van or two, now and then a
 * water tower. Then, thinning out with distance, farms, big houses and
 * cottages along the lane and the country road, and cars and vans parked
 * on the road. Worked out along the lane (`a`) and out along the road (`o`).
 */
function hamlet(lane: Lane, t: Tools, add: Add): void {
  const { rng, pick, variant, turn } = t;
  const { at, facing } = localFrame([lane.x, lane.z], lane.along, lane.out);
  const R = ROAD / 2;
  const L = LANE / 2;
  /** Put a thing at (a, o), if it stays clear of the street grid and the shore. */
  const put = (kind: PropKind, a: number, o: number, rot: number, v = 0) => {
    const r = Math.max(KINDS[kind].w, KINDS[kind].d) / 2;
    if (o - r > -lane.back + 4 && o + r < lane.ahead - 4) add(kind, ...at(a, o), rot, v);
  };

  // The hamlet: little houses on the four corners, facing the lane or the road.
  const slots: Array<[number, number, number]> = [];
  for (const sa of [-1, 1]) {
    for (const so of [-1, 1]) {
      slots.push([sa * 10.5, so * (L + 4.5), facing(0, -so)]);
      slots.push([sa * (R + 4.5), so * 15, facing(-sa, 0)]);
      slots.push([sa * (R + 4.5), so * 23, facing(-sa, 0)]);
    }
  }
  const homes = 4 + Math.floor(rng() * 3);
  for (let k = 0; k < homes && slots.length; k++) {
    const [a, o, rot] = slots.splice(Math.floor(rng() * slots.length), 1)[0];
    put('cottage', a, o, rot, variant());
  }
  const sa = rng() < 0.5 ? -1 : 1;
  const so = rng() < 0.5 ? -1 : 1;
  put('barn', sa * 26, so * 26, facing(-sa, 0), variant());
  put('tractor', sa * 15.5, so * 31, turn(), variant());
  for (let k = 0; k < 4; k++) put('haybale', sa * (19 + k * 3), so * 36, 0);
  if (rng() < 0.5) put('watertower', -sa * 26, -so * 26, 0, variant());
  put('fruitstand', -sa * 19, so * (L + 2.5), facing(0, -so), variant());
  for (let k = 0; k < 10; k++) {
    const a = (rng() < 0.5 ? -1 : 1) * (14 + rng() * 22);
    const o = (rng() < 0.5 ? -1 : 1) * (12 + rng() * 26);
    put(pick(['tree', 'tree', 'pine', 'bush'] as const), a, o, turn(), variant());
  }
  for (const a of [-17, 17]) if (rng() < 0.6) put(pick(['van', 'car', 'car'] as const), a, (rng() < 0.5 ? -1 : 1) * 2, facing(1, 0), variant());

  // Along the lane and out along the road: something every 24 or so,
  // more often near the crossing.
  const homestead = (a: number, o: number, da: number, dO: number) => {
    // (a, o) is the spot by the road; (da, dO) points away from the road.
    const r = rng();
    const face = facing(-da, -dO);
    if (r < 0.3) {
      // A farm: barn back from the road, the farmhouse in front, bales beside.
      put('cottage', a, o, face, variant());
      put('barn', a + da * 12 + dO * 10, o + dO * 12 + da * 10, face, variant());
      for (let k = 0; k < 3; k++) put('haybale', a - dO * (7 + k * 2.4) + da * 3, o - da * (7 + k * 2.4) + dO * 3, 0);
      if (rng() < 0.5) put('tractor', a + da * 9 - dO * 8, o + dO * 9 - da * 8, turn(), variant());
    } else if (r < 0.55) {
      // A big house with its garden and a car.
      put('villa', a + da * 2, o + dO * 2, face, variant());
      put(pick(['car', 'van'] as const), a - dO * 9 + da * 1, o - da * 9 + dO * 1, face, variant());
      for (const k of [-1, 1]) put(pick(['tree', 'pine'] as const), a + da * 10 + dO * k * 7, o + dO * 10 + da * k * 7, turn(), variant());
    } else if (r < 0.85) {
      // Two little houses side by side.
      for (const k of [-1, 1]) put('cottage', a + dO * k * 4.5, o + da * k * 4.5, face, variant());
      put('tree', a + da * 8, o + dO * 8, turn(), variant());
    } else {
      // A stall at the roadside, bales behind.
      put('fruitstand', a - da * 1.5, o - dO * 1.5, face, variant());
      for (let k = 0; k < 3; k++) put('haybale', a + da * 5 + dO * (k - 1) * 2.4, o + dO * 5 + da * (k - 1) * 2.4, 0);
    }
  };
  // A farm at each end of the lane: the house, two cottages, the barn, bales.
  for (const s of [-1, 1]) {
    const a = s * (lane.len - 6);
    const side = rng() < 0.5 ? -1 : 1;
    for (const k of [0, 8]) put('cottage', a - s * k, side * (L + 4.5), facing(0, -side), variant());
    put('barn', a - s * 4, side * (L + 20), facing(0, -side), variant());
    put('tractor', a - s * 16, side * (L + 14), turn(), variant());
    for (let k = 0; k < 4; k++) put('haybale', a - s * (22 + k * 2.6), side * (L + 20), 0);
    put('tree', a - s * 16, side * (L + 4.5), turn(), variant());
  }
  for (let a = 40; a < lane.len - 30; a += 24) {
    for (const s of [-1, 1]) {
      if (rng() > 0.95 - 0.45 * (a / lane.len)) continue;
      const side = rng() < 0.5 ? -1 : 1;
      homestead(s * a, side * (L + 4.5), 0, side);
    }
  }
  for (const s of [-1, 1]) {
    const room = s < 0 ? lane.back : lane.ahead;
    for (let o = 36; o < room - 12; o += 24) {
      if (rng() > 0.9 - 0.4 * (o / room)) continue;
      const side = rng() < 0.5 ? -1 : 1;
      homestead(side * (R + 4.5), s * o, side, 0);
    }
    // Cars and vans parked along the road's edge.
    for (let o = 12; o < room - 6; o += 11) {
      if (rng() < 0.3) put(pick(['car', 'car', 'van', 'car', 'bus'] as const), (rng() < 0.5 ? -1 : 1) * 2.6, s * o, facing(0, 1), variant());
    }
  }
}

/**
 * The open land between the street grid and the shore, in rings: farmland
 * nearest town, then woods and (on the bigger maps) wind farms on the open
 * meadows, and on the Region mountains along the far edge. Things keep off
 * the country roads, and fields are recorded so the ground can plough them.
 */
export function countryside(
  map: MapId,
  half: number,
  land: number,
  roads: readonly Rect[],
  fields: Rect[],
  t: Tools,
  keepOff: readonly Rect[],
  lanes: readonly Lane[],
  wonders: readonly PropKind[] = [],
): void {
  const { rng, pick, variant, turn } = t;
  const margin = land - half;
  const CELL = 26;
  const n = Math.ceil((land * 2) / CELL);
  // Wind farms on every map with countryside: big, tall and worth a lot,
  // seen from the edge of town, a reason to head out.
  const winds = map !== 'town';
  const peaks = map === 'region';
  // Ground the big things stand on: nothing else goes there. Each entry says
  // whether a spot (with `pad` of room round it) is on that ground.
  const taken: Array<(x: number, z: number, pad: number) => boolean> = [];
  const block = (x: number, z: number, w: number, d: number) =>
    taken.push((px, pz, pad) => Math.abs(px - x) < w / 2 + pad && Math.abs(pz - z) < d / 2 + pad);
  const round = (x: number, z: number, r: number) => taken.push((px, pz, pad) => Math.hypot(px - x, pz - z) < r + pad);
  // Small things already put down, by 8-unit square, so scattered trees,
  // rocks and bales never land on one another (the squares searched round a
  // spot reach its own size plus the widest neighbour, a barn).
  const small = new Map<string, Array<{ x: number; z: number; r: number }>>();
  const SQ = 8;
  const crowded = (x: number, z: number, r: number) => {
    const k = Math.ceil((r + 7) / SQ);
    for (let i = Math.floor(x / SQ) - k; i <= Math.floor(x / SQ) + k; i++) {
      for (let j = Math.floor(z / SQ) - k; j <= Math.floor(z / SQ) + k; j++) {
        if (small.get(`${i}:${j}`)?.some((o) => Math.max(Math.abs(o.x - x), Math.abs(o.z - z)) < o.r + r)) return true;
      }
    }
    return false;
  };
  const free = (x: number, z: number, pad: number) => !taken.some((on) => on(x, z, pad));
  /** Where the meals are: things a middling hole (a van to a little house) can swallow. */
  const meals: Array<[number, number]> = [];
  /** A small thing, only where nothing else stands, and off the roads (parked cars and vans excepted). */
  const add: Add = (kind, x, z, rot, variant, hScale) => {
    const r = Math.max(KINDS[kind].w, KINDS[kind].d) / 2;
    // Never into the street grid (its outer road runs right along its edge).
    if (Math.max(Math.abs(x), Math.abs(z)) - r < half + 0.5) return;
    // (A square's corner reaches √2 of its half-width into round ground.)
    if (!free(x, z, r * 1.42) || crowded(x, z, r)) return;
    if (!PARKS.has(kind) && inside(roads, x, z, r + 0.5)) return;
    if (kind !== 'haybale' && kind !== 'tractor' && inside(fields, x, z, r)) return;
    t.add(kind, x, z, rot, variant, hScale);
    const size = Math.hypot(KINDS[kind].w, KINDS[kind].d) * 0.425;
    if (size >= MEAL[0] && size <= MEAL[1]) meals.push([x, z]);
    const key = `${Math.floor(x / SQ)}:${Math.floor(z / SQ)}`;
    small.set(key, [...(small.get(key) ?? []), { x, z, r }]);
  };

  for (const r of keepOff) block((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, r.x1 - r.x0, r.z1 - r.z0);

  // One power plant out on the Region's countryside, on its own ground.
  if (map === 'region') {
    const px = land - margin * 0.45;
    const pz = -land + margin * 0.5;
    t.add('powerplant', px, pz, 0);
    block(px, pz, KINDS.powerplant.w + 4, KINDS.powerplant.d + 4);
  }

  // Wonders that belong out in the open, on a meadow a little way out of
  // town: their gold star is a lure into the countryside.
  for (const kind of wonders) {
    const heads = kind === 'moai';
    const [w, d] = heads ? [28, 16] : [KINDS[kind].w + 4, KINDS[kind].d + 4];
    const r = Math.max(w, d) / 2;
    for (let tries = 0; tries < 60; tries++) {
      const side = Math.floor(rng() * 4);
      const out = half + margin * (0.3 + rng() * 0.3);
      const along = (rng() - 0.5) * 2 * (half - 30);
      const [x, z] = side === 0 ? [along, -out] : side === 1 ? [out, along] : side === 2 ? [along, out] : [-out, along];
      if (!free(x, z, r) || inside(roads, x, z, r + 2) || Math.max(Math.abs(x), Math.abs(z)) - r < half + 4) continue;
      if (heads) {
        // Four heads in a loose arc, two with the red topknot (as on a city block).
        const tops = rng() < 0.5 ? [0, 1, 1, 0] : [1, 0, 0, 1];
        [-9.6, -3.2, 3.2, 9.6].forEach((dx, i) => t.add('moai', x + dx, z + dx * dx * 0.05, (rng() - 0.5) * 0.3, tops[i]));
      } else t.add(kind, x, z, 0);
      block(x, z, w, d);
      break;
    }
  }

  // Hamlets where the lanes cross the country roads, and homes, farms and
  // stalls along the lanes and roads: most of the countryside's food, so it
  // is thickest near the roads and thins out towards the shore.
  for (const lane of lanes) hamlet(lane, t, add);

  // Which cells of open land get what (all drawn from the rng first, so the
  // big things can claim their ground before anything small is put down).
  const cells: Array<{ i: number; j: number; cx: number; cz: number; u: number; r: number }> = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const cx = -land + (i + 0.5) * CELL;
      const cz = -land + (j + 0.5) * CELL;
      const d = Math.max(Math.abs(cx), Math.abs(cz)) - half;
      // Only the countryside ring, clear of the shore (each thing keeps off the roads itself).
      if (d < CELL * 0.6 || Math.max(Math.abs(cx), Math.abs(cz)) > land - CELL * 0.55) continue;
      cells.push({ i, j, cx, cz, u: d / margin, r: rng() });
    }
  }
  // Mountains along the Region's far edge, and wind turbines on the open
  // meadows, where they have room: clear of the roads and the power plant.
  const TURBINE_PAD = 7;
  const big = new Set<(typeof cells)[number]>();
  const mountain = (c: (typeof cells)[number]) => peaks && c.u > 0.72 && c.r < 0.5 && (c.i + c.j) % 2 === 0;
  for (const c of cells) {
    if (!mountain(c) || !free(c.cx, c.cz, MOUNTAIN_FOOT) || crowded(c.cx, c.cz, MOUNTAIN_FOOT) || inside(roads, c.cx, c.cz, MOUNTAIN_FOOT + 2)) continue;
    t.add('mountain', c.cx, c.cz, turn(), variant());
    round(c.cx, c.cz, MOUNTAIN_FOOT);
    big.add(c);
  }
  for (const c of cells) {
    const { cx, cz, u, r } = c;
    if (!winds || (peaks && u > 0.72) || u < 0.2 || r >= 0.3 || !free(cx, cz, TURBINE_PAD) || crowded(cx, cz, TURBINE_PAD) || inside(roads, cx, cz, TURBINE_PAD)) continue;
    t.add('windturbine', cx, cz, 0);
    round(cx, cz, TURBINE_PAD);
    big.add(c);
    if (rng() < 0.5) add('rock', cx + 9, cz + 8, 0);
    // The engineers' van.
    if (rng() < 0.4) add('van', cx - 9, cz + 8, 0, variant());
  }
  // A line of trees along a field's south and west edges (the next field's
  // closes the other two): mostly pines, which are light to draw, a bush or
  // a leafy tree between them now and then.
  const hedgerow = (cx: number, cz: number) => {
    const e = CELL / 2;
    for (let k = 0; k < 11; k++) {
      const u = -e + 1.3 + k * 2.4;
      const w = rng();
      const kind: PropKind = w < 0.75 ? 'pine' : w < 0.9 ? 'bush' : 'tree';
      add(kind, cx + u, cz + e, turn(), variant());
      add(kind, cx - e, cz + u, turn(), variant());
    }
  };
  // Everything else, round them.
  for (const c of cells) {
    if (big.has(c)) continue;
    const { cx, cz, u, r } = c;
    if (peaks && u > 0.72) {
      // Pines at the mountains' feet, and now and then a hut among them.
      if (rng() < 0.45) add('cottage', cx, cz, turn(), variant());
      for (let k = 0; k < 10; k++) add('pine', cx + (rng() - 0.5) * CELL * 0.8, cz + (rng() - 0.5) * CELL * 0.8, 0, variant());
    } else if (u < 0.4) {
      // Farmland: fields of hay or crops, now and then a farmyard.
      if (r < 0.3) {
        // A farmyard: the barn, the tractor, a stall and the farmer's little house.
        add('barn', cx - 4, cz - 4, turn(), variant());
        add('tractor', cx + 7, cz + 6, turn(), variant());
        add('fruitstand', cx + 7, cz - 8, 0, variant());
        add('cottage', cx - 5, cz + 8, Math.PI, variant());
      } else if (r < 0.8) {
        if (!free(cx, cz, CELL / 2) || crowded(cx, cz, CELL / 2 - 1) || inside(roads, cx, cz, CELL / 2)) continue;
        // Fields stop short of the cell's edge, leaving room for a hedgerow between two.
        fields.push({ x0: cx - CELL / 2 + 1.6, z0: cz - CELL / 2 + 1.6, x1: cx + CELL / 2 - 1.6, z1: cz + CELL / 2 - 1.6 });
        for (let a = 0; a < 4; a++) for (let b = 0; b < 3; b++) if (rng() < 0.8) add('haybale', cx - 8 + a * 5.5, cz - 6 + b * 6, 0);
        // The tractor at the end of the rows, clear of the bales.
        if (rng() < 0.3) add('tractor', cx + 8.5, cz + 9.6, turn(), variant());
        hedgerow(cx, cz);
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
      // Woods, some with a cabin in a clearing.
      if (rng() < 0.5) add(pick(['cottage', 'cottage', 'cottage', 'villa'] as const), cx, cz, turn(), variant());
      for (let k = 0; k < 16; k++) {
        const w = rng();
        const kind = w < 0.8 ? 'pine' : w < 0.92 ? 'tree' : 'bush';
        add(kind, cx - CELL / 2 + 2.5 + (k % 4) * 6.2 + rng() * 1.5, cz - CELL / 2 + 2.5 + Math.floor(k / 4) * 6.2 + rng() * 1.5, turn(), variant());
      }
    } else {
      // Open meadow: a cottage with a car, or a stall, and bushes and rocks.
      add(pick(['cottage', 'cottage', 'fruitstand'] as const), cx, cz, turn(), variant());
      if (rng() < 0.5) add(pick(['car', 'van'] as const), cx + 6, cz - 1, 0, variant());
      for (let k = 0; k < 3; k++) add(pick(['rock', 'bush', 'haybale', 'tree'] as const), cx + (rng() - 0.5) * CELL * 0.7, cz + (rng() - 0.5) * CELL * 0.7, 0, variant());
    }
  }
  // Then green all over the open land: trees, bushes and the odd rock on
  // whatever ground is still free (never on a field), so the country reads
  // as lived-in, not a lawn with a few things on it. Woods are full already.
  for (const c of cells) {
    if (big.has(c) || (peaks && c.u > 0.72) || (c.u >= 0.4 && c.r < 0.75)) continue;
    for (let k = 0; k < 11; k++) {
      const w = rng();
      const kind: PropKind = w < 0.6 ? 'pine' : w < 0.78 ? 'tree' : w < 0.9 ? 'bush' : 'rock';
      add(kind, c.cx + (rng() - 0.5) * CELL * 0.9, c.cz + (rng() - 0.5) * CELL * 0.9, turn(), variant());
    }
  }
  // Nowhere without a meal: wherever a stretch of countryside has nothing a
  // middling hole can swallow within about a screen, a little house goes up
  // in the nearest free spot.
  const STEP = 40;
  for (let x = -land + 30; x <= land - 30; x += STEP) {
    for (let z = -land + 30; z <= land - 30; z += STEP) {
      if (Math.max(Math.abs(x), Math.abs(z)) < half + 20) continue;
      if (meals.some(([mx, mz]) => Math.hypot(mx - x, mz - z) < 45)) continue;
      const before = meals.length;
      for (const [dx, dz] of [
        [0, 0],
        [12, 0],
        [-12, 0],
        [0, 12],
        [0, -12],
        [12, 12],
        [-12, -12],
        [12, -12],
        [-12, 12],
        [24, 0],
        [-24, 0],
        [0, 24],
        [0, -24],
      ]) {
        if (meals.length > before) break;
        add('cottage', x + dx, z + dz, turn(), variant());
      }
    }
  }
}
