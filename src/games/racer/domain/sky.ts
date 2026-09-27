/**
 * Rainbow Racer — the shape of the open sky.
 *
 * The sky has no edge, so it cannot be built in advance: it is cut into square
 * cells, and whatever sits in a cell (a rainbow ring, floating islands, a
 * balloon) is decided by hashing the cell's coordinates. The same cell always
 * holds the same things, on every device and every race, so two players see
 * the same sky without sending it, and the scene only builds the cells near
 * the camera. Rings live here, not in the scene, because flying through one
 * is a rule (a speed burst), not just scenery.
 */

import { CRUISE_ALTITUDE, SKY_CEILING, SKY_FLOOR } from './flight';

/** The side of one sky cell, in world units. */
export const CELL = 180;
/** A rainbow ring's radius; flying within it counts as flying through. */
export const RING_RADIUS = 9;

export interface Ring {
  /** Stable across devices: `r:<cx>:<cz>`. */
  id: string;
  x: number;
  y: number;
  z: number;
  /** Which way the ring faces (the direction you fly through it). */
  heading: number;
}

export interface Island {
  x: number;
  /** Height of the island's top. */
  y: number;
  z: number;
  /** Radius of the top. */
  radius: number;
  /** 0–1, picks the flowers and trees. */
  kind: number;
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

/** The ring in a cell, if it has one (about two in five do). The start cell always does. */
export function ringInCell(cx: number, cz: number): Ring | null {
  const start = cx === 0 && cz === 0;
  if (!start && cellNoise(cx, cz, 1) > 0.42) return null;
  if (start) {
    // A ring straight ahead of the start line, so the first thing a child
    // sees is something to fly through.
    return { id: 'r:0:0', x: 0, y: CRUISE_ALTITUDE, z: 70, heading: 0 };
  }
  const margin = 30;
  return {
    id: `r:${cx}:${cz}`,
    x: cx * CELL + margin + cellNoise(cx, cz, 2) * (CELL - 2 * margin),
    y: SKY_FLOOR + 10 + cellNoise(cx, cz, 3) * (SKY_CEILING - SKY_FLOOR - 30),
    z: cz * CELL + margin + cellNoise(cx, cz, 4) * (CELL - 2 * margin),
    heading: cellNoise(cx, cz, 5) * Math.PI * 2,
  };
}

/** The floating islands in a cell (zero to two). They sit below the racers. */
export function islandsInCell(cx: number, cz: number): Island[] {
  const out: Island[] = [];
  const count = cellNoise(cx, cz, 10) < 0.45 ? 0 : cellNoise(cx, cz, 11) < 0.7 ? 1 : 2;
  for (let i = 0; i < count; i++) {
    const s = 20 + i * 7;
    out.push({
      x: cx * CELL + 25 + cellNoise(cx, cz, s) * (CELL - 50),
      y: -4 - cellNoise(cx, cz, s + 1) * 16,
      z: cz * CELL + 25 + cellNoise(cx, cz, s + 2) * (CELL - 50),
      radius: 14 + cellNoise(cx, cz, s + 3) * 22,
      kind: cellNoise(cx, cz, s + 4),
    });
  }
  return out;
}

/** Every ring within `radius` of a point (for the rules and the scene). */
export function ringsNear(x: number, z: number, radius: number): Ring[] {
  const out: Ring[] = [];
  const c0 = cellOf(x - radius);
  const c1 = cellOf(x + radius);
  const r0 = cellOf(z - radius);
  const r1 = cellOf(z + radius);
  for (let cx = c0; cx <= c1; cx++) {
    for (let cz = r0; cz <= r1; cz++) {
      const ring = ringInCell(cx, cz);
      if (ring && Math.hypot(ring.x - x, ring.z - z) <= radius) out.push(ring);
    }
  }
  return out;
}

/** The ring a racer at this point is flying through, if any. */
export function ringAt(x: number, y: number, z: number): Ring | null {
  for (const ring of ringsNear(x, z, RING_RADIUS)) {
    if (Math.hypot(ring.x - x, ring.y - y, ring.z - z) <= RING_RADIUS) return ring;
  }
  return null;
}
