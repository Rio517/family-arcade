/**
 * The big Gulp Universe kinds (tier 7 and up): factories, stadiums, skyscrapers
 * and mountains. Same kit and rules as props.ts; kept apart because each one
 * is a small scene of its own.
 */
import * as THREE from 'three';
import type { PropKind } from '../domain/catalog';
import {
  type Builder,
  type Kit,
  type V3,
  FLUSH,
  ON_GROUND,
  PAL,
  darker,
  doorAt,
  lighter,
  mix,
  paneAt,
  parapet,
  placement,
  translate,
  walls,
  windowAt,
} from './kit';

export type LandmarkKind = Extract<
  PropKind,
  | 'factory'
  | 'warehouse'
  | 'watertower'
  | 'barn'
  | 'chemplant'
  | 'stadium'
  | 'powerplant'
  | 'mall'
  | 'windturbine'
  | 'jet'
  | 'skyscraper'
  | 'tvtower'
  | 'terminal'
  | 'mountain'
>;

type Profile = ReadonlyArray<readonly [number, number]>;
type Pair = readonly [number, number];

const HAZARD_YELLOW = 0xffc61a;
const HAZARD_BLACK = 0x25272e;
const TOXIC = 0x3cc444;
const TOXIC_TOP = 0x86e46a;
const TOXIC_GLOW = 0xb2ff66;
const CONCRETE = 0xd4d0c8;
const ASPHALT = 0x6f7580;
const STEAM = 0xf3f6f9;
const RED = 0xe63946;
/** Bright window glass, the same sky blue the town's buildings use. */
const GLASS = 0x6fd8ff;
/** Warm white for podiums, ledges and spires on the soft skyscrapers. */
const CREAM_WHITE = 0xfff6e6;

// ---------------------------------------------------------------------------
// Helpers only the big kinds need

/** Lathe that can be squashed into an oval and swept only part of the way round. */
function latheOval(
  k: Kit,
  color: number,
  profile: Profile,
  seg: number,
  o: { sx?: number; x?: number; z?: number; phi?: Pair } = {},
): void {
  const g = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
    o.phi?.[0] ?? 0,
    o.phi?.[1] ?? Math.PI * 2,
  );
  k.add(g, color, placement(o.x ?? 0, 0, o.z ?? 0, undefined, [o.sx ?? 1, 1, 1]));
}

/** Ring of alternating colours hugging a cylinder: hazard stripes, painted bands. */
function stripeBand(k: Kit, colors: Pair, r: number, h: number, n: number, x: number, y: number, z: number): void {
  const step = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    k.cyl(colors[i % 2], r, r, h, 1, x, y, z, { open: true, theta: [i * step, step] });
  }
}

/** Chimney or mast in alternating colour bands, tapering from rBot to rTop, with a dark mouth. */
function stripedStack(
  k: Kit,
  colors: Pair,
  rBot: number,
  rTop: number,
  h: number,
  bands: number,
  x: number,
  z: number,
  y0 = 0,
  seg = 12,
): void {
  const bh = h / bands;
  for (let i = 0; i < bands; i++) {
    const r0 = rBot + ((rTop - rBot) * i) / bands;
    const r1 = rBot + ((rTop - rBot) * (i + 1)) / bands;
    k.cyl(colors[i % 2], r1, r0, bh, seg, x, y0 + i * bh, z, { open: i < bands - 1 });
  }
  k.cyl(PAL.ink, rTop * 0.72, rTop * 0.72, 0.04, seg, x, y0 + h, z);
}

interface Arc {
  R: number;
  cy: number;
  a: number;
}
/** Circle through two eaves (yBase, +-span/2) and a crown rise above them. */
function arc(span: number, yBase: number, rise: number): Arc {
  const half = span / 2;
  const R = (half * half + rise * rise) / (2 * rise);
  return { R, cy: yBase + rise - R, a: Math.asin(half / R) };
}

/**
 * Curved slab running along x, between arc angles phiA..phiB (0 is the crown,
 * positive toward +z). Built from convex slices so the underside is solid too.
 */
function arcSlab(
  k: Kit,
  color: number,
  x0: number,
  x1: number,
  zc: number,
  c: Arc,
  rOut: number,
  thick: number,
  phiA: number,
  phiB: number,
  n: number,
): void {
  for (let i = 0; i < n; i++) {
    const p0 = phiA + ((phiB - phiA) * i) / n;
    const p1 = phiA + ((phiB - phiA) * (i + 1)) / n;
    const pts: V3[] = [];
    for (const x of [x0, x1]) {
      for (const p of [p0, p1]) {
        for (const r of [rOut, rOut - thick]) pts.push([x, c.cy + r * Math.cos(p), zc + r * Math.sin(p)]);
      }
    }
    k.hull(color, pts);
  }
}

/** Fill under an arch roof over walls of depth D, so the gable ends are closed. */
function arcFill(k: Kit, color: number, x0: number, x1: number, zc: number, c: Arc, D: number, yBase: number): void {
  const r = c.R - 0.05;
  const aw = Math.asin(Math.min(1, D / 2 / r));
  const pts: V3[] = [];
  for (const x of [x0, x1]) {
    pts.push([x, yBase, zc - D / 2], [x, yBase, zc + D / 2]);
    for (let i = 0; i <= 8; i++) {
      const p = -aw + (2 * aw * i) / 8;
      pts.push([x, c.cy + r * Math.cos(p), zc + r * Math.sin(p)]);
    }
  }
  k.hull(color, pts);
}

/** Ribbon window on the current wall frame: one long pane with glazing bars and a sill. */
function ribbon(k: Kit, glass: number, frame: number, len: number, y: number, h: number, bars: number): void {
  k.box(glass, len, h, 0.16, 0, y, 0, undefined, FLUSH);
  for (let i = 1; i < bars; i++) k.box(frame, 0.14, h, 0.22, -len / 2 + (i * len) / bars, y, 0, undefined, FLUSH);
  k.box(frame, len + 0.3, 0.12, 0.3, 0, y - 0.12, 0, undefined, FLUSH);
}

/** Roll-up loading door on the current wall frame. */
function rollDoor(k: Kit, frame: number, u: number, y: number, w: number, h: number): void {
  k.box(frame, w + 0.4, h + 0.3, 0.14, u, y, 0, undefined, FLUSH);
  k.box(0xd3d9e0, w, h, 0.2, u, y, 0, undefined, FLUSH);
  for (let i = 1; i < 5; i++) k.box(0xa9b2bd, w, 0.08, 0.24, u, y + (h * i) / 5, 0, undefined, FLUSH);
}

/** Yellow and black kerb around the edge of a W x D pad. */
function hazardKerb(k: Kit, W: number, D: number, y: number, h: number, t: number, seg: number): void {
  let i = 0;
  const next = () => (i++ % 2 ? HAZARD_BLACK : HAZARD_YELLOW);
  const run = (len: number, put: (u: number, l: number) => void) => {
    const n = Math.max(2, Math.round(len / seg));
    for (let j = 0; j < n; j++) put(-len / 2 + ((j + 0.5) * len) / n, len / n);
  };
  for (const sz of [-1, 1]) run(W, (u, l) => k.box(next(), l, h, t, u, y, sz * (D / 2 - t / 2), undefined, ON_GROUND));
  for (const sx of [-1, 1]) {
    run(D - 2 * t, (u, l) => k.box(next(), t, h, l, sx * (W / 2 - t / 2), y, u, undefined, ON_GROUND));
  }
}

/**
 * Little parked car for car parks and roads, standing on its tyres at y. The
 * tyres sit a little proud of the body so they show from the high camera.
 */
function toyCar(k: Kit, color: number, x: number, y: number, z: number, ry = 0): void {
  k.within(placement(x, y, z, { ry }), () => {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) k.rod(PAL.ink, 0.26, 0.22, 8, [sx * 0.66, 0.26, sz * 0.82], { rz: Math.PI / 2 });
    }
    k.cbox(color, 1.5, 0.5, 2.6, 0.14, 0, 0.24, 0);
    k.box(PAL.carGlass, 1.2, 0.38, 1.3, 0, 0.74, -0.15, undefined, ON_GROUND);
    k.box(color, 1.24, 0.1, 1.1, 0, 1.12, -0.15, undefined, ON_GROUND);
  });
}

/** Round low-poly tree for plazas and roof gardens. */
function smallTree(k: Kit, x: number, y: number, z: number, r: number, color: number = PAL.leaf): void {
  k.cyl(PAL.bark, r * 0.14, r * 0.2, r * 0.9, 5, x, y, z);
  k.ico(color, r, 0, [x, y + r * 1.55, z], [1, 0.9, 1]);
}

// ---------------------------------------------------------------------------
// Tier 7: factories and farms

const FACTORY = [
  { wall: 0x52639a, roof: 0x17c3b2, trim: 0xfff1d6, office: 0xffc933, stack: [0xf2433a, 0xf7f8fa] as Pair },
  { wall: 0x2f7bff, roof: 0xffc933, trim: 0xfff1d6, office: 0xff8a4c, stack: [0xff8a1f, 0xf7f8fa] as Pair },
];

