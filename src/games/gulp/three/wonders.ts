/**
 * The Gulp Universe wonders: cheerful toy versions of famous landmarks, worth
 * a big bonus. Same kit and rules as props.ts; kept apart because each one is
 * a small scene of its own.
 *
 * They are big and only edible late, when the camera is high, so each one
 * leans on its silhouette and a few bold colours rather than fine detail.
 * Everything faces +z, toward the camera.
 */
import * as THREE from 'three';
import type { PropKind } from '../domain/catalog';
import { type Builder, type Kit, type V3, FLUSH, ON_GROUND, PAL, lighter, parapet, placement, translate, walls } from './kit';

export type WonderKind = Extract<
  PropKind,
  | 'liberty'
  | 'megaspire'
  | 'irontower'
  | 'pyramid'
  | 'pearlpalace'
  | 'buddha'
  | 'reichstag'
  | 'opera'
  | 'onion'
  | 'clocktower'
  | 'leaning'
  | 'stonecircle'
  | 'moai'
>;

type Profile = ReadonlyArray<readonly [number, number]>;
type Pair = readonly [number, number];

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const GOLD = 0xf5c542;
const GRASS = 0x86d06a;
const GRASS_DARK = 0x6fbf5a;

// ---------------------------------------------------------------------------
// Helpers only the wonders need

/** Cylinder or cone from a to b: arms, crown spikes, palm trunks. */
function spike(k: Kit, color: number, a: V3, b: V3, rBase: number, rTip: number, seg: number): void {
  const va = new THREE.Vector3(a[0], a[1], a[2]);
  const dir = new THREE.Vector3(b[0], b[1], b[2]).sub(va);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(rTip, rBase, len, seg);
  g.translate(0, len / 2, 0);
  k.add(g, color, new THREE.Matrix4().compose(va, new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()), ONE));
}

/** Lathe that can be lifted, squashed into an oval along x, and swept part of the way round. */
function latheAt(
  k: Kit,
  color: number,
  profile: Profile,
  seg: number,
  o: { x?: number; y?: number; z?: number; sx?: number; phi?: Pair } = {},
): void {
  const g = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
    o.phi?.[0] ?? 0,
    o.phi?.[1] ?? TAU,
  );
  k.add(g, color, placement(o.x ?? 0, o.y ?? 0, o.z ?? 0, undefined, [o.sx ?? 1, 1, 1]));
}

/**
 * Arch-shaped panel on the current wall frame: flat bottom on y, straight
 * sides, a round (or pointed) top, standing out from z by `depth`. A plate
 * rounds all four corners, which reads as an oval rather than an arch.
 */
