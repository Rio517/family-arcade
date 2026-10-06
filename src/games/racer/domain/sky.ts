/**
 * Rainbow Racer — the shape of the open sky.
 *
 * The sky has no edge, so it cannot be built in advance: it is cut into square
 * cells, and whatever sits in a cell (floating islands, clouds, a balloon) is
 * decided by hashing the cell's coordinates (scenery.ts). The same cell
 * always holds the same things, on every device and every race, so two
 * players see the same sky without sending it, and the scene only builds the
 * cells near the camera. The rainbow road lives here, with the rings that
 * hang over it: flying through a ring is a rule (a speed burst), not just
 * scenery. Every ring is on the road, so a ring always means "this way".
 */

import { CRUISE_ALTITUDE, SKY_CEILING, SKY_FLOOR } from './flight';

/** The side of one sky cell, in world units. */
export const CELL = 180;
/** A rainbow ring's radius; flying within it counts as flying through. */
export const RING_RADIUS = 9;

export interface Ring {
  /** Stable across devices: `t:<road point>`. */
  id: string;
  x: number;
  y: number;
  z: number;
  /** Which way the ring faces (the direction you fly through it). */
  heading: number;
}

/** A deterministic 0–1 value for a cell and a salt. No Math.random. */
export function cellNoise(cx: number, cz: number, salt: number): number {
  let h = Math.imul(cx | 0, 374761393) ^ Math.imul(cz | 0, 668265263) ^ Math.imul(salt | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function cellOf(v: number): number {
  return Math.floor(v / CELL);
}

/** The ring a racer at this point is flying through, if any. */
export function ringAt(x: number, y: number, z: number): Ring | null {
  for (const ring of trailRingsNear(x, z, RING_RADIUS)) {
    if (Math.hypot(ring.x - x, ring.y - y, ring.z - z) <= RING_RADIUS) return ring;
  }
  return null;
}

// ── the rainbow road ───────────────────────────────────────────────────────
//
// A track to follow through the open sky. It starts at the start line and
// winds on forever: each point is a fixed step on from the last, turning a
// little (the turn itself changes slowly, so the road sweeps rather than
// zigzags) and rising and falling gently. Points are computed once, in
// order, and kept, so the same index is the same point on every device.
// Flying off the road is allowed; the road is where the coins are thickest,
// and the only place rings hang.

/** Distance between road points. */
export const TRAIL_STEP = 40;
/** A rainbow ring hangs over the road every this many points… */
export const TRAIL_RING_EVERY = 6;
/** …and one more on the straight out of the start, so the first thing a
 * child sees is something to fly through. */
export const FIRST_RING = 2;

export interface TrailPoint {
  x: number;
  y: number;
  z: number;
  /** Direction of travel here. */
  heading: number;
}

const trail: TrailPoint[] = [{ x: 0, y: CRUISE_ALTITUDE, z: 0, heading: 0 }];
/** Road point indices by sky cell, so a position finds its road without a hint. */
const trailCells = new Map<string, number[]>([['0:0', [0]]]);
let trailTurn = 0;

export function trailPoint(i: number): TrailPoint {
  const n = Math.max(0, Math.floor(i));
  while (trail.length <= n) {
    const k = trail.length;
    const prev = trail[k - 1];
    // The first stretch runs straight and level out of the start, through
    // the first ring; after that it sweeps left and right, up and down.
    const wobble = k < 4 ? 0 : (cellNoise(k, 7, 31) - 0.5) * 0.24;
    trailTurn = trailTurn * 0.82 + wobble;
    const heading = prev.heading + trailTurn;
    const ramp = Math.min(1, Math.max(0, (k - 3) / 6));
    const swell = Math.sin(k * 0.17) * 14 + Math.sin(k * 0.071 + 1.3) * 10 - Math.sin(1.3) * 10;
    const y = CRUISE_ALTITUDE + swell * ramp;
    const point = {
      x: prev.x + Math.sin(heading) * TRAIL_STEP,
      y: Math.max(SKY_FLOOR + 6, Math.min(SKY_CEILING - 12, y)),
      z: prev.z + Math.cos(heading) * TRAIL_STEP,
      heading,
    };
    trail.push(point);
    const key = `${cellOf(point.x)}:${cellOf(point.z)}`;
    const list = trailCells.get(key);
    if (list) list.push(k);
    else trailCells.set(key, [k]);
  }
  return trail[n];
}

/** Road points built so far that lie in the cells around a position. */
function trailIndicesNear(x: number, z: number): number[] {
  const out: number[] = [];
  const cx = cellOf(x);
  const cz = cellOf(z);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) out.push(...(trailCells.get(`${cx + dx}:${cz + dz}`) ?? []));
  }
  return out;
}

/**
 * The road point nearest a position. `hint` is the index last found for the
 * same racer; the road is built out to a little past it, and the search
 * covers the points around the hint and every road point in nearby cells.
 */
export function nearestTrailIndex(x: number, z: number, hint = 0): number {
  const h = Math.max(0, Math.floor(hint));
  trailPoint(h + 40);
  let best = h;
  let bestD = Infinity;
  const consider = (i: number) => {
    const p = trail[i];
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  };
  for (let i = Math.max(0, h - 40); i <= h + 40; i++) consider(i);
  for (const i of trailIndicesNear(x, z)) consider(i);
  return best;
}

/** The ring over the road at point i, if there is one there. */
export function trailRing(i: number): Ring | null {
  if (i !== FIRST_RING && (i <= 0 || i % TRAIL_RING_EVERY !== 0)) return null;
  const p = trailPoint(i);
  return { id: `t:${i}`, x: p.x, y: p.y, z: p.z, heading: p.heading };
}

/** Road rings already built near a position (the road is built ahead of racers). */
function trailRingsNear(x: number, z: number, radius: number): Ring[] {
  const out: Ring[] = [];
  for (const i of trailIndicesNear(x, z)) {
    const r = trailRing(i);
    if (r && Math.hypot(r.x - x, r.z - z) <= radius) out.push(r);
  }
  return out;
}

/** The road points built so far that lie in a cell, in order. */
export function trailPointsInCell(cx: number, cz: number): readonly number[] {
  return trailCells.get(`${cx}:${cz}`) ?? [];
}
