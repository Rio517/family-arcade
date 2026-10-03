/**
 * The chunky unicorn, in two styles. Faces +z, hooves near y = 0, about five
 * units nose to tail. The body is level in flight: front legs reach forward,
 * hind legs trail, wings stand up in a V so the chase camera sees their face.
 *
 *   A, close match: hard boxes and flat colour, a cube head, square eyes,
 *      the mane and tail as stepped rainbow blocks, wings as stepped slabs.
 *   B, in between: the same frame in rounded blocks, with the approved
 *      sheet's signatures: big glossy violet eyes with lashes, blush, an
 *      open smile, a spiral gold horn, rainbow curls, rounded feathers.
 */
import { Part, place, sx, type Figure, type Rot, type V3 } from './kit';
import {
  EAR_PINK,
  FEATHER,
  GOLD,
  GOLD_DEEP,
  HOOF,
  INK,
  MOUTH,
  MUZZLE,
  PEARL,
  PEARL_SHADE,
  BLUSH,
  RAINBOW,
  TONGUE,
  VIOLET,
  VIOLET_DEEP,
  WHITE,
} from './palette';

const SIDES = [1, -1] as const;

/** Hinges, shared by both styles so they fly the same. */
const HEAD_PIVOT: V3 = [0, 2.85, 1.05];
const WING_PIVOT: V3 = [0.72, 2.4, 0.3];
const TAIL_PIVOT: V3 = [0, 2.15, -1.25];

/** Hip positions and flight angles: front legs reach forward, hind legs trail. */
const LEGS: ReadonlyArray<{ hip: V3; rot: Rot }> = [
  { hip: [0.5, 1.3, 0.6], rot: { rx: -0.55 } },
  { hip: [-0.5, 1.3, 0.6], rot: { rx: -0.35 } },
  { hip: [0.5, 1.3, -0.85], rot: { rx: 0.75 } },
  { hip: [-0.5, 1.3, -0.85], rot: { rx: 0.95 } },
];

function figure(body: Part, head: Part, wings: [Part, Part], tail: Part): Figure {
  return {
    body,
    head,
    wings,
    tail,
    pivots: { head: HEAD_PIVOT, wings: [WING_PIVOT, sx(-1, WING_PIVOT)], tail: TAIL_PIVOT },
    wingRest: 0.5,
    flapAmp: 0.5,
    lean: 0,
    leanAbout: 0,
    headLift: 0,
  };
}

// ---------------------------------------------------------------------------
// A, close match