const factory: Builder = (k, v) => {
  const c = FACTORY[v];
  // Main hall at the left; office and chimneys on the right.
  const hx0 = -10;
  const hx1 = 4;
  const hz0 = -7.75;
  const hz1 = 6.6;
  const W = hx1 - hx0;
  const D = hz1 - hz0;
  const cx = (hx0 + hx1) / 2;
  const cz = (hz0 + hz1) / 2;
  const top = 5.6;
  k.box(darker(c.wall, 0.3), W + 0.2, 0.35, D + 0.2, cx, 0, cz, undefined, ON_GROUND);
  k.rbox(c.wall, W, top - 0.35, D, 0.8, 0, cx, 0.35, cz, { seg: 3 });
  k.rbox(c.trim, W + 0.3, 0.3, D + 0.3, 0.95, 0, cx, top - 0.3, cz, { seg: 3 });

  // Saw-tooth roof: each tooth climbs toward the front and drops in a glazed
  // face, so the camera sees a row of bright north lights.
  const teeth = 5;
  const p = D / teeth;
  const rise = 1.9;
  for (let i = 0; i < teeth; i++) {
    const z0 = hz0 + i * p;
    const z1 = z0 + p;
    k.hull(c.roof, [
      [hx0, top, z0],
      [hx1, top, z0],
      [hx0, top, z1],
      [hx1, top, z1],
      [hx0, top + rise, z1],
      [hx1, top + rise, z1],
    ]);
    k.box(PAL.glass, W - 0.4, rise - 0.35, 0.1, cx, top + 0.12, z1 + 0.04, undefined, FLUSH);
    for (let j = 1; j < 3; j++) {
      k.box(c.trim, 0.36, rise - 0.35, 0.16, hx0 + (j * W) / 3, top + 0.12, z1 + 0.06, undefined, FLUSH);
    }
  }

  // Loading dock along the front with three roll-up doors under a canopy.
  k.box(CONCRETE, W - 1, 1.0, 1.1, cx, 0, hz1 + 0.55, undefined, ON_GROUND);
  k.box(HAZARD_YELLOW, W - 1, 0.16, 0.12, cx, 0.84, hz1 + 1.1, undefined, ON_GROUND);
  k.box(c.roof, W - 0.6, 0.22, 1.35, cx, 4.55, hz1 + 0.67, undefined);
  k.within(translate(cx, 0, cz), () => {
    for (const wall of walls(W, D)) {
      k.within(wall.m, () => {
        if (wall.side === 'front') {
          for (const u of [-4.6, 0, 4.6]) rollDoor(k, c.trim, u, 1.0, 3.0, 3.1);
          return;
        }
        const n = Math.floor(wall.len / 3.6);
        for (let i = 0; i < n; i++) {
          const u = -wall.len / 2 + ((i + 0.5) * wall.len) / n;
          paneAt(k, GLASS, c.trim, u, 1.8, 1.7, 2.1);
        }
      });
    }
  });

  // Office block.
  const ox = 7.4;
  const oz = 4.2;
  const OW = 4.8;
  const OD = 6.6;
  const OH = 6.2;
  k.box(darker(c.office, 0.2), OW + 0.2, 0.3, OD + 0.2, ox, 0, oz, undefined, ON_GROUND);
  k.rbox(c.office, OW, OH - 0.3, OD, 0.6, 0, ox, 0.3, oz, { seg: 3 });
  k.rbox(c.trim, OW + 0.4, 0.45, OD + 0.4, 0.8, 0.18, ox, OH, oz, { seg: 3 });
  k.box(c.roof, OW - 0.5, 0.04, OD - 0.5, ox, OH + 0.45, oz, undefined, ON_GROUND);
  k.within(translate(ox, 0, oz), () => {
    for (const wall of walls(OW, OD)) {
      k.within(wall.m, () => {
        ribbon(k, GLASS, c.trim, wall.len - 1.6, 3.7, 1.5, 2);
        if (wall.side === 'front') {
          doorAt(k, c.trim, c.wall, 0, 0.3, 1.1, 2.2);
        } else {
          ribbon(k, GLASS, c.trim, wall.len - 1.6, 1.1, 1.5, 2);
        }
      });
    }
  });

  // Two striped chimneys (one taller) with a puff of smoke.
  for (const [z, h] of [
    [-6.3, 12.0],
    [-2.0, 10.2],
  ] as const) {
    k.box(CONCRETE, 2.9, 0.9, 2.9, 7.3, 0, z, undefined, ON_GROUND);
    stripedStack(k, c.stack, 1.15, 0.78, h, 6, 7.3, z);
    k.rod(PAL.metal, 0.32, 2.9, 8, [5.4, 2.6, z], { rz: Math.PI / 2 });
  }
  k.ico(STEAM, 0.85, 1, [7.6, 12.65, -6.1]);
  k.ico(STEAM, 0.55, 0, [8.5, 12.35, -5.3]);
};

const WAREHOUSE = [
  { wall: 0xfff1d6, roof: 0x2f7bff, trim: 0x2f7bff, curved: true },
  { wall: 0x2ec4b6, roof: 0xff8a1f, trim: 0x178f83, curved: true },
  { wall: 0xff7a5c, roof: 0xffc933, trim: 0xc9503a, curved: false },
];

const warehouse: Builder = (k, v) => {
  const c = WAREHOUSE[v];
  const W = 23.2;
  const D = 12.6;
  const wallTop = c.curved ? 6.0 : 7.9;
  const rib = darker(c.wall, 0.12);
  k.box(darker(c.wall, 0.3), W + 0.2, 0.4, D + 0.2, 0, 0, 0, undefined, ON_GROUND);
  k.rbox(c.wall, W, wallTop - 0.4, D, 0.6, 0, 0, 0.4, 0, { seg: 3 });
  const doorsU = [-7.2, 0, 7.2];
  const doorW = 4.2;
  const doorH = 4.4;
  for (const wall of walls(W, D)) {
    k.within(wall.m, () => {
      // Cladding: a few chunky ribs, kept clear of the doors.
      const n = Math.round(wall.len / 2.6);
      for (let i = 1; i < n; i++) {
        const u = -wall.len / 2 + (i * wall.len) / n;
        const overDoor = wall.side === 'front' && doorsU.some((d) => Math.abs(u - d) < doorW / 2 + 0.35);
        const y0 = overDoor ? 0.4 + doorH + 0.3 : 0.4;
        k.box(rib, 0.36, wallTop - 0.1 - y0, 0.16, u, y0, 0, undefined, ['nz', 'ny']);
      }
      k.box(c.trim, wall.len - 1.0, 0.5, 0.3, 0, wallTop - 0.75, 0, undefined, FLUSH);
      if (wall.side === 'front') {
        for (const u of doorsU) {
          rollDoor(k, c.trim, u, 0.4, doorW, doorH);
          for (const s of [-1, 1]) {
            k.cyl(HAZARD_YELLOW, 0.17, 0.17, 1.0, 6, u + s * (doorW / 2 + 0.55), 0, 0.45);
          }
        }
      } else if (wall.side === 'right') {
        doorAt(k, c.trim, c.trim, -2.5, 0.4, 1.0, 2.1);
        paneAt(k, GLASS, PAL.white, 0.4, 1.6, 1.6, 1.2);
      }
    });
  }
  if (c.curved) {
    const a = arc(D + 0.9, wallTop - 0.05, 2.9);
    arcFill(k, c.wall, -W / 2, W / 2, 0, a, D, wallTop - 0.05);
    arcSlab(k, c.roof, -W / 2 - 0.4, W / 2 + 0.4, 0, a, a.R, 0.28, -a.a, a.a, 10);
    const band = darker(c.roof, 0.18);
    for (const x of [-8.1, -2.7, 2.7, 8.1]) arcSlab(k, band, x - 0.18, x + 0.18, 0, a, a.R + 0.08, 0.1, -a.a, a.a, 8);
    for (const s of [-1, 1]) {
      arcSlab(k, PAL.glass, -10.5, 10.5, 0, a, a.R + 0.05, 0.08, s * 0.14, s * 0.3, 1);
    }
  } else {
    parapet(k, c.trim, W, D, wallTop, 0.6, 0.3);
    k.box(c.roof, W - 0.6, 0.04, D - 0.6, 0, wallTop, 0, undefined, ON_GROUND);
    for (const x of [-7.5, 0, 7.5]) {
      for (const z of [-2.5, 2.5]) {
        k.box(PAL.white, 2.6, 0.3, 1.4, x, wallTop, z, undefined, ON_GROUND);
        k.box(PAL.glass, 2.3, 0.36, 1.1, x, wallTop, z, undefined, ON_GROUND);
      }
    }
  }
};

const WATERTOWER = [
  { tank: 0xf2f4f7, top: 0xe63946, legs: 0x8d99ae, face: false },
  { tank: 0x8fd0f0, top: 0xf7f8fa, legs: 0x6c7a8c, face: true },
];

const watertower: Builder = (k, v) => {
  const c = WATERTOWER[v];
  const legAt = (y: number) => 3.9 - (1.3 * y) / 12.4;
  const corners: ReadonlyArray<Pair> = [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ];
  const at = (s: Pair, y: number): V3 => [s[0] * legAt(y), y, s[1] * legAt(y)];
  for (const s of corners) {
    k.box(CONCRETE, 1.1, 0.5, 1.1, s[0] * 3.9, 0, s[1] * 3.9, undefined, ON_GROUND);
    k.beam(c.legs, at(s, 0), at(s, 12.4), 0.45);
  }
  const levels = [0.6, 4.5, 8.4, 12.1];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    for (let j = 1; j < levels.length; j++) {
      k.beam(c.legs, at(a, levels[j]), at(b, levels[j]), 0.25);
      k.beam(c.legs, at(a, levels[j - 1]), at(b, levels[j]), 0.13);
      k.beam(c.legs, at(b, levels[j - 1]), at(a, levels[j]), 0.13);
    }
  }
  k.cyl(c.legs, 0.45, 0.45, 12.2, 8, 0, 0, 0);
  // Tank: bowl, catwalk with railing, painted band and a cone roof.
  k.lathe(c.tank, [
    [0, 11.7],
    [0.8, 11.7],
    [3.1, 12.5],
    [4.0, 13.2],
  ], 16);
  k.cyl(darker(c.legs, 0.2), 4.6, 4.6, 0.16, 16, 0, 12.95, 0);
  k.cyl(c.tank, 4.0, 4.0, 5.6, 16, 0, 13.2, 0, { open: true });
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    k.box(c.legs, 0.1, 0.9, 0.1, 4.5 * Math.sin(a), 13.1, 4.5 * Math.cos(a));
  }
  k.cyl(c.legs, 4.52, 4.52, 0.1, 16, 0, 14.0, 0, { open: true });
  k.cyl(c.top, 4.04, 4.04, 0.7, 16, 0, 13.6, 0, { open: true });
  k.cyl(c.top, 4.3, 4.3, 0.25, 16, 0, 18.7, 0);
  k.cyl(c.top, 0.35, 4.3, 2.5, 16, 0, 18.95, 0);
  k.cyl(c.legs, 0.08, 0.2, 0.5, 6, 0, 21.4, 0);
  k.gem(RED, 0.25, [0, 21.95, 0]);
  if (c.face) {
    // A smiling tank, facing the street.
    for (const s of [-1, 1]) {
      const a = s * 0.23;
      k.cbox(PAL.ink, 0.42, 0.95, 0.14, 0.1, 4.02 * Math.sin(a), 16.3, 4.02 * Math.cos(a), { ry: a });
      k.gem(0xff9eb5, 0.28, [4.06 * Math.sin(s * 0.42), 15.5, 4.06 * Math.cos(s * 0.42)]);
    }
    for (let i = 0; i < 7; i++) {
      const t = -0.36 + 0.12 * i;
      const y = 14.75 + 0.75 * (t / 0.36) ** 2;
      k.box(PAL.ink, 0.5, 0.26, 0.14, 4.03 * Math.sin(t), y, 4.03 * Math.cos(t), { ry: t });
    }
  } else {
    k.cyl(c.top, 4.04, 4.04, 0.9, 16, 0, 16.4, 0, { open: true });
  }
  // Ladder up one leg face to the catwalk.
  for (const s of [-1, 1]) k.beam(c.legs, [s * 0.3, 0, 3.35], [s * 0.3, 12.95, 2.7], 0.1);
};