function arch(k: Kit, color: number, w: number, h: number, depth: number, u: number, y: number, z = 0, pointed = false): void {
  const hw = w / 2;
  const rise = pointed ? 1.5 : 1;
  const hs = Math.max(0, h - hw * rise);
  const o: Array<readonly [number, number]> = [
    [-hw, 0],
    [hw, 0],
    [hw, hs],
  ];
  if (pointed) o.push([hw * 0.72, hs + hw * 0.95], [0, hs + hw * rise], [-hw * 0.72, hs + hw * 0.95]);
  else for (let i = 1; i < 4; i++) o.push([hw * Math.cos((i * Math.PI) / 4), hs + hw * Math.sin((i * Math.PI) / 4)]);
  o.push([-hw, hs]);
  const pos: number[] = [];
  for (let i = 1; i < o.length - 1; i++) pos.push(o[0][0], o[0][1], depth, o[i][0], o[i][1], depth, o[i + 1][0], o[i + 1][1], depth);
  o.forEach((a, i) => {
    const b = o[(i + 1) % o.length];
    pos.push(a[0], a[1], 0, b[0], b[1], 0, b[0], b[1], depth);
    pos.push(a[0], a[1], 0, b[0], b[1], depth, a[0], a[1], depth);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  k.add(g, color, translate(u, y, z));
}

/** Onion dome shape, as (radius, height) fractions from the neck to the tip. */
const ONION: Profile = [
  [0.72, 0],
  [0.94, 0.12],
  [1, 0.27],
  [0.93, 0.43],
  [0.74, 0.58],
  [0.48, 0.72],
  [0.26, 0.84],
  [0.1, 0.94],
  [0, 1],
];

/**
 * Onion dome in two colours whose stripes twist round it as they climb, the
 * swirl that makes the dome palace read at a glance. Radius R, height H, base
 * on (x, y, z).
 */
function onionDome(k: Kit, colors: Pair, x: number, y: number, z: number, R: number, H: number, stripes = 10, twist = 1.4): void {
  const lists: [number[], number[]] = [[], []];
  const at = (r: number, h: number, a: number): V3 => [x + R * r * Math.sin(a), y + H * h, z + R * r * Math.cos(a)];
  for (let s = 0; s < stripes; s++) {
    const list = lists[s % 2];
    for (let j = 0; j < ONION.length - 1; j++) {
      const [r0, h0] = ONION[j];
      const [r1, h1] = ONION[j + 1];
      const a = (s / stripes) * TAU;
      const b = ((s + 1) / stripes) * TAU;
      // Seen from outside, the angle grows to the right, so this order winds outward.
      const p00 = at(r0, h0, a + twist * h0);
      const p01 = at(r0, h0, b + twist * h0);
      const p10 = at(r1, h1, a + twist * h1);
      const p11 = at(r1, h1, b + twist * h1);
      list.push(...p00, ...p01, ...p11);
      if (r1 > 0) list.push(...p00, ...p11, ...p10);
    }
  }
  lists.forEach((list, i) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
    g.computeVertexNormals();
    k.add(g, colors[i]);
  });
}

/** Gold finial: a short rod and a bead, the tip of every dome. */
function finial(k: Kit, x: number, y: number, z: number, h: number): void {
  k.cyl(GOLD, 0.12, 0.2, h, 6, x, y, z);
  k.sphere(GOLD, 0.3, [x, y + h * 0.45, z], 6, 4);
  k.gem(GOLD, 0.26, [x, y + h, z]);
}

/** Palm tree leaning by `lean` toward +x. */
function palm(k: Kit, x: number, z: number, h: number, lean: number): void {
  let p: V3 = [x, 0, z];
  for (let i = 1; i <= 3; i++) {
    const q: V3 = [x + lean * (i / 3) ** 2, (h * i) / 3, z];
    spike(k, 0x9c6b43, p, q, 0.3 - i * 0.03, 0.27 - i * 0.03, 5);
    p = q;
  }
  for (let i = 0; i < 6; i++) {
    const a = (i * TAU) / 6 + 0.3;
    const sa = Math.sin(a);
    const ca = Math.cos(a);
    const tip: V3 = [p[0] + sa * 2.3, p[1] - 0.9, p[2] + ca * 2.3];
    const mid: V3 = [p[0] + sa * 1.2, p[1] + 0.35, p[2] + ca * 1.2];
    k.hull(i % 2 ? 0x3fae52 : 0x5cc863, [p, tip, [mid[0] + ca * 0.5, mid[1], mid[2] - sa * 0.5], [mid[0] - ca * 0.5, mid[1], mid[2] + sa * 0.5]]);
  }
  k.ico(0x7a4a2a, 0.3, 0, [p[0], p[1] - 0.2, p[2] + 0.2]);
}

/** Slim dark-green cypress for formal gardens. */
function cypress(k: Kit, x: number, y: number, z: number, h: number): void {
  k.cyl(0x7a5236, 0.12, 0.16, 0.4, 5, x, y, z);
  k.cyl(0x2f8f5a, 0.05, 0.55, h, 6, x, y + 0.3, z);
}

// ---------------------------------------------------------------------------
// The Statue of Liberty

const COPPER = 0x52caa6;
const COPPER_LIGHT = 0x8ae6c6;
const COPPER_DARK = 0x33a386;

const liberty: Builder = (k) => {
  const stone = 0xeee3cf;
  const stoneDark = 0xcdbfa6;
  // A grassy island under an eleven-point star fort.
  k.cyl(GRASS, 6.2, 6.2, 0.3, 22, 0, 0, 0);
  k.cyl(stoneDark, 4.5, 4.5, 1.3, 22, 0, 0.3, 0);
  for (let i = 0; i < 11; i++) {
    const a = (i * TAU) / 11;
    const s = Math.PI / 11;
    const pts: V3[] = [];
    for (const y of [0.3, 1.6]) {
      pts.push([6.0 * Math.sin(a), y, 6.0 * Math.cos(a)]);
      pts.push([4.2 * Math.sin(a - s), y, 4.2 * Math.cos(a - s)], [4.2 * Math.sin(a + s), y, 4.2 * Math.cos(a + s)]);
    }
    k.hull(stoneDark, pts);
  }
  // Stepped stone pedestal, about two fifths of the height.
  k.rbox(stone, 8.4, 1.3, 8.4, 0.5, 0.25, 0, 1.6, 0);
  k.rbox(stone, 7.3, 4.2, 7.3, 0.5, 0.2, 0, 2.9, 0);
  k.rbox(stone, 6.2, 9.8, 6.2, 0.4, 0, 0, 7.1, 0);
  for (const wall of walls(6.2, 6.2)) {
    k.within(wall.m, () => {
      k.plate(stoneDark, 3.4, 4.6, 0.3, 0.1, 0, 8.2, 0);
      for (const u of [-1.5, 0, 1.5]) arch(k, 0x5a6f8c, 0.8, 1.7, 0.14, u, 13.9);
    });
    k.within(translate(0, 2.9, 0), () => k.within(wall.m, () => arch(k, stoneDark, 2.4, 2.6, 0.1, 0, 0.6)));
  }
  k.rbox(stoneDark, 7.2, 0.8, 7.2, 0.5, 0.2, 0, 16.9, 0);
  k.rbox(stone, 5.4, 1.2, 5.4, 0.4, 0.2, 0, 17.7, 0);

  // The robed figure, facing +z; her right arm (at -x) holds the torch high.
  const y0 = 18.9;
  k.lathe(
    COPPER,
    [
      [2.6, y0],
      [2.65, y0 + 0.9],
      [2.35, y0 + 3.5],
      [2.05, y0 + 7.5],
      [1.95, y0 + 10.2],
      [2.15, y0 + 12.2],
      [2.2, y0 + 13.2],
      [1.6, y0 + 14.0],
      [0.7, y0 + 14.4],
      [0, y0 + 14.5],
    ],
    12,
  );
  // Robe folds down the front and a draped sash across the chest.
  for (const u of [-1.3, -0.45, 0.45, 1.3]) {
    const r = Math.sqrt(2.45 ** 2 - u * u);
    spike(k, COPPER_DARK, [u, y0 + 0.3, r], [u * 0.85, y0 + 7.0, r - 0.45], 0.24, 0.14, 4);
  }
  k.hull(COPPER_LIGHT, [
    [-2.2, y0 + 12.9, 0.4],
    [-2.0, y0 + 13.4, -0.2],
    [2.15, y0 + 8.2, 0.6],
    [2.0, y0 + 8.8, -0.4],
    [0.2, y0 + 10.9, 2.15],
    [-0.4, y0 + 11.8, 1.95],
  ]);
  const top = y0 + 14.4;
  k.cyl(COPPER, 0.75, 0.85, 1.2, 8, 0, top - 0.3, 0);
  const headY = top + 2.0;
  k.sphere(COPPER, 1.65, [0, headY, 0], 12, 8, { scale: [1, 1.08, 1] });
  k.sphere(COPPER_DARK, 0.9, [0, headY - 0.2, -1.2], 8, 5);
  for (const sx of [-1, 1]) k.gem(0x1f3b4d, 0.2, [sx * 0.55, headY + 0.05, 1.5]);
  k.gem(COPPER_DARK, 0.3, [0, headY - 0.35, 1.62]);
  // Spiky crown: a band and seven rays fanning up and out.
  k.cyl(COPPER_DARK, 1.72, 1.8, 0.6, 12, 0, headY + 0.6, 0);
  for (let i = 0; i < 7; i++) {
    const a = ((i - 3) * Math.PI) / 5.2;
    const d: V3 = [Math.sin(a) * 0.72, 0.7, Math.cos(a) * 0.72];
    const base: V3 = [Math.sin(a) * 1.5, headY + 0.95, Math.cos(a) * 1.5];
    spike(k, COPPER_LIGHT, base, [base[0] + d[0] * 2.3, base[1] + d[1] * 2.3, base[2] + d[2] * 2.3], 0.34, 0.02, 4);
  }
  // Raised torch arm, then the gold torch and its flame.
  const shoulder: V3 = [-1.7, top - 1.2, 0.1];
  const hand: V3 = [-2.7, top + 6.6, 0.5];
  spike(k, COPPER, shoulder, hand, 0.85, 0.6, 8);
  k.sphere(COPPER, 0.65, hand, 8, 5);
  k.cyl(COPPER_DARK, 0.5, 0.35, 1.3, 8, hand[0], hand[1] + 0.3, hand[2]);
  const cupY = hand[1] + 1.6;
  k.lathe(
    GOLD,
    [
      [0.45, cupY],
      [1.1, cupY + 0.8],
      [1.2, cupY + 1.0],
      [0, cupY + 1.0],
    ],
    10,
    hand[0],
    hand[2],
  );
  k.sphere(0xffa62b, 1.0, [hand[0], cupY + 1.6, hand[2]], 8, 6, { scale: [1, 1.25, 1] });
  k.cyl(0xffd84a, 0, 0.75, 2.3, 7, hand[0], cupY + 1.6, hand[2]);
  // Left arm hugs the tablet against her side.
  spike(k, COPPER, [1.8, top - 1.0, 0.1], [2.35, top - 3.6, 0.9], 0.7, 0.55, 8);
  k.within(placement(2.35, y0 + 8.4, 0.9, { rz: 0.22, rx: -0.12, ry: -0.35 }), () => {
    k.cbox(COPPER_LIGHT, 1.8, 3.0, 0.55, 0.12, 0, 0, 0);
    k.box(COPPER_DARK, 1.2, 0.14, 0.62, 0, 2.2, 0);
  });
};

// ---------------------------------------------------------------------------
// The Burj Khalifa

const megaspire: Builder = (k) => {
  const glass = 0x9fd6f7;
  const silver = 0xf4f8fc;
  const steel = 0xb4c6db;
  k.cyl(0xdbe3ec, 12.6, 12.9, 0.5, 6, 0, 0, 0, { ry: Math.PI / 6 });
  k.cyl(PAL.water, 3.0, 3.0, 0.1, 12, 0, 0.5, 0);
  // Three rounded wings in a Y, each stepping in at a different height so the
  // setbacks spiral up the tower.
  const base = 0.5;
  for (let i = 0; i < 3; i++) {
    const phi = Math.PI / 2 + (i * TAU) / 3;
    const dx = Math.cos(phi);
    const dz = Math.sin(phi);
    let y = base;
    for (let j = 0; j < 7; j++) {
      const L = 11.4 - j * 1.15;
      const W = 7.0 - j * 0.35;
      const y1 = 22 + j * 20 + i * 6.5;
      const h = y1 - y;
      const r = W * 0.45;
      k.rbox(glass, L, h, W, r, 0, (dx * L) / 2, y, (dz * L) / 2, { ry: -phi });
      const n = Math.max(1, Math.round(h / 5.5));
      for (let b = 1; b <= n; b++) {
        k.rbox(silver, L + 0.5, 0.7, W + 0.5, r + 0.25, 0, (dx * L) / 2, y + (b * h) / n - 0.7, (dz * L) / 2, { ry: -phi });
      }
      y = y1;
    }
  }
  // The core climbs on past the wings in shrinking hexagons, then the needle.
  const core: Array<readonly [number, number, number]> = [
    [base, 80, 5.4],
    [80, 130, 4.7],
    [130, 160, 4.0],
    [160, 172, 3.2],
    [172, 182, 2.5],
  ];
  for (const [a, b, r] of core) {
    k.cyl(glass, r, r, b - a, 6, 0, a, 0);
    const n = Math.max(1, Math.round((b - a) / 5.5));
    for (let i = 1; i <= n; i++) k.cyl(silver, r + 0.3, r + 0.3, 0.7, 6, 0, a + (i * (b - a)) / n - 0.7, 0);
  }
  k.cyl(steel, 1.3, 1.9, 14, 8, 0, 182, 0);
  k.cyl(silver, 0.6, 1.1, 12, 8, 0, 196, 0);
  k.cyl(silver, 0.06, 0.5, 12, 6, 0, 208, 0);
};

// ---------------------------------------------------------------------------
// The Eiffel Tower

const irontower: Builder = (k) => {
  const iron = 0xc0703a;
  const brace = 0xe39a5b;
  const deck = 0x8f4a2b;
  // Each leg is a square lattice column: rings of (height, outer, inner) offsets.
  const legRings: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = [
    [
      [0.5, 12.3, 8.7],
      [6.4, 10.9, 7.6],
      [12.2, 9.6, 6.5],
      [18, 8.5, 5.6],
    ],
    [
      [20.4, 7.7, 5.0],
      [26.3, 6.6, 4.2],
      [32.2, 5.6, 3.4],
      [38, 4.7, 2.7],
    ],
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      k.cbox(0xcdbfa6, 4.6, 0.7, 4.6, 0.2, sx * 10.5, 0, sz * 10.5);
      for (const rings of legRings) {
        const corners = ([y, o, i]: readonly [number, number, number]): V3[] => [
          [sx * o, y, sz * o],
          [sx * i, y, sz * o],
          [sx * i, y, sz * i],
          [sx * o, y, sz * i],
        ];
        for (let s = 0; s < rings.length - 1; s++) {
          const b = corners(rings[s]);
          const t = corners(rings[s + 1]);
          for (let c = 0; c < 4; c++) k.beam(iron, b[c], t[c], 0.75);
          // Cross braces on the two outer faces, where the camera sees them.
          k.beam(brace, b[0], t[1], 0.42);
          k.beam(brace, b[1], t[0], 0.42);
          k.beam(brace, b[0], t[3], 0.42);
          k.beam(brace, b[3], t[0], 0.42);
          for (let c = 0; c < 4; c++) k.beam(iron, t[c], t[(c + 1) % 4], 0.5);
        }
      }
    }
  }
  // Big arches between the legs.
  for (let side = 0; side < 4; side++) {
    k.within(placement(0, 0, 0, { ry: (side * Math.PI) / 2 }), () => {
      k.add(new THREE.TorusGeometry(8.2, 0.55, 4, 14, Math.PI), iron, translate(0, 4.0, 9.7));
    });
  }
  // Two decks with gold rails.
  k.box(deck, 18.4, 2.4, 18.4, 0, 18, 0);
  k.box(0xd6844a, 18.8, 0.5, 18.8, 0, 18.9, 0);
  parapet(k, GOLD, 18.4, 18.4, 20.4, 0.55, 0.3);
  k.box(deck, 10.6, 2.0, 10.6, 0, 38, 0);
  k.box(0xd6844a, 11.0, 0.45, 11.0, 0, 38.7, 0);
  parapet(k, GOLD, 10.6, 10.6, 40, 0.5, 0.28);
  // One square column tapering to the top.
  const shaft: ReadonlyArray<readonly [number, number]> = [
    [40, 3.8],
    [48, 3.05],
    [56, 2.45],
    [64, 1.95],
    [72, 1.5],
    [79.5, 1.15],
  ];
  const sq = ([y, o]: readonly [number, number]): V3[] => [
    [o, y, o],
    [-o, y, o],
    [-o, y, -o],
    [o, y, -o],
  ];
  for (let s = 0; s < shaft.length - 1; s++) {
    const b = sq(shaft[s]);
    const t = sq(shaft[s + 1]);
    for (let c = 0; c < 4; c++) {
      const c2 = (c + 1) % 4;
      k.beam(iron, b[c], t[c], 0.62);
      k.beam(brace, b[c], t[c2], 0.36);
      k.beam(brace, b[c2], t[c], 0.36);
      k.beam(iron, t[c], t[c2], 0.45);
    }
  }
  // Lookout cabin, gold cap and antenna.
  k.box(deck, 3.4, 0.5, 3.4, 0, 79.4, 0);
  k.box(0xffe8a8, 2.4, 1.8, 2.4, 0, 79.9, 0);
  k.cyl(GOLD, 0.4, 1.6, 1.4, 8, 0, 81.7, 0, { ry: Math.PI / 8 });
  k.cyl(PAL.metal, 0.12, 0.3, 6.4, 6, 0, 83.1, 0);
  k.gem(0xff4d4d, 0.4, [0, 89.6, 0]);
};