export function unicornA(color: number): Figure {
  const body = new Part();
  body.box(PEARL, [1.6, 1.4, 2.3], [0, 1.75, -0.15]);
  body.box(PEARL, [1.1, 0.95, 0.95], [0, 2.5, 0.75]);
  for (const { hip, rot } of LEGS) {
    body.within(place(hip, rot), () => {
      body.box(PEARL_SHADE, [0.46, 0.85, 0.46], [0, -0.42, 0]);
      body.box(HOOF, [0.52, 0.28, 0.52], [0, -0.95, 0]);
    });
  }

  const head = new Part();
  head.box(PEARL, [1.8, 1.55, 1.6], [0, 0.55, 0.45]);
  head.box(MUZZLE, [1.25, 0.72, 0.6], [0, 0.05, 1.5]);
  for (const s of SIDES) {
    head.box(EAR_PINK, [0.16, 0.1, 0.04], [0.3 * s, 0.2, 1.81]);
    // Square eyes: violet, a deep pupil, one white highlight up and to the left.
    head.box(VIOLET, [0.36, 0.46, 0.06], [0.5 * s, 0.74, 1.26]);
    head.box(VIOLET_DEEP, [0.22, 0.3, 0.06], [0.5 * s, 0.7, 1.28]);
    head.box(WHITE, [0.12, 0.12, 0.06], [0.5 * s - 0.08, 0.86, 1.3]);
    head.within(place([0.58 * s, 1.5, 0.25], { rz: -0.15 * s }), () => {
      head.box(PEARL, [0.36, 0.55, 0.26], [0, 0, 0]);
      head.box(EAR_PINK, [0.18, 0.36, 0.04], [0, -0.02, 0.14]);
    });
  }
  // Horn: three gold blocks stepping in, leaning forward.
  head.within(place([0, 1.3, 0.85], { rx: 0.3 }), () => {
    head.box(GOLD, [0.36, 0.34, 0.36], [0, 0.17, 0]);
    head.box(GOLD_DEEP, [0.26, 0.32, 0.26], [0, 0.5, 0]);
    head.box(GOLD, [0.16, 0.3, 0.16], [0, 0.8, 0]);
  });
  // Forelock over one side of the brow, then the mane steps down the neck.
  head.box(RAINBOW[0], [0.72, 0.4, 0.26], [-0.42, 1.18, 1.3]);
  head.box(RAINBOW[5], [0.62, 0.3, 0.5], [-0.32, 1.44, 0.98]);
  const mane: ReadonlyArray<[V3, V3]> = [
    [[0.64, 0.42, 0.62], [0, 1.45, 0.45]],
    [[0.64, 0.46, 0.56], [0, 1.32, -0.08]],
    [[0.64, 0.52, 0.5], [0, 1.0, -0.5]],
    [[0.64, 0.56, 0.5], [0, 0.55, -0.78]],
    [[0.64, 0.56, 0.5], [0, 0.08, -1.02]],
    [[0.64, 0.56, 0.5], [0, -0.38, -1.24]],
  ];
  mane.forEach(([size, at], i) => head.box(RAINBOW[i], size, at));

  // Tail: six flat rainbow bands, rising behind; each one steps a little longer.
  const tail = new Part();
  tail.within(place([0, 0, 0], { rx: 0.6 }), () => {
    RAINBOW.forEach((c, i) => {
      const len = 1.1 + i * 0.12;
      tail.box(c, [0.86, 0.22, len], [0, 0.55 - i * 0.22, -len / 2]);
    });
  });

  const wings: Part[] = SIDES.map((s) => {
    const w = new Part();
    w.box(WHITE, [0.5, 0.5, 0.22], sx(s, [0.12, -0.12, 0]));
    // Stepped feathers: white on top, then the player colour, lavender, sky.
    const rows: ReadonlyArray<[number, number, number, number]> = [
      [WHITE, 2.3, 0.55, -0.22],
      [color, 1.95, 0.4, -0.68],
      [FEATHER[1], 1.5, 0.36, -1.05],
      [FEATHER[2], 0.95, 0.32, -1.38],
    ];
    for (const [c, span, h, y] of rows) w.box(c, [span, h, 0.16], sx(s, [span / 2, y, 0]));
    return w;
  });

  return figure(body, head, [wings[0], wings[1]], tail);
}

// ---------------------------------------------------------------------------
// B, in between

/** A rounded feather slab from `root`, `len` long, drooping by `droop` radians. */
function feather(p: Part, color: number, side: number, root: V3, len: number, r: number, droop: number): void {
  const dx = Math.cos(droop) * side;
  const dy = -Math.sin(droop);
  const half = len / 2 + r;
  p.pill(color, r, len, [root[0] + dx * half, root[1] + dy * half, root[2]], {
    rot: { rz: Math.PI / 2 - droop * side },
    scale: [1, 1, 0.42],
  });
}

