/**
 * The Gulp Universe model kit: every PropKind drawn as one merged, vertex-coloured
 * geometry, sized to the footprint and height in the catalogue so the rules
 * and the picture agree. Everything is procedural (the game is an offline
 * PWA), deterministic (variety comes from `variant` and `hScale`, never
 * Math.random), and cheap enough to instance by the thousand on an iPad.
 *
 * Conventions: origin at the footprint centre, base on y = 0, vehicles and
 * buildings face +z. The camera looks down at about 55 degrees, so roofs and
 * tops carry most of the character.
 */
import * as THREE from 'three';
import { KINDS, type PropKind } from '../domain/catalog';
import {
  type Builder,
  type V3,
  FLUSH,
  Kit,
  ON_GROUND,
  PAL,
  archDoor,
  cells,
  darker,
  lighter,
  mix,
  paneAt,
  placement,
  translate,
  walls,
} from './kit';
import { LANDMARKS, type LandmarkKind } from './landmarks';
import { WONDERS_BUILDERS, type WonderKind } from './wonders';

const HALF_PI = Math.PI / 2;

// ---------------------------------------------------------------------------
// Tier 0: small street things

function cone(k: Kit): void {
  k.cbox(0xe25d12, 0.58, 0.08, 0.58, 0.025, 0, 0, 0);
  k.cyl(0xff7a21, 0.045, 0.24, 0.72, 12, 0, 0.08, 0);
  // The reflective band hugs the taper, a hair proud of it so it never flickers.
  const r = (y: number) => 0.24 - ((0.24 - 0.045) * (y - 0.08)) / 0.72 + 0.012;
  k.cyl(PAL.white, r(0.52), r(0.36), 0.16, 12, 0, 0.36, 0, { open: true });
}

const HYDRANTS = [
  { body: 0xe63946, cap: 0xb81d2a },
  { body: 0xffc233, cap: 0xe63946 },
] as const;

function hydrant(k: Kit, v: number): void {
  const c = HYDRANTS[v];
  k.cyl(darker(c.body, 0.3), 0.24, 0.27, 0.08, 8, 0, 0, 0);
  k.cyl(c.body, 0.16, 0.175, 0.5, 8, 0, 0.08, 0);
  k.cyl(c.cap, 0.21, 0.21, 0.08, 8, 0, 0.55, 0);
  k.sphere(c.cap, 0.17, [0, 0.63, 0], 8, 3, { hemi: true });
  k.cyl(c.cap, 0.045, 0.06, 0.1, 6, 0, 0.78, 0);
  for (const sx of [-1, 1]) k.rod(c.cap, 0.07, 0.2, 8, [sx * 0.2, 0.4, 0], { rz: HALF_PI });
  k.rod(c.cap, 0.09, 0.16, 8, [0, 0.36, 0.2], { rx: HALF_PI });
  k.rod(darker(c.cap, 0.2), 0.05, 0.04, 6, [0, 0.36, 0.29], { rx: HALF_PI });
}

const BINS = [0x3fa34d, 0x8d99ae] as const;

function bin(k: Kit, v: number): void {
  const c = BINS[v];
  const dark = darker(c, 0.3);
  k.cyl(c, 0.35, 0.3, 0.88, 12, 0, 0, 0);
  const r = (y: number) => 0.3 + (0.05 * y) / 0.88 + 0.012;
  for (const y of [0.08, 0.72]) k.cyl(dark, r(y + 0.07), r(y), 0.07, 12, 0, y, 0, { open: true });
  k.cyl(dark, 0.39, 0.39, 0.08, 12, 0, 0.88, 0);
  k.cyl(dark, 0.12, 0.36, 0.1, 12, 0, 0.96, 0);
  k.cyl(PAL.white, 0.06, 0.06, 0.05, 8, 0, 1.05, 0);
  // A light label on the front so the bin reads as a bin rather than a post.
  k.box(PAL.white, 0.22, 0.22, 0.06, 0, 0.36, r(0.48) - 0.02, undefined, FLUSH);
}

function mailbox(k: Kit): void {
  const blue = 0x2f6fd6;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(PAL.ink, 0.07, 0.36, 0.07, sx * 0.24, 0, sz * 0.19);
  k.box(darker(blue, 0.3), 0.66, 0.08, 0.56, 0, 0.32, 0);
  // Body and rounded top as one hull: a D-shaped profile pushed along z.
  const pts: V3[] = [];
  for (const sz of [-0.26, 0.26]) {
    pts.push([-0.31, 0.38, sz], [0.31, 0.38, sz]);
    for (let i = 0; i <= 6; i++) {
      const a = (Math.PI * i) / 6;
      pts.push([0.31 * Math.cos(a), 0.99 + 0.31 * Math.sin(a), sz]);
    }
  }
  k.hull(blue, pts);
  k.box(darker(blue, 0.45), 0.36, 0.06, 0.06, 0, 1.0, 0.26, undefined, FLUSH);
  k.box(lighter(blue, 0.2), 0.42, 0.08, 0.1, 0, 1.08, 0.26, undefined, FLUSH);
  k.box(PAL.white, 0.3, 0.2, 0.05, 0, 0.56, 0.26, undefined, FLUSH);
}

const PLANTERS = [
  { pot: 0xcf7a4f, petal: 0xff7eb6, eye: 0xffe066 },
  { pot: 0xb58152, petal: 0xffd23f, eye: 0xf3722c },
  { pot: 0xe8e2d4, petal: 0xb07cff, eye: 0xffe066 },
] as const;

function planter(k: Kit, v: number): void {
  const c = PLANTERS[v];
  k.cbox(c.pot, 0.82, 0.46, 0.82, 0.04, 0, 0, 0);
  k.cbox(darker(c.pot, 0.12), 0.9, 0.08, 0.9, 0.03, 0, 0.44, 0);
  k.box(0x6b4a33, 0.72, 0.04, 0.72, 0, 0.49, 0);
  const leaves: V3[] = [
    [-0.16, 0.6, -0.1],
    [0.17, 0.58, 0.12],
    [0.04, 0.66, -0.2],
    [-0.1, 0.6, 0.18],
  ];
  leaves.forEach((p, i) => k.ico(i % 2 ? PAL.leaf : PAL.leafLight, 0.2, 0, p, [1, 0.8, 1], i));
  const flowers: V3[] = [
    [-0.2, 0.8, -0.05],
    [0.15, 0.8, 0.18],
    [0.02, 0.88, -0.12],
    [0.22, 0.75, -0.18],
    [-0.12, 0.76, 0.22],
  ];
  for (const p of flowers) {
    k.gem(c.petal, 0.1, p);
    k.gem(c.eye, 0.045, [p[0], p[1] + 0.075, p[2]]);
  }
}

/** Shirt, trousers, hair and skin for the people on the pavements; `long` hair falls down the back. */
const PEOPLE = [
  { shirt: 0xff4d4d, legs: 0x2f5fd0, hair: 0x3b2a20, skin: 0xf2c29b, long: false },
  { shirt: 0xffc933, legs: 0x39476b, hair: 0x1f1a17, skin: 0x8d5a3b, long: true },
  { shirt: 0x2ec4b6, legs: 0xe9e4da, hair: 0xf2c14e, skin: 0xffd9bd, long: true },
  { shirt: 0x7a4de8, legs: 0x2f3b5c, hair: 0xc2562c, skin: 0xe8b48a, long: false },
  { shirt: 0xff8fb8, legs: 0x3a7bff, hair: 0x2b1d14, skin: 0xc68642, long: true },
  { shirt: 0x3cc95a, legs: 0x8a5a3b, hair: 0x6b4a2f, skin: 0x5c3a24, long: false },
] as const;

/**
 * A blocky toy person facing +z: square legs, body and arms, a big cube head
 * with a hair cap and two dot eyes. Seen small from above, the shirt and the
 * hair carry it, so both are bold.
 */
function person(k: Kit, v: number): void {
  const c = PEOPLE[v];
  for (const sx of [-1, 1]) {
    k.box(c.legs, 0.24, 0.72, 0.3, sx * 0.14, 0, 0, undefined, ON_GROUND);
    k.box(c.shirt, 0.14, 0.52, 0.22, sx * 0.35, 0.74, 0, undefined, ['py']);
    k.box(c.skin, 0.12, 0.13, 0.18, sx * 0.35, 0.6, 0, undefined, ['py']);
  }
  k.box(c.shirt, 0.56, 0.58, 0.36, 0, 0.7, 0, undefined, ON_GROUND);
  k.cbox(c.skin, 0.46, 0.42, 0.42, 0.05, 0, 1.24, 0);
  k.box(c.hair, 0.5, 0.14, 0.46, 0, 1.56, -0.01);
  k.box(c.hair, 0.5, c.long ? 0.62 : 0.3, 0.1, 0, c.long ? 1.02 : 1.3, -0.23, undefined, ['py']);
  for (const sx of [-1, 1]) k.box(PAL.ink, 0.08, 0.1, 0.03, sx * 0.1, 1.42, 0.21, undefined, FLUSH);
}

// ---------------------------------------------------------------------------
// Tier 1

const BENCHES = [
  { slat: 0xc98a4b, frame: 0x3a4450 },
  { slat: 0x4f9d69, frame: PAL.ink },
] as const;

function bench(k: Kit, v: number): void {
  const c = BENCHES[v];
  const lean = 0.14;
  for (const sx of [-0.86, 0.86]) {
    k.box(c.frame, 0.08, 0.42, 0.08, sx, 0, 0.22);
    k.beam(c.frame, [sx, 0, -0.24], [sx, 0.98, -0.24 - lean], 0.08);
    k.box(c.frame, 0.08, 0.06, 0.6, sx, 0.38, -0.02);
    k.box(c.frame, 0.1, 0.05, 0.5, sx, 0.66, 0);
    k.beam(c.frame, [sx, 0.44, 0.2], [sx, 0.66, 0.2], 0.06);
  }
  for (const z of [-0.18, 0.02, 0.22]) k.box(c.slat, 1.96, 0.06, 0.17, 0, 0.44, z);
  for (const y of [0.58, 0.8]) {
    const zc = -0.24 - (lean * y) / 0.98 + 0.07;
    k.box(c.slat, 1.96, 0.15, 0.05, 0, y, zc, { rx: -Math.atan2(lean, 0.98) });
  }
}