// ---------------------------------------------------------------------------
// The Great Pyramid

const pyramid: Builder = (k) => {
  const sand = 0xf6dfa4;
  const steps = [0xf3c56c, 0xe8b457] as const;
  k.box(sand, 27, 0.2, 27, 0, 0, 0, undefined, ON_GROUND);
  // Stepped pyramid: eleven courses, then a gold cap that carries the slope
  // on up to a point, so the whole reads as one big triangle.
  const n = 11;
  const sh = 1.3;
  const side = (i: number) => 22 - i * 1.75;
  for (let i = 0; i < n; i++) k.box(steps[i % 2], side(i), sh, side(i), 0, 0.2 + i * sh, 0, undefined, ON_GROUND);
  const capBase = 0.2 + n * sh;
  const capSide = side(n - 1) - 0.6;
  k.cyl(GOLD, 0, (capSide * Math.SQRT2) / 2, (capSide / 2) * 1.35, 4, 0, capBase, 0, { ry: Math.PI / 4 });
  // A little dark doorway high on the front, with a lintel.
  k.within(translate(0, 0.2 + 2 * sh, side(2) / 2), () => {
    k.plate(0x4a3526, 1.3, 1.0, 0.15, 0.08, 0, 0.1, 0);
    k.box(0xd9a24c, 1.9, 0.25, 0.2, 0, 1.1, 0, undefined, FLUSH);
  });
  // The sphinx lies along the left side, looking out over the front.
  const sx = -12;
  const lion = 0xe9bf73;
  k.cbox(lion, 2.2, 1.5, 5.0, 0.35, sx, 0.2, 7.2);
  k.cbox(lion, 2.4, 1.4, 1.9, 0.35, sx, 0.2, 5.0);
  for (const px of [-0.55, 0.55]) k.cbox(lion, 0.7, 0.55, 2.4, 0.2, sx + px, 0.2, 10.6);
  k.cbox(lion, 1.7, 1.2, 1.7, 0.3, sx, 1.5, 9.1);
  k.cbox(0xf0cf86, 1.3, 1.5, 1.3, 0.3, sx, 2.1, 9.4);
  // Striped headdress falling to the shoulders.
  k.hull(0x3f7fd9, [
    [sx - 0.95, 2.0, 8.6],
    [sx + 0.95, 2.0, 8.6],
    [sx - 0.95, 2.0, 9.6],
    [sx + 0.95, 2.0, 9.6],
    [sx - 0.7, 3.8, 9.0],
    [sx + 0.7, 3.8, 9.0],
    [sx - 0.7, 3.8, 9.6],
    [sx + 0.7, 3.8, 9.6],
  ]);
  k.box(GOLD, 1.95, 0.25, 1.05, sx, 2.6, 9.1);
  k.box(GOLD, 1.95, 0.25, 1.05, sx, 3.2, 9.1);
  for (const ex of [-0.3, 0.3]) k.gem(PAL.ink, 0.13, [sx + ex, 3.0, 10.08]);
  // Palms at the corners.
  palm(k, 12.2, 11.6, 5.2, -0.6);
  palm(k, 11.8, 7.4, 4.2, 0.5);
  palm(k, -11.8, -11.6, 4.8, 0.6);
  palm(k, 12.2, -11.8, 4.4, -0.7);
};

// ---------------------------------------------------------------------------
// The Taj Mahal

/** The Taj Mahal's square grew; scaling the whole palace keeps its proportions. */
const TAJ_SCALE = 1.115;

