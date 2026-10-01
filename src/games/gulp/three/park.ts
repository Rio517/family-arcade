/**
 * Town and park life for Gulp Universe: the people (walking, sitting on
 * benches, and the police), dogs, the police car, the garbage truck and the
 * ice-cream van, and the playground and dog-park gear. Same kit and rules as
 * props.ts: chunky soft toys, bold candy colours, and tops that read from the
 * high camera.
 */
import * as THREE from 'three';
import type { PropKind } from '../domain/catalog';
import {
  type Builder,
  type Face,
  type V3,
  CONCRETE_GREY,
  FLUSH,
  HALF_PI,
  Kit,
  ON_GROUND,
  PAL,
  SITE_ORANGE,
  SITE_YELLOW,
  barrier,
  carBody,
  darker,
  lighter,
  placement,
  translate,
  walls,
} from './kit';

export type ParkKind = Extract<
  PropKind,
  | 'person'
  | 'sitter'
  | 'dog'
  | 'police'
  | 'policecar'
  | 'swings'
  | 'slide'
  | 'seesaw'
  | 'sandbox'
  | 'climber'
  | 'carousel'
  | 'agility'
  | 'garbagetruck'
  | 'icecreamvan'
  | 'tallsite'
  | 'picnic'
  | 'hoop'
  | 'crane'
  | 'ship'
  | 'office'
>;

const RED = 0xe63946;
const YELLOW = 0xffc233;
const BLUE = 0x3a86ff;
const GREEN = 0x3cc95a;
const PINK = 0xff8fb8;
const PURPLE = 0x7a4de8;
const TEAL = 0x2ec4b6;
const ORANGE = 0xff8a1f;
const NAVY = 0x22346b;
const SAND = 0xf1d38e;

/**
 * A block with only its top edges chamfered: about half the triangles of a
 * fully chamfered box, for boards and caps that are mostly seen from above.
 */
function slab(k: Kit, color: number, w: number, h: number, d: number, b: number, x: number, y: number, z: number): void {
  const pts: V3[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      pts.push([x + (sx * w) / 2, y, z + (sz * d) / 2], [x + (sx * w) / 2, y + h - b, z + (sz * d) / 2]);
      pts.push([x + sx * (w / 2 - b), y + h, z + sz * (d / 2 - b)]);
    }
  }
  k.hull(color, pts);
}

// ---------------------------------------------------------------------------
// People
//
// Chunky soft toys: a big bevelled head about two fifths of the height, a
// hair shape that tells people apart from above, a dot-eyed smiling face,
// and short stubby arms and legs. Walkers, sitters and the police share the
// same head, so a crowd looks like one town.

type Hair = 'short' | 'buns' | 'bob' | 'bald' | 'pigtails' | 'beanie';

/** The six townsfolk, by variant: outfit, skin, hair colour and shape, and an accent for bands and bows. */
const PEOPLE = [
  { shirt: 0xff4d4d, legs: 0x2f5fd0, skin: 0xf2c29b, hair: 0x3b2a20, style: 'short', accent: 0x3b2a20 },
  { shirt: 0xffc933, legs: 0x7a4de8, skin: 0xe8a37a, hair: 0xd9713a, style: 'buns', accent: 0xffe066 },
  { shirt: 0x2ec4b6, legs: 0xf4efe4, skin: 0xffd9bd, hair: 0xf2c14e, style: 'bob', accent: 0xff8fb8 },
  { shirt: 0xff8a1f, legs: 0x39476b, skin: 0xe8b48a, hair: 0xc9ccd4, style: 'bald', accent: 0xc9ccd4 },
  { shirt: 0xff8fb8, legs: 0x3a7bff, skin: 0x8d5a3b, hair: 0x2b1d14, style: 'pigtails', accent: 0xffd23f },
  { shirt: 0x3cc95a, legs: 0x8a5a3b, skin: 0x5c3a24, hair: 0x1f1a17, style: 'beanie', accent: 0x3a86ff },
] as const satisfies ReadonlyArray<{
  shirt: number;
  legs: number;
  skin: number;
  hair: number;
  style: Hair;
  accent: number;
}>;

const SHOE = 0x3a3f4b;
const CHEEK = 0xff9c9c;

/**
 * The toy head, drawn with its base at the origin and facing +z: a bevelled
 * block of skin, two dot eyes, a small smile and rosy cheeks, then the hair.
 * Its top stays under 0.75 so it fits every body it sits on.
 */
function toyHead(k: Kit, skin: number, hair: number, style: Hair | 'none', accent: number): void {
  k.cbox(skin, 0.62, 0.58, 0.56, 0.13, 0, 0, 0);
  for (const sx of [-1, 1]) {
    k.box(PAL.ink, 0.075, 0.1, 0.03, sx * 0.12, 0.27, 0.28, undefined, FLUSH);
    k.box(CHEEK, 0.08, 0.045, 0.02, sx * 0.19, 0.2, 0.28, undefined, FLUSH);
  }
  // A smile: half a thin ring, turned so it curves up at the ends.
  k.add(new THREE.TorusGeometry(0.06, 0.016, 2, 5, Math.PI), PAL.ink, placement(0, 0.21, 0.285, { rz: Math.PI }));
  const cap = (color: number, h = 0.2, y = 0.45) => k.cbox(color, 0.68, h, 0.62, 0.08, 0, y, -0.01);
  // Kept a little inside the footprint: Kit.build lifts flush details outward a hair.
  const back = (h: number, y: number) => k.box(hair, 0.66, h, 0.1, 0, y, -0.25, undefined, ['py']);
  switch (style) {
    case 'short':
      cap(hair);
      back(0.3, 0.18);
      break;
    case 'buns':
      // Hair pulled up into two round buns, with a bright band.
      cap(hair);
      k.box(accent, 0.66, 0.06, 0.6, 0, 0.43, -0.01, undefined, ['py', 'ny']);
      for (const sx of [-1, 1]) k.ico(hair, 0.15, 0, [sx * 0.24, 0.62, -0.06], [1, 0.9, 1], sx);
      break;
    case 'bob':
      cap(hair, 0.22, 0.44);
      back(0.46, 0.08);
      for (const sx of [-1, 1]) k.box(hair, 0.08, 0.42, 0.46, sx * 0.34, 0.1, -0.04, undefined, ['py']);
      k.gem(accent, 0.07, [0.24, 0.62, 0.16]);
      break;
    case 'bald':
      // A shiny top, with a fringe of grey hair round the back and sides.
      back(0.2, 0.2);
      for (const sx of [-1, 1]) k.box(hair, 0.07, 0.2, 0.34, sx * 0.315, 0.2, -0.08, undefined, ['nz']);
      break;
    case 'pigtails':
      cap(hair);
      back(0.28, 0.2);
      for (const sx of [-1, 1]) {
        k.ico(hair, 0.1, 0, [sx * 0.36, 0.26, -0.04], [0.8, 1.4, 0.8], sx);
        k.gem(accent, 0.065, [sx * 0.35, 0.43, -0.04]);
      }
      break;
    case 'beanie':
      back(0.24, 0.18);
      cap(accent, 0.26, 0.4);
      k.box(lighter(accent, 0.45), 0.7, 0.07, 0.62, 0, 0.4, -0.01, undefined, ['py', 'ny']);
      k.ico(lighter(accent, 0.45), 0.1, 0, [0, 0.63, -0.02]);
      break;
    case 'none':
      break;
  }
}

/**
 * A standing toy person facing +z: shoes, short legs, a soft body, stubby
 * arms with skin-coloured hands, and the big head.
 */
function person(k: Kit, v: number): void {
  const c = PEOPLE[v];
  for (const sx of [-1, 1]) {
    k.box(SHOE, 0.22, 0.1, 0.3, sx * 0.13, 0, 0.03, undefined, ON_GROUND);
    k.box(c.legs, 0.2, 0.34, 0.22, sx * 0.13, 0.1, 0, undefined, ['py', 'ny']);
    // Drawn from the hand up to the shoulder: a beam pointing down turns its cross-section awkwardly.
    k.beam(c.shirt, [sx * 0.36, 0.62, 0.02], [sx * 0.3, 0.9, 0], 0.14, 0.18);
    k.box(c.skin, 0.12, 0.12, 0.14, sx * 0.37, 0.52, 0.02);
  }
  k.box(c.legs, 0.5, 0.12, 0.34, 0, 0.4, 0, undefined, ON_GROUND);
  slab(k, c.shirt, 0.54, 0.47, 0.38, 0.1, 0, 0.48, 0);
  k.within(translate(0, 0.95, 0), () => toyHead(k, c.skin, c.hair, c.style, c.accent));
}

/** Bottom of a sitter: a bench seat's slats top out at 0.5, so this sinks into them a touch and never floats. */
const SEAT = 0.46;

