/**
 * The Gulp City model kit: every PropKind drawn as one merged, vertex-coloured
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
  acUnit,
  cells,
  darker,
  doorAt,
  lighter,
  mix,
  parapet,
  placement,
  translate,
  walls,
  windowAt,
} from './kit';
import { LANDMARKS, type LandmarkKind } from './landmarks';

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
  for (const x of [-0.8, 0.8]) for (const z of [-1.3, 1.3]) k.wheel(0.38, 0.3, [x, 0.38, z], 10);
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
  for (const sx of [-1, 1]) for (const z of [-1.8, 1.75]) k.wheel(0.46, 0.34, [sx * 0.98, 0.46, z], 10);
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
  for (const sx of [-1, 1]) for (const z of [-2.8, 2.9]) k.wheel(0.52, 0.36, [sx * 1.1, 0.52, z], 10);
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
    for (const z of [2.7, -1.6, -2.75]) k.wheel(0.5, 0.36, [sx * 1.08, 0.5, z], 8);
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

const HOUSES = [
  { wall: 0xfff0d4, roof: 0xe0533d, door: 0x3a86ff, shutter: 0x3a86ff, hip: false },
  { wall: 0xcfe8f7, roof: 0x3f5f8f, door: 0xf28c38, shutter: 0xf28c38, hip: true },
  { wall: 0xffe08a, roof: 0x9a5b3a, door: 0x2a9d8f, shutter: 0x2a9d8f, hip: false },
  { wall: 0xd3efc4, roof: 0xd8683f, door: 0xe63946, shutter: 0xe63946, hip: true },
] as const;

function house(k: Kit, v: number, s: number): void {
  const c = HOUSES[v];
  const H = 7 * s;
  const W = 7;
  const D = 6.4;
  const cz = -0.3;
  const roofH = 2.5;
  const ridge = H - 0.25;
  const eave = ridge - roofH;
  const base = 0.3;
  // Taller houses get more storeys at a normal storey height, not taller windows.
  const floors = Math.max(1, Math.round((eave - base) / 2.1));
  const fh = (eave - base) / floors;
  const winH = Math.min(1.15, fh - 0.75);

  k.box(PAL.stoneDark, W + 0.24, base, D + 0.24, 0, 0, cz, undefined, ON_GROUND);
  k.box(c.wall, W, eave - base, D, 0, base, cz, undefined, ON_GROUND);
  for (let f = 1; f <= floors; f++) {
    k.box(PAL.white, W + 0.12, 0.14, D + 0.12, 0, base + f * fh - 0.14, cz, undefined, ON_GROUND);
  }

  k.within(translate(0, 0, cz), () => {
    for (const wall of walls(W, D)) {
      k.within(wall.m, () => {
        const cols = wall.len > 6.8 ? 3 : 2;
        // Glazing bars and shutters only where the camera looks: the front.
        const front = wall.side === 'front';
        const style = {
          frame: PAL.white,
          glass: PAL.glass,
          cross: front,
          shutters: front ? c.shutter : undefined,
        };
        for (let f = 0; f < floors; f++) {
          const y = base + f * fh + (fh - winH) / 2 + 0.02;
          cells(cols, wall.len).forEach((u, i) => {
            if (wall.side === 'front' && f === 0 && i === 1) return;
            windowAt(k, style, u, y, 0.95, winH);
          });
        }
        if (wall.side === 'front') {
          const doorH = Math.min(1.85, fh - 0.2);
          doorAt(k, PAL.white, c.door, 0, base, 1.05, doorH);
          k.box(PAL.stoneDark, 1.6, 0.18, 0.55, 0, 0, 0.3);
          k.box(c.roof, 1.8, 0.12, 0.8, 0, base + doorH + 0.2, 0.36, { rx: 0.25 });
        }
      });
    }
  });

  const over = 0.45;
  const halfD = D / 2;
  if (c.hip) {
    const rx = W / 2 + over;
    const rz = halfD + over;
    const ridgeHalf = 1.0;
    k.hull(c.roof, [
      [-rx, eave - 0.05, cz - rz],
      [rx, eave - 0.05, cz - rz],
      [-rx, eave - 0.05, cz + rz],
      [rx, eave - 0.05, cz + rz],
      [-rx, eave + 0.2, cz - rz],
      [rx, eave + 0.2, cz - rz],
      [-rx, eave + 0.2, cz + rz],
      [rx, eave + 0.2, cz + rz],
      [-ridgeHalf, ridge + 0.1, cz],
      [ridgeHalf, ridge + 0.1, cz],
    ]);
  } else {
    // Gable facing the street, the way a child draws a house: wall-coloured
    // triangles front and back under two thick roof slabs.
    const halfW = W / 2;
    k.hull(c.wall, [
      [-halfW, eave, cz - halfD],
      [halfW, eave, cz - halfD],
      [-halfW, eave, cz + halfD],
      [halfW, eave, cz + halfD],
      [0, ridge - 0.1, cz - halfD],
      [0, ridge - 0.1, cz + halfD],
    ]);
    const slope = roofH / halfW;
    for (const sx of [-1, 1]) {
      k.beam(c.roof, [sx * (halfW + over), eave + 0.12 - over * slope, cz], [0, ridge + 0.02, cz], 0.24, D + 0.7);
    }
    k.box(darker(c.roof, 0.2), 0.36, 0.2, D + 0.8, 0, ridge - 0.04, cz);
    // A round window in each gable.
    for (const sz of [-1, 1]) {
      k.rod(PAL.white, 0.46, 0.1, 8, [0, eave + 0.95, cz + sz * (halfD + 0.02)], { rx: HALF_PI });
      k.rod(PAL.glass, 0.34, 0.16, 8, [0, eave + 0.95, cz + sz * (halfD + 0.02)], { rx: HALF_PI });
    }
  }
  // Chimney on the slope the camera sees.
  k.box(PAL.brick, 0.7, H - 0.18 - eave, 0.7, 1.9, eave, cz - 1.4);
  k.box(0x5d6470, 0.9, 0.18, 0.9, 1.9, H - 0.18, cz - 1.4);
}

const SHOPS = [
  { wall: 0xf6d5a8, accent: 0xe63946 },
  { wall: 0xb9e2dc, accent: 0x2f6fd6 },
  { wall: 0xf9c6d3, accent: 0x7b4fc9 },
  { wall: 0xd9774f, accent: 0x2a9d8f },
] as const;

function shop(k: Kit, v: number, s: number): void {
  const c = SHOPS[v];
  const H = 6 * s;
  const W = 9.6;
  const D = 7.2;
  const cz = -0.35;
  const G = 3.3;
  const parapetH = 0.45;
  const roofY = H - 0.3 - parapetH;
  // A short shop is just its shopfront; taller ones gain whole upper floors.
  const upper = roofY - G;
  const floors = upper < 1.9 ? 0 : Math.max(1, Math.round(upper / 2.4));
  const fh = floors ? upper / floors : 0;
  const winH = Math.min(1.3, fh - 0.8);
  const accentDark = darker(c.accent, 0.2);

  k.box(darker(c.wall, 0.25), W + 0.14, 0.35, D + 0.14, 0, 0, cz, undefined, ON_GROUND);
  k.box(c.wall, W, roofY, D, 0, 0, cz, undefined, ON_GROUND);
  for (let f = 1; f < floors; f++) k.box(PAL.white, W + 0.1, 0.12, D + 0.1, 0, G + f * fh - 0.1, cz, undefined, ON_GROUND);
  k.box(PAL.white, W + 0.3, 0.22, D + 0.3, 0, roofY - 0.22, cz, undefined, ON_GROUND);
  k.box(mix(c.wall, 0xe8eaed, 0.55), W - 0.4, 0.03, D - 0.4, 0, roofY, cz);

  k.within(translate(0, 0, cz), () => {
    parapet(k, c.wall, W, D, roofY, parapetH, 0.3);
    parapet(k, PAL.white, W + 0.1, D + 0.1, roofY + parapetH, 0.08, 0.4);
    for (const wall of walls(W, D)) {
      k.within(wall.m, () => {
        const style = { frame: PAL.white, glass: PAL.glass };
        const cols = wall.len > 8 ? 4 : 3;
        for (let f = 0; f < floors; f++) {
          const y = G + f * fh + (fh - winH) / 2;
          for (const u of cells(cols, wall.len)) windowAt(k, style, u, y, 1.2, winH);
        }
        if (wall.side === 'front') {
          shopfront(k, c.accent, accentDark, W);
        } else if (wall.side === 'back') {
          doorAt(k, PAL.white, 0x6c757d, -2.4, 0.35, 1.1, 2.1);
          windowAt(k, style, 1.6, 1.2, 1.2, 1.1);
        } else {
          for (const u of cells(2, wall.len)) windowAt(k, style, u, 1.2, 1.2, 1.2);
        }
      });
    }
  });

  acUnit(k, -2.6, roofY, cz - 1.6);
  acUnit(k, -0.8, roofY, cz - 2.0, 1.0, 0.6, 0.9);
  k.box(PAL.metal, 1.8, 0.2, 1.3, 2.6, roofY, cz - 1.4);
  k.box(PAL.glass, 1.5, 0.08, 1.0, 2.6, roofY + 0.2, cz - 1.4);
  k.cyl(PAL.metal, 0.12, 0.12, 0.7, 6, 3.8, roofY, cz - 2.8);
  // A sign standing on the front parapet: the camera looks down on roofs, so
  // this is the part of the shop a player actually sees.
  const signZ = cz + D / 2 - 0.5;
  k.within(placement(0, roofY, signZ, { rx: -0.45 }), () => {
    k.box(c.accent, 5.0, 1.2, 0.22, 0, 0, 0);
    k.box(PAL.white, 4.4, 0.72, 0.06, 0, 0.36, 0.12, undefined, FLUSH);
    [0.4, 0.52, 0.4, 0.52].forEach((h, i) =>
      k.box(accentDark, 0.56, h, 0.06, -1.2 + i * 0.8, 0.72 - h / 2, 0.16, undefined, FLUSH),
    );
  });
}

/** Ground-floor shopfront on the current (front) wall frame: windows, door, awning, sign. */
function shopfront(k: Kit, accent: number, accentDark: number, W: number): void {
  for (const side of [-1, 1]) {
    const u = side * 2.65;
    k.box(accent, 3.5, 0.5, 0.18, u, 0.35, 0, undefined, FLUSH);
    k.box(accentDark, 3.5, 1.85, 0.12, u, 0.85, 0, undefined, FLUSH);
    k.box(PAL.glass, 3.2, 1.55, 0.16, u, 0.98, 0, undefined, FLUSH);
    k.box(accentDark, 0.1, 1.55, 0.2, u, 0.98, 0, undefined, FLUSH);
  }
  k.box(accentDark, 1.5, 2.3, 0.12, 0, 0.35, 0, undefined, FLUSH);
  k.box(PAL.glassDeep, 1.2, 2.1, 0.16, 0, 0.35, 0, undefined, FLUSH);
  k.box(PAL.metal, 0.08, 0.5, 0.26, 0.4, 1.2, 0, undefined, FLUSH);
  // Striped awning, sloping out over the pavement, with a hanging valance.
  const n = 10;
  const sw = (W - 0.2) / n;
  const depth = 1.05;
  const drop = 0.45;
  const len = Math.hypot(depth, drop);
  for (let i = 0; i < n; i++) {
    const col = i % 2 ? PAL.white : accent;
    const u = -(W - 0.2) / 2 + (i + 0.5) * sw;
    k.box(col, sw, 0.06, len, u, 2.7 - drop / 2, depth / 2, { rx: Math.atan2(drop, depth) });
    k.box(col, sw, 0.26, 0.05, u, 2.7 - drop - 0.22, depth);
  }
  // Sign board over the awning: a light panel with blocky "lettering".
  k.box(accent, W + 0.1, 0.56, 0.28, 0, 2.74, 0.02, undefined, FLUSH);
  k.box(PAL.white, 5.2, 0.38, 0.06, 0, 2.83, 0.18, undefined, FLUSH);
  const letters = [0.24, 0.3, 0.24, 0.3, 0.24];
  letters.forEach((h, i) => k.box(accentDark, 0.34, h, 0.06, -1.6 + i * 0.8, 2.87 + (0.3 - h) / 2, 0.22, undefined, FLUSH));
  k.rod(PAL.brass, 0.3, 0.1, 10, [-3.3, 3.02, 0.24], { rx: HALF_PI });
}