const pearlpalace: Builder = (k) => {
  k.within(placement(0, 0, 0, undefined, [TAJ_SCALE, TAJ_SCALE, TAJ_SCALE]), () => {
    const marble = 0xfbf7ef;
    const dome = 0xffffff;
    const inlay = 0xc9bff0;
    const sandstone = 0xf2a488;
    const pz = -3.5;
    // Pink sandstone terrace, the white plinth on it, then the palace.
    k.rbox(sandstone, 22, 0.8, 19, 0.6, 0.2, 0, 0, pz);
    k.rbox(marble, 21, 1.4, 18, 0.5, 0.2, 0, 0.8, pz);
    const by = 2.2;
    k.rbox(marble, 11.4, 8.8, 11.4, 2.4, 0, 0, by, pz, { seg: 1 });
    k.within(translate(0, 0, pz), () => {
      for (const wall of walls(11.4, 11.4)) {
        k.within(wall.m, () => {
          arch(k, GOLD, 5.0, 7.6, 0.08, 0, by + 0.3, 0, true);
          arch(k, inlay, 4.2, 7.0, 0.14, 0, by + 0.3, 0, true);
          arch(k, 0x6a5fae, 2.0, 3.4, 0.2, 0, by + 0.3, 0, true);
          for (const u of [-2.6, 2.6]) {
            for (const y of [by + 0.6, by + 4.3]) arch(k, inlay, 1.1, 2.7, 0.14, u + Math.sign(u) * 0.2, y, 0, true);
          }
        });
      }
    });
    k.rbox(0xf6e9c8, 11.8, 0.6, 11.8, 2.5, 0.2, 0, by + 8.8, pz, { seg: 1 });
    const ry = by + 9.4;
    // Four little domed kiosks round the drum.
    for (const cx of [-3.9, 3.9]) {
      for (const cz of [-3.9, 3.9]) {
        k.cyl(marble, 1.2, 1.25, 1.5, 8, cx, ry, pz + cz);
        k.lathe(
          dome,
          [
            [1.2, ry + 1.5],
            [1.45, ry + 2.0],
            [1.3, ry + 2.7],
            [0.7, ry + 3.4],
            [0, ry + 3.8],
          ],
          10,
          cx,
          pz + cz,
        );
        k.gem(GOLD, 0.25, [cx, ry + 4.0, pz + cz]);
      }
    }
    // The big onion dome on its drum.
    k.cyl(marble, 3.6, 3.7, 2.2, 16, 0, ry, pz);
    k.cyl(GOLD, 3.75, 3.75, 0.3, 16, 0, ry + 1.9, pz);
    const dy = ry + 2.2;
    k.lathe(
      dome,
      [
        [3.6, dy],
        [4.5, dy + 1.2],
        [5.0, dy + 2.8],
        [4.9, dy + 4.4],
        [4.3, dy + 6.0],
        [3.2, dy + 7.4],
        [1.8, dy + 8.6],
        [0.7, dy + 9.6],
        [0, dy + 10.2],
      ],
      16,
      0,
      pz,
    );
    finial(k, 0, dy + 9.9, pz, 3.4);
    // Slim minarets at the plinth corners.
    for (const mx of [-9.4, 9.4]) {
      for (const mz of [-7.6, 7.6]) {
        const x = mx;
        const z = pz + mz;
        k.cyl(marble, 0.72, 0.95, 17.4, 8, x, 2.2, z);
        for (const y of [7.6, 13.0, 18.3]) k.cyl(0xf6e9c8, 1.25, 1.1, 0.45, 8, x, y, z);
        k.cyl(marble, 0.8, 0.8, 1.0, 8, x, 19.6, z);
        k.lathe(
          dome,
          [
            [0.85, 20.6],
            [1.0, 21.0],
            [0.6, 21.8],
            [0, 22.3],
          ],
          8,
          x,
          z,
        );
        k.gem(GOLD, 0.22, [x, 22.5, z]);
      }
    }
    // Reflecting pool down the middle of a lawn, lined with cypresses.
    k.box(GRASS, 10, 0.2, 7.3, 0, 0, 9.2, undefined, ON_GROUND);
    k.box(marble, 3.2, 0.32, 7.3, 0, 0, 9.2, undefined, ON_GROUND);
    k.box(PAL.water, 2.2, 0.36, 6.9, 0, 0, 9.3, undefined, ON_GROUND);
    for (const x of [-3.2, 3.2]) for (const z of [7.2, 9.6, 12.0]) cypress(k, x, 0.2, z, 2.6);
  });
};

// ---------------------------------------------------------------------------
// The Big Buddha

const BRONZE = 0x4f9b85;
const BRONZE_LIGHT = 0x6fbf9f;
const BRONZE_DARK = 0x39776a;
const STONE_WHITE = 0xf3efe6;
const STONE_RIM = 0xd9d3c4;
const LOTUS = 0xf29bb5;

/** A dark closed-eye or smile curve on a face: half a thin ring, turned so its ends point up. */
function faceArc(k: Kit, r: number, tube: number, x: number, y: number, z: number): void {
  k.add(new THREE.TorusGeometry(r, tube, 3, 6, Math.PI), PAL.ink, placement(x, y, z, { rz: Math.PI }));
}

/**
 * A lotus petal lying round the throne at angle `a`: (radial, height,
 * sideways) points turned into place, bottom at y.
 */
function petal(k: Kit, color: number, a: number, r0: number, r1: number, y: number, rise: number, w: number): void {
  const at = (r: number, h: number, t: number): V3 => [
    r * Math.sin(a) + t * Math.cos(a),
    y + h,
    r * Math.cos(a) - t * Math.sin(a),
  ];
  k.hull(color, [
    at(r0, 0, -w),
    at(r0, 0, w),
    at((r0 + r1) / 2 + 0.3, rise * 0.55, -w * 0.9),
    at((r0 + r1) / 2 + 0.3, rise * 0.55, w * 0.9),
    at(r1, rise, 0),
    at(r0 - 0.4, rise * 0.7, 0),
  ]);
}

/**
 * The Big Buddha, after Hong Kong's Tian Tan Buddha: a calm bronze-green
 * figure sitting cross-legged on a pink lotus throne, one hand raised, with a
 * round head, a topknot, long ears and a serene face turned to the camera. It
 * sits on three round white stone tiers with a wide staircase at the front,
 * incense urns and small attendant figures on the tiers, and a tree at each
 * corner.
 */