/**
 * A toy person sitting on a bench seat, facing +z: thighs forward, shins down
 * to the ground, hands resting on the knees. The body sits forward of the
 * bench's leaning backrest, and the head is a little smaller so a sitter
 * stays shorter than a walker.
 */
function sitter(k: Kit, v: number): void {
  const c = PEOPLE[v];
  for (const sx of [-1, 1]) {
    k.box(SHOE, 0.22, 0.1, 0.28, sx * 0.13, 0, 0.4, undefined, ON_GROUND);
    k.box(c.legs, 0.2, SEAT - 0.1, 0.2, sx * 0.13, 0.1, 0.38, undefined, ['py', 'ny']);
    k.box(c.legs, 0.2, 0.18, 0.56, sx * 0.13, SEAT, 0.2);
    k.beam(c.shirt, [sx * 0.31, 0.68, 0.28], [sx * 0.3, 0.8, 0.02], 0.14, 0.16);
    k.box(c.skin, 0.12, 0.12, 0.13, sx * 0.29, 0.62, 0.34);
  }
  slab(k, c.shirt, 0.54, 0.36, 0.38, 0.1, 0, SEAT, 0);
  k.within(placement(0, SEAT + 0.36, 0, undefined, [0.88, 0.88, 0.88]), () =>
    toyHead(k, c.skin, c.hair, c.style, c.accent),
  );
}

/**
 * A friendly police officer: the toy person in a navy uniform, with a peaked
 * cap, a gold badge on the cap and the chest, and the right arm raised. No
 * weapons of any kind: the scene adds a baton on its own, pivoting at
 * (-0.45, 1.25, 0.1), so the raised hand sits just inside that point.
 */
function police(k: Kit): void {
  const shirt = 0x2f4f9e;
  const skin = 0xf2c29b;
  for (const sx of [-1, 1]) {
    k.box(PAL.ink, 0.22, 0.1, 0.3, sx * 0.13, 0, 0.03, undefined, ON_GROUND);
    k.box(NAVY, 0.2, 0.38, 0.22, sx * 0.13, 0.1, 0, undefined, ['py', 'ny']);
  }
  k.box(NAVY, 0.5, 0.12, 0.34, 0, 0.44, 0, undefined, ON_GROUND);
  slab(k, shirt, 0.54, 0.5, 0.38, 0.1, 0, 0.5, 0);
  k.box(PAL.ink, 0.56, 0.07, 0.4, 0, 0.52, 0, undefined, ON_GROUND);
  k.box(PAL.brass, 0.1, 0.07, 0.03, 0, 0.52, 0.2, undefined, FLUSH);
  k.gem(PAL.brass, 0.07, [0.13, 0.84, 0.2]);
  // Left arm down at the side, right arm up to hold the baton.
  k.beam(shirt, [0.36, 0.66, 0.02], [0.3, 0.95, 0], 0.14, 0.18);
  k.box(skin, 0.12, 0.12, 0.14, 0.37, 0.56, 0.02);
  k.beam(shirt, [-0.3, 0.9, 0.02], [-0.36, 1.12, 0.08], 0.14, 0.18);
  k.box(skin, 0.12, 0.12, 0.14, -0.37, 1.1, 0.1);
  k.within(translate(0, 1.0, 0), () => {
    toyHead(k, skin, 0x3b2a20, 'none', 0);
    k.box(0x3b2a20, 0.66, 0.26, 0.1, 0, 0.2, -0.25, undefined, ['py']);
    // The cap: a white band, a wide navy crown, a shiny black peak and a badge.
    k.box(PAL.white, 0.66, 0.1, 0.6, 0, 0.42, -0.01, undefined, ['py', 'ny']);
    slab(k, NAVY, 0.72, 0.18, 0.62, 0.06, 0, 0.52, -0.01);
    k.box(PAL.ink, 0.5, 0.04, 0.09, 0, 0.44, 0.26, { rx: 0.2 });
    k.box(PAL.brass, 0.13, 0.13, 0.03, 0, 0.53, 0.3, undefined, FLUSH);
  });
}

// ---------------------------------------------------------------------------
// Dogs

const DOGS = [
  { coat: 0xa0663a, ear: 0x6b4226, snout: 0xd09a68, collar: RED, patch: null },
  { coat: 0xeab45c, ear: 0xc98636, snout: 0xf8dca4, collar: BLUE, patch: null },
  { coat: PAL.white, ear: PAL.ink, snout: PAL.white, collar: RED, patch: PAL.ink },
  { coat: 0x9aa1ab, ear: 0x676d78, snout: 0xcfd4dc, collar: YELLOW, patch: null },
] as const;

/** A blocky toy dog facing +z: long body, four legs, a big head with a snout and floppy ears, tail up. */
function dog(k: Kit, v: number): void {
  const c = DOGS[v];
  const dz = -0.03;
  for (const sx of [-1, 1]) {
    for (const z of [-0.26, 0.14]) k.box(c.coat, 0.1, 0.26, 0.1, sx * 0.1, 0, z + dz, undefined, ON_GROUND);
  }
  k.cbox(c.coat, 0.32, 0.28, 0.62, 0.06, 0, 0.22, -0.06 + dz);
  k.beam(c.patch ?? c.coat, [0, 0.44, -0.34 + dz], [0, 0.66, -0.45 + dz], 0.07);
  k.box(c.collar, 0.3, 0.08, 0.14, 0, 0.44, 0.19 + dz);
  const hz = 0.28 + dz;
  k.cbox(c.coat, 0.3, 0.26, 0.28, 0.06, 0, 0.42, hz);
  k.box(c.snout, 0.18, 0.13, 0.14, 0, 0.43, hz + 0.19, undefined, ['nz']);
  k.box(PAL.ink, 0.08, 0.06, 0.04, 0, 0.51, hz + 0.26, undefined, FLUSH);
  for (const sx of [-1, 1]) {
    k.box(PAL.ink, 0.05, 0.06, 0.03, sx * 0.07, 0.58, hz + 0.14, undefined, FLUSH);
    k.box(c.ear, 0.06, 0.2, 0.13, sx * 0.17, 0.44, hz - 0.02, { rz: sx * 0.2 });
  }
  if (c.patch !== null) {
    k.box(c.patch, 0.22, 0.03, 0.24, 0.02, 0.5, -0.14 + dz, undefined, ON_GROUND);
    k.box(c.patch, 0.1, 0.1, 0.02, 0.07, 0.54, hz + 0.14, undefined, FLUSH);
  }
}

// ---------------------------------------------------------------------------
// Police car

/**
 * A toy police car on the same body, cabin and wheels as the town's `car`
 * in props.ts: a navy body with white doors and roof, a blue stripe along
 * the doors, a gold badge, and a red and blue light bar on the roof.
 */
function policecar(k: Kit): void {
  const body = NAVY;
  // The town's `car` (props.ts) shares this same body; here the roof and
  // pillars come out white for the black-and-white livery.
  carBody(k, body, PAL.white);
  for (const sx of [-1, 1]) {
    // White doors on the flat of the side, between the wheel arches, with the stripe across them.
    const away = sx > 0 ? 'nx' : 'px';
    k.box(PAL.white, 0.04, 0.34, 1.84, sx * 0.96, 0.44, -0.05, undefined, [away]);
    k.box(BLUE, 0.04, 0.1, 1.84, sx * 0.975, 0.56, -0.05, undefined, [away]);
    k.box(PAL.brass, 0.03, 0.14, 0.14, sx * 0.99, 0.64, 0.45, undefined, [away]);
  }
  // A white stripe down the bonnet so it still reads as a police car from above.
  k.box(PAL.white, 0.5, 0.02, 0.9, 0, 0.92, 1.4, undefined, ON_GROUND);
  // Light bar: red on one side, blue on the other, on a dark base.
  k.box(PAL.ink, 1.1, 0.06, 0.34, 0, 1.58, -0.22);
  k.cbox(RED, 0.48, 0.22, 0.32, 0.05, -0.28, 1.64, -0.22);
  k.cbox(BLUE, 0.48, 0.22, 0.32, 0.05, 0.28, 1.64, -0.22);
  k.box(PAL.white, 0.1, 0.14, 0.28, 0, 1.64, -0.22);
}

// ---------------------------------------------------------------------------
// Town trucks

/** A flat shape of `thick` lying on top of y, from (x, z) corner points: roof marks. */
function flat(k: Kit, color: number, pts: ReadonlyArray<readonly [number, number]>, y: number, thick: number): void {
  k.hull(
    color,
    pts.flatMap(([x, z]): V3[] => [
      [x, y, z],
      [x, y + thick, z],
    ]),
  );
}

/**
 * The recycling mark, three arrows chasing round a triangle, lying on the
 * roof at y around (0, z), `r` from the centre to each corner.
 */