function bush(k: Kit, v: number): void {
  const [a, b] = v === 0 ? [0x4caf50, 0x74c86a] : [0x3e9a55, 0x5bb870];
  k.ico(a, 0.62, 1, [0, 0.6, 0], [1, 0.9, 1]);
  k.ico(b, 0.46, 1, [0.32, 0.46, 0.28], [1, 0.9, 1]);
  k.ico(b, 0.42, 0, [-0.36, 0.4, 0.22]);
  k.ico(a, 0.4, 0, [-0.12, 0.42, -0.38], undefined, 0.7);
  k.ico(lighter(a, 0.12), 0.32, 0, [0.08, 0.98, 0.04], undefined, 0.3);
  if (v === 1) {
    // A flowering bush: blossoms scattered over the big blob.
    for (let i = 0; i < 6; i++) {
      const az = i * 1.1 + 0.4;
      const el = 0.3 + (i % 3) * 0.28;
      const p: V3 = [
        Math.cos(el) * Math.cos(az) * 0.6,
        0.6 + Math.sin(el) * 0.56,
        Math.cos(el) * Math.sin(az) * 0.6,
      ];
      k.gem(i % 2 ? 0xff8fb8 : 0xfff0f6, 0.09, p);
    }
  }
}

const BIKES = [0xe63946, 0x2a9d8f, 0xf4a261] as const;

function bike(k: Kit, v: number): void {
  const frame = BIKES[v];
  const hubY = 0.385;
  for (const z of [-0.52, 0.52]) {
    k.ring(PAL.ink, 0.34, 0.045, [0, hubY, z], { ry: HALF_PI }, 3, 10);
    k.box(PAL.metal, 0.08, 0.1, 0.1, 0, hubY - 0.05, z);
  }
  const R: V3 = [0, hubY, -0.52];
  const F: V3 = [0, hubY, 0.52];
  const B: V3 = [0, 0.36, -0.04];
  const S: V3 = [0, 0.86, -0.2];
  const Ht: V3 = [0, 0.92, 0.34];
  const Hb: V3 = [0, 0.72, 0.38];
  const t = 0.05;
  k.beam(frame, R, B, t);
  k.beam(frame, R, S, t);
  k.beam(frame, B, S, t);
  k.beam(frame, B, Hb, 0.06);
  k.beam(frame, S, Ht, t);
  k.beam(frame, Hb, Ht, 0.07);
  k.beam(PAL.metal, Hb, F, 0.045);
  k.beam(PAL.metal, S, [0, 0.98, -0.23], 0.04);
  k.box(PAL.ink, 0.14, 0.06, 0.28, 0, 0.98, -0.24);
  k.beam(PAL.metal, Ht, [0, 1.0, 0.32], 0.04);
  k.box(PAL.ink, 0.5, 0.05, 0.06, 0, 1.0, 0.3);
  k.box(0xd9a86c, 0.3, 0.2, 0.24, 0, 0.8, 0.58);
  k.box(PAL.ink, 0.06, 0.08, 0.14, 0, 0.3, -0.04);
}