// ---------------------------------------------------------------------------
// Tier 6: tall buildings

const APARTMENTS = [
  { wall: 0xf4a261, base: 0xc97c4b, accent: 0x2a9d8f },
  { wall: 0x9fd3c7, base: 0x5e9c8f, accent: 0xe76f51 },
  { wall: 0xf2e8cf, base: 0xb08968, accent: 0xe63946 },
  { wall: 0xc9b6e4, base: 0x8e7cc3, accent: 0xffd166 },
] as const;

function apartment(k: Kit, v: number, s: number): void {
  const c = APARTMENTS[v];
  const H = 18 * s;
  const L = 11.0;
  const G = 3.4;
  const R = H - 3.0;
  const U = R - G;
  const floors = Math.max(2, Math.round(U / 2.9));
  const fh = U / floors;
  const winH = Math.min(1.7, fh * 0.56);
  const spandrel = fh - winH;
  const glass = PAL.glassDeep;

  // Ground floor: a solid base with the entrance on the front.
  k.box(c.base, L + 0.4, G, L + 0.4, 0, 0, 0, undefined, ON_GROUND);
  k.box(darker(c.base, 0.2), L + 0.6, 0.3, L + 0.6, 0, G - 0.3, 0, undefined, ON_GROUND);
  // Upper floors: a glass core wrapped by spandrels and pillars, which leaves
  // a grid of recessed windows that stays right however many floors there are.
  k.box(glass, L - 0.8, U, L - 0.8, 0, G, 0, undefined, ON_GROUND);
  for (let f = 0; f < floors; f++) k.box(c.wall, L, spandrel, L, 0, G + f * fh, 0, undefined, ON_GROUND);
  const cols = 4;
  const corner = 1.0;
  const pillar = 0.9;
  const cell = (L - 2 * corner - (cols - 1) * pillar) / cols;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(c.wall, corner, U, corner, sx * (L / 2 - corner / 2), G, sz * (L / 2 - corner / 2));

  const cellU = (i: number) => -L / 2 + corner + cell / 2 + i * (cell + pillar);
  for (const wall of walls(L, L)) {
    k.within(wall.m, () => {
      for (let j = 1; j < cols; j++) k.box(c.wall, pillar, U, 0.4, cellU(j) - (cell + pillar) / 2, G, -0.2, undefined, FLUSH);
      if (wall.side === 'front') {
        // Balconies on the middle two columns of every floor.
        for (let f = 0; f < floors; f++) {
          const y = G + f * fh + spandrel;
          for (const i of [1, 2]) {
            const u = cellU(i);
            k.box(PAL.white, cell + 0.3, 0.14, 0.8, u, y - 0.14, 0.4);
            k.box((f + i) % 3 === 0 ? c.accent : PAL.white, cell + 0.3, 0.55, 0.07, u, y, 0.77);
            for (const e of [-1, 1]) k.box(PAL.white, 0.07, 0.55, 0.8, u + e * (cell / 2 + 0.12), y, 0.4);
            if ((f * 2 + i) % 3 === 1) k.ico(PAL.leaf, 0.22, 0, [u + cell / 2 - 0.2, y + 0.2, 0.5]);
          }
        }
      }
    });
  }
  for (const wall of walls(L + 0.4, L + 0.4)) {
    k.within(wall.m, () => {
      const style = { frame: PAL.white, glass: PAL.glass };
      if (wall.side === 'front') {
        doorAt(k, PAL.white, glass, 0, 0, 2.0, 2.4);
        k.box(c.accent, 3.4, 0.22, 0.8, 0, 2.7, 0.4);
        for (const u of [-3.6, 3.6]) windowAt(k, style, u, 0.9, 1.8, 1.4);
      } else {
        for (const u of [-3.2, 0, 3.2]) windowAt(k, style, u, 0.9, 1.6, 1.4);
      }
    });
  }

  // Roof: cornice, deck, parapet, water tank, stair hut and air-conditioning.
  k.box(c.wall, L + 0.3, 0.4, L + 0.3, 0, R, 0, undefined, ON_GROUND);
  k.box(mix(c.wall, 0xe8eaed, 0.55), L - 0.2, 0.02, L - 0.2, 0, R + 0.4, 0);
  parapet(k, PAL.white, L + 0.3, L + 0.3, R + 0.4, 0.4, 0.3);
  // A little roof garden: a splash of green where the camera looks.
  k.box(0x8d6e4f, 3.0, 0.4, 1.3, -1.6, R + 0.4, 3.9);
  k.box(0x6b4a33, 2.8, 0.04, 1.1, -1.6, R + 0.8, 3.9);
  for (const [x, r] of [
    [-2.6, 0.45],
    [-1.6, 0.55],
    [-0.6, 0.42],
  ]) {
    k.ico(x === -1.6 ? PAL.leafLight : PAL.leaf, r, 0, [x, R + 0.95, 3.9], [1, 0.85, 1], x);
  }
  const tx = -2.6;
  const tz = -2.4;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(PAL.ink, 0.14, 0.95, 0.14, tx + sx * 0.6, R + 0.4, tz + sz * 0.6);
  k.cyl(0x9c6b4a, 0.95, 0.95, 1.2, 10, tx, R + 1.35, tz);
  k.cyl(PAL.ink, 0.97, 0.97, 0.08, 10, tx, R + 1.75, tz, { open: true });
  k.cyl(darker(0x9c6b4a, 0.25), 0.05, 1.05, 0.45, 10, tx, R + 2.55, tz);
  k.box(c.wall, 2.4, 1.8, 2.0, 2.6, R + 0.4, -2.6);
  k.box(c.base, 2.6, 0.14, 2.2, 2.6, R + 2.2, -2.6);
  k.box(0x6c757d, 0.9, 1.4, 0.08, 2.6, R + 0.4, -1.6);
  acUnit(k, 2.4, R + 0.4, 2.2);
  acUnit(k, -2.0, R + 0.4, 2.4, 1.0, 0.6, 1.0);
}