function recycleMark(k: Kit, color: number, y: number, z: number, r: number): void {
  const corner = (j: number): [number, number] => {
    const a = -HALF_PI + (j * Math.PI * 2) / 3;
    return [r * Math.cos(a), z + r * Math.sin(a)];
  };
  for (let i = 0; i < 3; i++) {
    const [px, pz] = corner(i);
    const [qx, qz] = corner(i + 1);
    const at = (t: number): [number, number] => [px + (qx - px) * t, pz + (qz - pz) * t];
    const len = Math.hypot(qx - px, qz - pz);
    const nx = -(qz - pz) / len;
    const nz = (qx - px) / len;
    const [ax, az] = at(0.14);
    const [bx, bz] = at(0.66);
    const w = r * 0.13;
    flat(k, color, [
      [ax + nx * w, az + nz * w],
      [ax - nx * w, az - nz * w],
      [bx + nx * w, bz + nz * w],
      [bx - nx * w, bz - nz * w],
    ], y, 0.05);
    const h = r * 0.3;
    const [tx, tz] = at(0.9);
    flat(k, color, [
      [bx + nx * h, bz + nz * h],
      [bx - nx * h, bz - nz * h],
      [tx, tz],
    ], y, 0.05);
  }
}

const GARBAGE = [
  { body: 0x3fae5a, cab: PAL.white, trim: 0x2f8a46, stripe: PAL.white, bins: [BLUE, 0x2f8a46] },
  { body: 0xff8a1f, cab: 0xb8c0cc, trim: 0xd96e0e, stripe: 0x5d6470, bins: [0x5d6470, GREEN] },
] as const;

/**
 * A sanitation truck: a cab at the front (+z), a ribbed compactor body with a
 * recycling mark on its roof, a rear hopper with a hazard band, and a bin
 * lifter with two wheelie bins hanging off the back. Tyres stand proud of the
 * body like the town's vans and buses.
 */
function garbagetruck(k: Kit, v: number): void {
  const c = GARBAGE[v];
  for (const sx of [-1, 1]) for (const z of [2.6, -1.0, -2.1]) k.wheel(0.55, 0.4, [sx * 1.12, 0.55, z], 10);
  k.box(PAL.chassis, 2.0, 0.4, 6.4, 0, 0.35, -0.1);
  // Cab.
  k.cbox(c.cab, 2.3, 1.95, 1.8, 0.16, 0, 0.6, 2.85);
  k.box(PAL.carGlass, 1.9, 0.75, 0.08, 0, 1.55, 3.76);
  k.box(PAL.ink, 1.1, 0.36, 0.06, 0, 0.8, 3.77);
  k.box(PAL.metal, 2.3, 0.22, 0.14, 0, 0.45, 3.77);
  for (const sx of [-1, 1]) {
    k.box(PAL.carGlass, 0.06, 0.65, 0.9, sx * 1.16, 1.6, 3.0);
    k.box(PAL.head, 0.36, 0.18, 0.06, sx * 0.78, 0.95, 3.77);
    k.box(c.cab, 0.1, 0.34, 0.1, sx * 1.2, 1.6, 3.4);
    k.box(PAL.tail, 0.18, 0.36, 0.06, sx * 1.02, 0.85, -3.07);
  }
  k.box(PAL.ink, 1.0, 0.06, 0.3, 0, 2.55, 2.5);
  for (const sx of [-1, 1]) k.cbox(0xffb703, 0.34, 0.2, 0.26, 0.05, sx * 0.3, 2.61, 2.5);
  // Compactor body: ribs down the sides, a band, and the recycling mark on top.
  k.cbox(c.body, 2.4, 2.5, 4.4, 0.16, 0, 0.6, -0.35);
  k.box(c.stripe, 2.44, 0.3, 4.1, 0, 1.2, -0.35);
  for (let i = 0; i < 4; i++) k.box(c.trim, 2.46, 2.0, 0.14, 0, 0.8, -2.0 + i * 1.12);
  k.rbox(PAL.white, 1.8, 0.06, 1.8, 0.45, 0, 0, 3.1, -0.45, { seg: 1 });
  recycleMark(k, 0x2e9e4f, 3.16, -0.45, 0.66);
  // Rear hopper: a dark mouth under a yellow and black band.
  k.cbox(darker(c.body, 0.15), 2.36, 2.3, 0.5, 0.12, 0, 0.7, -2.8);
  k.box(PAL.ink, 1.8, 0.6, 0.06, 0, 1.0, -3.06);
  for (let i = 0; i < 6; i++) k.box(i % 2 ? PAL.ink : 0xffc61a, 0.36, 0.2, 0.05, -0.9 + i * 0.36, 2.45, -3.06);
  // Bin lifter and two wheelie bins on its hooks.
  for (const sx of [-1, 1]) k.box(PAL.metal, 0.08, 1.05, 0.08, sx * 0.95, 0.85, -3.12);
  k.box(PAL.metal, 2.0, 0.1, 0.1, 0, 1.86, -3.14);
  c.bins.forEach((col, i) => {
    const x = i ? 0.45 : -0.45;
    k.box(col, 0.55, 0.75, 0.5, x, 1.0, -3.4);
    k.box(darker(col, 0.25), 0.6, 0.08, 0.55, x, 1.75, -3.4);
    k.box(PAL.ink, 0.1, 0.12, 0.3, x, 1.8, -3.2);
  });
}

const ICECREAM = [
  { body: 0xffc2d6, accent: 0x9fe2c8, scoop: 0xff8fb8 },
  { body: 0xb5f0d8, accent: 0xff8fb8, scoop: 0xfff1c9 },
] as const;

const WAFFLE = 0xe0a458;

/**
 * An ice-cream van: the town van's cab and box in pastel, stripes along the
 * sides and across the roof, a serving hatch with a counter and a striped
 * awning on the kerb side (+x), a cone picture on the other side, and a giant
 * soft-serve cone on the roof.
 */
function icecreamvan(k: Kit, v: number): void {
  const c = ICECREAM[v];
  const W = 2.1;
  for (const sx of [-1, 1]) for (const z of [-1.75, 1.7]) k.wheel(0.44, 0.3, [sx * 0.97, 0.44, z], 10);
  k.box(PAL.chassis, 1.8, 0.34, 5.0, 0, 0.26, 0);
  k.cbox(c.body, W, 2.3, 3.6, 0.14, 0, 0.42, -0.95);
  k.cbox(c.body, W - 0.04, 0.9, 1.9, 0.12, 0, 0.42, 1.8);
  k.hull(PAL.carGlass, [
    [-0.94, 1.28, 0.85],
    [0.94, 1.28, 0.85],
    [-0.94, 1.28, 2.45],
    [0.94, 1.28, 2.45],
    [-0.87, 2.2, 0.85],
    [0.87, 2.2, 0.85],
    [-0.87, 2.2, 1.55],
    [0.87, 2.2, 1.55],
  ]);
  k.cbox(c.body, 1.86, 0.12, 0.96, 0.04, 0, 2.14, 1.28);
  for (const sx of [-1, 1]) {
    k.beam(c.body, [sx * 0.91, 1.28, 2.4], [sx * 0.86, 2.2, 1.52], 0.12);
    k.beam(c.body, [sx * 0.92, 1.28, 1.2], [sx * 0.88, 2.2, 1.2], 0.1);
    k.box(PAL.head, 0.36, 0.18, 0.06, sx * 0.62, 0.9, 2.76);
    k.box(PAL.tail, 0.18, 0.36, 0.06, sx * 0.85, 0.8, -2.76);
    k.box(c.body, 0.12, 0.12, 0.14, sx * 1.07, 1.6, 2.2);
  }
  for (const sz of [-1, 1]) k.box(PAL.metal, 2.14, 0.18, 0.16, 0, 0.3, sz * 2.8);
  k.box(PAL.ink, 1.2, 0.18, 0.05, 0, 0.7, 2.76);
  // Pastel stripes along the sides and across the roof.
  k.box(PAL.white, W + 0.04, 0.2, 3.4, 0, 0.7, -0.95);
  k.box(c.accent, W + 0.04, 0.2, 3.4, 0, 0.9, -0.95);
  for (let i = 0; i < 7; i++) {
    k.box(i % 2 ? PAL.white : c.accent, W - 0.3, 0.04, 0.44, 0, 2.72, -2.5 + i * 0.5, undefined, ON_GROUND);
  }
  // Serving hatch on the kerb side: a dark window, a counter with cones on it, and an awning.
  k.box(0x5a3a4a, 0.06, 0.85, 1.7, 1.04, 1.28, -1.1, undefined, ['nx']);
  k.box(PAL.white, 0.28, 0.08, 1.9, 1.16, 1.2, -1.1);
  for (const z of [-1.6, -1.1, -0.6]) {
    k.cyl(WAFFLE, 0.07, 0.02, 0.18, 6, 1.16, 1.28, z);
    k.ico(z === -1.1 ? c.accent : c.scoop, 0.08, 0, [1.16, 1.5, z]);
  }
  const n = 6;
  for (let i = 0; i < n; i++) {
    k.box(i % 2 ? PAL.white : c.accent, 0.28, 0.05, 1.9 / n, 1.17, 2.2, -2.05 + (i + 0.5) * (1.9 / n), { rz: -0.35 });
  }
  // A cone picture on the road side.
  k.hull(WAFFLE, [
    [-1.05, 1.95, -1.4],
    [-1.09, 1.95, -1.4],
    [-1.05, 1.95, -0.6],
    [-1.09, 1.95, -0.6],
    [-1.05, 1.05, -1.0],
    [-1.09, 1.05, -1.0],
  ]);
  k.rod(c.scoop, 0.36, 0.06, 10, [-1.08, 2.12, -1.0], { rz: HALF_PI });
  // The giant soft-serve cone on the roof, with a cherry.
  const cz = -1.1;
  k.cyl(darker(c.body, 0.2), 0.3, 0.34, 0.1, 10, 0, 2.72, cz);
  // The swirl stays narrower than the cone's rim, so it reads as soft serve rather than a cupcake.
  k.cyl(WAFFLE, 0.46, 0.1, 0.55, 10, 0, 2.72, cz);
  k.cyl(darker(WAFFLE, 0.15), 0.48, 0.46, 0.08, 10, 0, 3.2, cz, { open: true });
  k.cyl(c.scoop, 0.36, 0.44, 0.2, 10, 0, 3.27, cz);
  k.cyl(lighter(c.scoop, 0.4), 0.22, 0.32, 0.19, 10, 0.02, 3.47, cz, { ry: 0.3 });
  k.cyl(c.scoop, 0, 0.19, 0.22, 10, 0.04, 3.66, cz, { ry: 0.6 });
}

