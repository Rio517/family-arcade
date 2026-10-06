/**
 * Rainbow Racer — what decorates the sky: the floating islands and the cloud
 * banks in each sky cell.
 *
 * Like the rest of the sky (sky.ts) it is decided by hashing each cell's
 * coordinates, so the same cell always holds the same islands and clouds on
 * every device, and nothing here is ever sent. Only the 3D view reads it;
 * no rule does, so it stays out of the code every player downloads.
 */

import { CELL, cellNoise, cellOf, trailPoint, trailPointsInCell } from './sky';

type IslandSize = 'small' | 'medium' | 'large';

/** The radius of each size's top: [smallest, largest] of what the sky places. */
const RADII: Record<IslandSize, [number, number]> = {
  small: [11, 16],
  medium: [18, 28],
  large: [30, 40],
};

/**
 * Which size a seed makes. Small ones are common, medium and large
 * regular. Large ones are mostly out away from the road.
 */
function islandSize(seed: number, farFromRoad: boolean): IslandSize {
  if (farFromRoad) return seed < 0.1 ? 'small' : seed < 0.4 ? 'medium' : 'large';
  return seed < 0.2 ? 'small' : seed < 0.65 ? 'medium' : 'large';
}

export interface Island {
  x: number;
  /** Height of the island's top. */
  y: number;
  z: number;
  /** Radius of the top. */
  radius: number;
  /** 0–1, picks the trees and bushes. */
  kind: number;
  /**
   * The way from the island toward the road a little before its nearest
   * point (a heading): the side racers see as they fly up to it, where a
   * waterfall shows best.
   */
  facing: number;
}

/** A bank of cloud: a cluster of puffs on a flat base. */
export interface CloudBank {
  x: number;
  /** Height of the bank's flat base. */
  y: number;
  z: number;
  /** The footprint, along its long side and across it. */
  length: number;
  width: number;
  /** Which way the long side runs. */
  heading: number;
  /** 0–1, varies the puffs. */
  seed: number;
  /** How tall it stands, as a multiple of a low bank's height: 1 is a flat bank, 3 a towering cumulus. */
  tall: number;
}

/** The cloud sea's height: far below the racers (never under SKY_FLOOR), so islands show their whole cliffs. */
export const CLOUD_SEA_Y = -110;
/** How far an island's edge, or a cloud bank's, stays from the road's middle line. */
export const ROAD_CLEARANCE = 20;

/**
 * The floating islands in a cell. Wherever the road crosses a cell, one or
 * two line it, a little way off either side; more stand out in the open sky.
 * Their tops are at every depth, from well below the road to above the
 * racers, and none is ever on the road or overlapping another of the cell's.
 */
export function islandsInCell(cx: number, cz: number): Island[] {
  const out: Island[] = [];
  const n = (salt: number) => cellNoise(cx, cz, salt);
  const radiusOf = (size: IslandSize, t: number) => RADII[size][0] + t * (RADII[size][1] - RADII[size][0]);
  const add = (x: number, y: number, z: number, radius: number, kind: number) => {
    const road = roadNear(x, z);
    if (road.distance < radius + ROAD_CLEARANCE) return;
    for (const o of out) if (Math.hypot(o.x - x, o.z - z) < (o.radius + radius) * 1.15 + 6) return;
    out.push({ x, y, z, radius, kind, facing: road.seenFrom });
  };

  // Beside the road: one or two wherever it crosses the cell, either side.
  const here = roadPointsInCell(cx, cz);
  if (here.length) {
    const first = n(199) < 0.5 ? -1 : 1;
    const odds = [1, 0.95, 0.7, 0.3];
    for (let k = 0; k < odds.length; k++) {
      const s = 200 + k * 10;
      if (n(s) > odds[k]) continue;
      const p = trailPoint(here[Math.floor(n(s + 5) * here.length)]);
      const side = k % 2 === 0 ? first : -first;
      const kind = n(s + 4);
      // Large ones stand off from the road; small and medium ones close in.
      const radius = radiusOf(islandSize(kind, n(s + 2) > 0.45), n(s + 1));
      // Mostly close and above the racers, so their cliffs and waterfalls
      // face the camera; now and then further out and well below.
      const h = n(s + 3);
      const low = h < 0.2;
      const off = radius + ROAD_CLEARANCE + (low ? 30 + n(s + 2) * 40 : 4 + n(s + 2) * 30);
      add(
        p.x + Math.cos(p.heading) * side * off,
        low ? p.y - 62 + h * 100 : p.y + 2 + (h - 0.2) * 50,
        p.z - Math.sin(p.heading) * side * off,
        radius,
        kind,
      );
    }
  }

  // Out in the open: low under the road, level with the racers, or high above.
  const open = [0.95, 0.8, 0.55, 0.3];
  for (let i = 0; i < open.length; i++) {
    if (n(10 + i) > open[i]) continue;
    const s = 20 + i * 7;
    const band = n(s + 5);
    const y = band < 0.3 ? -16 + n(s + 1) * 20 : band < 0.65 ? 8 + n(s + 1) * 38 : 46 + n(s + 1) * 50;
    const x = cx * CELL + 20 + n(s) * (CELL - 40);
    const z = cz * CELL + 20 + n(s + 2) * (CELL - 40);
    const kind = n(s + 4);
    add(x, y, z, radiusOf(islandSize(kind, roadNear(x, z).distance > 110), n(s + 3)), kind);
  }
  return out;
}