const BARN = [
  { wall: 0xc8372d, roof: 0x5d6470, silo: 0xc9d1d9, siloTop: 0xeef1f4 },
  { wall: 0xd4533a, roof: 0x3f8f5a, silo: 0x3d6fb0, siloTop: 0xeef1f4 },
];

const barn: Builder = (k, v) => {
  const c = BARN[v];
  const cx = -2.15;
  const hw = 4.75;
  const zf = 4.4;
  const eaveY = 4.6;
  const knee: Pair = [3.75, 7.4];
  const ridgeY = 8.9;
  const profile: Pair[] = [
    [-hw, 0],
    [hw, 0],
    [hw, eaveY],
    [knee[0], knee[1]],
    [0, ridgeY],
    [-knee[0], knee[1]],
    [-hw, eaveY],
  ];
  k.hull(
    c.wall,
    profile.flatMap(([x, y]): V3[] => [
      [cx + x, y, -zf],
      [cx + x, y, zf],
    ]),
  );
  // Gambrel roof: two slabs a side, pushed out by half their thickness.
  const roofD = 2 * zf + 0.9;
  const slab = (a: Pair, b: Pair, extA: number, extB: number) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const L = Math.hypot(dx, dy);
    const ux = dx / L;
    const uy = dy / L;
    let nx = uy;
    let ny = -ux;
    if (nx * (a[0] + b[0]) + ny * (a[1] + b[1] - 8) < 0) {
      nx = -nx;
      ny = -ny;
    }
    const t = 0.34;
    k.beam(
      c.roof,
      [cx + a[0] - ux * extA + (nx * t) / 2, a[1] - uy * extA + (ny * t) / 2, 0],
      [cx + b[0] + ux * extB + (nx * t) / 2, b[1] + uy * extB + (ny * t) / 2, 0],
      t,
      roofD,
    );
  };
  for (const sx of [-1, 1]) {
    slab([sx * hw, eaveY], [sx * knee[0], knee[1]], 0.6, 0.14);
    slab([sx * knee[0], knee[1]], [0, ridgeY], 0.06, 0.16);
  }
  k.box(darker(c.roof, 0.25), 0.55, 0.3, roofD + 0.05, cx, ridgeY + 0.12, 0);
  // White trim tracing the gable, the corners, and X-braced doors.
  for (const z of [zf + 0.07, -zf - 0.07]) {
    // Roofline edges: eave, knee, ridge, knee, eave.
    for (let i = 2; i < profile.length - 1; i++) {
      const a = profile[i];
      const b = profile[i + 1];
      k.beam(PAL.white, [cx + a[0], a[1], z], [cx + b[0], b[1], z], 0.28, 0.14);
    }
    for (const sx of [-1, 1]) k.box(PAL.white, 0.3, eaveY, 0.3, cx + sx * (hw - 0.1), 0, z - Math.sign(z) * 0.1);
  }
  const zd = zf + 0.08;
  const door = darker(c.wall, 0.2);
  k.box(door, 4.2, 3.9, 0.12, cx, 0, zf + 0.02);
  const trimBeam = (a: Pair, b: Pair, z: number, t = 0.2) =>
    k.beam(PAL.white, [cx + a[0], a[1], z], [cx + b[0], b[1], z], t, 0.14);
  for (const x0 of [-2.1, 0]) {
    const x1 = x0 + 2.1;
    trimBeam([x0, 0.1], [x1, 3.8], zd + 0.04, 0.16);
    trimBeam([x1, 0.1], [x0, 3.8], zd + 0.04, 0.16);
  }
  trimBeam([-2.2, 0], [-2.2, 4.0], zd, 0.25);
  trimBeam([2.2, 0], [2.2, 4.0], zd, 0.25);
  trimBeam([0, 0], [0, 4.0], zd, 0.2);
  trimBeam([-2.3, 4.0], [2.3, 4.0], zd, 0.25);
  // Hay loft with hay spilling out and a hoist beam.
  k.box(door, 1.7, 1.7, 0.12, cx, 5.1, zf + 0.02);
  trimBeam([-0.85, 5.1], [0.85, 6.8], zd + 0.04, 0.14);
  trimBeam([0.85, 5.1], [-0.85, 6.8], zd + 0.04, 0.14);
  trimBeam([-0.95, 5.0], [-0.95, 6.9], zd, 0.2);
  trimBeam([0.95, 5.0], [0.95, 6.9], zd, 0.2);
  trimBeam([-1.05, 6.9], [1.05, 6.9], zd, 0.2);
  trimBeam([-1.05, 5.0], [1.05, 5.0], zd, 0.2);
  k.box(0xf2cf5b, 1.3, 0.45, 0.5, cx, 5.15, zf + 0.3);
  k.box(darker(c.roof, 0.2), 0.3, 0.3, 0.9, cx, 7.55, zf + 0.35);
  // Side windows.
  k.within(translate(cx, 0, 0), () => {
    for (const wall of walls(2 * hw, 2 * zf)) {
      if (wall.side !== 'left' && wall.side !== 'right') continue;
      k.within(wall.m, () => {
        for (const u of [-2.3, 2.3]) windowAt(k, { frame: PAL.white, glass: PAL.glass, cross: true }, u, 1.7, 1.1, 1.2);
      });
    }
  });
  // Silo with hoops, a dome and a ladder.
  const sx = 4.95;
  const sz = -2.0;
  k.cyl(CONCRETE, 2.15, 2.2, 0.4, 14, sx, 0, sz);
  k.cyl(c.silo, 1.9, 1.9, 7.9, 14, sx, 0.4, sz, { open: true });
  for (const y of [1.8, 3.6, 5.4, 7.2]) k.cyl(darker(c.silo, 0.15), 1.96, 1.96, 0.16, 14, sx, y, sz, { open: true });
  k.sphere(c.siloTop, 1.95, [sx, 8.3, sz], 14, 5, { hemi: true });
  k.gem(c.siloTop, 0.3, [sx, 10.2, sz]);
  for (const s of [-1, 1]) k.box(PAL.metal, 0.1, 8.2, 0.1, sx + s * 0.3, 0.4, sz + 1.98);
  for (let i = 0; i < 10; i++) k.box(PAL.metal, 0.6, 0.08, 0.08, sx, 0.8 + i * 0.8, sz + 1.98);
  k.beam(c.silo, [sx - 1.3, 7.9, sz], [cx + hw - 0.4, 6.0, sz], 0.4);
};