// ---------------------------------------------------------------------------
// Town extras: a tower going up, picnic tables, a basketball hoop, and the port

/** This tower's own glass, bluer than the small buildings' so a site under wraps still stands out. */
const SITE_GLASS = 0x6fd8ff;

const TALLSITES = [
  { crane: SITE_YELLOW, net: 0x8fdc4a },
  { crane: RED, net: 0x3aa0ff },
] as const;

/**
 * A tower going up: the step between a building site and a skyscraper. A
 * concrete core and bare floor slabs on columns, the lowest floors already
 * glazed and the top ones still open with rebar showing; scaffolding with
 * bright safety netting on two faces; hoarding round the lot; and a tall tower
 * crane whose jib reaches out over the roof with a load on its hook.
 */
function tallsite(k: Kit, v: number): void {
  const c = TALLSITES[v];
  const dirt = 0xd9a066;
  k.rbox(dirt, 11.8, 0.2, 11.8, 1.0, 0.08, 0, 0, 0, { seg: 1 });
  barrier(k, 11.8, 11.8, 1.6, 1.2, 3.0);
  // The frame: floors of bare slabs on columns round a concrete core.
  const S = 7.6;
  const bx = -0.6;
  const bz = -0.6;
  const fh = 3.2;
  const floors = 6;
  const y0 = 0.2;
  k.box(CONCRETE_GREY, 2.6, 21.2, 2.6, bx, y0, bz, undefined, ON_GROUND);
  k.box(darker(CONCRETE_GREY, 0.2), 1.2, 2.2, 0.08, bx, y0 + 18.6, bz + 1.34, undefined, FLUSH);
  // The columns run up through the slabs in one piece each: the slabs hide where they cross.
  for (const px of [-1, 0, 1]) {
    for (const pz of [-1, 0, 1]) {
      if (px === 0 && pz === 0) continue;
      k.box(lighter(CONCRETE_GREY, 0.1), 0.34, floors * fh, 0.34, bx + px * (S / 2 - 0.3), y0, bz + pz * (S / 2 - 0.3), undefined, ['py', 'ny']);
    }
  }
  for (let f = 0; f <= floors; f++) {
    const y = y0 + f * fh;
    const top = f === floors;
    // The top slab is only half poured.
    if (top) k.box(CONCRETE_GREY, S, 0.3, S / 2, bx, y, bz - S / 4);
    else if (f > 0) k.box(CONCRETE_GREY, S, 0.3, S, bx, y, bz);
    if (top) continue;
    // The lowest two floors are already glazed.
    if (f < 2) k.box(SITE_GLASS, S - 0.9, fh - 0.3, S - 0.9, bx, y + (f === 0 ? 0 : 0.3), bz, undefined, ['py', 'ny']);
  }
  // Rebar sticking up from the columns on the unfinished top.
  const yt = y0 + floors * fh + 0.3;
  for (const px of [-1, 1]) {
    for (const pz of [-1, 1]) k.box(0xb5523b, 0.12, 1.3, 0.12, bx + px * (S / 2 - 0.3), yt, bz + pz * (S / 2 - 0.3), undefined, ['ny']);
  }
  // Scaffolding and netting on the front (+z) and right (+x) faces.
  const out = S / 2 + 0.7;
  const scaffH = floors * fh - 0.4;
  for (const [nx, nz] of [
    [0, 1],
    [1, 0],
  ] as const) {
    const px = bx + nx * out;
    const pz = bz + nz * out;
    for (let i = 0; i < 5; i++) {
      const u = -S / 2 + (i * S) / 4;
      k.box(SITE_YELLOW, 0.14, scaffH, 0.14, px + nz * u, y0, pz + nx * u, undefined, ['ny']);
    }
    for (let f = 1; f < floors; f++) {
      k.box(PAL.wood, nz ? S + 0.3 : 0.8, 0.1, nx ? S + 0.3 : 0.8, px - nx * 0.35, y0 + f * fh, pz - nz * 0.35);
    }
    // Netting panels between the poles over the upper floors, a hair outside
    // them, with one bay left open so the bare frame still shows.
    const ny0 = y0 + 3 * fh + 0.2;
    for (let i = 0; i < 4; i++) {
      if (i === (nx ? 1 : 2)) continue;
      const u = -S / 2 + ((i + 0.5) * S) / 4;
      k.box(c.net, nz ? S / 4 - 0.2 : 0.06, scaffH - 3 * fh - 0.2, nx ? S / 4 - 0.2 : 0.06, px + nz * u + nx * 0.12, ny0, pz + nx * u + nz * 0.12);
    }
  }
  // Tower crane at the back corner, its jib reaching over the roof.
  const mx = 4.6;
  const mz = -4.6;
  const top = 25.0;
  k.rbox(CONCRETE_GREY, 2.0, 0.5, 2.0, 0.3, 0.1, mx, 0.2, mz, { seg: 1 });
  k.box(c.crane, 0.8, top - 0.7, 0.8, mx, 0.7, mz, undefined, ['py', 'ny']);
  for (let y = 2.0; y < top - 1; y += 2.2) k.box(PAL.ink, 0.86, 0.14, 0.86, mx, y, mz, undefined, ['py', 'ny']);
  k.cbox(c.crane, 1.3, 1.0, 1.3, 0.12, mx, top - 1.0, mz + 0.9);
  k.box(SITE_GLASS, 1.0, 0.45, 0.06, mx, top - 0.7, mz + 1.56, undefined, FLUSH);
  const j0 = mx + 1.8;
  const j1 = -5.6;
  k.box(c.crane, j0 - j1, 0.55, 0.55, (j0 + j1) / 2, top, mz);
  k.cbox(CONCRETE_GREY, 1.4, 1.1, 0.9, 0.1, j0 - 0.8, top - 1.0, mz);
  k.hull(c.crane, [
    [mx - 0.35, top + 0.55, mz - 0.35],
    [mx + 0.35, top + 0.55, mz - 0.35],
    [mx - 0.35, top + 0.55, mz + 0.35],
    [mx + 0.35, top + 0.55, mz + 0.35],
    [mx, 27.6, mz],
  ]);
  const ends: readonly Face[] = ['py', 'ny'];
  k.beam(PAL.ink, [j1 + 2.4, top + 0.55, mz], [mx, 27.5, mz], 0.07, 0.07, ends);
  k.beam(PAL.ink, [j0 - 0.3, top + 0.55, mz], [mx, 27.5, mz], 0.07, 0.07, ends);
  // Trolley, cable and hook block with a bundle of steel beams.
  const hx = -3.2;
  k.box(PAL.ink, 0.7, 0.28, 0.7, hx, top - 0.28, mz);
  k.box(PAL.ink, 0.06, 2.6, 0.06, hx, top - 2.88, mz, undefined, ['py', 'ny']);
  k.cbox(RED, 0.4, 0.4, 0.4, 0.06, hx, top - 3.28, mz);
  for (let i = 0; i < 3; i++) k.box(0x3a86ff, 2.4, 0.18, 0.2, hx, top - 3.62, mz - 0.24 + i * 0.24);
  // Ground clutter: bricks, planks and cones by the gate.
  k.box(PAL.wood, 1.4, 0.18, 1.1, 3.4, 0.2, 3.4);
  k.box(0xd9483b, 1.2, 0.5, 0.9, 3.4, 0.38, 3.4);
  for (const x of [-1.9, 1.9]) {
    k.cyl(SITE_ORANGE, 0.05, 0.26, 0.7, 8, x, 0.2, 5.4);
    k.cyl(PAL.white, 0.14, 0.19, 0.16, 8, x, 0.5, 5.4, { open: true });
  }
}