function haybale(k: Kit): void {
  const straw = 0xe9c46a;
  const profile = [
    [0, -0.76],
    [0.6, -0.76],
    [0.7, -0.66],
    [0.7, 0.66],
    [0.6, 0.76],
    [0, 0.76],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  // Lying on its side, rolled along x like a bale in a field.
  k.add(new THREE.LatheGeometry(profile, 12), straw, placement(0, 0.7, 0, { rz: HALF_PI }));
  // Rolled ends: rings of lighter straw, like the spiral of a real bale.
  k.rod(lighter(straw, 0.2), 0.48, 1.54, 10, [0, 0.7, 0], { rz: HALF_PI });
  k.rod(darker(straw, 0.06), 0.3, 1.56, 10, [0, 0.7, 0], { rz: HALF_PI });
  k.rod(lighter(straw, 0.3), 0.13, 1.58, 8, [0, 0.7, 0], { rz: HALF_PI });
}

// ---------------------------------------------------------------------------
// Construction sites: what stands on an eaten lot until the new building is up.

const SITE_YELLOW = 0xffc21a;
const SITE_ORANGE = 0xff7a1a;
const CONCRETE_GREY = 0xc9cdd3;

/** Orange and white barrier panels round a W x D lot, leaving a gate gap at the front. */
function barrier(k: Kit, W: number, D: number, panel: number, h: number, gate: number): void {
  let i = 0;
  for (const wall of walls(W, D)) {
    k.within(wall.m, () => {
      const n = Math.round(wall.len / panel);
      const pw = wall.len / n;
      for (let j = 0; j < n; j++) {
        const u = -wall.len / 2 + (j + 0.5) * pw;
        if (wall.side === 'front' && Math.abs(u) < gate / 2) continue;
        k.box(i++ % 2 ? PAL.white : SITE_ORANGE, pw - 0.08, h, 0.16, u, 0, -0.1, undefined, ON_GROUND);
      }
    });
  }
}

/** A traffic cone with a white band, simpler than the street cone. */
function siteCone(k: Kit, x: number, z: number, s = 1): void {
  k.cyl(SITE_ORANGE, 0.05 * s, 0.26 * s, 0.7 * s, 8, x, 0, z);
  k.cyl(PAL.white, 0.14 * s, 0.19 * s, 0.16 * s, 8, x, 0.3 * s, z, { open: true });
}

/** A crate of red bricks on a wooden pallet. */
function bricks(k: Kit, x: number, z: number): void {
  k.box(PAL.wood, 1.4, 0.18, 1.1, x, 0, z);
  for (const [dx, dz] of [
    [-0.35, -0.25],
    [0.35, -0.25],
    [-0.35, 0.25],
    [0.35, 0.25],
  ]) {
    k.box(0xd9483b, 0.64, 0.38, 0.46, x + dx, 0.18, z + dz);
  }
  k.box(0xe8604f, 0.64, 0.38, 0.46, x, 0.56, z);
}

const SITES = [0xeac27a, 0xdba56a] as const;

/**
 * A small building site: a sand pad inside barrier panels, bricks, planks and
 * cones, and either a little yellow crane (variant 0) or a scaffold tower
 * with a cement mixer (variant 1).
 */
function site(k: Kit, v: number): void {
  const sand = SITES[v];
  k.rbox(sand, 7.8, 0.16, 7.8, 0.8, 0.06, 0, 0, 0);
  barrier(k, 7.8, 7.8, 1.3, 0.8, 2.4);
  k.cyl(darker(sand, 0.14), 0.3, 1.1, 0.7, 7, 2.3, 0, 2.2);
  bricks(k, 1.9, -2.3);
  for (let i = 0; i < 3; i++) k.box(i === 1 ? lighter(PAL.wood, 0.15) : PAL.wood, 2.6, 0.16, 0.36, -1.7, 0.16 + i * 0.16, 2.5 - i * 0.05, { ry: 0.08 * (i - 1) });
  siteCone(k, -0.9, 3.4);
  siteCone(k, 0.9, 3.4);
  if (v === 0) {
    // A little crane: mast, cab, a jib across the lot, and a hook with a load.
    const mx = -2.3;
    const mz = -2.1;
    k.rbox(CONCRETE_GREY, 1.3, 0.45, 1.3, 0.3, 0.1, mx, 0.16, mz);
    k.box(SITE_YELLOW, 0.5, 3.8, 0.5, mx, 0.6, mz);
    for (const y of [1.3, 2.3, 3.3]) k.box(PAL.ink, 0.54, 0.12, 0.54, mx, y, mz);
    k.cbox(SITE_YELLOW, 0.9, 0.75, 0.9, 0.1, mx, 3.65, mz + 0.55);
    k.box(GLASS, 0.7, 0.35, 0.06, mx, 3.95, mz + 1.01, undefined, FLUSH);
    k.box(SITE_YELLOW, 6.2, 0.34, 0.34, mx + 1.7, 4.4, mz);
    k.cbox(CONCRETE_GREY, 0.8, 0.7, 0.6, 0.08, mx - 1.1, 3.72, mz);
    k.hull(SITE_YELLOW, [
      [mx - 0.25, 4.74, mz - 0.25],
      [mx + 0.25, 4.74, mz - 0.25],
      [mx - 0.25, 4.74, mz + 0.25],
      [mx + 0.25, 4.74, mz + 0.25],
      [mx, 5.0, mz],
    ]);
    const hx = mx + 4.1;
    k.box(PAL.ink, 0.06, 1.9, 0.06, hx, 2.5, mz);
    k.cbox(0xe63946, 0.34, 0.36, 0.34, 0.06, hx, 2.2, mz);
    k.box(0x3a86ff, 1.2, 0.3, 0.45, hx, 1.75, mz);
  } else {
    // A scaffold tower with a hoist arm, and a cement mixer.
    const sx0 = -2.1;
    const sz0 = -2.1;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(SITE_YELLOW, 0.16, 4.5, 0.16, sx0 + sx * 0.9, 0.16, sz0 + sz * 0.9);
    for (const y of [1.6, 3.1, 4.5]) k.box(PAL.wood, 2.1, 0.14, 2.1, sx0, y, sz0);
    for (const s of [-1, 1]) k.beam(SITE_YELLOW, [sx0 - 0.9 * s, 0.2, sz0 + 0.95], [sx0 + 0.9 * s, 1.6, sz0 + 0.95], 0.1);
    k.box(SITE_YELLOW, 2.8, 0.2, 0.2, sx0 + 1.7, 4.64, sz0);
    k.box(PAL.ink, 0.05, 1.3, 0.05, sx0 + 2.9, 3.34, sz0);
    k.cbox(0xe63946, 0.3, 0.3, 0.3, 0.05, sx0 + 2.9, 3.05, sz0);
    k.gem(0xe63946, 0.14, [sx0 - 0.9, 4.86, sz0 - 0.9]);
    const cx = 1.6;
    const czm = 1.0;
    k.box(PAL.chassis, 1.2, 0.2, 0.8, cx, 0.5, czm);
    for (const s of [-1, 1]) k.rod(PAL.ink, 0.3, 0.14, 6, [cx + s * 0.4, 0.3, czm + 0.48], { rx: HALF_PI });
    k.rod(SITE_ORANGE, 0.55, 1.0, 10, [cx, 1.25, czm], { rz: 0.7 }, 0.4);
    k.rod(darker(SITE_ORANGE, 0.2), 0.4, 0.35, 10, [cx + 0.56, 1.72, czm], { rz: 0.7 }, 0.22);
  }
}

/**
 * A big building site, where a stadium or factory will go: a dug pad with a
 * concrete slab and rebar, a tall tower crane with its jib across the lot,
 * a site office, a digger, barriers and cones.
 */
function bigsite(k: Kit): void {
  const dirt = 0xd9a066;
  k.rbox(dirt, 19.6, 0.2, 19.6, 1.6, 0.08, 0, 0, 0);
  barrier(k, 19.6, 19.6, 2.4, 1.2, 5.0);
  // Foundation slab with rebar sticking up.
  k.rbox(CONCRETE_GREY, 11, 0.6, 8.6, 0.6, 0.15, -1.5, 0.2, -2.5);
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 3; j++) k.box(0xb5523b, 0.14, 1.0, 0.14, -5.5 + i * 2.0, 0.8, -5.2 + j * 2.6);
  }
  // Tower crane: a banded mast, a peak with ties, a long jib and a counterweight.
  const mx = -6.8;
  const mz = 6.2;
  const top = 10.2;
  k.rbox(CONCRETE_GREY, 2.2, 0.6, 2.2, 0.4, 0.12, mx, 0.2, mz);
  k.box(SITE_YELLOW, 0.9, top - 0.8, 0.9, mx, 0.8, mz);
  for (let y = 1.8; y < top - 0.5; y += 1.6) k.box(PAL.ink, 0.96, 0.16, 0.96, mx, y, mz);
  k.cbox(SITE_YELLOW, 1.4, 1.0, 1.4, 0.12, mx, top - 1.0, mz + 0.9);
  k.box(GLASS, 1.1, 0.5, 0.06, mx, top - 0.7, mz + 1.62, undefined, FLUSH);
  const j0 = mx - 3.2;
  const j1 = 9.4;
  k.box(SITE_YELLOW, j1 - j0, 0.6, 0.6, (j0 + j1) / 2, top, mz);
  k.cbox(CONCRETE_GREY, 1.6, 1.2, 1.0, 0.1, j0 + 0.9, top - 1.0, mz);
  k.hull(SITE_YELLOW, [
    [mx - 0.4, top + 0.6, mz - 0.4],
    [mx + 0.4, top + 0.6, mz - 0.4],
    [mx - 0.4, top + 0.6, mz + 0.4],
    [mx + 0.4, top + 0.6, mz + 0.4],
    [mx, 12.0, mz],
  ]);
  k.beam(PAL.ink, [mx, 11.9, mz], [j1 - 3, top + 0.6, mz], 0.08);
  k.beam(PAL.ink, [mx, 11.9, mz], [j0 + 0.3, top + 0.6, mz], 0.08);
  const hx = 3.6;
  k.box(PAL.ink, 0.8, 0.3, 0.8, hx, top - 0.3, mz);
  k.box(PAL.ink, 0.08, 4.2, 0.08, hx, top - 4.5, mz);
  k.cbox(0xe63946, 0.6, 0.6, 0.6, 0.08, hx, top - 5.1, mz);
  k.box(0x3a86ff, 3.6, 0.45, 0.6, hx, top - 5.7, mz);
  // Site office: a blue container with windows and a door.
  const ox = 6.4;
  const oz = 5.6;
  k.cbox(0x2f7bff, 5.0, 2.4, 2.3, 0.12, ox, 0.2, oz);
  k.box(PAL.white, 5.1, 0.2, 2.4, ox, 2.6, oz);
  k.within(translate(ox, 0.2, oz + 1.15), () => {
    for (const u of [-1.5, 0.4]) paneAt(k, GLASS, PAL.white, u, 1.0, 1.2, 0.8);
    archDoor(k, PAL.white, SITE_YELLOW, 1.8, 0, 0.8, 1.8);
  });
  // A digger by the slab: tracks, a turning body, an arm and a bucket.
  const dx = 5.2;
  const dz = -3.2;
  for (const s of [-1, 1]) k.cbox(PAL.ink, 0.7, 0.7, 3.0, 0.2, dx + s * 1.0, 0.2, dz);
  k.cbox(SITE_YELLOW, 2.4, 1.2, 2.4, 0.2, dx, 0.9, dz + 0.2);
  k.cbox(SITE_YELLOW, 1.1, 1.2, 1.1, 0.15, dx + 0.55, 2.1, dz + 0.6);
  k.box(GLASS, 0.9, 0.7, 0.06, dx + 0.55, 2.4, dz + 1.16, undefined, FLUSH);
  k.beam(SITE_YELLOW, [dx - 0.5, 1.8, dz - 0.2], [dx - 1.6, 4.0, dz - 1.8], 0.4);
  k.beam(SITE_YELLOW, [dx - 1.6, 4.0, dz - 1.8], [dx - 2.4, 1.6, dz - 3.3], 0.34);
  k.cbox(PAL.ink, 1.1, 0.7, 0.8, 0.12, dx - 2.4, 1.0, dz - 3.4, { rx: 0.4 });
  // A heap of dirt, a stack of pipes and cones by the gate.
  k.cyl(darker(dirt, 0.12), 0.6, 2.2, 1.4, 8, -6.2, 0, -6.6);
  for (let i = 0; i < 3; i++) k.rod(0x3a86ff, 0.3, 4.0, 8, [-2.6 + i * 0.62, 0.5, 6.4], { rx: HALF_PI });
  k.rod(0x3a86ff, 0.3, 4.0, 8, [-2.3, 1.02, 6.4], { rx: HALF_PI });
  for (const x of [-2.2, 2.2]) siteCone(k, x, 9.2, 1.3);
  bricks(k, 1.6, 6.0);
}

// ---------------------------------------------------------------------------
// Tier 2

const TREES = [
  { a: 0x4fb35a, b: 0x74cf6a },
  { a: 0xf29e38, b: 0xe8623e },
  { a: 0xf49ac1, b: 0xfbc4da },
] as const;

function tree(k: Kit, v: number): void {
  const c = TREES[v];
  k.cyl(PAL.bark, 0.17, 0.26, 2.4, 7, 0, 0, 0);
  const turn = v * 2.2;
  const rot = (x: number, z: number): [number, number] => [
    x * Math.cos(turn) - z * Math.sin(turn),
    x * Math.sin(turn) + z * Math.cos(turn),
  ];
  const [bx, bz] = rot(0.5, 0.2);
  k.beam(PAL.bark, [0, 1.3, 0], [bx, 2.2, bz], 0.14);
  const blobs: Array<[number, number, number, number, number]> = [
    [1.15, 0, 3.3, 0, c.a],
    [0.82, 0.52, 2.85, 0.3, c.b],
    [0.8, -0.56, 2.95, -0.25, c.b],
    [0.72, 0.05, 4.2, -0.05, c.a],
  ];
  blobs.forEach(([r, x, y, z, col], i) => {
    const [px, pz] = rot(x, z);
    k.ico(col, r, 1, [px, y, pz], [1, 0.92, 1], i * 0.9 + v);
  });
}

const PINES = [
  { a: 0x2f8a4e, b: 0x3fa860 },
  { a: 0x2f7f73, b: 0x46a38f },
] as const;

function pine(k: Kit, v: number): void {
  const c = PINES[v];
  k.cyl(PAL.bark, 0.16, 0.22, 1.0, 6, 0, 0, 0);
  const tiers: Array<[number, number, number]> = [
    [1.18, 1.9, 0.75],
    [0.95, 1.75, 1.95],
    [0.72, 1.55, 3.05],
    [0.45, 1.35, 4.15],
  ];
  tiers.forEach(([r, h, y], i) => k.cyl(i % 2 ? c.b : c.a, 0, r, h, 8, 0, y, 0, { ry: i * 0.4 }));
}

function lamp(k: Kit): void {
  const post = 0x34425a;
  const z0 = -0.5;
  k.cyl(post, 0.2, 0.26, 0.35, 8, 0, 0, z0);
  k.cyl(post, 0.12, 0.18, 0.25, 8, 0, 0.35, z0);
  k.cyl(post, 0.065, 0.085, 4.05, 8, 0, 0.6, z0);
  k.cyl(post, 0.11, 0.11, 0.12, 8, 0, 1.7, z0);
  k.cyl(post, 0.02, 0.1, 0.28, 8, 0, 4.62, z0);
  k.beam(post, [0, 4.5, z0], [0, 4.84, z0 + 0.36], 0.08);
  k.beam(post, [0, 4.84, z0 + 0.32], [0, 4.84, 0.42], 0.08);
  k.hull(post, [
    [-0.13, 4.9, 0.28],
    [0.13, 4.9, 0.28],
    [-0.13, 4.9, 0.62],
    [0.13, 4.9, 0.62],
    [-0.22, 4.68, 0.2],
    [0.22, 4.68, 0.2],
    [-0.22, 4.68, 0.72],
    [0.22, 4.68, 0.72],
  ]);
  k.box(0xfff0a0, 0.36, 0.06, 0.44, 0, 4.63, 0.46);
  // A little flag banner halfway up, for a splash of colour on a grey post.
  k.box(0xe63946, 0.04, 0.7, 0.34, 0, 2.6, z0 + 0.25);
}