const TOWERS = [
  { glass: 0x57b8d9, glassTop: 0x8ad3ec, band: 0xeef2f6, podium: 0xd8d4cc, setback: false },
  { glass: 0x3f6fb5, glassTop: 0x6a93d1, band: 0xc9d3de, podium: 0xb9c2cc, setback: true },
  { glass: 0xe9b949, glassTop: 0xf5d27a, band: 0x5a4a3a, podium: 0xe2d6c0, setback: false },
] as const;

type TowerScheme = (typeof TOWERS)[number];

/** A glass shaft of `floors` storeys: tinted core, floor bands and vertical fins. */
function glassShaft(k: Kit, c: TowerScheme, S: number, y0: number, floors: number, fh: number): void {
  const U = floors * fh;
  // The core lightens towards the top, a cheap stand-in for sky reflection.
  const split = Math.ceil(floors * 0.6);
  k.box(c.glass, S, split * fh, S, 0, y0, 0, undefined, ON_GROUND);
  k.box(c.glassTop, S, U - split * fh, S, 0, y0 + split * fh, 0, undefined, ON_GROUND);
  for (let f = 0; f <= floors; f++) k.box(c.band, S + 0.3, 0.3, S + 0.3, 0, y0 + f * fh - 0.15, 0, undefined, ON_GROUND);
  const fins = Math.max(3, Math.round(S / 1.8));
  for (const wall of walls(S, S)) {
    k.within(wall.m, () => {
      for (let i = 1; i < fins; i++) k.box(c.band, 0.18, U, 0.3, -S / 2 + (i * S) / fins, y0, 0, undefined, FLUSH);
    });
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(c.band, 0.4, U, 0.4, sx * S / 2, y0, sz * S / 2);
}

function tower(k: Kit, v: number, s: number): void {
  const c = TOWERS[v];
  const H = 30 * s;
  const G = 4.0;
  const mast = 4.6;
  const R = H - mast;
  const crown = 1.2;
  const U = R - crown - G;
  const floors = Math.max(3, Math.round(U / 3.0));
  const fh = U / floors;

  // Podium: glass lobby behind stone columns, with a canopy over the doors.
  k.box(c.podium, 12, 0.25, 12, 0, 0, 0, undefined, ON_GROUND);
  k.box(PAL.glassDeep, 11.2, 3.0, 11.2, 0, 0.25, 0, undefined, ON_GROUND);
  for (const wall of walls(11.4, 11.4)) {
    k.within(wall.m, () => {
      for (const u of [-5.4, -2.7, 0, 2.7, 5.4]) k.box(c.podium, 0.6, 3.0, 0.5, u, 0.25, 0, undefined, FLUSH);
    });
  }
  k.box(c.podium, 12, 0.75, 12, 0, 3.25, 0, undefined, ON_GROUND);
  k.box(c.band, 4.0, 0.2, 0.9, 0, 2.5, 6.05);
  k.box(0x8fbf6a, 11.0, 0.05, 11.0, 0, G, 0);

  // The setback scheme steps in to a slimmer shaft with a planted terrace.
  const S = c.setback ? 7.6 : 9.4;
  const top = R - crown;
  if (c.setback) {
    const lower = Math.min(floors - 1, Math.max(2, Math.round(floors * 0.6)));
    glassShaft(k, c, 9.8, G, lower, fh);
    const yb = G + lower * fh;
    k.box(c.band, 10.4, 0.4, 10.4, 0, yb, 0, undefined, ON_GROUND);
    k.box(0x8fbf6a, 9.4, 0.05, 9.4, 0, yb + 0.4, 0);
    glassShaft(k, c, S, yb + 0.4, floors - lower, fh - 0.4 / (floors - lower));
  } else {
    glassShaft(k, c, S, G, floors, fh);
  }
  // Crown, roof deck, helipad and a mast with a red light.
  k.box(c.band, S + 0.6, crown, S + 0.6, 0, top, 0, undefined, ON_GROUND);
  k.box(PAL.roofDeck, S - 0.2, 0.02, S - 0.2, 0, R, 0);
  const padR = S * 0.34;
  k.cyl(0x4a4e5a, padR, padR, 0.3, 16, -0.3, R, 0.3);
  k.lathe(PAL.white, [
    [padR - 0.15, R + 0.32],
    [padR - 0.5, R + 0.32],
  ], 16, -0.3, 0.3);
  const hy = R + 0.3;
  for (const sx of [-1, 1]) k.box(0xffd166, 0.3, 0.05, 1.5, -0.3 + sx * 0.45, hy, 0.3);
  k.box(0xffd166, 0.6, 0.05, 0.3, -0.3, hy, 0.3);
  const mx = S / 2 - 0.7;
  const mz = -S / 2 + 0.7;
  k.cyl(PAL.metal, 0.06, 0.16, mast - 0.2, 6, mx, R, mz);
  for (const y of [1.2, 2.4]) k.box(PAL.metal, 0.8, 0.06, 0.06, mx, R + y, mz);
  k.gem(PAL.tail, 0.16, [mx, H - 0.16, mz]);
  acUnit(k, -S / 2 + 1.2, R, -S / 2 + 1.1, 1.2, 0.7, 1.0);
}

// ---------------------------------------------------------------------------

const STREET: Record<Exclude<PropKind, LandmarkKind>, Builder> = {
  cone,
  hydrant,
  bin,
  mailbox,
  planter,
  bench,
  bush,
  bike,
  haybale,
  tree,
  pine,
  lamp,
  cafe,
  rock,
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

const BUILDERS: Record<PropKind, Builder> = { ...STREET, ...LANDMARKS };

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