const PICNICS = [
  { top: PAL.wood, frame: darker(PAL.wood, 0.3) },
  { top: 0x4f9d69, frame: darker(0x4f9d69, 0.35) },
] as const;

/** A picnic table with its two benches joined on, standing on crossed legs. */
function picnic(k: Kit, v: number): void {
  const c = PICNICS[v];
  const ends: readonly Face[] = ['py', 'ny'];
  for (const x of [-0.8, 0.8]) {
    // Crossed legs from the bench rails up to the table top, drawn upward.
    for (const s of [-1, 1]) k.beam(c.frame, [x, 0, s * 0.62], [x, 0.74, -s * 0.12], 0.08, 0.08, ends);
    k.box(c.frame, 0.08, 0.08, 1.7, x, 0.34, 0);
    k.box(c.frame, 0.08, 0.06, 0.74, x, 0.68, 0);
  }
  for (const z of [-0.26, 0, 0.26]) k.box(c.top, 2.1, 0.07, 0.24, 0, 0.74, z);
  for (const z of [-0.7, 0.7]) k.box(c.top, 2.0, 0.07, 0.3, 0, 0.42, z);
}

/**
 * A basketball hoop at the end of a court: a padded base, a pole and an arm
 * reaching forward to a white backboard with its red square, and an orange
 * rim with a white net below it, facing +z.
 */
function hoop(k: Kit): void {
  const pz = -0.7;
  k.cbox(0x2f6fd6, 0.56, 0.9, 0.56, 0.08, 0, 0, pz);
  k.cyl(0x5d6470, 0.07, 0.07, 2.2, 6, 0, 0.9, pz, { open: true });
  k.beam(0x5d6470, [0, 2.7, pz], [0, 2.95, 0.18], 0.1, 0.1, ['py', 'ny']);
  const bz = 0.25;
  k.box(PAL.white, 1.1, 0.72, 0.08, 0, 2.6, bz);
  // The red square above the rim, drawn as four bars on the backboard.
  const sy = 2.72;
  for (const [w, h, x, y] of [
    [0.44, 0.05, 0, sy],
    [0.44, 0.05, 0, sy + 0.31],
    [0.05, 0.36, -0.195, sy],
    [0.05, 0.36, 0.195, sy],
  ] as const) {
    k.box(RED, w, h, 0.03, x, y, bz + 0.05, undefined, FLUSH);
  }
  k.box(0x5d6470, 0.1, 0.06, 0.12, 0, 2.72, bz + 0.1);
  k.ring(ORANGE, 0.21, 0.025, [0, 2.76, bz + 0.34], { rx: HALF_PI }, 3, 10);
  // The net: white strings hanging from the rim and drawing in below it.
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + Math.PI / 6;
    k.beam(PAL.white, [0.12 * Math.sin(a), 2.42, bz + 0.34 + 0.12 * Math.cos(a)], [0.2 * Math.sin(a), 2.76, bz + 0.34 + 0.2 * Math.cos(a)], 0.025, 0.025, ['py', 'ny']);
  }
}

const CRANES = [
  { frame: 0xe63946, trim: PAL.white },
  { frame: 0x2f6fd6, trim: PAL.white },
] as const;

/**
 * A port gantry crane: four legs on bogies running along rails (along x) on
 * a strip of quay, a portal beam frame, a machinery house on top, and a long
 * boom reaching out over the water (+z) with a trolley and a container
 * spreader on its cables. Stays run from a tall A-frame to both boom ends.
 */
function crane(k: Kit, v: number): void {
  const c = CRANES[v];
  const ends: readonly Face[] = ['py', 'ny'];
  // Quay strip with a yellow edge at the water side, and the two rails.
  k.box(CONCRETE_GREY, 10.0, 0.12, 9.6, 0, 0, -1.2, undefined, ON_GROUND);
  k.box(SITE_YELLOW, 10.0, 0.04, 0.3, 0, 0.12, 3.45, undefined, ON_GROUND);
  const lx = 4.0;
  const lz = 2.3;
  for (const z of [-lz, lz]) k.box(PAL.ink, 10.0, 0.1, 0.25, 0, 0.12, z, undefined, ON_GROUND);
  const portal = 15.5;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      k.box(PAL.chassis, 1.3, 0.6, 0.9, sx * lx, 0.22, sz * lz, undefined, ON_GROUND);
      k.box(c.frame, 0.7, portal - 0.82, 0.7, sx * lx, 0.82, sz * lz, undefined, ['py', 'ny']);
    }
    // Side frame: a sill low down and a diagonal brace.
    k.box(c.frame, 0.5, 0.6, 2 * lz, sx * lx, 7.0, 0, undefined, ['nz', 'pz']);
    k.beam(c.frame, [sx * lx, 7.6, -lz + 0.3], [sx * lx, portal - 0.2, lz - 0.3], 0.35, 0.35, ends);
  }
  // Portal beams along x and z.
  for (const sz of [-1, 1]) k.box(c.frame, 2 * lx + 0.7, 1.0, 0.7, 0, portal, sz * lz);
  for (const sx of [-1, 1]) k.box(c.frame, 0.7, 1.0, 2 * lz - 0.7, sx * lx, portal, 0, undefined, ['pz', 'nz']);
  // Machinery house with a stripe.
  k.cbox(c.trim, 4.4, 2.4, 3.6, 0.15, 0, portal + 1.0, -1.4);
  k.box(c.frame, 4.44, 0.35, 3.64, 0, portal + 2.0, -1.4);
  // Boom: two girders from the back reach out over the water.
  const by = portal + 3.4;
  const z0 = -5.6;
  const z1 = 6.4;
  for (const sx of [-1, 1]) k.box(c.frame, 0.4, 0.9, z1 - z0, sx * 0.9, by, (z0 + z1) / 2);
  for (const z of [z0 + 0.3, -1.5, 2.5, z1 - 0.3]) k.box(c.frame, 1.8, 0.2, 0.3, 0, by + 0.35, z);
  // A-frame and stays.
  const apex: V3 = [0, 25.6, -1.2];
  for (const sx of [-1, 1]) k.beam(c.frame, [sx * 1.4, portal + 1.0, -1.2], apex, 0.4, 0.4, ends);
  k.cbox(c.trim, 0.8, 0.5, 0.8, 0.1, 0, 25.4, -1.2);
  k.beam(PAL.ink, [0, by + 0.9, z1 - 0.4], apex, 0.12, 0.12, ends);
  k.beam(PAL.ink, [0, by + 0.9, z0 + 0.4], apex, 0.12, 0.12, ends);
  // Trolley, cables and a spreader.
  const tz = 3.8;
  k.cbox(c.trim, 1.6, 0.8, 1.4, 0.1, 0, by - 0.6, tz);
  for (const sx of [-1, 1]) k.box(PAL.ink, 0.05, by - 0.6 - 10.3, 0.05, sx * 0.4, 10.3, tz, undefined, ['py', 'ny']);
  k.box(SITE_YELLOW, 1.2, 0.35, 3.2, 0, 9.95, tz);
}

const SHIPS = [
  { hull: 0x22346b, stripe: PAL.white },
  { hull: 0x2e8b57, stripe: PAL.white },
] as const;

/** The colours a ship's containers come in. */
export const BOXES = [0xe63946, 0x3a86ff, 0xffc21a, 0x2ec4b6, 0xff8a1f, 0x8e5cd9, 0xf4f5f7, 0x3fa34d] as const;

/** One shipping container on a ship's deck: 2.4 wide, 2.4 high and 6.1 long. */
export const CONTAINER = { w: 2.4, h: 2.4, d: 6.1 } as const;
/** The ship's deck height, where the bottom row of containers stands. */
const DECK = 4.6;
/** Container stacks: four bays (stern to bow) of four rows, stacks of one to three. */
const STACKS = [
  [2, 3, 3, 2],
  [3, 2, 3, 3],
  [2, 3, 2, 3],
  [1, 2, 2, 1],
] as const;
/** The thin gap between containers in a stack, and under the bottom one. */
const STACK_GAP = 0.06;

/** A container on a ship's deck: its middle in the ship's own frame, and its colour. */
export interface ShipBox {
  x: number;
  y: number;
  z: number;
  color: number;
}

/** A ship's variant as its model is built: whole, and wrapped round the ones there are (see buildKindGeometry). */
const shipVariant = (v: number): number => {
  const whole = Number.isFinite(v) ? Math.floor(v) : 0;
  return ((whole % SHIPS.length) + SHIPS.length) % SHIPS.length;
};

/**
 * The containers on a cargo ship of variant `variant`, as `ship` stacks
 * them, so a swallowed ship can spill them one by one (see propView.ts).
 */