const chemplant: Builder = (k) => {
  k.box(CONCRETE, 22, 0.25, 18, 0, 0, 0, undefined, ON_GROUND);
  hazardKerb(k, 22, 18, 0.25, 0.35, 0.5, 2.0);
  const base = 0.25;

  // Two tall green tanks with hazard bands and a ladder.
  for (const [x, z, r, h] of [
    [-7.8, -4.6, 2.5, 9.6],
    [-2.3, -4.6, 2.5, 8.0],
  ] as const) {
    k.cyl(TOXIC, r, r, h, 12, x, base, z, { open: true });
    k.sphere(TOXIC_TOP, r, [x, base + h, z], 12, 3, { hemi: true, scale: [1, 0.42, 1] });
    stripeBand(k, [HAZARD_YELLOW, HAZARD_BLACK], r * 1.03, 1.0, 14, x, base + h * 0.62, z);
    stripeBand(k, [HAZARD_YELLOW, HAZARD_BLACK], r * 1.03, 0.6, 14, x, base, z);
    for (const s of [-1, 1]) k.box(PAL.metal, 0.1, h, 0.1, x + s * 0.28, base, z + r + 0.08);
  }

  // Spherical tank on legs.
  const spx = 5.0;
  const spz = -4.3;
  const spr = 3.1;
  const spy = base + 1.7 + spr;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + 0.3;
    k.beam(PAL.metal, [spx + 2.6 * Math.sin(a), base, spz + 2.6 * Math.cos(a)], [spx + 2.8 * Math.sin(a), spy, spz + 2.8 * Math.cos(a)], 0.3);
  }
  k.sphere(TOXIC, spr, [spx, spy, spz], 12, 7);
  stripeBand(k, [HAZARD_YELLOW, HAZARD_BLACK], spr * 1.01, 0.7, 14, spx, spy - 0.35, spz);

  // Pipe rack joining everything.
  for (const x of [-9, -4.5, 0, 4.5, 8]) {
    for (const z of [-0.2, 0.9]) k.beam(PAL.metal, [x, base, z], [x, 3.6, z], 0.26);
    k.box(PAL.metal, 0.3, 0.25, 1.4, x, 3.6, 0.35);
  }
  k.rod(HAZARD_YELLOW, 0.24, 17.5, 8, [-0.5, 3.1, 0.0], { rz: Math.PI / 2 });
  k.rod(0x9aa5b1, 0.3, 17.5, 8, [-0.5, 3.1, 0.7], { rz: Math.PI / 2 });
  k.rod(TOXIC, 0.22, 17.5, 8, [-0.5, 4.1, 0.35], { rz: Math.PI / 2 });
  for (const x of [-7.8, -2.3]) k.rod(HAZARD_YELLOW, 0.24, 2.0, 6, [x, 3.1, -1.1], { rx: Math.PI / 2 });

  // Two bullet tanks lying down.
  for (const x of [-0.2, 3.2]) {
    const y = base + 1.55;
    const z = 3.6;
    for (const dz of [-1.3, 1.3]) k.box(CONCRETE, 1.9, 0.9, 0.4, x, base, z + dz, undefined, ON_GROUND);
    k.rod(TOXIC, 1.05, 3.6, 12, [x, y, z], { rx: Math.PI / 2 });
    for (const s of [-1, 1]) {
      k.sphere(TOXIC_TOP, 1.05, [x, y, z + s * 1.8], 12, 2, {
        hemi: true,
        scale: [1, 0.55, 1],
        rot: { rx: (s * Math.PI) / 2 },
      });
    }
    stripeBand(k, [HAZARD_YELLOW, HAZARD_BLACK], 0.6, 0.12, 10, x, y + 1.0, z);
  }

  // Flare stack with a flame.
  k.box(CONCRETE, 1.8, 0.7, 1.8, 8.6, base, 6.2, undefined, ON_GROUND);
  stripedStack(k, [RED, PAL.white], 0.5, 0.34, 14.2, 7, 8.6, 6.2, base, 8);
  k.cyl(0xff7b24, 0, 0.8, 1.5, 7, 8.6, base + 14.2, 6.2);
  k.cyl(0xffd23f, 0, 0.45, 1.0, 7, 8.6, base + 14.25, 6.2, { ry: 0.4 });

  // Control room with a striped roof edge.
  const bx = -6.6;
  const bz = 5.0;
  k.box(0xeef1f4, 6.2, 3.3, 4.4, bx, base, bz, undefined, ON_GROUND);
  k.box(PAL.roofDeck, 5.8, 0.04, 4.0, bx, base + 3.3, bz, undefined, ON_GROUND);
  for (let i = 0; i < 8; i++) {
    k.box(i % 2 ? HAZARD_BLACK : HAZARD_YELLOW, 6.3 / 8, 0.45, 0.2, bx - 3.15 + (i + 0.5) * (6.3 / 8), base + 2.95, bz + 2.25, undefined, FLUSH);
  }
  k.within(translate(bx, base, bz), () => {
    for (const wall of walls(6.2, 4.4)) {
      if (wall.side === 'back') continue;
      k.within(wall.m, () => {
        if (wall.side === 'front') {
          doorAt(k, PAL.metal, 0x5d6470, -1.8, 0, 0.9, 2.0);
          ribbon(k, PAL.glassDeep, PAL.metal, 3.0, 1.2, 1.1, 3);
        } else ribbon(k, PAL.glassDeep, PAL.metal, 2.6, 1.2, 1.1, 2);
      });
    }
  });

  // Toxic pond with a striped rim, and drums beside it.
  k.cyl(TOXIC_GLOW, 1.8, 1.8, 0.14, 12, 1.8, base, 6.3);
  stripeBand(k, [HAZARD_YELLOW, HAZARD_BLACK], 1.85, 0.4, 12, 1.8, base, 6.3);
  for (const [dx, dz] of [
    [-0.6, -0.4],
    [0.7, 0.5],
    [0.1, 0.8],
  ] as const) {
    k.gem(0xe0ffc0, 0.22, [1.8 + dx, base + 0.2, 6.3 + dz]);
  }
  for (const [x, z] of [
    [4.4, 6.9],
    [5.3, 6.9],
    [4.85, 7.75],
  ] as const) {
    k.cyl(TOXIC, 0.4, 0.4, 1.1, 8, x, base, z);
    k.cyl(HAZARD_YELLOW, 0.41, 0.41, 0.12, 8, x, base + 1.1, z);
  }

  // Warning signs on posts at the front.
  for (const x of [-2.5, 5.9]) {
    const z = 8.2;
    k.box(PAL.metal, 0.14, 1.7, 0.14, x, base, z);
    k.hull(HAZARD_BLACK, [
      [x - 0.95, 1.55, z + 0.08],
      [x + 0.95, 1.55, z + 0.08],
      [x, 3.25, z + 0.08],
      [x - 0.95, 1.55, z + 0.16],
      [x + 0.95, 1.55, z + 0.16],
      [x, 3.25, z + 0.16],
    ]);
    k.hull(HAZARD_YELLOW, [
      [x - 0.72, 1.7, z + 0.16],
      [x + 0.72, 1.7, z + 0.16],
      [x, 2.98, z + 0.16],
      [x - 0.72, 1.7, z + 0.24],
      [x + 0.72, 1.7, z + 0.24],
      [x, 2.98, z + 0.24],
    ]);
    k.box(HAZARD_BLACK, 0.14, 0.55, 0.06, x, 2.12, z + 0.26);
    k.box(HAZARD_BLACK, 0.14, 0.14, 0.06, x, 1.85, z + 0.26);
  }
};

// ---------------------------------------------------------------------------
// Tier 8: stadiums, power and airliners

const STADIUM = [
  { seats: [0x2f7fe0, 0x8ecae6] as Pair, facade: 0xeef2f6, accent: 0x2f6fd6 },
  { seats: [0xe63946, 0xffb703] as Pair, facade: 0xf3ead8, accent: 0xe63946 },
];

const stadium: Builder = (k, v) => {
  const c = STADIUM[v];
  const SX = 1.2;
  const seg = 36;
  const oval = (r: number, phi: number): [number, number] => [SX * r * Math.sin(phi), r * Math.cos(phi)];
  // A paved apron and a dark plinth band, so the light facade meets the
  // ground on something solid instead of a bright edge that reads as a gap.
  latheOval(k, PAL.stone, [
    [16.2, 0],
    [16.2, 0.12],
    [15, 0.12],
  ], seg, { sx: SX });
  latheOval(k, c.facade, [
    [15, 0],
    [15, 8.6],
  ], seg, { sx: SX });
  latheOval(k, darker(c.facade, 0.3), [
    [15.1, 0.12],
    [15.1, 0.9],
    [15, 0.9],
  ], seg, { sx: SX });
  latheOval(k, PAL.glassDeep, [
    [15.04, 5.4],
    [15.04, 7.0],
  ], seg, { sx: SX });
  latheOval(k, c.accent, [
    [15, 8.6],
    [15, 9.6],
    [14.5, 9.6],
  ], seg, { sx: SX });
  // Seats: eight steps down to the pitch, two steps to each colour ring.
  const steps = 8;
  const rTop = 14.5;
  const rBot = 9.7;
  const yTop = 9.6;
  const yBot = 0.9;
  const stairs: Array<[number, number]> = [];
  for (let b = 0; b < 4; b++) {
    const prof: Array<[number, number]> = [];
    for (let s = 0; s < 2; s++) {
      const i = b * 2 + s;
      const r0 = rTop - ((rTop - rBot) * i) / steps;
      const r1 = rTop - ((rTop - rBot) * (i + 1)) / steps;
      const y0 = yTop - ((yTop - yBot) * i) / steps;
      const y1 = yTop - ((yTop - yBot) * (i + 1)) / steps;
      if (s === 0) prof.push([r0, y0]);
      prof.push([r1, y0], [r1, y1]);
    }
    latheOval(k, c.seats[b % 2], prof, seg, { sx: SX });
    stairs.push(...prof.slice(b === 0 ? 0 : 1));
  }
  latheOval(k, c.facade, [
    [rBot, yBot],
    [rBot, 0.3],
  ], seg, { sx: SX });
  // Aisles: narrow grey wedges of the same steps, lifted a hair so they sit on top.
  const aisle = stairs.map(([r, y]): [number, number] => [r - 0.04, y + 0.04]);
  for (let i = 0; i < 12; i++) {
    const phi = ((i + 0.5) * Math.PI * 2) / 12;
    latheOval(k, lighter(c.facade, 0.2), aisle, 1, { sx: SX, phi: [phi, 0.05] });
  }
  // Running track, pitch, mowing stripes and markings.
  k.add(new THREE.CylinderGeometry(9.8, 9.8, 0.3, seg), 0xd9734e, placement(0, 0.15, 0, undefined, [SX, 1, 1]));
  k.box(0x46a84b, 17, 0.06, 11, 0, 0.3, 0, undefined, ON_GROUND);
  for (let i = 0; i < 10; i += 2) k.box(0x5bbd5b, 1.7, 0.08, 11, -8.5 + 1.7 * (i + 0.5), 0.3, 0, undefined, ON_GROUND);
  const line = (w: number, d: number, x: number, z: number) => k.box(PAL.white, w, 0.1, d, x, 0.3, z, undefined, ON_GROUND);
  for (const s of [-1, 1]) {
    line(17, 0.14, 0, s * 5.43);
    line(0.14, 11, s * 8.43, 0);
    line(0.14, 5.4, s * 5.6, 0);
    line(2.8, 0.14, s * 7.0, 2.63);
    line(2.8, 0.14, s * 7.0, -2.63);
    k.box(PAL.white, 0.15, 0.95, 0.15, s * 8.6, 0.36, 1.1);
    k.box(PAL.white, 0.15, 0.95, 0.15, s * 8.6, 0.36, -1.1);
    k.box(PAL.white, 0.15, 0.15, 2.35, s * 8.6, 1.31, 0);
    k.box(0xdfe6ee, 0.5, 0.9, 2.2, s * 8.95, 0.36, 0, undefined, ON_GROUND);
  }
  line(0.14, 11, 0, 0);
  k.ring(PAL.white, 1.7, 0.08, [0, 0.39, 0], { rx: Math.PI / 2 }, 3, 20);
  // Facade pillars and gates.
  for (let i = 0; i < 24; i++) {
    const phi = (i * Math.PI * 2) / 24;
    const [x, z] = oval(15.05, phi);
    const ry = Math.atan2(Math.sin(phi) / SX, Math.cos(phi));
    if (i % 6 === 0) {
      k.box(0x3a3f4b, 2.6, 3.2, 0.3, x, 0, z, { ry }, FLUSH);
      k.box(c.accent, 3.4, 0.3, 1.2, x, 3.3, z, { ry });
    } else {
      k.box(lighter(c.facade, 0.3), 0.8, 8.6, 0.4, x, 0, z, { ry }, FLUSH);
    }
  }
  // Roof over the main stand (the far side, so it frames the view).
  latheOval(k, PAL.white, [
    [15.4, 10.9],
    [15.4, 11.3],
    [11.6, 12.3],
    [11.6, 12.0],
    [15.4, 10.9],
  ], 14, { sx: SX, phi: [Math.PI - 0.8, 1.6] });
  for (const phi of [Math.PI - 0.6, Math.PI, Math.PI + 0.6]) {
    const [x, z] = oval(15.25, phi);
    k.beam(PAL.metal, [x, 9.6, z], [x, 11.1, z], 0.35);
  }
  // Floodlight masts at the corners, heads turned to the pitch.
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    const x = sx * 16.3;
    const z = sz * 13.3;
    k.beam(PAL.metal, [x, 0, z], [x, 12.6, z], 0.45);
    k.within(placement(x, 12.4, z, { ry: Math.atan2(-x, -z) }), () => {
      k.box(PAL.ink, 2.6, 1.5, 0.3, 0, 0, 0, { rx: 0.45 });
      k.box(0xfff4c2, 2.3, 1.2, 0.14, 0, 0.14, 0.22, { rx: 0.45 });
    });
  }
};