const buddha: Builder = (k) => {
  // Three round white tiers, each with a low balustrade that opens for the stairs.
  const stairW = 4.4;
  const tiers: ReadonlyArray<readonly [number, number]> = [
    [11.5, 0],
    [9.5, 1.2],
    [7.5, 2.4],
  ];
  for (const [r, y] of tiers) {
    k.cyl(STONE_WHITE, r, r, 1.2, 24, 0, y, 0);
    const gap = Math.asin((stairW / 2 + 0.2) / r);
    latheAt(
      k,
      STONE_RIM,
      [
        [r + 0.05, y + 1.2],
        [r + 0.05, y + 1.6],
        [r - 0.35, y + 1.6],
        [r - 0.35, y + 1.2],
      ],
      20,
      { phi: [gap, TAU - 2 * gap] },
    );
  }
  // The wide staircase up the front, between two sloping side walls.
  for (let i = 0; i < 6; i++) k.box(STONE_WHITE, stairW, 3.6 - i * 0.6, 0.8, 0, 0, 7.4 + i * 0.8);
  for (const sx of [-1, 1]) {
    const x0 = sx * (stairW / 2 + 0.05);
    const x1 = sx * (stairW / 2 + 0.45);
    k.hull(STONE_RIM, [
      [x0, 0, 11.8],
      [x1, 0, 11.8],
      [x0, 0.9, 11.8],
      [x1, 0.9, 11.8],
      [x0, 0, 7.0],
      [x1, 0, 7.0],
      [x0, 4.4, 7.0],
      [x1, 4.4, 7.0],
    ]);
  }
  // Incense urns on the lowest tier, each with a puff of smoke.
  for (const deg of [40, 90, 140, 220, 270, 320]) {
    const a = (deg * Math.PI) / 180;
    const x = 10.5 * Math.sin(a);
    const z = 10.5 * Math.cos(a);
    latheAt(
      k,
      BRONZE_DARK,
      [
        [0.35, 1.2],
        [0.75, 1.7],
        [0.8, 2.2],
        [0.6, 2.4],
        [0, 2.4],
      ],
      8,
      { x, z },
    );
    k.ico(0xf4f4f4, 0.35, 0, [x, 3.0, z]);
  }
  // Small attendant figures kneeling on the middle tier, holding up gold offerings.
  for (const deg of [55, 125, 235, 305]) {
    const a = (deg * Math.PI) / 180;
    const x = 8.5 * Math.sin(a);
    const z = 8.5 * Math.cos(a);
    k.cyl(BRONZE_LIGHT, 0.35, 0.6, 1.3, 8, x, 2.4, z);
    k.sphere(BRONZE_LIGHT, 0.38, [x, 4.0, z], 8, 5);
    k.gem(GOLD, 0.28, [x - 0.6 * Math.sin(a), 3.6, z - 0.6 * Math.cos(a)]);
  }
  // A round tree at each corner.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * 10.3;
      const z = sz * 10.3;
      k.cyl(0x8a5a3b, 0.25, 0.35, 1.6, 6, x, 0, z);
      k.ico(sz > 0 ? PAL.leafLight : PAL.leaf, 1.75, 1, [x, 2.9, z], [1, 0.9, 1], sx);
    }
  }
  // The lotus throne: two rings of pink petals round a bronze drum, and a gold cushion.
  k.cyl(BRONZE_DARK, 5.2, 5.4, 0.9, 16, 0, 3.6, 0);
  for (let i = 0; i < 12; i++) {
    const a = (i * TAU) / 12;
    petal(k, LOTUS, a, 4.8, 7.0, 3.7, 2.0, 0.95);
    petal(k, lighter(LOTUS, 0.35), a + TAU / 24, 3.8, 5.4, 4.3, 1.6, 0.75);
  }
  k.cyl(0xe8c35a, 4.3, 4.4, 0.7, 16, 0, 4.5, 0);
  // The figure, drawn at unit size and scaled up onto the cushion.
  const S = 1.69;
  k.within(placement(0, 5.2, -0.4, undefined, [S, S, S]), () => {
    // Crossed legs as one broad lap, with the soles turned up.
    k.sphere(BRONZE, 1, [0, 1.2, 0.8], 14, 6, { scale: [4.0, 1.5, 2.6] });
    for (const sx of [-1, 1]) k.sphere(BRONZE_LIGHT, 0.8, [sx * 1.6, 2.5, 2.6], 8, 4, { scale: [1.3, 0.5, 0.8] });
    // A robed body, a little flattened front to back.
    const body = new THREE.LatheGeometry(
      [
        [3.0, 1.2],
        [3.3, 3.2],
        [3.1, 6.2],
        [2.8, 7.8],
        [2.0, 8.9],
        [0.9, 9.4],
        [0, 9.5],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      12,
    );
    k.add(body, BRONZE, placement(0, 0, 0.2, undefined, [1, 1, 0.72]));
    // The left hand rests in the lap; the right is raised, palm out.
    spike(k, BRONZE, [-3.0, 7.4, 0.2], [-3.6, 4.2, 1.0], 0.8, 0.7, 8);
    spike(k, BRONZE, [-3.6, 4.2, 1.0], [-1.8, 3.0, 2.6], 0.7, 0.6, 8);
    k.sphere(BRONZE_LIGHT, 0.7, [-1.5, 3.0, 2.8], 8, 4, { scale: [1.2, 0.5, 1] });
    spike(k, BRONZE, [3.0, 7.4, 0.2], [3.8, 4.6, 1.2], 0.8, 0.7, 8);
    spike(k, BRONZE, [3.8, 4.6, 1.2], [3.4, 7.2, 2.8], 0.7, 0.6, 8);
    k.cbox(BRONZE_LIGHT, 1.2, 1.5, 0.45, 0.12, 3.4, 7.1, 2.9);
    // Neck, head, hair, topknot and long ears.
    k.cyl(BRONZE, 0.95, 0.95, 1.0, 10, 0, 9.2, 0.2);
    // The head tips up a little, so the face turns toward the high camera.
    k.within(placement(0, 12.0, 0.3, { rx: -0.3 }), () => {
      k.sphere(BRONZE_LIGHT, 2.1, [0, 0, 0], 14, 8);
      k.sphere(BRONZE_DARK, 2.18, [0, 0.45, -0.25], 14, 4, { hemi: true, rot: { rx: -0.4 } });
      k.sphere(BRONZE_DARK, 1.0, [0, 2.35, -0.3], 8, 5);
      for (const sx of [-1, 1]) k.sphere(BRONZE_LIGHT, 1, [sx * 2.1, -0.6, -0.1], 8, 5, { scale: [0.35, 1.35, 0.55] });
      // A serene face: closed eyes, a small smile, and a gold dot between the brows.
      for (const sx of [-1, 1]) faceArc(k, 0.38, 0.08, sx * 0.8, -0.1, 1.97);
      faceArc(k, 0.45, 0.07, 0, -1.05, 1.82);
      k.gem(GOLD, 0.2, [0, 0.45, 2.06]);
    });
  });
};

// ---------------------------------------------------------------------------
// The Reichstag

const SANDSTONE = 0xe9d8b4;
const SANDSTONE_LIGHT = 0xf5ead0;
const SANDSTONE_DARK = 0xcdb88e;
const WINDOW_DARK = 0x3d5a78;
const DOME_GLASS = 0xa9dff5;
const STEEL = 0x8f98a5;

/**
 * The Reichstag: a long pale sandstone block with a square tower at each
 * corner flying a black, red and gold flag, a columned portico with a
 * pediment and wide steps at the front (+z), a lawn with paths before it, and
 * on the roof the glass dome with its steel ribs and the spiral ramp showing
 * through.
 */