export function shipCargo(variant: number): ShipBox[] {
  const v = shipVariant(variant);
  const boxes: ShipBox[] = [];
  const h = CONTAINER.h;
  STACKS.forEach((bay, b) => {
    const z = -10.8 + b * 6.4;
    bay.forEach((n, r) => {
      const x = -3.75 + r * 2.5;
      for (let i = 0; i < n; i++) {
        const color = BOXES[(b * 5 + r * 3 + i * 2 + v) % BOXES.length];
        boxes.push({ x, y: DECK + STACK_GAP + i * (h + STACK_GAP) + h / 2, z, color });
      }
    });
  });
  return boxes;
}

/**
 * A cargo ship, bow to +z, sitting in the water from y = 0: a strong-coloured
 * hull over a red waterline band, a white bridge and a funnel at the stern,
 * and stacks of containers in many colours along the deck, which is what
 * reads from the high camera. Without `cargo`, the deck is bare: the ship a
 * hole has swallowed falls in without its containers, which spill off on
 * their own.
 */
function cargoShip(k: Kit, v: number, cargo: boolean): void {
  const c = SHIPS[v];
  const deck = DECK;
  const band = 1.6;
  // The hull outline at a height: square stern, straight sides, pointed bow.
  const outline = (y: number, inset: number, bowZ: number): V3[] => {
    const hw = 5.8 - inset;
    return [
      [-hw, y, -21.2 + inset],
      [hw, y, -21.2 + inset],
      [-hw, y, 11.5],
      [hw, y, 11.5],
      [-hw * 0.72, y, 17.5],
      [hw * 0.72, y, 17.5],
      [0, y, bowZ - inset],
    ];
  };
  k.hull(RED, [...outline(0, 0.7, 19.2), ...outline(band, 0.35, 20.6)]);
  k.hull(c.hull, [...outline(band - 0.1, 0.4, 20.5), ...outline(deck, 0, 21.8)]);
  k.hull(0x9aa1ab, [...outline(deck - 0.1, 0.45, 21.2), ...outline(deck + 0.06, 0.45, 21.2)]);
  // A white line just under the deck edge, along both sides.
  for (const sx of [-1, 1]) k.box(c.stripe, 0.06, 0.25, 32.5, sx * 5.8, deck - 0.6, -4.95, undefined, [sx > 0 ? 'nx' : 'px']);
  if (cargo) {
    for (const b of shipCargo(v)) k.box(b.color, CONTAINER.w, CONTAINER.h, CONTAINER.d, b.x, b.y - CONTAINER.h / 2, b.z, undefined, ON_GROUND);
  }
  // Superstructure at the stern: accommodation, bridge with wings, funnel.
  const sz = -17.6;
  k.cbox(PAL.white, 8.4, 6.2, 5.0, 0.2, 0, deck, sz);
  k.box(PAL.white, 11.2, 1.3, 2.8, 0, deck + 5.6, sz + 0.9);
  k.box(0x2d3142, 11.24, 0.5, 2.84, 0, deck + 6.0, sz + 0.9);
  for (const y of [1.6, 3.2]) k.box(0x34506b, 7.0, 0.5, 0.08, 0, deck + y, sz + 2.5, undefined, FLUSH);
  k.cbox(PAL.white, 5.6, 1.4, 3.4, 0.15, 0, deck + 6.9, sz - 0.2);
  k.cbox(c.hull, 2.2, 2.6, 2.4, 0.3, 0, deck + 6.9, sz - 2.4);
  k.box(RED, 2.24, 0.5, 2.44, 0, deck + 8.6, sz - 2.4);
  k.box(PAL.ink, 1.6, 0.06, 1.8, 0, deck + 9.5, sz - 2.4, undefined, ON_GROUND);
  // A mast on the bow.
  k.box(0xe8e3da, 0.25, 3.2, 0.25, 0, deck, 18.2, undefined, ON_GROUND);
  k.box(0xe8e3da, 1.8, 0.2, 0.2, 0, deck + 2.6, 18.2);
}

const ship: Builder = (k, v) => cargoShip(k, v, true);

/** A cargo ship with a bare deck, in the same frame as the kind (its containers come from `shipCargo`). */
export function buildShipHullGeometry(v: number): THREE.BufferGeometry {
  const k = new Kit();
  cargoShip(k, shipVariant(v), false);
  const g = k.build();
  // Snap to the water the way buildKindGeometry does, so both frames agree.
  const minY = g.boundingBox?.min.y ?? 0;
  if (minY !== 0) g.translate(0, -minY, 0);
  return g;
}

/** One container spilled off a ship, its middle on the origin, closed on every side as it tumbles. */
export function buildContainerGeometry(color: number): THREE.BufferGeometry {
  const k = new Kit();
  k.box(color, CONTAINER.w, CONTAINER.h, CONTAINER.d, 0, -CONTAINER.h / 2, 0);
  return k.build();
}

// ---------------------------------------------------------------------------
// Office block

/** Warm off-white for plinths and roof rims, as the town's other buildings use. */
const OFFICE_CREAM = 0xfff6e6;
const OFFICE_DOOR_GLASS = 0x62b6ee;

const OFFICES = [
  { wall: 0xf4f1ea, glass: 0x3cc7c0, stripe: 0xff8a1f },
  { wall: 0x3e4c7a, glass: 0x4aa8ff, stripe: PAL.white },
  { wall: 0xf4f1ea, glass: 0x5cc98a, stripe: 0xffc933 },
] as const;

/**
 * A square, friendly mid-rise office block: soft rounded walls wrapped in long
 * ribbons of glass, a coloured stripe under each floor, a glassy lobby tucked
 * under the first floor with a canopy over the entrance (+z), and a flat roof
 * with air-conditioning boxes, a water tank and a small garden. Taller ones
 * gain floors; the lobby and roof stay the same.
 */
function office(k: Kit, v: number, s: number): void {
  const c = OFFICES[v];
  const H = 16 * s;
  const W = 13.0;
  const D = 13.0;
  const r = 1.4;
  const G = 4.2;
  const rimH = 0.6;
  const roofY = H - rimH - 1.2;
  const floors = Math.max(2, Math.round((roofY - G) / 3.4));
  const fh = (roofY - G) / floors;
  k.rbox(OFFICE_CREAM, W + 0.4, 0.3, D + 0.4, r + 0.2, 0.1, 0, 0, 0, { seg: 2 });
  // Lobby: a glass box set back under the first floor, with two bright pillars at the door.
  k.rbox(OFFICE_DOOR_GLASS, W - 1.6, G - 0.3, D - 1.6, r - 0.5, 0, 0, 0.3, 0, { seg: 2 });
  for (const sx of [-1, 1]) k.cyl(c.stripe, 0.3, 0.3, G - 0.3, 8, sx * 2.6, 0.3, D / 2 - 0.4);
  k.within(translate(0, 0, D / 2 - 0.8), () => {
    k.plate(PAL.white, 3.4, 2.8, 0.4, 0.12, 0, 0.3, 0, 1);
    k.plate(0x2f7fb8, 2.8, 2.5, 0.3, 0.18, 0, 0.3, 0, 1);
  });
  k.rbox(c.stripe, 6.4, 0.35, 1.0, 0.5, 0.12, 0, G - 0.35, D / 2 + 0.1, { seg: 1 });
  // The floors: the wall block, and per floor a coloured stripe and a glass ribbon wrapping every side.
  k.rbox(c.wall, W, roofY - G + 0.05, D, r, 0, 0, G, 0, { seg: 2 });
  const winH = Math.min(2.3, fh * 0.62);
  for (let f = 0; f < floors; f++) {
    const y = G + f * fh;
    k.rbox(c.stripe, W + 0.12, 0.45, D + 0.12, r + 0.06, 0, 0, y + 0.1, 0, { seg: 2 });
    k.rbox(c.glass, W + 0.08, winH, D + 0.08, r + 0.04, 0, 0, y + 0.1 + 0.45 + (fh - 0.45 - winH) / 2, 0, { seg: 2 });
  }
  // Cream fins up the faces break the glass ribbons into panes, so they read as windows.
  for (const wall of walls(W, D)) {
    k.within(wall.m, () => {
      const us = [-3.9, -1.3, 1.3, 3.9];
      for (const u of us) k.box(OFFICE_CREAM, 0.22, roofY - G, 0.3, u, G, 0.05, undefined, ['nz', 'py', 'ny']);
    });
  }
  // Roof: a thick soft rim, a pale deck, and the rooftop plant.
  k.rbox(OFFICE_CREAM, W + 0.4, rimH, D + 0.4, r + 0.2, 0.2, 0, roofY, 0, { seg: 2 });
  const top = roofY + rimH;
  k.rbox(0xd7dce2, W - 0.8, 0.05, D - 0.8, r - 0.2, 0, 0, top, 0, { seg: 1 });
  for (const [x, z] of [
    [-4.6, -3.2],
    [-2.4, -3.2],
    [-4.6, -1.2],
  ] as const) {
    k.cbox(0xb8c0cc, 1.7, 0.9, 1.3, 0.12, x, top + 0.05, z);
    k.cyl(0x5d6470, 0.42, 0.42, 0.06, 8, x, top + 0.95, z);
  }
  k.cyl(c.stripe, 1.0, 1.0, 0.95, 10, 4.4, top + 0.05, -2.8);
  k.cyl(lighter(c.stripe, 0.3), 0.1, 1.05, 0.2, 10, 4.4, top + 1.0, -2.8);
  // Solar panels, tilted to the sun.
  for (const x of [3.9, 5.4]) {
    for (const z of [0.6, 2.4]) k.box(0x2f4f9e, 1.3, 0.08, 1.4, x, top + 0.35, z, { rx: -0.3 });
  }
  k.rbox(0x8a5a3b, 4.2, 0.35, 2.4, 0.5, 0.1, 1.0, top + 0.05, 2.8, { seg: 1 });
  k.rbox(0x5cbf5a, 3.9, 0.06, 2.1, 0.4, 0, 1.0, top + 0.4, 2.8, { seg: 1 });
  for (const [x, rr] of [
    [-0.2, 0.55],
    [1.0, 0.65],
    [2.2, 0.5],
  ] as const) {
    k.ico(x === 1.0 ? PAL.leafLight : PAL.leaf, rr, 0, [x, top + 0.46 + rr * 0.6, 2.8], [1, 0.85, 1], x);
  }
}