export function unicornB(color: number): Figure {
  const body = new Part();
  body.rbox(PEARL, [1.7, 1.5, 2.3], 0.55, [0, 1.75, -0.15]);
  body.rbox(PEARL, [1.15, 1.25, 1.0], 0.45, [0, 2.45, 0.8], { rx: 0.4 });
  for (const { hip, rot } of LEGS) {
    body.within(place(hip, rot), () => {
      body.pill(PEARL_SHADE, 0.25, 0.5, [0, -0.45, 0]);
      body.rbox(HOOF, [0.6, 0.34, 0.6], 0.15, [0, -0.95, 0], {}, { seg: 1 });
    });
  }

  const head = new Part();
  head.rbox(PEARL, [1.9, 1.7, 1.7], 0.62, [0, 0.6, 0.45]);
  head.rbox(MUZZLE, [1.3, 0.8, 0.75], 0.34, [0, 0.02, 1.4]);
  // A small open smile on the front of the muzzle.
  head.ball(MOUTH, 0.2, [0, -0.12, 1.76], { scale: [1.1, 0.75, 0.5], rot: { rx: Math.PI }, hemi: true, seg: [10, 4] });
  head.ball(TONGUE, 0.12, [0, -0.2, 1.8], { scale: [1, 0.6, 0.4], seg: [8, 4] });
  for (const s of SIDES) {
    head.ball(EAR_PINK, 0.06, [0.24 * s, 0.22, 1.77], { seg: [6, 4] });
    // Big glossy eyes on the curve of the face, turned a little outward.
    head.within(place([0.5 * s, 0.78, 1.25], { ry: 0.32 * s }), () => {
      head.ball(VIOLET_DEEP, 0.3, [0, 0, 0], { scale: [0.9, 1.12, 0.3], finish: 'gloss' });
      head.ball(VIOLET, 0.24, [0, -0.04, 0.03], { scale: [0.86, 1.04, 0.3], finish: 'gloss' });
      head.ball(VIOLET_DEEP, 0.14, [0, -0.02, 0.07], { scale: [0.9, 1.1, 0.3], finish: 'gloss' });
      head.ball(WHITE, 0.075, [-0.08, 0.12, 0.11], { seg: [8, 6], finish: 'gloss' });
      head.ball(WHITE, 0.035, [0.08, -0.1, 0.11], { seg: [6, 4], finish: 'gloss' });
      // Two lash blocks at the outer corner.
      head.box(INK, [0.2, 0.07, 0.07], [0.27 * s, 0.24, 0.02], { rz: 0.55 * s });
      head.box(INK, [0.16, 0.06, 0.06], [0.3 * s, 0.1, 0.0], { rz: 0.2 * s });
    });
    head.ball(BLUSH, 0.22, [0.7 * s, 0.3, 1.1], { scale: [1, 0.55, 0.25], rot: { ry: 0.7 * s }, seg: [10, 6] });
    head.within(place([0.6 * s, 1.5, 0.25], { rz: -0.18 * s }), () => {
      head.rbox(PEARL, [0.42, 0.66, 0.3], 0.15, [0, 0, 0], {}, { seg: 1 });
      head.rbox(EAR_PINK, [0.22, 0.42, 0.06], 0.05, [0, -0.03, 0.15], {}, { seg: 1 });
    });
  }
  // Spiral horn: a gold cone ringed three times.
  head.within(place([0, 1.35, 0.85], { rx: 0.3 }), () => {
    head.cone(GOLD, 0.03, 0.24, 1.05, 10, [0, 0.5, 0], {}, 'gloss');
    for (let i = 0; i < 3; i++) {
      head.curl(GOLD_DEEP, 0.2 - i * 0.055, 0.04, Math.PI * 2, [0, 0.16 + i * 0.27, 0], { rot: { rx: Math.PI / 2 + 0.2 }, finish: 'gloss' });
    }
  });
  // Forelock: a lavender and pink swoop over one side of the brow.
  head.rbox(RAINBOW[5], [0.78, 0.46, 0.5], 0.22, [-0.4, 1.36, 1.02], { rz: 0.25 }, { seg: 1 });
  head.rbox(RAINBOW[0], [0.6, 0.4, 0.42], 0.2, [-0.6, 1.08, 1.22], { rz: 0.5 }, { seg: 1 });
  // Mane: chunky rounded curls stepping down the neck.
  const mane: ReadonlyArray<[number, V3]> = [
    [0, [0.08, 1.5, 0.4]],
    [1, [-0.06, 1.38, -0.1]],
    [2, [0.08, 1.05, -0.52]],
    [3, [-0.06, 0.62, -0.8]],
    [4, [0.08, 0.16, -1.04]],
    [5, [-0.04, -0.3, -1.22]],
  ];
  for (const [i, at] of mane) head.rbox(RAINBOW[i], [0.84, 0.72, 0.64], 0.3, at, { rx: -0.45 }, { seg: 1 });

  // Tail: six rounded rainbow locks fanning up and back, so the chase
  // camera sees every colour stacked.
  const tail = new Part();
  RAINBOW.forEach((c, i) => {
    tail.within(place([0, 0.5 - i * 0.2, 0], { rx: 0.62 - i * 0.09 }), () => {
      tail.rbox(c, [0.94 - i * 0.03, 0.34, 1.3 + i * 0.07], 0.16, [0, 0, -0.62 - i * 0.035], {}, { seg: 1 });
    });
  });

  const wings: Part[] = SIDES.map((s) => {
    const w = new Part();
    w.ball(WHITE, 0.34, sx(s, [0.1, -0.1, 0]), { scale: [1, 1, 0.6] });
    feather(w, FEATHER[2], s, sx(s, [0.05, -0.55, -0.04]), 0.9, 0.24, 0.55);
    feather(w, FEATHER[1], s, sx(s, [0.05, -0.38, -0.02]), 1.35, 0.26, 0.32);
    feather(w, color, s, sx(s, [0.05, -0.2, 0.0]), 1.8, 0.27, 0.12);
    feather(w, WHITE, s, sx(s, [0.0, 0.0, 0.03]), 1.6, 0.3, -0.05);
    return w;
  });

  return figure(body, head, [wings[0], wings[1]], tail);
}