const CAFES = [0xe63946, 0x3a86ff, 0x2a9d8f] as const;

function cafe(k: Kit, v: number): void {
  const col = CAFES[v];
  k.cyl(PAL.ink, 0.22, 0.26, 0.04, 8, 0, 0, 0);
  k.cyl(PAL.ink, 0.04, 0.04, 0.72, 6, 0, 0.04, 0);
  k.cyl(PAL.white, 0.46, 0.46, 0.05, 12, 0, 0.76, 0);
  k.cyl(0xfff4e0, 0.06, 0.05, 0.1, 6, 0.18, 0.81, 0.1);
  k.cyl(col, 0.05, 0.04, 0.12, 6, -0.16, 0.81, -0.12);
  for (const sx of [-1, 1]) {
    const x = sx * 0.82;
    k.box(PAL.wood, 0.42, 0.05, 0.42, x, 0.44, 0);
    for (const lx of [-0.17, 0.17]) for (const lz of [-0.17, 0.17]) k.box(PAL.ink, 0.04, 0.44, 0.04, x + lx, 0, lz);
    k.box(PAL.wood, 0.05, 0.46, 0.42, x + sx * 0.19, 0.49, 0);
  }
  k.cyl(PAL.white, 0.035, 0.035, 1.3, 6, 0, 0.81, 0);
  k.canopy([col, PAL.white], 1.18, 0.42, 1.98, 8);
  k.sphere(col, 0.08, [0, 2.44, 0], 6, 4);
}

function rock(k: Kit): void {
  const grey = 0x9aa1ab;
  // A lumpy hull: rings of points on a squashed dome, pushed in and out by a
  // fixed pattern so the rock is the same every time.
  const bumps = [1, 0.84, 0.95, 0.8, 1, 0.9, 0.86, 0.97];
  const pts: V3[] = [];
  const rings: Array<[number, number]> = [
    [0, 1.0],
    [0.55, 0.92],
    [1.0, 0.62],
    [1.4, 0.3],
  ];
  rings.forEach(([y, r], ring) => {
    for (let i = 0; i < 7; i++) {
      const az = (i / 7) * Math.PI * 2 + ring * 0.45;
      const b = bumps[(i + ring * 3) % 8];
      pts.push([Math.cos(az) * r * 1.1 * b, y * (ring ? b : 1), Math.sin(az) * r * 0.95 * b]);
    }
  });
  pts.push([0.15, 1.52, -0.1]);
  k.hull(grey, pts);
  // Tufts of grass at its foot, and a small stone beside it.
  for (const [x, z] of [
    [-0.9, 0.55],
    [0.2, 0.95],
    [-0.35, -0.95],
  ]) {
    for (let i = 0; i < 3; i++) {
      k.cyl(i === 1 ? PAL.leafLight : PAL.leaf, 0, 0.1, 0.3 + i * 0.08, 4, x + (i - 1) * 0.12, 0, z, { ry: i });
    }
  }
  const small: V3[] = [];
  for (let i = 0; i < 6; i++) {
    const az = (i / 6) * Math.PI * 2;
    small.push([0.75 + Math.cos(az) * 0.38, 0, 0.62 + Math.sin(az) * 0.32]);
    small.push([0.75 + Math.cos(az + 0.5) * 0.24 * bumps[i], 0.42, 0.62 + Math.sin(az + 0.5) * 0.2]);
  }
  k.hull(lighter(grey, 0.1), small);
}

// ---------------------------------------------------------------------------
// Tier 3: cars and friends

const CARS = [0xe63946, 0x3a86ff, 0x9ccc3c, 0xf4f5f7, 0x8e5cd9] as const;

function car(k: Kit, v: number, taxi = false): void {
  const body = taxi ? 0xffc21a : CARS[v];
  // Tyres stand a little proud of the body: a tyre face flush with a body side flickers.
  for (const x of [-0.88, 0.88]) for (const z of [-1.3, 1.3]) k.wheel(0.38, 0.3, [x, 0.38, z], 10);
  k.box(PAL.chassis, 1.7, 0.32, 3.5, 0, 0.18, 0);
  k.cbox(body, 1.9, 0.62, 4.1, 0.14, 0, 0.3, 0);
  // Cabin: a glass hull, a body-coloured roof and pillars so it reads as windows.
  k.hull(PAL.carGlass, [
    [-0.84, 0.9, -1.2],
    [0.84, 0.9, -1.2],
    [-0.84, 0.9, 0.95],
    [0.84, 0.9, 0.95],
    [-0.72, 1.48, -0.88],
    [0.72, 1.48, -0.88],
    [-0.72, 1.48, 0.45],
    [0.72, 1.48, 0.45],
  ]);
  k.cbox(body, 1.52, 0.12, 1.44, 0.05, 0, 1.46, -0.22);
  for (const sx of [-1, 1]) {
    k.beam(body, [sx * 0.8, 0.9, 0.92], [sx * 0.71, 1.49, 0.44], 0.1);
    k.beam(body, [sx * 0.8, 0.9, -1.18], [sx * 0.71, 1.49, -0.86], 0.12);
    k.beam(body, [sx * 0.83, 0.9, -0.14], [sx * 0.72, 1.49, -0.2], 0.1);
    k.box(PAL.head, 0.36, 0.16, 0.06, sx * 0.58, 0.62, 2.05);
    k.box(PAL.tail, 0.34, 0.14, 0.06, sx * 0.62, 0.66, -2.05);
    k.box(body, 0.14, 0.1, 0.12, sx * 0.94, 0.98, 0.78);
  }
  k.box(darker(body, 0.35), 0.62, 0.14, 0.05, 0, 0.47, 2.05);
  for (const sz of [-1, 1]) k.box(PAL.metal, 1.92, 0.16, 0.14, 0, 0.3, sz * 2.03);
  if (taxi) {
    k.box(PAL.ink, 0.76, 0.04, 0.34, 0, 1.58, -0.22);
    k.cbox(PAL.white, 0.7, 0.22, 0.3, 0.04, 0, 1.62, -0.22);
    k.box(0xe63946, 0.4, 0.08, 0.32, 0, 1.69, -0.22);
    // Chequered stripe along each side.
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        for (let row = 0; row < 2; row++) {
          if ((i + row) % 2) continue;
          k.box(PAL.ink, 0.04, 0.1, 0.22, sx * 0.955, 0.52 + row * 0.1, -1.1 + i * 0.22, undefined, [
            sx > 0 ? 'nx' : 'px',
            'ny',
          ]);
        }
      }
    }
  }
}

/** Awning colours for the fruit stand: green or orange stripes on white. */
const STANDS = [0x3fae5a, 0xf28c28] as const;

/**
 * A fruit stand: a wooden counter with crates of apples, oranges, limes and
 * bananas, under a striped awning. Healthy food, so it has to read as fruit.
 */
function fruitstand(k: Kit, v: number): void {
  const col = STANDS[v];
  // Counter, and the posts that hold the awning.
  k.box(PAL.wood, 2.3, 0.9, 1.0, 0, 0, 0.2);
  k.box(darker(PAL.wood, 0.2), 2.36, 0.08, 1.06, 0, 0.9, 0.2);
  for (const sx of [-1, 1]) {
    k.box(PAL.wood, 0.1, 2.1, 0.1, sx * 1.15, 0, -0.75);
    k.box(PAL.wood, 0.1, 1.75, 0.1, sx * 1.15, 0, 0.75);
  }
  // Three crates, each heaped with one kind of fruit.
  const crates: Array<{ x: number; fruit: number }> = [
    { x: -0.75, fruit: 0xe23b3b },
    { x: 0, fruit: 0xff9f1c },
    { x: 0.75, fruit: 0x8ccf3a },
  ];
  for (const c of crates) {
    k.box(lighter(PAL.wood, 0.15), 0.66, 0.22, 0.8, c.x, 0.98, 0.25);
    for (const [dx, dz] of [
      [-0.16, 0.05],
      [0.16, 0.05],
      [0, 0.4],
      [-0.16, 0.45],
      [0.16, 0.42],
    ] as const) {
      k.ico(c.fruit, 0.13, 0, [c.x + dx, 1.28, dz]);
    }
  }
  // Bananas: a yellow bunch hanging at the front.
  for (let i = 0; i < 3; i++) k.sphere(0xf7d94c, 0.09, [-0.3 + i * 0.12, 1.45, 0.72], 6, 4, { scale: [1, 2.6, 1], rot: { rz: 0.4 - i * 0.2 } });
  // A striped awning, sloping down to the front.
  const stripes = 6;
  for (let i = 0; i < stripes; i++) {
    const w = 2.5 / stripes;
    k.box(i % 2 ? PAL.white : col, w, 0.06, 1.75, -1.25 + w * (i + 0.5), 1.9, 0, { rx: -0.2 });
  }
}

const CARTS = [0xff8fab, 0x6fd3b5] as const;