// ---------------------------------------------------------------------------
// Playground

const SWINGS = [
  { frame: RED, seat: YELLOW, cap: YELLOW },
  { frame: BLUE, seat: PINK, cap: PINK },
] as const;

/** An A-frame swing set with two swings, one of them caught mid-swing. */
function swings(k: Kit, v: number): void {
  const c = SWINGS[v];
  const top = 2.45;
  const ex = 1.85;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) k.beam(c.frame, [sx * ex, 0, sz * 0.85], [sx * ex, top, 0], 0.13);
    k.box(c.frame, 0.09, 0.09, 1.08, sx * ex, 0.8, 0);
    k.gem(c.cap, 0.14, [sx * 1.97, top, 0]);
  }
  k.rod(c.frame, 0.1, 3.9, 8, [0, top, 0], { rz: HALF_PI });
  for (const [x, swing] of [
    [-0.85, 0],
    [0.85, -0.38],
  ] as const) {
    k.within(placement(x, top, 0, { rx: swing }), () => {
      for (const cx of [-0.24, 0.24]) k.box(PAL.metal, 0.04, 2.0, 0.04, cx, -2.0, 0);
      k.cbox(c.seat, 0.64, 0.09, 0.32, 0.03, 0, -2.07, 0);
    });
  }
}

const SLIDES = [
  { chute: YELLOW, frame: RED, roof: BLUE, deck: TEAL },
  { chute: PINK, frame: PURPLE, roof: GREEN, deck: YELLOW },
] as const;

/**
 * A run of convex slices along a path in the y-z plane, each slice spanning
 * x0..x1 and from `below` under the path to `above` over it: the slide's bed
 * and its side walls, joined without gaps at the bends.
 */
function sweep(k: Kit, color: number, path: readonly (readonly [number, number])[], x0: number, x1: number, below: number, above: number): void {
  for (let i = 0; i + 1 < path.length; i++) {
    const pts: V3[] = [];
    for (const [z, y] of [path[i], path[i + 1]]) {
      for (const x of [x0, x1]) pts.push([x, y - below, z], [x, y + above, z]);
    }
    k.hull(color, pts);
  }
}

/** A ladder up to a roofed platform and a bright slide down along +z. */
function slide(k: Kit, v: number): void {
  const c = SLIDES[v];
  const deck = 1.7;
  const pz = -1.35;
  const half = 0.55;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) k.box(c.frame, 0.12, 2.35, 0.12, sx * half, 0, pz + sz * half, undefined, ON_GROUND);
    k.box(c.frame, 0.07, 0.07, 1.1, sx * half, deck + 0.5, pz);
  }
  k.cbox(c.deck, 1.3, 0.14, 1.3, 0.04, 0, deck - 0.14, pz);
  // A pointed roof, like a little tower.
  const ry = 2.3;
  const e = 0.7;
  k.hull(c.roof, [
    [-e, ry, pz - e],
    [e, ry, pz - e],
    [-e, ry, pz + e],
    [e, ry, pz + e],
    [-e, ry + 0.08, pz - e],
    [e, ry + 0.08, pz - e],
    [-e, ry + 0.08, pz + e],
    [e, ry + 0.08, pz + e],
    [0, 2.78, pz],
  ]);
  k.gem(YELLOW, 0.1, [0, 2.82, pz]);
  // Ladder at the back, its rails running on up as handrails.
  const z0 = -2.28;
  const z1 = pz - half - 0.08;
  for (const sx of [-1, 1]) k.beam(c.frame, [sx * 0.36, 0, z0], [sx * 0.36, deck + 0.55, z1 + 0.1], 0.08);
  for (let i = 1; i <= 4; i++) {
    const t = (i * deck) / 5 / (deck + 0.55);
    k.box(PAL.metal, 0.66, 0.06, 0.07, 0, (i * deck) / 5, z0 + (z1 + 0.1 - z0) * t);
  }
  // The slide: a bed with raised sides, steep at the top and flattening out at the bottom.
  const path: ReadonlyArray<readonly [number, number]> = [
    [pz + half - 0.05, deck],
    [-0.4, deck - 0.1],
    [1.55, 0.44],
    [2.25, 0.3],
  ];
  const w = 0.72;
  sweep(k, c.chute, path, -w / 2, w / 2, 0.08, 0);
  for (const sx of [-1, 1]) sweep(k, darker(c.chute, 0.1), path, sx > 0 ? w / 2 : -w / 2 - 0.08, sx > 0 ? w / 2 + 0.08 : -w / 2, 0.08, 0.2);
  k.box(c.frame, 0.5, 0.24, 0.1, 0, 0, 2.12, undefined, ON_GROUND);
}

const SEESAWS = [
  { plank: RED, seat: YELLOW, base: BLUE },
  { plank: GREEN, seat: ORANGE, base: PURPLE },
] as const;

/** A plank on a pivot, one end down on its bumper tyre, with a seat and a handle at each end. */
function seesaw(k: Kit, v: number): void {
  const c = SEESAWS[v];
  const py = 0.46;
  k.hull(c.base, [
    [-0.24, 0, -0.32],
    [0.24, 0, -0.32],
    [-0.24, 0, 0.32],
    [0.24, 0, 0.32],
    [-0.16, py, 0],
    [0.16, py, 0],
  ]);
  k.rod(PAL.metal, 0.07, 0.5, 8, [0, py, 0], { rz: HALF_PI });
  k.cyl(PAL.ink, 0.16, 0.18, 0.25, 8, 0, 0, 1.52);
  k.within(placement(0, py + 0.02, 0, { rx: 0.15 }), () => {
    k.box(c.plank, 0.4, 0.08, 3.4, 0, 0, 0);
    for (const sz of [-1, 1]) {
      k.cbox(c.seat, 0.44, 0.08, 0.5, 0.03, 0, 0.08, sz * 1.38);
      for (const sx of [-1, 1]) k.box(c.base, 0.05, 0.22, 0.05, sx * 0.15, 0.08, sz * 1.02);
      k.box(c.base, 0.4, 0.06, 0.07, 0, 0.28, sz * 1.02);
    }
  });
}

