/**
 * Where the sky's floating islands come from.
 *
 * domain/sky.ts decides where each island floats, how big it is and which
 * way the road is from it; an `IslandSource` decides what it looks like.
 * The scene asks its source to place every island of a sky cell while that
 * cell is being built, and never builds an island any other way, so the
 * look can be swapped in one place.
 *
 * `codeIslands` is made in code — layered rock, a grassy lip with moss
 * hanging off it, round trees, bushes and, on the bigger islands, a
 * waterfall facing the racers — baked into the cell's one land mesh, in a
 * full version near the camera and a cheap one out in the haze.
 */
import * as THREE from 'three';
import type { Island } from '../domain/scenery';
import { Batch, lit, seeded } from './bake';

/** One sky cell while it is being built. */
export interface CellBuild {
  /** Opaque, unlit, its light baked in (see bake.ts). */
  land: Batch;
  /** Waterfall ribbons: see-through, with a texture that runs downward. */
  falls: Batch;
  /** Anything that is not baked. */
  group: THREE.Group;
  /**
   * True for the full-detail version of a cell, built when it comes near
   * the camera; false for the cheap one shown out in the haze. The two
   * should share their outline so the swap between them is not seen.
   */
  near: boolean;
}

export interface IslandSource {
  /** Builds one island into the cell. */
  place(island: Island, cell: CellBuild): void;
  /** Frees what the source holds (shared geometry). */
  dispose(): void;
}

const GRASS = new THREE.Color('#a9d85b');
const GRASS_EDGE = new THREE.Color('#79bf48');
const MOSS = new THREE.Color('#6fb446');
const ROCK_TOP = new THREE.Color('#ecc9a0');
const ROCK_LOW = new THREE.Color('#b8847e');
const ROCK_TINTS = ['#ff9fa0', '#f2b660', '#f6dcc0'].map((c) => new THREE.Color(c));
const TRUNK = new THREE.Color('#9a6b4a');
const LEAVES = ['#5cc04b', '#4aae52', '#82cf55', '#69c35a'].map((c) => new THREE.Color(c));
const BLOSSOM = new THREE.Color('#ff9fcd');
const GRASS_LIGHT = new THREE.Color('#c2e166');
const BUSHES = ['#5fb94a', '#7ccc4f', '#ff9fcd', '#ffd36b'].map((c) => new THREE.Color(c));
const WATER_TOP = new THREE.Color('#f2fbff');
const WATER_LOW = new THREE.Color('#c4e8ff');

/** The island's outline: its radius at each angle, a soft irregular round. */
function outline(rnd: () => number): (a: number) => number {
  const p1 = rnd() * 6.3;
  const p2 = rnd() * 6.3;
  const p3 = rnd() * 6.3;
  return (a) => 1 + 0.06 * Math.sin(a * 2 + p1) + 0.05 * Math.sin(a * 3 + p2) + 0.03 * Math.sin(a * 5 + p3);
}

/**
 * The rock under the grass, as the factory's island has it: rounded rock
 * columns in three tiers, each tier narrower and lower, over a core that
 * fills the gaps, coming to a few points about two radii down. Warm stone
 * with a pink, ochre or pale tint per column, cooler toward the bottom.
 */
function addRock(isl: Island, rnd: () => number, land: Batch, column: THREE.BufferGeometry, near: boolean): void {
  const R = isl.radius;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const base = new THREE.Color();
  const depth = R * 2;
  const paint = (tint: THREE.Color) => (out: THREE.Color, at: THREE.Vector3, n: THREE.Vector3) => {
    const t = Math.min(1, Math.max(0, (isl.y - at.y) / depth));
    base.copy(ROCK_TOP).lerp(ROCK_LOW, t).lerp(tint, 0.42);
    // Deeper crevices between and across the columns: dark in the hollows, which
    // by hash of position come out as ragged streaks.
    const streak = Math.abs(Math.sin(at.x * 0.55 + at.y * 0.21) * Math.sin(at.z * 0.5 - at.y * 0.17));
    const crevice = 0.68 + 0.32 * Math.min(1, streak * 2.2);
    lit(out, base, n, (1 - t * 0.3) * crevice * (0.8 + 0.2 * Math.max(0, n.y + 0.4)));
  };
  // The core, then [columns, ring radius, column radius, half height, middle depth] per tier.
  land.add(column, m.compose(v.set(isl.x, isl.y - R * 0.42, isl.z), q.identity(), s.set(R * 0.86, R * 0.42, R * 0.86)), paint(ROCK_TOP));
  // Out in the haze, fewer and fatter columns make the same outline.
  const tiers: Array<[number, number, number, number, number]> = [
    [near ? 10 : 7, 0.74, near ? 0.24 : 0.3, 0.42, 0.5],
    [near ? 7 : 5, 0.44, near ? 0.22 : 0.26, 0.52, 1.0],
    [3, 0.16, 0.18, 0.48, 1.5],
  ];
  const twist = rnd() * 6.3;
  for (const [count, ring, radius, half, mid] of tiers) {
    for (let c = 0; c < count; c++) {
      const a = twist + (c / count) * Math.PI * 2 + (rnd() - 0.5) * 0.3;
      const r = R * ring * (0.9 + rnd() * 0.2);
      const h = R * half * (0.8 + rnd() * 0.45);
      const w = R * radius * (0.85 + rnd() * 0.3);
      // Leaning a little in toward the middle.
      q.setFromEuler(e.set(Math.cos(a) * 0.12, 0, -Math.sin(a) * 0.12));
      land.add(
        column,
        m.compose(v.set(isl.x + Math.sin(a) * r, isl.y - R * mid - (h - R * half) * 0.5, isl.z + Math.cos(a) * r), q, s.set(w, h, w)),
        paint(ROCK_TINTS[Math.floor(rnd() * ROCK_TINTS.length)]),
      );
    }
  }
}