function cart(k: Kit, v: number): void {
  const col = CARTS[v];
  const cz = 0.25;
  k.cbox(col, 1.5, 0.95, 1.9, 0.1, 0, 0.45, cz);
  k.box(PAL.white, 1.54, 0.16, 1.94, 0, 0.95, cz);
  k.cbox(PAL.white, 1.62, 0.1, 2.02, 0.03, 0, 1.4, cz);
  for (const sx of [-1, 1]) {
    k.wheel(0.42, 0.12, [sx * 0.82, 0.42, 0.75], 12, PAL.white);
    k.box(PAL.ink, 0.08, 0.46, 0.08, sx * 0.6, 0, -0.55);
    k.beam(PAL.metal, [sx * 0.5, 1.1, -0.68], [sx * 0.5, 1.22, -1.4], 0.06);
  }
  k.box(PAL.metal, 1.06, 0.07, 0.07, 0, 1.19, -1.42);
  // Three scoops in cones along the front of the counter.
  const scoops = [0xfff1c9, 0x7b4b2a, 0xff9ec4];
  scoops.forEach((c, i) => {
    const x = (i - 1) * 0.45;
    k.cyl(0xd9a066, 0.12, 0.03, 0.26, 6, x, 1.5, 0.85);
    k.ico(c, 0.15, 0, [x, 1.82, 0.85]);
  });
  k.cyl(PAL.white, 0.035, 0.035, 0.62, 6, 0, 1.5, -0.3);
  k.canopy([col, PAL.white], 0.9, 0.32, 2.02, 8, 0, -0.3);
  k.sphere(col, 0.07, [0, 2.36, -0.3], 6, 4);
}

const TRACTORS = [
  { body: 0x3f9d4f, rim: 0xffd23f },
  { body: 0xd8352c, rim: 0xf4f5f7 },
] as const;

function tractor(k: Kit, v: number): void {
  const c = TRACTORS[v];
  for (const sx of [-1, 1]) {
    k.wheel(0.76, 0.42, [sx * 0.86, 0.76, -0.78], 12, c.rim);
    k.wheel(0.42, 0.28, [sx * 0.78, 0.42, 1.18], 10, c.rim);
    // Mudguard over the big back wheel.
    k.box(c.body, 0.5, 0.08, 1.3, sx * 0.86, 1.56, -0.78);
    k.beam(c.body, [sx * 0.86, 1.6, -0.12], [sx * 0.86, 1.0, 0.2], 0.5, 0.08);
  }
  k.box(PAL.chassis, 0.8, 0.4, 3.0, 0, 0.35, 0.1);
  k.cbox(c.body, 0.95, 0.8, 1.7, 0.1, 0, 0.62, 0.9);
  k.box(PAL.ink, 0.7, 0.4, 0.06, 0, 0.8, 1.76);
  for (const sx of [-1, 1]) k.box(PAL.head, 0.16, 0.12, 0.06, sx * 0.36, 1.26, 1.76);
  k.cyl(PAL.ink, 0.06, 0.06, 1.0, 6, 0.3, 1.4, 1.35);
  k.cyl(PAL.ink, 0.08, 0.06, 0.08, 6, 0.3, 2.4 - 0.08, 1.35);
  // Cab: floor, glass box, corner posts and a roof.
  k.cbox(c.body, 1.3, 0.3, 1.3, 0.06, 0, 0.9, -0.62);
  k.box(PAL.carGlass, 1.16, 1.0, 1.1, 0, 1.2, -0.62, undefined, ON_GROUND);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(PAL.ink, 0.08, 1.02, 0.08, sx * 0.6, 1.2, -0.62 + sz * 0.57);
  k.cbox(PAL.white, 1.46, 0.14, 1.42, 0.05, 0, 2.22, -0.62);
  k.box(PAL.head, 0.1, 0.1, 0.12, 0.55, 2.36, -0.1);
}

// ---------------------------------------------------------------------------
// Tier 4: big vehicles and park pieces

const VANS = [
  { body: 0xf4f5f7, stripe: 0x3a86ff },
  { body: 0xff8c42, stripe: 0xf4f5f7 },
  { body: 0x52b788, stripe: 0xffd166 },
] as const;

function van(k: Kit, v: number): void {
  const c = VANS[v];
  for (const sx of [-1, 1]) for (const z of [-1.8, 1.75]) k.wheel(0.46, 0.34, [sx * 1.06, 0.46, z], 10);
  k.box(PAL.chassis, 2.0, 0.36, 5.1, 0, 0.26, 0);
  k.cbox(c.body, 2.3, 2.3, 3.7, 0.12, 0, 0.42, -0.95);
  k.cbox(c.body, 2.24, 0.9, 1.95, 0.12, 0, 0.42, 1.78);
  k.hull(PAL.carGlass, [
    [-1.02, 1.28, 0.85],
    [1.02, 1.28, 0.85],
    [-1.02, 1.28, 2.5],
    [1.02, 1.28, 2.5],
    [-0.94, 2.2, 0.85],
    [0.94, 2.2, 0.85],
    [-0.94, 2.2, 1.55],
    [0.94, 2.2, 1.55],
  ]);
  k.cbox(c.body, 2.04, 0.12, 0.96, 0.04, 0, 2.14, 1.28);
  for (const sx of [-1, 1]) {
    k.beam(c.body, [sx * 0.99, 1.28, 2.45], [sx * 0.93, 2.2, 1.52], 0.12);
    k.beam(c.body, [sx * 1.0, 1.28, 1.2], [sx * 0.95, 2.2, 1.2], 0.1);
    k.box(PAL.head, 0.4, 0.18, 0.06, sx * 0.7, 0.9, 2.76);
    k.box(PAL.tail, 0.18, 0.4, 0.06, sx * 0.95, 0.8, -2.81);
    k.box(PAL.carGlass, 0.8, 0.55, 0.05, sx * 0.5, 1.8, -2.81);
    k.box(c.body, 0.14, 0.12, 0.16, sx * 1.14, 1.6, 2.2);
  }
  // Company livery: a stripe along the cargo box, a round badge on each side,
  // and twin stripes over the roof so the van is still itself from above.
  k.box(c.stripe, 2.34, 0.3, 3.4, 0, 0.95, -0.95);
  for (const sx of [-1, 1]) k.box(c.stripe, 0.34, 0.03, 3.5, sx * 0.36, 2.72, -0.95);
  k.box(0xdde3ea, 0.7, 0.14, 0.7, 0, 2.72, -2.1);
  k.rod(c.stripe, 0.48, 2.34, 12, [0, 1.85, -1.0], { rz: HALF_PI });
  k.rod(PAL.white, 0.28, 2.36, 12, [0, 1.85, -1.0], { rz: HALF_PI });
  k.box(darker(c.body, 0.3), 0.04, 2.0, 0.05, 0, 0.55, -2.81);
  k.box(PAL.ink, 1.4, 0.18, 0.05, 0, 0.7, 2.76);
  for (const sz of [-1, 1]) k.box(PAL.metal, 2.28, 0.18, 0.16, 0, 0.3, sz * 2.8);
}

const BUSES = [
  { body: 0xe63946, stripe: 0xf4f5f7, roof: 0xef5b67 },
  { body: 0xffc21a, stripe: PAL.ink, roof: 0xffd54a },
] as const;

function bus(k: Kit, v: number): void {
  const c = BUSES[v];
  for (const sx of [-1, 1]) for (const z of [-2.8, 2.9]) k.wheel(0.52, 0.36, [sx * 1.16, 0.52, z], 10);
  k.box(PAL.chassis, 2.2, 0.4, 8.4, 0, 0.25, 0);
  k.cbox(c.body, 2.5, 2.55, 8.9, 0.16, 0, 0.42, 0);
  // Window band with pillars; the front door breaks it on the kerb side (+x).
  k.box(PAL.carGlass, 2.54, 0.95, 7.9, 0, 1.68, -0.3);
  for (let i = 0; i <= 6; i++) k.box(c.body, 2.58, 0.95, 0.16, 0, 1.68, -4.1 + i * 1.22);
  k.box(PAL.carGlass, 0.06, 2.0, 0.9, 1.24, 0.6, 3.5);
  k.box(c.body, 0.08, 2.0, 0.08, 1.25, 0.6, 3.5);
  k.box(PAL.carGlass, 2.2, 1.3, 0.06, 0, 1.3, 4.44);
  k.box(c.stripe, 2.54, 0.2, 8.6, 0, 1.3, -0.1);
  if (v === 1) k.box(c.stripe, 2.54, 0.12, 8.7, 0, 0.9, 0);
  k.box(PAL.ink, 1.6, 0.3, 0.06, 0, 2.62, 4.45);
  k.box(0xffb703, 1.3, 0.15, 0.08, 0, 2.7, 4.45);
  k.cbox(c.roof, 2.24, 0.1, 8.3, 0.04, 0, 2.95, 0);
  k.cbox(0xdfe4ea, 1.3, 0.26, 1.8, 0.06, 0, 3.02, -1.8);
  for (const sx of [-1, 1]) {
    k.box(PAL.head, 0.4, 0.2, 0.06, sx * 0.85, 0.72, 4.46);
    k.box(PAL.tail, 0.26, 0.4, 0.06, sx * 1.02, 0.8, -4.46);
  }
  for (const sz of [-1, 1]) k.box(PAL.ink, 2.52, 0.24, 0.14, 0, 0.36, sz * 4.46);
}

function fountain(k: Kit): void {
  const stone = PAL.stone;
  k.lathe(
    stone,
    [
      [3.0, 0],
      [3.0, 0.62],
      [2.9, 0.78],
      [2.55, 0.78],
      [2.55, 0.35],
      [0, 0.35],
    ],
    16,
  );
  k.cyl(PAL.water, 2.56, 2.56, 0.2, 16, 0, 0.35, 0);
  k.cyl(stone, 0.34, 0.5, 1.3, 10, 0, 0.35, 0);
  k.lathe(
    stone,
    [
      [0.3, 1.2],
      [1.15, 1.6],
      [1.2, 1.78],
      [1.02, 1.78],
      [1.02, 1.62],
      [0, 1.62],
    ],
    12,
  );
  k.cyl(PAL.water, 1.03, 1.03, 0.1, 12, 0, 1.62, 0);
  k.cyl(stone, 0.12, 0.16, 0.42, 8, 0, 1.62, 0);
  k.ico(stone, 0.17, 0, [0, 2.1, 0]);
  // A jet with a splash on top, a short lip of water spilling over the upper
  // bowl, and a ring of foam where it lands.
  k.cyl(PAL.waterLight, 0.05, 0.1, 0.45, 8, 0, 2.2, 0);
  k.ico(PAL.waterLight, 0.2, 0, [0, 2.62, 0], [1, 0.8, 1]);
  k.lathe(
    PAL.waterLight,
    [
      [1.3, 1.34],
      [1.23, 1.74],
    ],
    12,
  );
  k.lathe(
    0xdcf3ff,
    [
      [1.58, 0.56],
      [1.3, 0.56],
    ],
    12,
  );
}