const reichstag: Builder = (k) => {
  const W = 25;
  const D = 13;
  const cz = -3.2;
  const front = cz + D / 2;
  // Lawn and paths in front.
  k.box(GRASS, 29, 0.12, 3.4, 0, 0, 10.3, undefined, ON_GROUND);
  k.box(PAL.stone, 3.0, 0.16, 3.4, 0, 0, 10.3, undefined, ON_GROUND);
  k.box(PAL.stone, 29, 0.16, 1.0, 0, 0, 10.6, undefined, ON_GROUND);
  // Plinth, main block, cornice and roof.
  k.rbox(SANDSTONE_DARK, W + 1, 1.4, D + 1, 0.4, 0.1, 0, 0, cz, { seg: 1 });
  k.rbox(SANDSTONE, W, 10.6, D, 0.4, 0, 0, 1.4, cz, { seg: 1 });
  k.rbox(SANDSTONE_LIGHT, W + 0.6, 0.6, D + 0.6, 0.5, 0.15, 0, 12.0, cz, { seg: 1 });
  k.box(0x9aa1ab, W - 1, 0.05, D - 1, 0, 12.6, cz, undefined, ON_GROUND);
  const T = 4.6;
  const tx = W / 2 - 1.6;
  const tz = D / 2 - 1.6;
  // Two rows of tall windows, clear of the towers and the portico.
  k.within(translate(0, 0, cz), () => {
    for (const wall of walls(W, D)) {
      k.within(wall.m, () => {
        const reach = wall.len / 2 - T + 0.6;
        for (let u = -reach + 1.1; u <= reach - 1.1 + 0.01; u += 2.2) {
          if (wall.side === 'front' && Math.abs(u) < 7.4) continue;
          for (const y of [3.0, 7.4]) k.plate(WINDOW_DARK, 1.1, 2.6, 0.2, 0.12, u, y, 0, 1);
        }
      });
    }
  });
  // Corner towers with windows on their outer faces and flags on top.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * tx;
      const z = cz + sz * tz;
      k.rbox(SANDSTONE, T, 14.6, T, 0.3, 0, x, 1.4, z, { seg: 1 });
      k.rbox(SANDSTONE_LIGHT, T + 0.5, 0.6, T + 0.5, 0.4, 0.15, x, 16.0, z, { seg: 1 });
      k.within(translate(x, 0, z), () => {
        for (const wall of walls(T, T)) {
          const outward =
            (wall.side === 'front' && sz > 0) ||
            (wall.side === 'back' && sz < 0) ||
            (wall.side === 'right' && sx > 0) ||
            (wall.side === 'left' && sx < 0);
          if (!outward) continue;
          k.within(wall.m, () => {
            for (const y of [3.0, 7.4, 12.2]) k.plate(WINDOW_DARK, 1.2, y > 12 ? 1.8 : 2.6, 0.2, 0.12, 0, y, 0, 1);
          });
        }
      });
      k.box(PAL.ink, 0.1, 2.8, 0.1, x, 16.6, z, undefined, ['ny']);
      [0x1a1a1a, 0xdd0000, 0xffce00].forEach((col, i) => k.box(col, 1.6, 0.32, 0.06, x + 0.85, 18.9 - i * 0.32, z));
    }
  }
  // The portico: a podium, wide steps, six columns, an entablature with its inscription band, and a pediment.
  const pz = front + 1.6;
  k.box(SANDSTONE_DARK, 13.4, 2.6, 3.2, 0, 0, pz);
  for (let i = 1; i <= 4; i++) k.box(SANDSTONE_LIGHT, 12.0, 2.6 - (i - 1) * 0.65, 0.5, 0, 0, pz + 1.6 + (i - 0.5) * 0.5);
  for (let i = 0; i < 6; i++) k.cyl(SANDSTONE_LIGHT, 0.42, 0.48, 7.4, 8, -5.5 + i * 2.2, 2.6, pz + 0.9);
  k.box(SANDSTONE_LIGHT, 13.4, 1.2, 3.4, 0, 10.0, pz);
  k.box(0x5d4a30, 8.0, 0.4, 0.05, 0, 10.4, pz + 1.7, undefined, FLUSH);
  k.hull(SANDSTONE, [
    [-6.7, 11.2, pz - 1.7],
    [6.7, 11.2, pz - 1.7],
    [-6.7, 11.2, pz + 1.7],
    [6.7, 11.2, pz + 1.7],
    [0, 14.0, pz - 1.7],
    [0, 14.0, pz + 1.7],
  ]);
  // The glass dome: a steel drum, a glassy dome, steel ribs and rings, and the spiral ramp.
  const dy = 13.8;
  const R = 6.0;
  const sy = 1.45;
  k.cyl(STEEL, R + 0.4, R + 0.4, 1.2, 16, 0, 12.6, cz);
  k.sphere(DOME_GLASS, R, [0, dy, cz], 16, 6, { hemi: true, scale: [1, sy, 1] });
  for (let i = 0; i < 6; i++) {
    k.add(new THREE.TorusGeometry(R + 0.06, 0.1, 3, 10, Math.PI), STEEL, placement(0, dy, cz, { ry: (i * Math.PI) / 6 }, [1, sy, 1]));
  }
  for (const deg of [25, 50, 70]) {
    const p = (deg * Math.PI) / 180;
    k.ring(STEEL, (R + 0.06) * Math.cos(p), 0.1, [0, dy + R * sy * Math.sin(p), cz], { rx: Math.PI / 2 }, 3, 16);
  }
  const turns = 2.2;
  const steps = 20;
  const helix = (t: number): V3 => {
    const p = (5 + 70 * t) * (Math.PI / 180);
    const a = turns * TAU * t;
    const rr = (R + 0.1) * Math.cos(p);
    return [rr * Math.sin(a), dy + R * sy * Math.sin(p), cz + rr * Math.cos(a)];
  };
  for (let i = 0; i < steps; i++) spike(k, 0x5d6470, helix(i / steps), helix((i + 1) / steps), 0.1, 0.1, 4);
  k.ring(STEEL, 1.3, 0.12, [0, dy + R * sy - 0.1, cz], { rx: Math.PI / 2 }, 3, 10);
};

// ---------------------------------------------------------------------------
// The Sydney Opera House

/**
 * One sail roof: a glazed opening facing -dir at x0, the pointed crown
 * leaning out over it, and a ridge sweeping down to the podium `len` further
 * along x. The overhanging crown is what makes it read as a shell.
 */
function sail(k: Kit, x0: number, y0: number, zc: number, hw: number, len: number, H: number, dir: 1 | -1, color: number): void {
  const X = (u: number) => x0 + dir * u;
  const lip = len * 0.28;
  const pts: V3[] = [
    [X(0), y0, zc - hw],
    [X(0), y0, zc + hw],
  ];
  for (let i = 0; i <= 7; i++) {
    const t = i / 7;
    const ur = -lip + (len + lip) * t;
    // Falls away from the crown at once, so the crown comes to a point.
    const y = y0 + H * (1 - t) ** 0.6;
    const ug = len * t;
    const w = hw * (1 - t) ** 0.7;
    pts.push([X(ur), y, zc], [X(ug), y0, zc - w], [X(ug), y0, zc + w]);
    // Across the shell the section is a pointed arch, so the sides curve in to the ridge.
    for (const f of [0.3, 0.62]) {
      const uf = ug + (ur - ug) * f;
      const wf = w * (1 - f) ** 0.55;
      pts.push([X(uf), y0 + (y - y0) * f, zc - wf], [X(uf), y0 + (y - y0) * f, zc + wf]);
    }
  }
  k.hull(color, pts);
  // Dark glass filling the opening under the crown, a little proud of it.
  const n = Math.hypot(H, lip);
  const nu = -H / n;
  const ny = -lip / n;
  const g: V3[] = [];
  for (const off of [0.06, 0.3]) {
    const du = nu * off;
    const dy = ny * off;
    g.push(
      [X(du), y0 + Math.max(0, dy), zc - hw * 0.84],
      [X(du), y0 + Math.max(0, dy), zc + hw * 0.84],
      [X(-lip * 0.8 + du), y0 + H * 0.8 + dy, zc],
    );
  }
  k.hull(0x4f86c6, g);
}

const opera: Builder = (k) => {
  const podium = 0xf2c3a6;
  const shellA = 0xffffff;
  const shellB = 0xf4f1ea;
  // A pink-beige podium with a broad staircase on the land side.
  k.rbox(podium, 23.6, 3.0, 19.4, 0.8, 0.25, 1.8, 0, 0);
  for (const wall of walls(23.6, 19.4)) {
    k.within(translate(1.8, 0, 0), () =>
      k.within(wall.m, () => {
        const n = Math.round(wall.len / 3.2);
        for (let i = 0; i < n; i++) k.plate(0x9a6a64, 2.2, 1.3, 0.3, 0.1, -wall.len / 2 + ((i + 0.5) * wall.len) / n, 0.8, 0);
      }),
    );
  }
  for (let i = 0; i < 4; i++) k.box(0xf9dcc9, 1.1, 0.75 * (i + 1), 16.4, -12.9 + i * 0.85, 0, 0, undefined, ON_GROUND);
  // Two halls of nested shells rising toward the harbour end, each met by a
  // smaller shell facing back the other way.
  const y0 = 3.0;
  const hallA: ReadonlyArray<readonly [number, number, number, number]> = [
    [-8.2, 3.6, 6.5, 7],
    [-4.2, 3.9, 7.5, 9.5],
    [0.4, 4.2, 8.2, 12.4],
  ];
  hallA.forEach(([x, hw, len, H], i) => sail(k, x, y0, -4.2, hw, len, H, 1, i % 2 ? shellB : shellA));
  sail(k, 12.9, y0, -4.2, 3.9, 5.0, 11.0, -1, shellB);
  const hallB: ReadonlyArray<readonly [number, number, number, number]> = [
    [-6.6, 3.3, 6, 6],
    [-2.9, 3.6, 7, 8.2],
    [1.3, 3.9, 7.6, 10.4],
  ];
  hallB.forEach(([x, hw, len, H], i) => sail(k, x, y0, 4.5, hw, len, H, 1, i % 2 ? shellA : shellB));
  sail(k, 12.5, y0, 4.5, 3.6, 4.6, 9.4, -1, shellA);
};

// ---------------------------------------------------------------------------
// St Basil's Cathedral