/**
 * The grass on top: a gently domed lawn whose edge rolls over the rock like
 * a lip and tucks back under it.
 */
function addLawn(isl: Island, round: (a: number) => number, land: Batch, near: boolean): void {
  const R = isl.radius;
  const S = near ? 26 : 16;
  // [radius, height] across the lawn, centre to tuck, as fractions of R.
  const profile: Array<[number, number]> = [
    [0, 0.05],
    [0.25, 0.05],
    [0.5, 0.045],
    [0.7, 0.035],
    [0.86, 0.02],
    [0.99, -0.03],
    [1.04, -0.1],
    [1.0, -0.17],
    [0.9, -0.2],
  ];
  const pos: number[] = [];
  const index: number[] = [];
  for (let p = 0; p < profile.length; p++) {
    for (let j = 0; j < S; j++) {
      const a = (j / S) * Math.PI * 2;
      const r = R * profile[p][0] * round(a);
      pos.push(isl.x + Math.sin(a) * r, isl.y + R * profile[p][1], isl.z + Math.cos(a) * r);
    }
  }
  for (let p = 0; p < profile.length - 1; p++) {
    for (let j = 0; j < S; j++) {
      const k = (j + 1) % S;
      const a = p * S + j;
      const b = p * S + k;
      const c = (p + 1) * S + j;
      const d = (p + 1) * S + k;
      index.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const base = new THREE.Color();
  land.add(geo, new THREE.Matrix4(), (out, at, n) => {
    const edge = Math.min(1, Math.max(0, (isl.y - at.y) / (R * 0.2)));
    // Sunny and shady patches across the lawn.
    const patch = 0.5 + 0.5 * Math.sin(at.x * 0.21 + Math.sin(at.z * 0.17) * 2) * Math.sin(at.z * 0.19);
    base.copy(GRASS).lerp(GRASS_LIGHT, patch * 0.7).lerp(GRASS_EDGE, edge);
    lit(out, base, n, 1 - edge * 0.2);
  });
  geo.dispose();
}

export function codeIslands(): IslandSource {
  const ball = new THREE.SphereGeometry(1, 10, 7);
  const smallBall = new THREE.SphereGeometry(1, 7, 4);
  const column = new THREE.SphereGeometry(1, 8, 6);
  const trunk = new THREE.CylinderGeometry(0.3, 0.5, 1, 6);
  trunk.translate(0, 0.5, 0);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const place = (x: number, y: number, z: number, sx: number, sy = sx, sz = sx) =>
    m.compose(v.set(x, y, z), q.identity(), s.set(sx, sy, sz));
  const flat = (color: THREE.Color, ao = 1) => (out: THREE.Color, _at: THREE.Vector3, n: THREE.Vector3) => lit(out, color, n, ao);

  return {
    place(isl, cell) {
      // One generator per part, so the near and far versions (which skip
      // some parts) still agree on everything they share.
      const seed = (isl.kind * 7919 + Math.abs(isl.x) * 0.013 + Math.abs(isl.z) * 0.007) % 1;
      const rnd = seeded(seed);
      const dripRnd = seeded((seed + 0.13) % 1);
      const treeRnd = seeded((seed + 0.31) % 1);
      const crownRnd = seeded((seed + 0.57) % 1);
      const fallRnd = seeded((seed + 0.79) % 1);
      const round = outline(rnd);
      const R = isl.radius;
      const land = cell.land;
      const near = cell.near;
      addRock(isl, rnd, land, near ? column : smallBall, near);
      addLawn(isl, round, land, near);

      // A mossy fringe hanging off the lip.
      const drips = near ? 8 + Math.floor(R / 3) : 6 + Math.floor(R / 8);
      for (let d = 0; d < drips; d++) {
        const a = (d / drips) * Math.PI * 2 + dripRnd() * 0.4;
        const r = R * 1.0 * round(a);
        const size = R * (0.045 + dripRnd() * 0.035);
        land.add(
          smallBall,
          place(isl.x + Math.sin(a) * r, isl.y - R * 0.15 - size * (0.6 + dripRnd()), isl.z + Math.cos(a) * r, size * 1.5, size * 2, size * 1.5),
          flat(MOSS, 0.9),
        );
      }

      // Round trees, a blossom tree now and then.
      const trees = Math.max(2, Math.min(9, Math.round(R / 6) + Math.floor(isl.kind * 3) - 1));
      const lawnY = isl.y + R * 0.04;
      for (let t = 0; t < trees; t++) {
        const a = t * 2.39996 + isl.kind * 9;
        const r = R * 0.68 * Math.sqrt((t + 0.6) / trees);
        const x = isl.x + Math.sin(a) * r;
        const z = isl.z + Math.cos(a) * r;
        const size = (0.85 + treeRnd() * 0.55) * Math.min(1.5, Math.max(0.8, R / 22));
        const leaves = treeRnd() < 0.14 ? BLOSSOM : LEAVES[Math.floor(treeRnd() * LEAVES.length)];
        const height = 3.4 * size;
        const cy = lawnY + height + 2 * size;
        const canopy = (out: THREE.Color, at: THREE.Vector3, n: THREE.Vector3) =>
          lit(out, leaves, n, 0.72 + 0.28 * Math.min(1, Math.max(0, (at.y - (cy - 3 * size)) / (5.5 * size))));
        if (!near) {
          // Out in the haze a tree is one round crown of the same size.
          land.add(smallBall, place(x, cy + 0.3 * size, z, 3.9 * size, 3.4 * size, 3.9 * size), canopy);
          continue;
        }
        land.add(trunk, place(x, lawnY - 0.5, z, size, height + 1, size), flat(TRUNK, 0.85));
        land.add(ball, place(x, cy, z, 3 * size), canopy);
        for (let b = 0; b < 2; b++) {
          const ba = a + b * 3.1 + crownRnd();
          land.add(
            ball,
            place(x + Math.sin(ba) * 2.2 * size, cy - 0.6 * size + crownRnd() * 1.8 * size, z + Math.cos(ba) * 2.2 * size, (1.7 + crownRnd() * 0.6) * size),
            canopy,
          );
        }
      }

      // Low round bushes, some in flower, around the edge of the lawn.
      const bushes = near ? 3 + Math.floor(R / 6) : 0;
      for (let b = 0; b < bushes; b++) {
        const a = b * 2.39996 + isl.kind * 5 + 1;
        const r = R * (0.72 + 0.14 * ((b * 0.37) % 1)) * round(a);
        const size = 1.1 + ((b * 0.61 + isl.kind) % 1) * 1.1;
        const color = BUSHES[(b + Math.floor(isl.kind * 4)) % BUSHES.length];
        land.add(smallBall, place(isl.x + Math.sin(a) * r, lawnY + size * 0.3, isl.z + Math.cos(a) * r, size * 1.3, size, size * 1.3), flat(color));
      }

      // A waterfall over the lip on the side the racers fly up to.
      if (R > 13 && fallRnd() < 0.75) {
        const a = isl.facing + (fallRnd() - 0.5) * 0.7;
        const rim = R * round(a);
        const width = Math.min(9, Math.max(3.5, R * 0.26));
        const fall = R * 3;
        const ox = Math.sin(a);
        const oz = Math.cos(a);
        const sx = Math.cos(a);
        const sz = -Math.sin(a);
        const falls = cell.falls;
        const steps = 10;
        let last: [number, number] | null = null;
        const color = new THREE.Color();
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          // Out from under the mossy lip, then straight down, drifting a little outward.
          const out = rim * (0.97 + 0.1 * Math.min(1, t * 10)) + R * 0.08 * t;
          const y = isl.y - R * 0.08 - t * fall;
          // Fading away into the air below the island.
          const alpha = 0.95 * Math.min(1, (1 - t) / 0.45) ** 1.5;
          color.copy(WATER_TOP).lerp(WATER_LOW, t);
          const v = (t * fall) / (width * 2);
          const cx = isl.x + ox * out;
          const cz = isl.z + oz * out;
          const l = falls.vertex(cx - (sx * width) / 2, y, cz - (sz * width) / 2, color, alpha, 0, v);
          const r = falls.vertex(cx + (sx * width) / 2, y, cz + (sz * width) / 2, color, alpha, 1, v);
          if (last) {
            falls.triangle(last[0], l, last[1]);
            falls.triangle(last[1], l, r);
          }
          last = [l, r];
        }
      }
    },
    dispose() {
      ball.dispose();
      smallBall.dispose();
      column.dispose();
      trunk.dispose();
    },
  };
}