const KIOSKS = [
  { wall: 0x2a9d8f, accent: 0xffd166 },
  { wall: 0xe76f51, accent: 0xfff1d6 },
  { wall: 0x4361ee, accent: 0xffd166 },
] as const;

function kiosk(k: Kit, v: number): void {
  const c = KIOSKS[v];
  const cz = -0.3;
  const front = cz + 1.2;
  k.cbox(c.wall, 3.5, 2.3, 2.4, 0.08, 0, 0, cz);
  k.box(0x3b4252, 2.4, 0.95, 0.04, 0, 1.08, front);
  k.box(PAL.wood, 2.7, 0.08, 0.4, 0, 1.0, front + 0.14);
  const mags = [0xef476f, 0xffd166, 0x06d6a0, 0x118ab2, 0xf78c6b, 0x9b5de5];
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 6; i++) {
      k.box(mags[(i + row * 3) % 6], 0.34, 0.34, 0.05, -1.3 + i * 0.52, 0.18 + row * 0.42, front + 0.03, {
        rx: -0.12,
      });
    }
  }
  for (const sx of [-1, 1]) k.box(PAL.white, 0.4, 0.12, 0.28, sx * 0.7, 1.08, front + 0.14);
  k.box(c.accent, 3.6, 0.45, 2.5, 0, 2.3, cz);
  k.box(PAL.white, 2.4, 0.28, 0.05, 0, 2.38, front + 0.05);
  for (let i = 0; i < 4; i++) k.box(c.wall, 0.3, 0.16, 0.06, -0.66 + i * 0.44, 2.44, front + 0.06);
  k.cbox(darker(c.wall, 0.2), 3.9, 0.18, 2.8, 0.05, 0, 2.75, cz);
  k.hull(c.wall, [
    [-1.85, 2.93, cz - 1.3],
    [1.85, 2.93, cz - 1.3],
    [-1.85, 2.93, cz + 1.3],
    [1.85, 2.93, cz + 1.3],
    [-0.7, 3.2, cz],
    [0.7, 3.2, cz],
  ]);
  // Striped awning over the counter.
  const n = 7;
  const sw = 3.2 / n;
  for (let i = 0; i < n; i++) {
    const col = i % 2 ? PAL.white : c.accent;
    const x = -1.6 + (i + 0.5) * sw;
    k.box(col, sw, 0.05, 0.64, x, 1.96, front + 0.3, { rx: 0.4 });
    k.box(col, sw, 0.16, 0.04, x, 1.72, front + 0.6);
  }
}

const CONTAINERS = [0xc8453b, 0x2f6fb5, 0x3f9d5a, 0xf08a3c] as const;

function container(k: Kit, v: number): void {
  const c = CONTAINERS[v];
  const dark = darker(c, 0.22);
  const W = 2.44;
  const L = 6.2;
  const H = 2.5;
  k.box(c, W, H, L, 0, 0.05, 0, undefined, ON_GROUND);
  // Corrugated sides and roof: shallow ribs in a slightly darker shade.
  const ribs = 16;
  for (let i = 0; i < ribs; i++) {
    const z = -L / 2 + 0.3 + (i * (L - 0.6)) / (ribs - 1);
    for (const sx of [-1, 1]) k.box(dark, 0.06, H - 0.3, 0.16, sx * (W / 2 + 0.02), 0.2, z, undefined, [sx > 0 ? 'nx' : 'px']);
  }
  for (let i = 0; i < 9; i++) k.box(dark, W - 0.3, 0.04, 0.2, 0, H + 0.05, -L / 2 + 0.5 + i * ((L - 1) / 8), undefined, ON_GROUND);
  // Frame rails and corner castings.
  for (const sx of [-1, 1]) {
    for (const y of [0.05, H - 0.1]) k.box(dark, 0.1, 0.15, L, sx * (W / 2 + 0.01), y, 0);
    for (const sz of [-1, 1]) k.box(darker(c, 0.4), 0.2, H + 0.05, 0.2, sx * (W / 2 - 0.06), 0, sz * (L / 2 - 0.06));
  }
  // Doors at the back with locking bars.
  for (let i = 0; i < 4; i++) k.box(PAL.metal, 0.05, H - 0.4, 0.06, -0.9 + i * 0.6, 0.25, -L / 2 - 0.02);
  k.box(dark, 0.04, H - 0.2, 0.05, 0, 0.15, -L / 2 - 0.02);
  k.box(PAL.white, 0.9, 0.3, 0.04, 0, H - 0.6, -L / 2 - 0.03);
}

function tanker(k: Kit): void {
  const cab = 0xe63946;
  const tank = 0xd5dbe3;
  for (const sx of [-1, 1]) {
    for (const z of [2.7, -1.6, -2.75]) k.wheel(0.5, 0.36, [sx * 1.13, 0.5, z], 8);
  }
  k.box(PAL.chassis, 2.0, 0.4, 7.8, 0, 0.3, 0);
  // Cab at the front.
  k.cbox(cab, 2.4, 1.3, 2.0, 0.14, 0, 0.5, 2.9);
  k.hull(PAL.carGlass, [
    [-1.12, 1.78, 2.05],
    [1.12, 1.78, 2.05],
    [-1.12, 1.78, 3.6],
    [1.12, 1.78, 3.6],
    [-1.05, 2.75, 2.05],
    [1.05, 2.75, 2.05],
    [-1.05, 2.75, 3.05],
    [1.05, 2.75, 3.05],
  ]);
  k.cbox(cab, 2.3, 0.2, 1.3, 0.05, 0, 2.7, 2.62);
  for (const sx of [-1, 1]) {
    k.beam(cab, [sx * 1.1, 1.78, 3.55], [sx * 1.04, 2.75, 3.0], 0.12);
    k.box(PAL.head, 0.42, 0.2, 0.06, sx * 0.75, 0.9, 3.91);
    k.box(PAL.tail, 0.2, 0.3, 0.06, sx * 0.9, 0.7, -3.92);
    k.box(PAL.metal, 0.12, 1.6, 0.12, sx * 1.12, 1.4, 1.9);
  }
  k.box(PAL.ink, 1.6, 0.36, 0.05, 0, 0.9, 3.91);
  k.box(PAL.metal, 2.4, 0.22, 0.16, 0, 0.36, 3.9);
  // The tank, with a bright hazard band so it reads as fuel from far away.
  const ty = 1.95;
  const seg = 12;
  const open = (r: number, len: number, z: number, color: number) =>
    k.add(new THREE.CylinderGeometry(r, r, len, seg, 1, true), color, placement(0, ty, z, { rx: HALF_PI }));
  open(1.1, 5.4, -0.95, tank);
  for (const sz of [-1, 1]) {
    k.sphere(tank, 1.1, [0, ty, -0.95 + sz * 2.7], seg, 3, {
      hemi: true,
      scale: [1, 0.28, 1],
      rot: { rx: sz * HALF_PI },
    });
  }
  open(1.13, 1.1, -0.95, 0xf77f00);
  for (const z of [-2.8, 0.9]) open(1.12, 0.14, z, darker(tank, 0.15));
  k.box(darker(tank, 0.2), 0.5, 0.08, 4.8, 0, ty + 1.07, -0.95);
  for (const z of [-2.4, -0.95, 0.5]) k.cyl(darker(tank, 0.3), 0.2, 0.22, 0.14, 6, 0, ty + 1.08, z);
  k.box(0xf77f00, 0.5, 0.5, 0.05, 0, ty - 0.1, -4.03, { rz: Math.PI / 4 });
}

// ---------------------------------------------------------------------------
// Tier 5: houses and shops
//
// Buildings are toys, not architecture: soft rounded masses in candy colours,
// a few big windows, and thick simple roofs, so a street reads as friendly
// and chunky from the high camera.

/** Window glass on the small buildings: a bright sky blue, softer than real glass. */
const GLASS = 0x6fd8ff;
/** Glass doors, a shade deeper than the windows so they read as doors. */
const DOOR_GLASS = 0x62b6ee;
/** Warm off-white for plinths, steps and roof rims, gentler than pure white. */
const CREAM = 0xfff6e6;

const HOUSES = [
  { wall: 0xffd23f, roof: 0xf2433a, door: 0x2f7bff, hip: false },
  { wall: 0x52639a, roof: 0x17c3b2, door: 0xff8a1f, hip: true },
  { wall: 0xfff1d6, roof: 0x3cc95a, door: 0xf2433a, hip: false },
  { wall: 0x4aa8ff, roof: 0xff8a1f, door: 0xffd23f, hip: true },
] as const;