const coolingTower = (k: Kit, x: number, z: number): void => {
  const seg = 24;
  latheOval(k, 0xdcd8d0, [
    [6.3, 0],
    [5.8, 3.5],
    [5.0, 9],
    [4.5, 14],
    [4.4, 16.4],
  ], seg, { x, z });
  latheOval(k, 0xe76f51, [
    [4.4, 16.4],
    [4.55, 19.4],
    [4.7, 21],
    [4.25, 21],
    [4.05, 19],
  ], seg, { x, z });
  latheOval(k, 0x5d636d, [
    [4.05, 19],
    [3.95, 15.5],
    [0, 15.5],
  ], seg, { x, z });
  latheOval(k, 0x5d636d, [
    [6.37, 0],
    [6.27, 1.0],
  ], seg, { x, z });
  k.ico(STEAM, 3.3, 1, [x, 23.3, z], [1, 0.8, 1]);
  k.ico(STEAM, 2.5, 1, [x + 1.6, 25.8, z - 0.9]);
  k.ico(STEAM, 1.7, 0, [x - 1.2, 27.5, z + 0.8]);
};

const powerplant: Builder = (k) => {
  coolingTower(k, -9.8, -6.4);
  coolingTower(k, 3.6, -6.4);
  // Turbine hall.
  const hx = -4.5;
  const hz = 7.0;
  const HW = 24;
  const HD = 10.4;
  const hallWall = 0x5aa0e8;
  k.box(darker(hallWall, 0.3), HW + 0.2, 0.4, HD + 0.2, hx, 0, hz, undefined, ON_GROUND);
  k.box(hallWall, HW, 8.6, HD, hx, 0.4, hz, undefined, ON_GROUND);
  k.within(translate(hx, 0, hz), () => {
    parapet(k, PAL.white, HW, HD, 9.0, 0.5, 0.3);
    k.box(0x17c3b2, HW - 0.6, 0.04, HD - 0.6, 0, 9.0, 0, undefined, ON_GROUND);
    for (const wall of walls(HW, HD)) {
      k.within(wall.m, () => {
        ribbon(k, GLASS, PAL.white, wall.len - 2, 5.6, 2.0, Math.round(wall.len / 6));
        if (wall.side === 'front') {
          rollDoor(k, PAL.white, -6, 0.4, 3.6, 4.0);
          rollDoor(k, PAL.white, 6, 0.4, 3.6, 4.0);
          ribbon(k, PAL.glassDeep, PAL.white, 6, 1.6, 2.2, 3);
        }
      });
    }
  });
  // Boiler house.
  const bx = 12.3;
  const bz = 6.6;
  const BW = 8.4;
  const BD = 11.2;
  const boiler = 0xf2c14e;
  k.box(boiler, BW, 14.4, BD, bx, 0, bz, undefined, ON_GROUND);
  k.within(translate(bx, 0, bz), () => {
    parapet(k, PAL.white, BW, BD, 14.4, 0.5, 0.3);
    k.box(0xf2433a, BW - 0.6, 0.04, BD - 0.6, 0, 14.4, 0, undefined, ON_GROUND);
    for (const wall of walls(BW, BD)) {
      k.within(wall.m, () => {
        for (const y of [3.0, 7.0, 11.0]) ribbon(k, GLASS, PAL.white, wall.len - 1.6, y, 1.6, 2);
      });
    }
  });
  // Big pipes from the towers into the hall.
  for (const x of [-9.8, 3.6]) k.beam(PAL.metal, [x, 2.6, -0.6], [x, 2.6, 1.9], 1.0);
  // Chimney: concrete, with red and white bands at the top.
  const cx = 13.3;
  const cz = -6.2;
  k.box(CONCRETE, 4.2, 1.0, 4.2, cx, 0, cz, undefined, ON_GROUND);
  k.cyl(0xc9c4ba, 1.5, 1.9, 22, 14, cx, 0, cz, { open: true });
  stripedStack(k, [RED, PAL.white], 1.5, 1.2, 8, 4, cx, cz, 22, 14);
  // Transformer yard.
  for (const z of [-1.2, 1.4]) {
    k.box(0x7d8796, 2.2, 2.0, 1.6, 15.3, 0, z, undefined, ON_GROUND);
    for (let i = 0; i < 3; i++) k.cyl(PAL.white, 0.12, 0.16, 0.9, 6, 14.6 + i * 0.7, 2.0, z);
  }
};

const MALL = [
  { wall: 0xffd23f, accent: 0xf2433a },
  { wall: 0x6fc3ff, accent: 0x2f7bff },
  { wall: 0xff8fb8, accent: 0x7a4de8 },
];

const mall: Builder = (k, v) => {
  const c = MALL[v];
  const W = 33;
  const D = 25;
  const cz = -1.3;
  const H = 8.4;
  const front = cz + D / 2;
  k.box(darker(c.wall, 0.25), W + 0.2, 0.4, D + 0.2, 0, 0, cz, undefined, ON_GROUND);
  k.rbox(c.wall, W, H - 0.4, D, 1.2, 0, 0, 0.4, cz, { seg: 3 });
  k.within(translate(0, 0, cz), () => {
    parapet(k, PAL.white, W, D, H, 0.6, 0.35);
    k.box(mix(c.accent, 0xffffff, 0.35), W - 0.7, 0.04, D - 0.7, 0, H, 0, undefined, ON_GROUND);
    for (const wall of walls(W, D)) {
      k.within(wall.m, () => {
        const n = Math.round(wall.len / 3.3);
        for (let i = 1; i < n; i++) {
          const u = -wall.len / 2 + (i * wall.len) / n;
          if (wall.side === 'front' && Math.abs(u) < 6) continue;
          k.box(PAL.white, 0.5, H - 0.4, 0.24, u, 0.4, 0, undefined, ['nz', 'ny']);
        }
        k.box(c.accent, wall.len - 2.0, 0.55, 0.3, 0, H - 1.25, 0, undefined, FLUSH);
        if (wall.side === 'front') {
          for (const s of [-1, 1]) {
            k.box(c.accent, 8.4, 1.8, 0.36, s * 11, 4.4, 0, undefined, FLUSH);
            k.box(PAL.white, 7.2, 1.0, 0.42, s * 11, 4.8, 0, undefined, FLUSH);
            for (let j = 0; j < 5; j++) {
              k.box(c.accent, 0.6, 0.55 + (j % 2) * 0.15, 0.48, s * 11 - 2.6 + j * 1.3, 5.0, 0, undefined, FLUSH);
            }
            k.box(PAL.glassDeep, 6.5, 2.4, 0.2, s * 11, 0.4, 0, undefined, FLUSH);
          }
        } else if (wall.side === 'back') {
          rollDoor(k, PAL.white, -6, 0.4, 3.6, 3.8);
          rollDoor(k, PAL.white, 6, 0.4, 3.6, 3.8);
        } else {
          k.box(PAL.glassDeep, 3.0, 2.6, 0.24, 0, 0.4, 0, undefined, FLUSH);
          k.box(c.accent, 4.0, 0.25, 1.1, 0, 3.2, 0.55);
        }
      });
    }
  });
  // Glass atrium over the main entrance.
  const ax = 5.2;
  const az0 = front - 4.3;
  const az1 = front + 1.5;
  const AH = 10.3;
  const amid = (az0 + az1) / 2;
  k.box(PAL.glass, 2 * ax, AH - 0.4, az1 - az0, 0, 0.4, amid, undefined, ON_GROUND);
  for (let i = 0; i <= 6; i++) k.box(PAL.white, 0.2, AH - 0.4, 0.26, -ax + (i * 2 * ax) / 6, 0.4, az1, undefined, FLUSH);
  for (const y of [3.6, 6.9, AH - 0.3]) k.box(PAL.white, 2 * ax + 0.1, 0.24, 0.28, 0, y, az1, undefined, FLUSH);
  for (const s of [-1, 1]) {
    for (let i = 1; i < 3; i++) k.box(PAL.white, 0.26, AH - 0.4, 0.2, s * ax, 0.4, az0 + ((az1 - az0) * i) / 3);
  }
  k.hull(lighter(PAL.glass, 0.25), [
    [-ax - 0.2, AH, az0 - 0.2],
    [ax + 0.2, AH, az0 - 0.2],
    [-ax - 0.2, AH, az1 + 0.2],
    [ax + 0.2, AH, az1 + 0.2],
    [-ax + 1.8, 12.0, amid],
    [ax - 1.8, 12.0, amid],
  ]);
  k.box(PAL.white, 2 * ax - 3.4, 0.2, 0.3, 0, 11.9, amid);
  k.box(PAL.glassDeep, 3.4, 2.7, 0.3, 0, 0.4, az1, undefined, FLUSH);
  k.box(c.accent, 4.6, 0.3, 1.2, 0, 3.3, az1 + 0.55);
  // Plaza trees.
  for (const x of [-14.5, -8.5, 8.5, 14.5]) smallTree(k, x, 0, front + 1.4, 0.9);
  // Roof: car park at the back, units and skylights at the front.
  const pz = cz - D / 2 + 6.4;
  k.box(ASPHALT, W - 1.4, 0.06, 11.4, 0, H, pz, undefined, ON_GROUND);
  for (const row of [-3.1, 3.1]) {
    for (let i = 0; i <= 11; i++) {
      k.box(PAL.white, 0.14, 0.03, 2.6, -14.3 + i * 2.6, H + 0.06, pz + row, undefined, ON_GROUND);
    }
  }
  const carColors = [0xe63946, 0x3a86ff, 0xffc21a, 0xf7f8fa, 0x2a9d8f, 0x8e5cd9, 0xff8c42];
  const stalls = [0, 2, 3, 6, 8, 9, 10];
  stalls.forEach((stall, i) => {
    const row = i % 2 ? -3.1 : 3.1;
    toyCar(k, carColors[i], -13 + stall * 2.6, H + 0.06, pz + row, row > 0 ? 0 : Math.PI);
  });
  for (const x of [-9, 9]) {
    k.box(PAL.white, 3.2, 0.3, 2.2, x, H, front - 9, undefined, ON_GROUND);
    k.box(PAL.glass, 2.9, 0.36, 1.9, x, H, front - 9, undefined, ON_GROUND);
  }
};