const onion: Builder = (k) => {
  const brick = 0xdc4b3e;
  const trim = 0xfff3dc;
  // Raised red gallery with white arches all round.
  k.rbox(brick, 18.4, 3.0, 18.4, 3.4, 0.25, 0, 0, 0, { seg: 2 });
  for (const wall of walls(18.4, 18.4)) {
    k.within(wall.m, () => {
      for (const u of [-4.5, -1.5, 1.5, 4.5]) arch(k, trim, 1.8, 2.2, 0.12, u, 0.3);
      if (wall.side === 'front') k.box(trim, 5.2, 0.8, 2.0, 0, 0, 0.9, undefined, ON_GROUND);
    });
  }
  k.rbox(trim, 18.8, 0.4, 18.8, 3.5, 0.15, 0, 3.0, 0, { seg: 2 });
  const y0 = 3.4;
  // Octagonal drum with a white band near the top and a neck for the dome.
  const drum = (x: number, z: number, r: number, h: number, body: number) => {
    k.cyl(body, r, r * 1.05, h, 8, x, y0, z);
    k.cyl(trim, r * 1.08, r * 1.08, 0.45, 8, x, y0 + h * 0.62, z);
    k.cyl(trim, r * 1.12, r * 1.12, 0.5, 8, x, y0 + h - 0.5, z);
    k.cyl(body, r * 0.75, r * 0.8, 0.8, 8, x, y0 + h, z);
    return y0 + h + 0.8;
  };
  // Central tent spire, striped, with a small gold onion on top.
  const cy = drum(0, -0.5, 2.7, 10.8, 0xf2a23a);
  const tent = 9.2;
  for (let i = 0; i < 8; i++) {
    k.cyl(i % 2 ? 0x46b97a : trim, 0.55, 2.3, tent, 1, 0, cy, -0.5, { theta: [(i * TAU) / 8, TAU / 8] });
  }
  onionDome(k, [GOLD, 0xffe58a], 0, cy + tent - 0.2, -0.5, 1.0, 2.4, 8, 1.2);
  finial(k, 0, cy + tent + 2.1, -0.5, 1.2);
  // Four big towers on the axes and four small ones between, every dome a
  // different candy swirl.
  const big: ReadonlyArray<readonly [number, number, number, number, Pair]> = [
    [0, 6.1, 8.2, brick, [0xe63946, PAL.white]],
    [6.1, -0.4, 9.2, 0xf0c64a, [0x2f7fe0, PAL.white]],
    [-6.1, -0.4, 9.0, 0x5cb85c, [0xff8a1f, 0xffd23f]],
    [0, -6.6, 9.8, brick, [0x3cbf5a, 0xffd23f]],
  ];
  for (const [x, z, h, body, c] of big) {
    const top = drum(x, z, 1.85, h, body);
    onionDome(k, c, x, top, z, 2.5, 4.7, 10, 1.5);
    finial(k, x, top + 4.5, z, 1.3);
  }
  const small: ReadonlyArray<readonly [number, number, number, Pair]> = [
    [5.1, 5.1, 6.4, [0xa259ff, PAL.white]],
    [-5.1, 5.1, 6.0, [0x17c3b2, 0xffe066]],
    [5.3, -5.6, 7.0, [0xff5d8f, 0xffd23f]],
    [-5.3, -5.6, 6.8, [0xe63946, 0x3cbf5a]],
  ];
  for (const [x, z, h, c] of small) {
    const top = drum(x, z, 1.2, h, brick);
    onionDome(k, c, x, top, z, 1.65, 3.2, 8, 1.4);
    finial(k, x, top + 3.1, z, 0.9);
  }
};

// ---------------------------------------------------------------------------
// The Clock Tower

const clocktower: Builder = (k) => {
  const sand = 0xecc47a;
  const pale = 0xf8e0a8;
  const deep = 0xc99a52;
  const roof = 0x2f7a6a;
  k.rbox(deep, 9.0, 2.4, 9.0, 0.6, 0.3, 0, 0, 0);
  k.rbox(sand, 7.0, 31.2, 7.0, 0.4, 0, 0, 2.4, 0, { seg: 1 });
  for (const wall of walls(7.0, 7.0)) {
    k.within(wall.m, () => {
      for (const u of [-2.55, 0, 2.55]) k.box(pale, 0.45, 31.2, 0.18, u, 2.4, 0, undefined, FLUSH);
      for (let r = 0; r < 5; r++) {
        for (const u of [-1.28, 1.28]) arch(k, 0x4d6f9c, 0.9, 3.0, 0.12, u, 5.0 + r * 5.6, 0, true);
      }
      if (wall.side === 'front') arch(k, 0x6b4a33, 1.8, 2.1, 0.12, 0, 0, 0, true);
    });
  }
  // The clock stage: a white face with gold rim and dark hands on every side.
  k.rbox(pale, 8.2, 8.6, 8.2, 0.5, 0.3, 0, 33.6, 0);
  const cyc = 37.9;
  for (const wall of walls(8.2, 8.2)) {
    k.within(wall.m, () => {
      k.rod(GOLD, 3.45, 0.3, 20, [0, cyc, 0.15], { rx: Math.PI / 2 });
      k.rod(PAL.white, 3.0, 0.46, 20, [0, cyc, 0.23], { rx: Math.PI / 2 });
      for (let i = 0; i < 12; i++) {
        const a = (i * TAU) / 12;
        k.gem(PAL.ink, i % 3 ? 0.14 : 0.24, [2.5 * Math.sin(a), cyc + 2.5 * Math.cos(a), 0.46]);
      }
      k.beam(PAL.ink, [0, cyc, 0.52], [-1.3, cyc + 1.0, 0.52], 0.34, 0.12);
      k.beam(PAL.ink, [0, cyc, 0.58], [0.55, cyc + 2.2, 0.58], 0.24, 0.12);
      k.gem(GOLD, 0.3, [0, cyc, 0.62]);
    });
  }
  k.box(GOLD, 8.6, 0.6, 8.6, 0, 42.2, 0);
  // Belfry, then a steep green spire with gold corner pinnacles.
  k.rbox(sand, 6.8, 3.8, 6.8, 0.4, 0, 0, 42.8, 0, { seg: 1 });
  for (const wall of walls(6.8, 6.8)) {
    k.within(wall.m, () => {
      for (const u of [-2.0, 0, 2.0]) arch(k, 0x3d4a5c, 1.2, 2.6, 0.12, u, 43.3, 0, true);
    });
  }
  k.rbox(deep, 7.6, 0.6, 7.6, 0.5, 0.2, 0, 46.6, 0);
  k.cyl(roof, 0.35, 3.5 * Math.SQRT2, 6.4, 4, 0, 47.2, 0, { ry: Math.PI / 4 });
  for (const px of [-3.2, 3.2]) for (const pz of [-3.2, 3.2]) k.cyl(GOLD, 0, 0.5, 3.0, 4, px, 47.2, pz, { ry: Math.PI / 4 });
  k.cyl(GOLD, 0.15, 0.4, 1.4, 6, 0, 53.4, 0);
  k.gem(GOLD, 0.4, [0, 55.0, 0]);
};

// ---------------------------------------------------------------------------
// The Leaning Tower

const leaning: Builder = (k) => {
  const marble = 0xfdfbf6;
  const shade = 0xc6ccd8;
  k.box(GRASS, 9, 0.3, 9, 0, 0, 0, undefined, ON_GROUND);
  k.box(0xf1e6cf, 2.2, 0.34, 4.6, 0, 0, 2.2, undefined, ON_GROUND);
  // About five degrees toward +x, with the base shifted so the top still fits.
  const tilt = 0.09;
  const shift = -(Math.sin(tilt) * 29) / 2;
  k.within(placement(shift, 0.3, 0, { rz: -tilt }), () => {
    k.cyl(marble, 3.1, 3.2, 5.0, 20, 0, 0, 0);
    for (let i = 0; i < 10; i++) {
      const a = ((2 * i + 0.5) * TAU) / 20;
      k.within(placement(3.02 * Math.sin(a), 0, 3.02 * Math.cos(a), { ry: a }), () => arch(k, shade, 1.2, 3.0, 0.12, 0, 0.9));
    }
    k.cyl(marble, 3.4, 3.4, 0.4, 20, 0, 5.0, 0);
    // Six open galleries: pale shadowed core, a ring of white columns, a ledge.
    const g = 3.2;
    for (let s = 0; s < 6; s++) {
      const y = 5.4 + s * g;
      k.cyl(shade, 2.6, 2.6, g, 14, 0, y, 0);
      for (let i = 0; i < 14; i++) {
        const a = (i * TAU) / 14;
        k.cyl(marble, 0.2, 0.2, g - 0.4, 5, 3.0 * Math.sin(a), y, 3.0 * Math.cos(a));
      }
      k.cyl(marble, 3.4, 3.35, 0.4, 20, 0, y + g - 0.4, 0);
    }
    // Belfry and a little flag.
    const by = 5.4 + 6 * g;
    k.cyl(marble, 2.2, 2.25, 3.4, 16, 0, by, 0);
    for (let i = 0; i < 8; i++) {
      const a = ((2 * i + 0.5) * TAU) / 16;
      k.within(placement(2.17 * Math.sin(a), 0, 2.17 * Math.cos(a), { ry: a }), () => arch(k, 0x3d4a5c, 0.8, 2.0, 0.12, 0, by + 0.6));
    }
    k.cyl(marble, 2.55, 2.55, 0.35, 16, 0, by + 3.4, 0);
    k.cyl(0xe8805a, 0.3, 2.3, 1.0, 16, 0, by + 3.75, 0);
    k.cyl(PAL.metal, 0.07, 0.07, 2.4, 5, 0, by + 4.6, 0);
    k.box(0xe63946, 1.2, 0.75, 0.08, 0.62, by + 6.15, 0);
  });
};