function house(k: Kit, v: number, s: number): void {
  const c = HOUSES[v];
  const H = 7 * s;
  const W = 7;
  const D = 6.4;
  const cz = -0.3;
  const halfW = W / 2;
  const halfD = D / 2;
  const roofH = 2.2;
  const t = 0.5;
  const roll = 0.38;
  // The roof slabs lie on the gable line and a fat roll caps the ridge; the
  // top of that roll is the house's full height.
  const lift = (t * Math.hypot(halfW, roofH)) / halfW;
  const ridge = H - roll - lift / 2;
  const eave = ridge - roofH;
  const base = 0.35;
  // Taller houses get more storeys at a normal storey height, not taller windows.
  const floors = Math.max(1, Math.round((eave - base) / 2.3));
  const fh = (eave - base) / floors;
  const winW = 1.3;
  const winH = Math.min(1.3, fh - 0.85);

  k.rbox(CREAM, W + 0.5, base, D + 0.5, 0.9, 0.12, 0, 0, cz);
  k.rbox(c.wall, W, eave - base + 0.05, D, 0.6, 0, 0, base, cz, { seg: 3 });

  k.within(translate(0, 0, cz), () => {
    for (const wall of walls(W, D)) {
      k.within(wall.m, () => {
        const front = wall.side === 'front';
        const us = wall.side === 'left' || wall.side === 'right' ? [0] : [-1.9, 1.9];
        for (let f = 0; f < floors; f++) {
          const y = base + f * fh + (fh - winH) / 2 + 0.08;
          for (const u of us) paneAt(k, GLASS, PAL.white, u, y, winW, winH, front);
        }
        if (!front) return;
        const doorH = Math.min(1.9, fh - 0.25);
        archDoor(k, PAL.white, c.door, 0, base, 1.1, doorH);
        k.rbox(CREAM, 1.9, base, 0.9, 0.3, 0.1, 0, 0, 0.45);
        k.rbox(c.roof, 2.0, 0.24, 0.8, 0.3, 0.1, 0, base + doorH + 0.3, 0.3);
        // Two round bushes at the front corners, one of them flowering.
        for (const sx of [-1, 1]) k.ico(sx < 0 ? PAL.leaf : PAL.leafLight, 0.55, 0, [sx * 3.0, 0.45, 0.6], [1, 0.85, 1], sx);
        k.gem(0xff8fb8, 0.16, [3.0, 0.94, 0.8]);
      });
    }
  });

  const over = 0.5;
  if (c.hip) {
    // A plump hip roof: a thick lip at the eaves, rounded shoulders, a short ridge.
    const rx = halfW + over;
    const rz = halfD + over;
    const rh = 1.0;
    const pts: V3[] = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        pts.push([sx * rx, eave - 0.1, cz + sz * rz], [sx * rx, eave + 0.25, cz + sz * rz]);
        pts.push([sx * (rx - 0.3), eave + 0.5, cz + sz * (rz - 0.3)]);
        pts.push([sx * (rh + 0.35), H - 0.28, cz + sz * 0.5], [sx * rh, H, cz + sz * 0.16]);
      }
    }
    k.hull(c.roof, pts);
  } else {
    // Gable facing the street, the way a child draws a house: a wall-coloured
    // triangle under two thick slabs with rounded edges.
    k.hull(c.wall, [
      [-halfW, eave, cz - halfD],
      [halfW, eave, cz - halfD],
      [-halfW, eave, cz + halfD],
      [halfW, eave, cz + halfD],
      [0, ridge, cz - halfD],
      [0, ridge, cz + halfD],
    ]);
    const len = D + 2 * over;
    const dy = lift / 2;
    for (const sx of [-1, 1]) {
      const x0 = sx * (halfW + over);
      const y0 = eave - (over * roofH) / halfW + dy;
      k.beam(c.roof, [x0, y0, cz], [0, ridge + dy, cz], t, len);
      k.rod(c.roof, t * 0.56, len, 8, [x0, y0, cz], { rx: HALF_PI });
    }
    k.rod(lighter(c.roof, 0.15), roll, len + 0.1, 10, [0, ridge + dy, cz], { rx: HALF_PI });
    // A round window in each gable.
    for (const sz of [-1, 1]) {
      const z = cz + sz * (halfD + 0.02);
      k.rod(PAL.white, 0.52, 0.12, 10, [0, eave + 0.85, z], { rx: HALF_PI });
      k.rod(GLASS, 0.38, 0.18, 10, [0, eave + 0.85, z], { rx: HALF_PI });
    }
  }
  // A chubby chimney on the slope the camera sees.
  k.rbox(0xf08c6c, 0.8, H - 0.3 - eave, 0.8, 0.22, 0, 1.9, eave, cz - 1.3);
  k.rbox(CREAM, 1.05, 0.3, 1.05, 0.3, 0.12, 1.9, H - 0.3, cz - 1.3);
}

const SHOPS = [
  { wall: 0x52639a, accent: 0xff8a1f },
  { wall: 0x2ec4b6, accent: 0xf2433a },
  { wall: 0xff8fb8, accent: 0x7a4de8 },
  { wall: 0xffc933, accent: 0x2f7bff },
] as const;

/** Two rounded panels back to back: a sign board that looks right from both sides. */
function board(k: Kit, color: number, w: number, h: number, r: number, t: number): void {
  k.plate(color, w, h, r, t / 2, 0, 0, 0, 2);
  k.within(placement(0, 0, 0, { ry: Math.PI }), () => k.plate(color, w, h, r, t / 2, 0, 0, 0, 2));
}

function shop(k: Kit, v: number, s: number): void {
  const c = SHOPS[v];
  const H = 6 * s;
  const W = 9.6;
  const D = 7.2;
  const cz = -0.35;
  const G = 3.3;
  const roofY = H - 1.0;
  const rimH = 0.55;
  // A short shop is just its shopfront; taller ones gain whole upper floors.
  const upper = roofY - G;
  const floors = upper < 1.9 ? 0 : Math.max(1, Math.round(upper / 2.5));
  const fh = floors ? upper / floors : 0;
  const winH = Math.min(1.4, fh - 0.8);

  k.rbox(CREAM, W + 0.4, 0.3, D + 0.4, 1.0, 0.1, 0, 0, cz, { seg: 1 });
  k.rbox(c.wall, W, roofY - 0.25, D, 0.8, 0, 0, 0.3, cz, { seg: 3 });
  // A thick rounded roof rim in a bright colour, with the roof inside it.
  k.rbox(c.accent, W + 0.5, rimH, D + 0.5, 1.0, 0.25, 0, roofY, cz, { seg: 3 });
  const top = roofY + rimH;
  k.rbox(mix(c.accent, 0xffffff, 0.3), W - 0.7, 0.05, D - 0.7, 0.6, 0, 0, top, cz);

  k.within(translate(0, 0, cz), () => {
    for (const wall of walls(W, D)) {
      k.within(wall.m, () => {
        const front = wall.side === 'front';
        const cols = wall.len > 8 ? 3 : 2;
        for (let f = 0; f < floors; f++) {
          const y = G + f * fh + (fh - winH) / 2;
          for (const u of cells(cols, wall.len - 1.6)) paneAt(k, GLASS, null, u, y, 1.8, winH, front);
        }
        if (front) {
          shopfront(k, c.accent, W);
        } else if (wall.side === 'back') {
          archDoor(k, PAL.white, lighter(c.accent, 0.2), -2.4, 0.3, 1.1, 2.1);
          paneAt(k, GLASS, PAL.white, 1.6, 1.1, 1.8, 1.3);
        } else {
          paneAt(k, GLASS, PAL.white, 0, 1.0, 2.6, 1.4);
        }
      });
    }
  });

  // One rounded skylight on the roof.
  k.rbox(CREAM, 2.4, 0.25, 1.7, 0.45, 0.1, 2.4, top, cz - 1.5, { seg: 1 });
  k.rbox(GLASS, 2.0, 0.34, 1.3, 0.4, 0.12, 2.4, top, cz - 1.5, { seg: 1 });
  // A sign standing on the front of the roof: the camera looks down on roofs,
  // so this is the part of the shop a player actually sees.
  k.within(placement(0, top, cz + D / 2 - 0.6, { rx: -0.35 }), () => {
    board(k, PAL.white, 5.0, 1.1, 0.5, 0.3);
    k.plate(c.wall, 4.3, 0.66, 0.3, 0.22, 0, 0.22, 0, 2);
    [0.36, 0.46, 0.36, 0.46].forEach((h, i) => k.plate(PAL.white, 0.52, h, 0.16, 0.28, -1.2 + i * 0.8, 0.55 - h / 2));
  });
}

/** Ground-floor shopfront on the current (front) wall frame: windows, door, awning, sign. */
function shopfront(k: Kit, accent: number, W: number): void {
  for (const side of [-1, 1]) {
    const u = side * 2.65;
    k.plate(accent, 3.4, 2.1, 0.5, 0.12, u, 0.35, 0, 2);
    k.plate(GLASS, 3.0, 1.7, 0.4, 0.2, u, 0.55, 0, 2);
    k.plate(lighter(GLASS, 0.6), 0.36, 0.9, 0.16, 0.24, u - 1.0, 1.1);
  }
  archDoor(k, accent, DOOR_GLASS, 0, 0.3, 1.2, 2.1);
  // A chunky striped awning with a rounded scallop under each stripe.
  const n = 6;
  const aw = W - 0.2;
  const sw = aw / n;
  const depth = 1.0;
  const drop = 0.45;
  const len = Math.hypot(depth, drop);
  const y0 = 2.8;
  for (let i = 0; i < n; i++) {
    const col = i % 2 ? PAL.white : accent;
    const u = -aw / 2 + (i + 0.5) * sw;
    k.box(col, sw, 0.14, len, u, y0 - drop / 2, depth / 2, { rx: Math.atan2(drop, depth) });
    k.add(
      new THREE.CylinderGeometry(sw * 0.5, sw * 0.5, 0.14, 6, 1, false, -HALF_PI, Math.PI),
      col,
      placement(u, y0 - drop + 0.02, depth - 0.02, { rx: HALF_PI }),
    );
  }
  // Sign board over the awning.
  k.plate(accent, W - 0.8, 0.6, 0.28, 0.2, 0, y0 + 0.05, 0, 2);
  k.plate(PAL.white, 4.6, 0.36, 0.18, 0.26, 0, y0 + 0.17, 0, 2);
}

// ---------------------------------------------------------------------------
// Tier 6: tall buildings

const APARTMENTS = [
  { wall: 0x52639a, base: 0x3e4c7a, accent: 0xff8a1f, roof: 0x3cc95a },
  { wall: 0x22b8a8, base: 0x178f83, accent: 0xffc933, roof: 0xff8a1f },
  { wall: 0xff6f5e, base: 0xd9503f, accent: 0x2ec4b6, roof: 0xfff1d6 },
  { wall: 0x8a63e8, base: 0x6a45c8, accent: 0xffc933, roof: 0x17c3b2 },
] as const;