/** A wooden sandpit with corner seats, a sandcastle, a bucket and a spade. */
function sandbox(k: Kit): void {
  const S = 2.9;
  const t = 0.18;
  const h = 0.3;
  const wood = PAL.wood;
  for (const sz of [-1, 1]) slab(k, wood, S, h, t, 0.05, 0, 0, sz * (S / 2 - t / 2));
  for (const sx of [-1, 1]) slab(k, darker(wood, 0.08), t, h, S - 2 * t, 0.05, sx * (S / 2 - t / 2), 0, 0);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const a = S / 2;
      const b = a - 0.6;
      k.hull(lighter(wood, 0.15), [
        [sx * a, h, sz * a],
        [sx * b, h, sz * a],
        [sx * a, h, sz * b],
        [sx * a, h + 0.06, sz * a],
        [sx * b, h + 0.06, sz * a],
        [sx * a, h + 0.06, sz * b],
      ]);
    }
  }
  const sy = 0.22;
  k.box(SAND, S - 2 * t + 0.02, sy, S - 2 * t + 0.02, 0, 0, 0, undefined, ON_GROUND);
  k.cyl(darker(SAND, 0.06), 0.12, 0.36, 0.12, 8, -0.55, sy, -0.55);
  // Sandcastle of wet sand: a block with four round towers, a keep and a little red flag.
  const cx = 0.42;
  const cz = -0.3;
  const castle = 0xd9a24a;
  k.box(castle, 0.6, 0.12, 0.6, cx, sy, cz);
  for (const tx of [-1, 1]) {
    for (const tz of [-1, 1]) {
      k.cyl(castle, 0.1, 0.11, 0.2, 6, cx + tx * 0.28, sy, cz + tz * 0.28);
      k.cyl(darker(castle, 0.1), 0.0, 0.1, 0.1, 6, cx + tx * 0.28, sy + 0.2, cz + tz * 0.28);
    }
  }
  k.box(lighter(castle, 0.1), 0.26, 0.14, 0.26, cx, sy + 0.12, cz);
  k.box(PAL.ink, 0.02, 0.09, 0.02, cx, sy + 0.26, cz);
  k.box(RED, 0.12, 0.06, 0.02, cx + 0.07, sy + 0.29, cz);
  // A red bucket with a yellow handle.
  const bx = -0.55;
  const bz = 0.5;
  k.cyl(RED, 0.15, 0.11, 0.2, 8, bx, sy, bz);
  k.cyl(darker(SAND, 0.1), 0.13, 0.13, 0.01, 8, bx, sy + 0.2, bz);
  k.add(new THREE.TorusGeometry(0.13, 0.018, 3, 6, Math.PI), YELLOW, placement(bx, sy + 0.2, bz));
  // A blue spade lying on the sand.
  k.within(placement(0.4, sy, 0.62, { ry: 0.5 }), () => {
    k.box(BLUE, 0.2, 0.03, 0.22, 0, 0, 0.2);
    k.box(YELLOW, 0.05, 0.05, 0.4, 0, 0, -0.1);
    k.box(YELLOW, 0.16, 0.05, 0.05, 0, 0, -0.3);
  });
}

/**
 * A climbing frame. Variant 0 is a cube of bars, a colour per level, with a
 * deck to stand on; variant 1 is a dome of rainbow rings.
 */
function climber(k: Kit, v: number): void {
  if (v === 1) {
    const R = 1.38;
    const H = 2.3;
    const rings = [RED, ORANGE, YELLOW, GREEN, BLUE];
    rings.forEach((col, i) => {
      const phi = (i * Math.PI) / 10;
      const r = R * Math.cos(phi);
      k.ring(col, r, 0.065, [0, Math.max(0.065, H * Math.sin(phi)), 0], { rx: HALF_PI }, 3, 14);
    });
    const at = (phi: number, az: number): V3 => [R * Math.cos(phi) * Math.cos(az), H * Math.sin(phi), R * Math.cos(phi) * Math.sin(az)];
    for (let m = 0; m < 6; m++) {
      const az = (m * Math.PI) / 3 + Math.PI / 6;
      for (let s = 0; s < 4; s++) k.beam(PURPLE, at((s * Math.PI) / 8, az), at(((s + 1) * Math.PI) / 8, az), 0.08);
    }
    k.sphere(PINK, 0.18, [0, H + 0.02, 0], 8, 5);
    return;
  }
  const g = 1.22;
  const levels = [
    [0.78, RED],
    [1.54, YELLOW],
    [2.3, BLUE],
  ] as const;
  for (const x of [-g, 0, g]) {
    for (const z of [-g, 0, g]) {
      k.box(GREEN, 0.11, 2.36, 0.11, x, 0, z, undefined, ON_GROUND);
      k.gem(lighter(GREEN, 0.3), 0.1, [x, 2.4, z]);
    }
  }
  for (const [y, col] of levels) {
    for (const u of [-g, 0, g]) {
      k.box(col, 2 * g, 0.09, 0.09, 0, y, u);
      k.box(col, 0.09, 0.09, 2 * g, u, y, 0);
    }
  }
  k.box(ORANGE, g - 0.1, 0.08, g - 0.1, -g / 2, 1.63, -g / 2);
  // A pennant on a pole at the back corner, for a splash of colour from above.
  k.box(PAL.white, 0.05, 0.4, 0.05, -g, 2.36, -g);
  k.hull(PINK, [
    [-g, 2.5, -g],
    [-g, 2.76, -g],
    [-g + 0.42, 2.63, -g],
    [-g, 2.5, -g + 0.03],
    [-g, 2.76, -g + 0.03],
    [-g + 0.42, 2.63, -g + 0.03],
  ]);
}

const CAROUSELS = [
  { a: RED, b: YELLOW, bars: BLUE, hat: RED },
  { a: TEAL, b: PAL.white, bars: PINK, hat: PURPLE },
] as const;

/** A playground roundabout: a striped round deck, handle bars to the middle and a little striped canopy. */
function carousel(k: Kit, v: number): void {
  const c = CAROUSELS[v];
  const R = 1.55;
  const deck = 0.3;
  k.cyl(PAL.metal, 0.5, 0.6, 0.12, 10, 0, 0, 0);
  k.cyl(darker(c.a, 0.2), R, R, 0.18, 16, 0, 0.12, 0);
  const n = 8;
  const step = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) k.cyl(i % 2 ? c.b : c.a, R - 0.08, R - 0.08, 0.02, 2, 0, deck, 0, { theta: [i * step, step] });
  for (let i = 0; i < 6; i++) {
    const az = (i * Math.PI) / 3 + Math.PI / 6;
    const p = (r: number, y: number): V3 => [r * Math.sin(az), y, r * Math.cos(az)];
    k.beam(c.bars, p(1.32, deck), p(1.24, 0.98), 0.08);
    k.beam(c.bars, p(1.24, 0.95), p(0.2, 1.02), 0.08);
  }
  k.cyl(c.bars, 0.13, 0.15, 1.02, 8, 0, deck, 0);
  k.canopy([c.hat, PAL.white], 0.8, 0.28, 1.28, 8);
  k.sphere(c.hat, 0.08, [0, 1.58, 0], 6, 4);
}

// ---------------------------------------------------------------------------
// Dog park

const TUNNEL = [RED, ORANGE, YELLOW, GREEN, BLUE] as const;

/** The cross-section of the dog tunnel: a thick arch, walls then a half circle. */
function archShape(): THREE.Shape {
  const ro = 0.48;
  const ri = 0.4;
  const wall = 0.6;
  const n = 6;
  const pts: THREE.Vector2[] = [new THREE.Vector2(-ro, 0)];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI - (i * Math.PI) / n;
    pts.push(new THREE.Vector2(ro * Math.cos(a), wall + ro * Math.sin(a)));
  }
  pts.push(new THREE.Vector2(ro, 0), new THREE.Vector2(ri, 0));
  for (let i = 0; i <= n; i++) {
    const a = (i * Math.PI) / n;
    pts.push(new THREE.Vector2(ri * Math.cos(a), wall + ri * Math.sin(a)));
  }
  pts.push(new THREE.Vector2(-ri, 0));
  return new THREE.Shape(pts);
}

/** Dog-agility gear: variant 0 is a striped jump bar between two posts, variant 1 a rainbow tunnel. */
function agility(k: Kit, v: number): void {
  if (v === 1) {
    const len = 0.56;
    const shape = archShape();
    TUNNEL.forEach((col, i) => {
      const g = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, curveSegments: 1 });
      k.add(g, col, placement(-1.4 + i * len, 0, 0, { ry: HALF_PI }));
    });
    return;
  }
  for (const sx of [-1, 1]) {
    const x = sx * 1.3;
    k.box(PAL.white, 0.12, 0.06, 0.8, x, 0, 0);
    k.box(BLUE, 0.1, 1.06, 0.1, x, 0.06, 0);
    for (const y of [0.3, 0.7]) k.box(PAL.white, 0.12, 0.14, 0.12, x, y, 0);
    k.gem(YELLOW, 0.1, [x, 1.14, 0]);
    k.box(PAL.ink, 0.12, 0.05, 0.14, x - sx * 0.08, 0.5, 0);
    // A wing on the outside of each post: a bright board that shows the jump from above.
    k.box(YELLOW, 0.06, 0.8, 0.7, x + sx * 0.12, 0.12, 0);
    k.box(BLUE, 0.07, 0.12, 0.72, x + sx * 0.12, 0.5, 0);
  }
  const n = 6;
  const len = 2.5 / n;
  for (let i = 0; i < n; i++) k.box(i % 2 ? PAL.white : RED, len, 0.12, 0.12, -1.25 + (i + 0.5) * len, 0.52, 0);
}

/** Every kind drawn here; walkers, sitters and the police share one toy look. */
export const PARK: Record<ParkKind, Builder> = {
  person,
  sitter,
  dog,
  police,
  policecar,
  swings,
  slide,
  seesaw,
  sandbox,
  climber,
  carousel,
  agility,
  garbagetruck,
  icecreamvan,
  tallsite,
  picnic,
  hoop,
  crane,
  ship,
  office,
};