// ---------------------------------------------------------------------------
// Stonehenge

const stonecircle: Builder = (k) => {
  const stones = [0xb6bcc6, 0xa5acb8, 0xc6cbd2] as const;
  k.cyl(GRASS_DARK, 10.9, 11.0, 0.25, 24, 0, 0, 0);
  latheAt(
    k,
    GRASS,
    [
      [10.4, 0.25],
      [9.9, 0.7],
      [9.3, 0.7],
      [8.9, 0.25],
    ],
    24,
  );
  k.cyl(0x9bdc7c, 8.9, 8.9, 0.06, 24, 0, 0.25, 0);
  const y0 = 0.3;
  const tangent = (a: number) => ({ ry: a });
  // Outer ring of uprights with lintels across pairs; a few are missing or fallen.
  const R = 7.4;
  const n = 16;
  const missing = new Set([5, 11]);
  const at = (a: number, r: number): [number, number] => [r * Math.sin(a), r * Math.cos(a)];
  for (let i = 0; i < n; i++) {
    if (missing.has(i)) continue;
    const a = (i * TAU) / n;
    const [x, z] = at(a, R);
    k.cbox(stones[i % 3], 1.5, 4.4, 1.1, 0.22, x, y0, z, tangent(a));
  }
  for (let i = 0; i < n; i += 2) {
    if (missing.has(i) || missing.has(i + 1) || i === 8) continue;
    const a = ((i + 0.5) * TAU) / n;
    const [x, z] = at(a, R);
    k.cbox(stones[(i + 1) % 3], 2 * R * Math.sin(Math.PI / n) + 1.6, 0.85, 1.15, 0.2, x, y0 + 4.4, z, tangent(a));
  }
  // Fallen uprights lying in the grass.
  const [fx, fz] = at(11.3 * (TAU / n), R + 0.2);
  k.cbox(stones[1], 1.5, 1.1, 4.2, 0.22, fx, y0, fz, { ry: 0.3 });
  const [lx, lz] = at(8.5 * (TAU / n), R + 1.4);
  k.cbox(stones[2], 3.9, 0.85, 1.15, 0.2, lx, y0, lz, { ry: 0.5 });
  // Inner horseshoe of five taller trilithons, open toward the front.
  const inner = 4.0;
  [180, 128, 232, 78, 282].forEach((d, i) => {
    const a = (d * Math.PI) / 180;
    const tx = Math.cos(a);
    const tz = -Math.sin(a);
    const [x, z] = at(a, inner);
    const h = i === 0 ? 5.2 : 4.6;
    if (i === 4) {
      // This one has fallen: one stone still up, the other and the lintel down.
      k.cbox(stones[i % 3], 1.3, h, 1.1, 0.2, x - tx * 0.9, y0, z - tz * 0.9, tangent(a));
      k.cbox(stones[(i + 1) % 3], 1.3, 1.1, h, 0.2, x + tx * 1.6 + 1.2, y0, z + tz * 1.6, { ry: a + 0.6 });
      return;
    }
    for (const s of [-0.9, 0.9]) k.cbox(stones[(i + (s > 0 ? 1 : 0)) % 3], 1.3, h, 1.1, 0.2, x + tx * s, y0, z + tz * s, tangent(a));
    k.cbox(stones[(i + 2) % 3], 3.4, 0.8, 1.2, 0.2, x, y0 + h, z, tangent(a));
  });
  // Altar stone in the middle and the heel stone out front.
  k.cbox(0x8d8578, 2.6, 0.5, 1.1, 0.15, 0, y0, -0.6, { ry: 0.1 });
  k.cbox(stones[0], 1.4, 2.8, 1.2, 0.3, 0.8, y0, 9.6, { rz: 0.12 });
};

// ---------------------------------------------------------------------------
// The Easter Island heads

function moaiHead(k: Kit, x: number, z: number, y0: number, s: number, topknot: boolean): void {
  const stone = 0xa89886;
  const dark = 0x6f6259;
  const deep = 0x3f3a36;
  k.within(placement(x, y0, z, undefined, [s, s, s]), () => {
    // Shoulders and body, then the long head with its face leaning forward.
    k.rbox(stone, 3.6, 3.0, 2.5, 0.8, 0.3, 0, 0, 0);
    k.hull(stone, [
      [-1.45, 2.7, -1.05],
      [1.45, 2.7, -1.05],
      [-1.3, 2.7, 1.2],
      [1.3, 2.7, 1.2],
      [-1.4, 7.4, -1.05],
      [1.4, 7.4, -1.05],
      [-1.3, 7.4, 0.8],
      [1.3, 7.4, 0.8],
    ]);
    const fz = (y: number) => 1.2 - (0.4 * (y - 2.7)) / 4.7;
    // Heavy brow, deep eyes, a long nose, pursed lips and a strong chin.
    k.box(stone, 2.8, 0.6, 0.8, 0, 5.9, fz(6.2) - 0.25);
    for (const ex of [-0.65, 0.65]) k.box(deep, 0.85, 0.5, 0.3, ex, 5.35, fz(5.6) - 0.12);
    k.hull(stone, [
      [0, 6.0, fz(6.0) + 0.3],
      [-0.25, 6.0, fz(6.0)],
      [0.25, 6.0, fz(6.0)],
      [-0.5, 4.1, fz(4.1)],
      [0.5, 4.1, fz(4.1)],
      [0, 4.0, fz(4.0) + 0.85],
    ]);
    k.box(dark, 1.5, 0.28, 0.35, 0, 3.55, fz(3.6) - 0.1);
    k.box(stone, 1.9, 0.6, 0.5, 0, 2.75, fz(2.9) - 0.1);
    for (const ex of [-1, 1]) k.box(stone, 0.35, 2.4, 0.7, ex * 1.5, 4.0, 0);
    // Hands meeting across the tummy.
    for (const ex of [-1, 1]) k.box(dark, 1.2, 0.3, 0.12, ex * 0.8, 0.9, 1.25);
    if (topknot) {
      k.cyl(0xd35a3a, 1.2, 1.1, 1.1, 10, 0, 7.4, -0.1);
      k.cyl(0xe6744f, 0.6, 0.9, 0.3, 10, 0, 8.5, -0.1);
    }
  });
}

/**
 * One Easter Island head on a low stone base, a little bigger than the heads
 * that once stood in a row; a block holds four of them. Variant 1 wears the
 * red topknot hat (pukao).
 */
const moai: Builder = (k, v) => {
  k.box(GRASS, 4.5, 0.12, 4.5, 0, 0, 0, undefined, ON_GROUND);
  k.rbox(0x8d877d, 4.2, 0.7, 3.8, 0.4, 0.15, 0, 0.12, -0.1);
  k.box(0x7a746b, 0.14, 0.5, 0.08, 0, 0.25, 1.83);
  moaiHead(k, 0, -0.35, 0.82, 1.15, v === 1);
};

export const WONDERS_BUILDERS: Record<WonderKind, Builder> = {
  liberty,
  megaspire,
  irontower,
  pyramid,
  pearlpalace,
  buddha,
  reichstag,
  opera,
  onion,
  clocktower,
  leaning,
  stonecircle,
  moai,
};