function apartment(k: Kit, v: number, s: number): void {
  const c = APARTMENTS[v];
  const H = 18 * s;
  const L = 11.0;
  const G = 3.4;
  const R = H - 2.8;
  const U = R - G;
  // Big storeys, so a block has a few rows of big windows rather than a grid.
  const floors = Math.max(2, Math.round(U / 4.2));
  const fh = U / floors;
  const winH = Math.min(2.0, fh * 0.52);

  k.rbox(c.base, L + 0.6, G, L + 0.6, 1.6, 0.3, 0, 0, 0, { seg: 3 });
  k.rbox(c.wall, L, U + 0.1, L, 1.3, 0, 0, G - 0.05, 0, { seg: 3 });
  k.rbox(c.roof, L + 0.6, 0.6, L + 0.6, 1.6, 0.3, 0, R, 0, { seg: 3 });
  const top = R + 0.6;
  k.rbox(mix(c.roof, 0xffffff, 0.3), L - 0.6, 0.05, L - 0.6, 1.0, 0, 0, top, 0);

  for (const wall of walls(L, L)) {
    k.within(wall.m, () => {
      const front = wall.side === 'front';
      for (let f = 0; f < floors; f++) {
        const fy = G + f * fh;
        const y = fy + (fh - winH) / 2 + 0.1;
        if (!front) {
          for (const u of [-2.3, 2.3]) paneAt(k, GLASS, null, u, y, 2.6, winH, false, 1);
          continue;
        }
        for (const u of [-3.1, 3.1]) paneAt(k, GLASS, null, u, y, 2.0, winH, true);
      }
      if (front) {
        // The stairwell: one tall glass strip up the middle in an accent frame.
        k.plate(c.accent, 2.4, U - 0.5, 0.8, 0.12, 0, G + 0.25, 0, 2);
        k.plate(DOOR_GLASS, 1.6, U - 1.1, 0.5, 0.2, 0, G + 0.55, 0, 2);
      }
    });
  }
  for (const wall of walls(L + 0.6, L + 0.6)) {
    k.within(wall.m, () => {
      if (wall.side === 'front') {
        archDoor(k, PAL.white, DOOR_GLASS, 0, 0, 2.0, 2.5);
        k.rbox(c.accent, 3.6, 0.3, 0.7, 0.3, 0.12, 0, 2.9, 0.35, { seg: 1 });
        for (const u of [-3.6, 3.6]) paneAt(k, GLASS, PAL.white, u, 0.9, 1.9, 1.5, true);
      } else {
        for (const u of [-2.6, 2.6]) paneAt(k, GLASS, null, u, 0.9, 2.4, 1.5, false, 1);
      }
    });
  }

  // Roof: a round water tank on stubby legs, a stair hut and a planter.
  const tx = -2.6;
  const tz = -2.4;
  k.cyl(c.accent, 1.1, 1.1, 1.8, 12, tx, top, tz);
  k.cyl(lighter(c.accent, 0.3), 0.12, 1.2, 0.6, 12, tx, top + 1.8, tz);
  k.rbox(c.wall, 2.4, 1.8, 2.0, 0.5, 0.25, 2.6, top, -2.6, { seg: 1 });
  k.rbox(0xd9a06b, 3.2, 0.5, 1.4, 0.4, 0.12, -1.4, top, 3.4, { seg: 1 });
  for (const [x, r] of [
    [-2.4, 0.5],
    [-1.4, 0.6],
    [-0.4, 0.48],
  ]) {
    k.ico(x === -1.4 ? PAL.leafLight : PAL.leaf, r, 0, [x, top + 0.85, 3.4], [1, 0.85, 1], x);
  }
}

const TOWERS = [
  { body: 0x4f6096, glass: 0x5fd8ff, trim: 0x3cc95a, setback: false },
  { body: 0x3a6fe0, glass: 0xa6e6ff, trim: 0xffc933, setback: true },
  { body: 0xffc933, glass: 0x3aa0f0, trim: 0xff5a4a, setback: false },
] as const;

type TowerScheme = (typeof TOWERS)[number];

/** A soft shaft of `floors` storeys with one wide rounded window band per floor on each face. */
function shaft(k: Kit, c: TowerScheme, S: number, y0: number, floors: number, fh: number): void {
  const r = 1.6;
  k.rbox(c.body, S, floors * fh + 0.1, S, r, 0, 0, y0, 0, { seg: 3 });
  const winH = Math.min(1.9, fh * 0.55);
  for (const wall of walls(S, S)) {
    k.within(wall.m, () => {
      for (let f = 0; f < floors; f++) {
        k.plate(c.glass, S - 2 * r - 0.6, winH, winH * 0.32, 0.16, 0, y0 + f * fh + (fh - winH) / 2, 0, 2);
      }
    });
  }
}

function tower(k: Kit, v: number, s: number): void {
  const c = TOWERS[v];
  const H = 30 * s;
  const G = 4.0;
  const mast = 3.6;
  const R = H - mast;
  const crown = 1.4;
  const U = R - crown - G;
  const floors = Math.max(3, Math.round(U / 3.8));
  const fh = U / floors;

  // Podium: a wide soft block with a big glass front door.
  k.rbox(CREAM, 11.6, G, 11.6, 2.0, 0.35, 0, 0, 0, { seg: 3 });
  for (const wall of walls(11.6, 11.6)) {
    k.within(wall.m, () => {
      if (wall.side === 'front') {
        archDoor(k, c.trim, DOOR_GLASS, 0, 0, 2.4, 2.8);
        for (const u of [-3.1, 3.1]) k.plate(c.glass, 2.2, 1.9, 0.6, 0.14, u, 0.9, 0, 2);
      } else {
        for (const u of [-2.0, 2.0]) k.plate(c.glass, 2.8, 1.9, 0.6, 0.14, u, 0.9, 0, 2);
      }
    });
  }

  // The setback scheme steps in to a slimmer shaft over a planted terrace.
  const S = c.setback ? 7.8 : 9.4;
  if (c.setback) {
    const lower = Math.min(floors - 1, Math.max(2, Math.round(floors * 0.6)));
    shaft(k, c, 10.0, G, lower, fh);
    const yb = G + lower * fh;
    k.rbox(CREAM, 10.6, 0.5, 10.6, 2.0, 0.2, 0, yb, 0);
    k.rbox(0x8fd16a, 9.4, 0.06, 9.4, 1.6, 0, 0, yb + 0.5, 0);
    for (const sx of [-1, 1]) k.ico(PAL.leaf, 0.7, 0, [sx * 4.2, yb + 1.1, 4.2], [1, 0.85, 1], sx);
    shaft(k, c, S, yb + 0.5, floors - lower, fh - 0.5 / (floors - lower));
  } else {
    shaft(k, c, S, G, floors, fh);
  }
  // Crown: a thick rounded cap in the trim colour, a helipad and a mast.
  k.rbox(c.trim, S + 0.6, crown, S + 0.6, 1.9, 0.45, 0, R - crown, 0, { seg: 3 });
  const padR = S * 0.32;
  k.cyl(0x6b7288, padR, padR, 0.2, 14, -0.3, R, 0.3);
  k.lathe(
    PAL.white,
    [
      [padR - 0.2, R + 0.22],
      [padR - 0.6, R + 0.22],
    ],
    14,
    -0.3,
    0.3,
  );
  const hy = R + 0.2;
  for (const sx of [-1, 1]) k.box(0xffd166, 0.4, 0.06, 1.7, -0.3 + sx * 0.5, hy, 0.3);
  k.box(0xffd166, 0.7, 0.06, 0.4, -0.3, hy, 0.3);
  const mx = S / 2 - 1.2;
  const mz = -S / 2 + 1.2;
  k.cyl(CREAM, 0.14, 0.3, mast - 0.6, 8, mx, R, mz);
  k.sphere(0xff5d5d, 0.4, [mx, H - 0.4, mz], 6, 4);
}

// ---------------------------------------------------------------------------

const STREET: Record<Exclude<PropKind, LandmarkKind | WonderKind>, Builder> = {
  cone,
  hydrant,
  bin,
  mailbox,
  planter,
  person,
  bench,
  bush,
  bike,
  haybale,
  site,
  bigsite,
  tree,
  pine,
  lamp,
  cafe,
  rock,
  fruitstand,
  car: (k, v) => car(k, v),
  taxi: (k) => car(k, 0, true),
  cart,
  tractor,
  van,
  bus,
  fountain,
  kiosk,
  container,
  tanker,
  house,
  shop,
  apartment,
  tower,
};

const BUILDERS: Record<PropKind, Builder> = { ...STREET, ...LANDMARKS, ...WONDERS_BUILDERS };

/**
 * One merged geometry (position, normal, colour) for a kind. Origin is the
 * footprint centre with the base on y = 0; vehicles face +z. Kinds marked
 * `scales` in the catalogue grow taller with `hScale` by gaining floors.
 */
export function buildKindGeometry(kind: PropKind, variant: number, hScale = 1): THREE.BufferGeometry {
  const info = KINDS[kind];
  const n = info.variants;
  const whole = Number.isFinite(variant) ? Math.floor(variant) : 0;
  const v = ((whole % n) + n) % n;
  const s = info.scales && Number.isFinite(hScale) ? Math.max(0.5, hScale) : 1;
  const k = new Kit();
  BUILDERS[kind](k, v, s);
  const g = k.build();
  // Faceted wheels and blobs never land exactly on zero; snap the lowest point
  // to the ground so nothing floats or sinks.
  const minY = g.boundingBox?.min.y ?? 0;
  if (minY !== 0) g.translate(0, -minY, 0);
  return g;
}