/**
 * The cloud banks in a cell: low wide ones sitting on the cloud sea, some
 * beside the road and out in the open, and a few far above the racers.
 * None sits on the road.
 */
export function cloudBanksInCell(cx: number, cz: number): CloudBank[] {
  const out: CloudBank[] = [];
  const n = (salt: number) => cellNoise(cx, cz, salt);
  const at = (s: number) => ({ x: cx * CELL + 15 + n(s) * (CELL - 30), z: cz * CELL + 15 + n(s + 1) * (CELL - 30) });

  const floor = n(80) < 0.85 ? (n(81) < 0.45 ? 2 : 1) : 0;
  for (let i = 0; i < floor; i++) {
    const s = 82 + i * 6;
    const length = 70 + n(s + 2) * 90;
    out.push({ ...at(s), y: CLOUD_SEA_Y - 6 + n(s + 3) * 6, length, width: length * (0.45 + n(s + 4) * 0.3), heading: n(s + 5) * Math.PI, seed: n(s + 6), tall: 1 });
  }

  const mid = (n(100) < 0.75 ? 1 : 0) + (n(101) < 0.4 ? 1 : 0);
  for (let i = 0; i < mid; i++) {
    const s = 102 + i * 7;
    const length = 30 + n(s + 2) * 50;
    const { x, z } = at(s);
    if (roadNear(x, z).distance < length / 2 + ROAD_CLEARANCE) continue;
    out.push({ x, y: -12 + n(s + 3) * 56, z, length, width: length * (0.5 + n(s + 4) * 0.3), heading: n(s + 5) * Math.PI, seed: n(s + 6), tall: 1 });
  }

  // Towering cumulus, rising from the cloud sea to above the racers: they
  // stand out in the distance, never near the road.
  if (n(130) < 0.5) {
    const length = 50 + n(132) * 40;
    const { x, z } = at(131);
    if (roadNear(x, z).distance >= length / 2 + ROAD_CLEARANCE + 30) {
      out.push({ x, y: -55 + n(133) * 30, z, length, width: length * (0.7 + n(134) * 0.25), heading: n(135) * Math.PI, seed: n(136), tall: 2.6 + n(137) * 0.8 });
    }
  }

  if (n(120) < 0.35) {
    const length = 40 + n(122) * 50;
    out.push({ ...at(121), y: 112 + n(123) * 40, length, width: length * 0.55, heading: n(124) * Math.PI, seed: n(125), tall: 1 });
  }
  return out;
}

// ── keeping the scenery off the road ───────────────────────────────────────
//
// Islands and cloud banks are placed by hashing their cell, and they must
// never sit on the road. The road is built lazily as racers fly, so the
// scenery is measured only against its first SCENERY_REACH points — many
// more than any race flies — which keeps the same cell the same on every
// device, however far along the road anyone has flown.

/** Road points the scenery keeps clear of. A race flies a few hundred. */
const SCENERY_REACH = 1500;
/** The start line has a run-up behind it, where the camera waits for Go. */
const RUN_UP = 200;

/** The first SCENERY_REACH road points that lie in a cell, in order. */
function roadPointsInCell(cx: number, cz: number): number[] {
  trailPoint(SCENERY_REACH);
  return trailPointsInCell(cx, cz).filter((i) => i < SCENERY_REACH);
}

/** How far back along the road, from its nearest point, a racer sees a roadside thing from. */
const SEEN_FROM = 120;

/**
 * How far a position is from the road's middle line, across the ground, and
 * the heading that points at where racers see it from as they fly up the
 * road. Exact out to a cell's width; past that it may say anything larger.
 */
function roadNear(x: number, z: number): { distance: number; seenFrom: number } {
  let best = Infinity;
  let seenFrom = 0;
  const segment = (ax: number, az: number, bx: number, bz: number) => {
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const px = ax + dx * t;
    const pz = az + dz * t;
    const d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < best) {
      best = d;
      const len = Math.hypot(dx, dz);
      seenFrom = Math.atan2(px - (dx / len) * SEEN_FROM - x, pz - (dz / len) * SEEN_FROM - z);
    }
  };
  segment(0, -RUN_UP, 0, 0);
  const cx = cellOf(x);
  const cz = cellOf(z);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (const i of roadPointsInCell(cx + dx, cz + dz)) {
        const a = trailPoint(i);
        const b = trailPoint(i + 1);
        segment(a.x, a.z, b.x, b.z);
        if (i > 0) segment(trailPoint(i - 1).x, trailPoint(i - 1).z, a.x, a.z);
      }
    }
  }
  return { distance: Math.sqrt(best), seenFrom };
}

/** How far a position is from the road's middle line, across the ground (exact out to one cell). */
export function roadDistance(x: number, z: number): number {
  return roadNear(x, z).distance;
}