/**
 * A wind turbine on a big square foundation pad, so from above it reads as a
 * whole site the size of its footprint rather than one thin pole: a hazard
 * kerb and a fence round the pad, a service hut, a transformer box and a
 * painted ring round the fat foot of the tower.
 */
const windturbine: Builder = (k) => {
  const white = 0xf4f6f8;
  const hubY = 35.0;
  const hubZ = 2.35;
  const blade = 12.8;
  const pad = 10.4;
  const py = 0.4;
  k.rbox(CONCRETE, pad, py, pad, 0.3, 0.08, 0, 0, 0, { seg: 1 });
  hazardKerb(k, pad - 0.4, pad - 0.4, py, 0.2, 0.3, 1.2);
  k.lathe(HAZARD_YELLOW, [
    [3.1, py + 0.02],
    [2.75, py + 0.02],
  ], 16);
  // A low white fence just inside the kerb, open at the front for the gate.
  const f = pad / 2 - 0.65;
  for (const [a, b] of [
    [[-f, -f], [f, -f]],
    [[-f, -f], [-f, f]],
    [[f, -f], [f, f]],
    [[-f, f], [-1.6, f]],
    [[1.6, f], [f, f]],
  ] as const) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(len / 1.4));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      k.box(PAL.white, 0.14, 1.0, 0.14, a[0] + (b[0] - a[0]) * t, py, a[1] + (b[1] - a[1]) * t);
    }
    k.beam(PAL.white, [a[0], py + 0.8, a[1]], [b[0], py + 0.8, b[1]], 0.1);
  }
  // Service hut with a door and a window, and a green transformer box.
  const hx = -3.2;
  const hz = -3.3;
  k.rbox(0x5aa0e6, 2.2, 2.0, 1.7, 0.3, 0, hx, py, hz, { seg: 1 });
  k.rbox(RED, 2.6, 0.3, 2.1, 0.35, 0.12, hx, py + 2.0, hz, { seg: 1 });
  k.within(translate(hx, py, hz + 0.85), () => {
    doorAt(k, PAL.white, 0xffc933, -0.45, 0, 0.6, 1.5);
    paneAt(k, GLASS, PAL.white, 0.55, 0.8, 0.5, 0.6, false, 1);
  });
  k.cbox(0x3fa34d, 1.6, 1.2, 1.1, 0.1, 3.0, py, -3.1);
  k.box(HAZARD_YELLOW, 0.5, 0.4, 0.04, 3.0, py + 0.5, -2.53, undefined, FLUSH);
  // A broad plinth and a thick foot, so the tower stands firmly on the pad.
  k.cyl(CONCRETE, 2.4, 2.7, 0.8, 14, 0, py, 0);
  k.cyl(white, 0.6, 1.5, hubY - 1.4 - py - 0.8, 14, 0, py + 0.8, 0);
  k.cyl(0x55b35c, 1.46, 1.48, 0.7, 14, 0, py + 2.0, 0, { open: true });
  k.box(0x5d6470, 0.8, 1.5, 0.3, 0, py + 0.8, 1.4, undefined, FLUSH);
  k.cbox(white, 1.7, 1.8, 4.3, 0.35, 0, hubY - 0.9, -0.4);
  k.rod(white, 0.85, 1.5, 10, [0, hubY, hubZ], { rx: Math.PI / 2 }, 0.2);
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const at = (d: number, w: number, zOff: number): V3 => [dx * d - dy * w, hubY + dy * d + dx * w, hubZ + zOff];
    const slice = (d: number, lead: number, trail: number, t: number): V3[] => [
      at(d, lead, t),
      at(d, lead, -t),
      at(d, -trail, t),
      at(d, -trail, -t),
    ];
    k.hull(white, [...slice(0.5, 0.45, 0.45, 0.18), ...slice(3.2, 0.75, 0.4, 0.12), ...slice(blade * 0.86, 0.3, 0.12, 0.06)]);
    k.hull(RED, [...slice(blade * 0.86, 0.3, 0.12, 0.07), ...slice(blade, 0.14, 0.04, 0.04)]);
  }
};

const JET = [0x2f6fd6, 0xe63946];

const jet: Builder = (k, v) => {
  const accent = JET[v];
  const body = 0xf7f8fa;
  const grey = 0xdfe4ea;
  const cy = 3.4;
  const prof: Profile = [
    [0, -18],
    [0.4, -17.7],
    [1.2, -15.6],
    [1.85, -12.2],
    [2.1, -8.5],
    [2.1, 11],
    [1.95, 13.6],
    [1.5, 15.8],
    [0.8, 17.3],
    [0, 18],
  ];
  k.add(
    new THREE.LatheGeometry(
      prof.map(([r, t]) => new THREE.Vector2(r, t)),
      14,
    ),
    body,
    placement(0, cy, 0, { rx: Math.PI / 2 }),
  );
  for (const s of [-1, 1]) {
    // Cheatline and cabin windows along each side.
    k.box(accent, 0.12, 0.34, 19.5, s * 2.08, cy - 0.55, 0.75);
    for (let z = -8; z <= 10; z += 1.1) k.box(PAL.carGlass, 0.12, 0.34, 0.45, s * 2.02, cy + 0.35, z);
    // Swept wing with a winglet.
    k.hull(grey, [
      [s * 1.6, 2.4, 4.8],
      [s * 1.6, 2.4, -3.2],
      [s * 1.6, 2.9, 4.2],
      [s * 1.6, 2.9, -2.8],
      [s * 17, 3.35, -6.2],
      [s * 17, 3.35, -8.0],
      [s * 16.9, 3.55, -6.4],
      [s * 16.9, 3.55, -7.8],
    ]);
    k.hull(accent, [
      [s * 16.75, 3.45, -6.3],
      [s * 16.75, 3.45, -8.0],
      [s * 17.0, 3.45, -6.3],
      [s * 17.0, 3.45, -8.0],
      [s * 16.9, 5.3, -7.7],
      [s * 16.9, 5.3, -8.6],
      [s * 17.05, 5.3, -7.7],
      [s * 17.05, 5.3, -8.6],
    ]);
    // Engine on a pylon.
    const ex = s * 6.3;
    k.box(grey, 0.3, 0.6, 2.2, ex, 2.2, 1.6);
    k.rod(0xe9ecef, 0.85, 3.8, 12, [ex, 1.55, 2.4], { rx: Math.PI / 2 }, 1.1);
    k.rod(accent, 1.13, 0.3, 12, [ex, 1.55, 4.2], { rx: Math.PI / 2 });
    k.rod(PAL.ink, 0.88, 0.06, 12, [ex, 1.55, 4.36], { rx: Math.PI / 2 });
    // Tailplane.
    k.hull(grey, [
      [s * 0.8, 4.0, -13.6],
      [s * 0.8, 4.0, -16.6],
      [s * 0.8, 4.3, -13.9],
      [s * 0.8, 4.3, -16.4],
      [s * 6.8, 4.6, -16.6],
      [s * 6.8, 4.6, -17.7],
      [s * 6.8, 4.75, -16.7],
      [s * 6.8, 4.75, -17.6],
    ]);
    // Main gear.
    k.beam(PAL.metal, [s * 2.4, 1.9, -1.0], [s * 2.4, 0.55, -1.0], 0.3);
    k.wheel(0.55, 0.4, [s * 2.4, 0.55, -0.4], 8);
    k.wheel(0.55, 0.4, [s * 2.4, 0.55, -1.6], 8);
  }
  // Fin in the airline colour, and the cockpit windows.
  k.hull(accent, [
    [-0.2, 4.9, -11.5],
    [0.2, 4.9, -11.5],
    [-0.2, 3.9, -17.4],
    [0.2, 3.9, -17.4],
    [-0.1, 11.0, -15.8],
    [0.1, 11.0, -15.8],
    [-0.1, 11.0, -17.9],
    [0.1, 11.0, -17.9],
  ]);
  // Windscreen: a dark wedge lying on the nose.
  k.hull(PAL.carGlass, [
    [-0.75, cy + 1.74, 14.6],
    [0.75, cy + 1.74, 14.6],
    [-0.75, cy + 1.45, 14.6],
    [0.75, cy + 1.45, 14.6],
    [-0.55, cy + 1.42, 15.9],
    [0.55, cy + 1.42, 15.9],
    [-0.55, cy + 1.15, 15.9],
    [0.55, cy + 1.15, 15.9],
  ]);
  k.beam(PAL.metal, [0, 1.8, 13.2], [0, 0.5, 13.2], 0.22);
  k.wheel(0.5, 0.35, [0, 0.5, 13.2], 8);
};

// ---------------------------------------------------------------------------
// Tier 9: skyscrapers and landmarks

/**
 * The first tier is nearly as wide as the podium, so a skyscraper fills its
 * lot from the ground up and never looks like a thin needle; the setbacks
 * only start higher up.
 */
const SKY = [
  { body: 0x4f6096, glass: 0x62d8ff, crown: 0x19c7b4, tiers: [20.4, 16.5, 13], rots: [0, 0, 0], top: 'steps' },
  { body: 0x4aa8ff, glass: 0xc8f0ff, crown: 0xffc933, tiers: [20.4, 15.5], rots: [0, 0], top: 'dome' },
  { body: 0x7c5ce6, glass: 0x9fe3ff, crown: 0xff6b5b, tiers: [20.4, 15, 11], rots: [0, Math.PI / 4, 0], top: 'spire' },
] as const;

/**
 * One tier: a soft block with one wide rounded window band per floor on each
 * face, under a thick rounded ledge. Big floors keep it a toy, not graph paper.
 */
function softTier(k: Kit, S: number, y0: number, h: number, body: number, glass: number, ry: number): void {
  const ledge = 1.2;
  const n = Math.max(2, Math.round((h - ledge) / 6.5));
  const fh = (h - ledge) / n;
  const r = S * 0.16;
  const winH = Math.min(3.0, fh * 0.5);
  k.within(placement(0, y0, 0, { ry }), () => {
    k.rbox(body, S, h - ledge + 0.1, S, r, 0, 0, 0, 0, { seg: 3 });
    for (const wall of walls(S, S)) {
      k.within(wall.m, () => {
        for (let i = 0; i < n; i++) k.plate(glass, S - 2 * r - 1.2, winH, winH * 0.2, 0.22, 0, i * fh + (fh - winH) / 2, 0, 1);
      });
    }
    k.rbox(CREAM_WHITE, S + 0.8, ledge, S + 0.8, r + 0.4, 0.45, 0, h - ledge, 0, { seg: 3 });
  });
}

const skyscraper: Builder = (k, v, s) => {
  const c = SKY[v];
  const H = 110 * s;
  const P = 7;
  const roofY = H * 0.86;
  // Podium: a wide soft block with big round-topped glass doors and a garden on top.
  k.rbox(CREAM_WHITE, 21.6, P, 21.6, 3.2, 0.6, 0, 0, 0, { seg: 3 });
  for (const wall of walls(21.6, 21.6)) {
    k.within(wall.m, () => {
      k.plate(c.glass, 4.2, 4.6, 2.1, 0.2, 0, 0, 0, 2);
      k.box(c.glass, 4.2, 2.3, 0.2, 0, 0, 0, undefined, FLUSH);
      for (const u of [-5.3, 5.3]) k.plate(c.glass, 3.6, 3.0, 1.0, 0.2, u, 1.6, 0, 2);
      if (wall.side === 'front') k.rbox(c.crown, 6, 0.45, 1.0, 0.45, 0.15, 0, 4.9, 0.5);
    });
  }
  for (const [x, z] of [
    [-8, -8],
    [8, -8],
    [-8, 8],
    [8, 8],
  ] as const) {
    k.box(0x5ccf6a, 3.4, 0.25, 3.4, x, P, z, undefined, ON_GROUND);
    smallTree(k, x, P + 0.25, z, 1.1);
  }
  // Tiers, each set back from the one below; ledges get a little greenery.
  const fr = c.tiers.length === 3 ? [0.42, 0.33, 0.25] : [0.58, 0.42];
  let y = P;
  c.tiers.forEach((S, i) => {
    const h = (roofY - P) * fr[i];
    softTier(k, S, y, h, c.body, c.glass, c.rots[i]);
    y += h;
    const next = c.tiers[i + 1];
    if (next !== undefined && S - next > 3) {
      // Corners of this tier's ledge, turned with the tier so the trees stay on it.
      const r = S / 2 - 1.3;
      const a = c.rots[i];
      for (const sx of [-1, 1]) {
        const px = sx * r;
        const pz = r * (i % 2 ? -1 : 1);
        smallTree(k, px * Math.cos(a) + pz * Math.sin(a), y, pz * Math.cos(a) - px * Math.sin(a), 0.9);
      }
    }
  });
  const top = c.tiers[c.tiers.length - 1];
  // Every crown ends in a short spire with a fat red ball, the top of the city.
  const spireTip = (from: number, rBase: number) => {
    k.cyl(CREAM_WHITE, 0.2, rBase, H - from - 1.4, 8, 0, from, 0);
    k.sphere(RED, 0.9, [0, H - 0.9, 0], 8, 5);
  };
  if (c.top === 'steps') {
    k.rbox(c.crown, top - 2.5, 3.0, top - 2.5, 2.2, 0.6, 0, roofY, 0, { seg: 3 });
    k.rbox(lighter(c.crown, 0.3), top - 6, 2.6, top - 6, 1.4, 0.5, 0, roofY + 3.0, 0, { seg: 3 });
    spireTip(roofY + 5.6, 0.8);
  } else if (c.top === 'dome') {
    const b = top / 2 - 0.4;
    const apexY = roofY + (H - roofY) * 0.5;
    k.sphere(c.crown, b, [0, roofY, 0], 14, 5, { hemi: true, scale: [1, (apexY - roofY) / b, 1] });
    spireTip(apexY - 0.4, 0.7);
  } else {
    const b = top / 2 - 0.4;
    const crownY = roofY + 1.6;
    k.rbox(c.crown, top - 1.0, 1.6, top - 1.0, 1.4, 0.5, 0, roofY, 0, { seg: 3, ry: c.rots[c.rots.length - 1] });
    k.cyl(c.crown, 0.5, b, (H - crownY) * 0.55, 12, 0, crownY, 0);
    spireTip(crownY + (H - crownY) * 0.5, 0.6);
  }
};

/**
 * A TV tower on a broad round visitor building with a plaza ring and trees,
 * so its foot fills the lot and it never looks like a needle you could
 * swallow early. Fins and a thick lower shaft carry it up to the pod.
 */
const tvtower: Builder = (k) => {
  const conc = 0xe8e3da;
  const pb = 5.2;
  k.cyl(PAL.stone, 10.9, 11.0, 0.2, 24, 0, 0, 0);
  k.lathe(PAL.stoneDark, [
    [10.5, 0.22],
    [9.9, 0.22],
  ], 24);
  k.lathe(conc, [
    [9.2, 0.2],
    [9.2, 1.0],
    [8.7, pb],
    [0, pb],
  ], 20);
  k.lathe(PAL.glassDeep, [
    [9.16, 1.5],
    [8.84, 4.2],
  ], 20);
  // A red rim round the roof edge and a ring of skylights, so from above it reads as a building.
  k.lathe(RED, [
    [9.5, pb - 0.3],
    [9.5, pb + 0.1],
    [8.3, pb + 0.1],
    [8.3, pb],
  ], 20);
  k.lathe(PAL.glass, [
    [7.2, pb],
    [7.2, pb + 0.25],
    [5.2, pb + 0.25],
    [5.2, pb],
  ], 20);
  // Round-topped glass doors on four sides, under little red canopies.
  for (let i = 0; i < 4; i++) {
    k.within(placement(0, 0.2, 0, { ry: (i * Math.PI) / 2 }), () => {
      k.within(translate(0, 0, 9.1), () => {
        k.plate(PAL.glassDeep, 2.2, 2.6, 1.1, 0.2, 0, 0, 0, 2);
        k.box(RED, 3.0, 0.2, 1.0, 0, 2.9, 0.4);
      });
    });
  }
  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.5) * Math.PI) / 6;
    if (i % 3 === 1) continue;
    smallTree(k, 10.2 * Math.sin(a), 0.2, 10.2 * Math.cos(a), 0.55);
  }
  // Three buttress fins give the shaft a sturdy toy footing.
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3 + Math.PI / 6;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    const px = dz * 0.6;
    const pz = -dx * 0.6;
    const pts: V3[] = [];
    for (const s of [-1, 1]) {
      pts.push([dx * 3.4 + s * px, pb, dz * 3.4 + s * pz]);
      pts.push([dx * 7.4 + s * px, pb, dz * 7.4 + s * pz]);
      pts.push([dx * 2.6 + s * px, 34, dz * 2.6 + s * pz]);
    }
    k.hull(conc, pts);
  }
  k.cyl(conc, 1.8, 4.0, 92 - pb, 14, 0, pb, 0);
  // Main pod: white underside, glass ring, balcony and a red cap.
  k.lathe(PAL.white, [
    [1.9, 92],
    [5.0, 97],
    [5.6, 99.2],
  ], 20);
  k.lathe(PAL.glassDeep, [
    [5.6, 99.2],
    [5.6, 102.4],
  ], 20);
  k.cyl(PAL.white, 5.95, 5.95, 0.3, 20, 0, 100.6, 0);
  k.lathe(RED, [
    [5.6, 102.4],
    [5.3, 103.4],
    [3.4, 105.4],
    [1.4, 106.2],
    [0, 106.3],
  ], 20);
  k.cyl(conc, 1.0, 1.35, 9.2, 12, 0, 106.2, 0);
  // Sky deck.
  k.lathe(PAL.white, [
    [1.0, 115],
    [2.5, 116.8],
    [2.6, 117.6],
  ], 14);
  k.lathe(PAL.glassDeep, [
    [2.6, 117.6],
    [2.6, 118.8],
  ], 14);
  k.lathe(PAL.white, [
    [2.6, 118.8],
    [1.2, 120.3],
    [0, 120.4],
  ], 14);
  stripedStack(k, [RED, PAL.white], 0.7, 0.18, 19.0, 7, 0, 0, 120.3, 8);
  k.gem(RED, 0.35, [0, 139.65, 0]);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    k.gem(RED, 0.25, [5.95 * Math.sin(a), 101.1, 5.95 * Math.cos(a)]);
  }
};

const terminal: Builder = (k) => {
  // Apron in front with lead-in lines to each gate; a road behind.
  k.box(0x9aa1ab, 36, 0.1, 11.4, 0, 0, 9.3, undefined, ON_GROUND);
  const gates = [-12, -3.5, 5];
  for (const gx of gates) {
    k.box(HAZARD_YELLOW, 0.26, 0.04, 5.8, gx, 0.1, 12.1, undefined, ON_GROUND);
    k.box(HAZARD_YELLOW, 2.4, 0.04, 0.26, gx, 0.1, 14.6, undefined, ON_GROUND);
  }
  k.box(ASPHALT, 36, 0.08, 3.4, 0, 0, -13.2, undefined, ON_GROUND);
  for (let i = 0; i < 9; i++) k.box(PAL.white, 1.6, 0.04, 0.2, -16 + i * 4, 0.08, -13.2, undefined, ON_GROUND);
  toyCar(k, 0xffc21a, -9, 0.08, -12.4, Math.PI / 2);
  toyCar(k, 0x3a86ff, 1, 0.08, -14.0, -Math.PI / 2);
  toyCar(k, 0xe63946, 7, 0.08, -12.4, Math.PI / 2);
  // Glass hall under a white arched roof.
  const x0 = -17;
  const x1 = 11;
  const W = x1 - x0;
  const D = 12;
  const cx = (x0 + x1) / 2;
  const cz = -2.6;
  const top = 8.2;
  k.box(CONCRETE, W + 0.3, 0.4, D + 0.3, cx, 0, cz, undefined, ON_GROUND);
  k.box(PAL.glass, W, top - 0.4, D, cx, 0.4, cz, undefined, ON_GROUND);
  k.within(translate(cx, 0, cz), () => {
    for (const wall of walls(W, D)) {
      k.within(wall.m, () => {
        const n = Math.round(wall.len / 4.6);
        for (let i = 1; i < n; i++) {
          k.box(PAL.white, 0.44, top - 0.4, 0.3, -wall.len / 2 + (i * wall.len) / n, 0.4, 0, undefined, ['nz', 'ny']);
        }
        k.box(PAL.white, wall.len, 0.3, 0.26, 0, 4.2, 0, undefined, FLUSH);
        if (wall.side === 'back') k.box(PAL.glassDeep, 4, 2.6, 0.3, 0, 0.4, 0, undefined, FLUSH);
      });
    }
  });
  const a = arc(D + 3.0, top, 3.2);
  arcFill(k, lighter(PAL.glass, 0.2), x0, x1, cz, a, D, top);
  arcSlab(k, 0xf4f6f8, x0 - 1.2, x1 + 1.2, cz, a, a.R, 0.35, -a.a, a.a, 12);
  arcSlab(k, 0x2f7fe0, x0 - 1.25, x1 + 1.25, cz, a, a.R + 0.02, 0.42, a.a - 0.1, a.a, 1);
  arcSlab(k, 0x2f7fe0, x0 - 1.25, x1 + 1.25, cz, a, a.R + 0.02, 0.42, -a.a, -a.a + 0.1, 1);
  for (const p of [-0.28, 0, 0.28]) arcSlab(k, PAL.glassDeep, x0 + 1, x1 - 1, cz, a, a.R + 0.04, 0.1, p - 0.05, p + 0.05, 1);
  // Jet bridges out to the gates.
  const fz = cz + D / 2;
  for (const gx of gates) {
    k.box(0xc9d1d9, 1.8, 1.8, 6.6, gx, 3.0, fz + 3.3);
    k.box(0x2f7fe0, 1.86, 0.3, 6.6, gx, 3.9, fz + 3.3);
    k.cbox(0x9aa5b1, 2.6, 2.2, 1.6, 0.15, gx, 2.8, fz + 7.1);
    k.beam(PAL.ink, [gx, 0, fz + 6.2], [gx, 3.0, fz + 6.2], 0.35);
    k.box(PAL.ink, 1.4, 0.4, 0.6, gx, 0, fz + 6.2);
  }
  // Control tower.
  const tx = 14.6;
  const tz = -9.2;
  k.box(CONCRETE, 4.5, 2.5, 4.5, tx, 0, tz, undefined, ON_GROUND);
  k.within(translate(tx, 0, tz), () => {
    for (const wall of walls(4.5, 4.5)) k.within(wall.m, () => ribbon(k, PAL.glassDeep, PAL.white, 3.2, 1.0, 0.9, 3));
  });
  k.cyl(0xf4f6f8, 0.95, 1.25, 10.5, 12, tx, 2.5, tz);
  k.cyl(0xf4f6f8, 1.9, 1.9, 0.3, 12, tx, 12.8, tz);
  k.lathe(0x2d4a5e, [
    [1.55, 13.1],
    [2.35, 15.0],
  ], 12, tx, tz);
  k.cyl(0xf4f6f8, 2.2, 2.55, 0.45, 12, tx, 15.0, tz);
  k.cyl(PAL.metal, 0.05, 0.1, 0.9, 6, tx, 15.45, tz);
  k.gem(RED, 0.16, [tx, 16.3, tz]);
  k.box(PAL.white, 1.0, 0.14, 0.3, tx + 0.9, 15.6, tz);
};

// ---------------------------------------------------------------------------
// Tier 10: mountains

/** Small seeded generator, so every mountain of a variant is the same mountain. */
function lcg(seed: number): () => number {
  let st = seed >>> 0;
  return () => {
    st = (Math.imul(st, 1664525) + 1013904223) >>> 0;
    return st / 4294967296;
  };
}

const MOUNTAIN = [
  { greens: [0x5fae4e, 0x74c05a] as Pair, rocks: [0x8d95a3, 0x7b8391] as Pair, snow: 0xf5f8fc, seed: 7 },
  { greens: [0x8fba4a, 0xa4c65a] as Pair, rocks: [0xa58d78, 0x917866] as Pair, snow: 0xf8f6f2, seed: 23 },
];

const mountain: Builder = (k, v) => {
  const c = MOUNTAIN[v];
  const rnd = lcg(c.seed);
  const buckets = new Map<number, number[]>();
  const emit = (a: V3, b: V3, d: V3, color: number) => {
    const list = buckets.get(color) ?? [];
    list.push(...a, ...b, ...d);
    buckets.set(color, list);
  };
  const half = 18.9;
  const clampXZ = (p: V3): V3 => [Math.max(-half, Math.min(half, p[0])), p[1], Math.max(-half, Math.min(half, p[2]))];
  const pineSpots: V3[] = [];
  const peak = (cx: number, cz: number, R: number, Hp: number, seg: number, rings: number) => {
    const grid: V3[][] = [];
    for (let j = 0; j < rings; j++) {
      const t = j / rings;
      const row: V3[] = [];
      for (let i = 0; i < seg; i++) {
        const ang = ((i + (j === 0 ? 0 : (rnd() - 0.5) * 0.6)) * Math.PI * 2) / seg + j * 0.19;
        // Radius falls fast near the foot and slowly near the top: a broad skirt of
        // slopes under a craggy peak.
        const rr = R * (1 - Math.pow(t, 0.75)) * (j === 0 ? 0.9 + 0.1 * rnd() : 0.82 + 0.26 * rnd());
        // Rings climb slowly at first, giving a broad foot of green slopes under steeper rock.
        const yy = j === 0 ? 0 : Hp * Math.pow(t, 1.3) * (0.9 + 0.2 * rnd());
        row.push(clampXZ([cx + rr * Math.sin(ang), yy, cz + rr * Math.cos(ang)]));
      }
      grid.push(row);
    }
    const apex: V3 = [cx + (rnd() - 0.5) * 1.5, Hp, cz + (rnd() - 0.5) * 1.5];
    const colorFor = (a: V3, b: V3, d: V3) => {
      const y = (a[1] + b[1] + d[1]) / 3 + (rnd() - 0.5) * 3;
      const pick = rnd() < 0.5 ? 0 : 1;
      if (y > Hp * 0.64 && y > 20) return c.snow;
      if (y < 12) return c.greens[pick];
      return c.rocks[pick];
    };
    for (let j = 0; j < rings - 1; j++) {
      for (let i = 0; i < seg; i++) {
        const i2 = (i + 1) % seg;
        const a = grid[j][i];
        const b = grid[j][i2];
        const d = grid[j + 1][i];
        const e = grid[j + 1][i2];
        emit(a, b, d, colorFor(a, b, d));
        emit(e, d, b, colorFor(e, d, b));
      }
    }
    for (let i = 0; i < seg; i++) {
      const a = grid[rings - 1][i];
      const b = grid[rings - 1][(i + 1) % seg];
      emit(a, b, apex, colorFor(a, b, apex));
    }
    for (let i = 0; i < seg; i += 3) pineSpots.push(grid[1][i]);
  };
  if (v === 0) {
    peak(0.5, -0.5, 18.0, 45, 15, 8);
    peak(-7.0, 6.5, 9, 25, 11, 6);
    peak(8.6, 8.0, 7.2, 18, 10, 5);
  } else {
    peak(-2.5, -1.5, 16.0, 45, 13, 8);
    peak(6.0, 1.5, 12, 36, 12, 7);
    peak(-2.0, 10, 7.5, 16, 10, 5);
  }
  for (const [color, list] of buckets) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(list, 3));
    g.computeVertexNormals();
    k.add(g, color);
  }
  // Pines on the lower slopes.
  for (const p of pineSpots) {
    const [x, y, z] = p;
    k.cyl(PAL.bark, 0.18, 0.24, 0.9, 5, x, y - 0.3, z);
    k.cyl(0x2f7f45, 0, 1.2, 2.3, 6, x, y + 0.4, z);
    k.cyl(0x3a9657, 0, 0.85, 1.7, 6, x, y + 1.6, z, { ry: 0.5 });
  }
};

export const LANDMARKS: Record<LandmarkKind, Builder> = {
  factory,
  warehouse,
  watertower,
  barn,
  chemplant,
  stadium,
  powerplant,
  mall,
  windturbine,
  jet,
  skyscraper,
  tvtower,
  terminal,
  mountain,
};
