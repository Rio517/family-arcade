/**
 * The chunky fairy, in two styles. Faces +z, shoes near y = 0, about 4.4
 * units tall with a head nearly half of that. In flight she leans into the
 * wind, one knee bent, arms out, while her head stays up to look ahead.
 *
 *   A, close match: a cube head under a stepped lavender bob, square teal
 *      eyes, a ring of flat petal slabs, butterfly wings as rimmed panels.
 *   B, in between: the same frame in rounded blocks, with the approved
 *      sheet's signatures: big glossy teal eyes with lashes, blush, an open
 *      smile, a soft swooped bob, rounded petals, oval butterfly wings.
 */
import { Part, place, sx, type Figure, type V3 } from './kit';
import {
  BLUSH,
  HAIR,
  HAIR_DEEP,
  INK,
  MINT,
  MOUTH,
  PETALS,
  SHOE,
  SKIN,
  SKIN_SHADE,
  TEAL,
  TEAL_DEEP,
  TONGUE,
  WHITE,
  WING_MINT,
  WING_PINK,
  WING_RIM,
} from './palette';

const SIDES = [1, -1] as const;

const HEAD_PIVOT: V3 = [0, 2.42, 0.02];
const WING_PIVOT: V3 = [0.12, 2.15, -0.5];
const HIP_Y = 1.3;

/** Thigh and shin angles per leg (radians about x, + trails back): one straight, one bent. */
const LEGS: ReadonlyArray<{ x: number; thigh: number; shin: number }> = [
  { x: 0.24, thigh: 0.35, shin: 0.25 },
  { x: -0.24, thigh: 0.15, shin: 1.15 },
];

function figure(body: Part, head: Part, wings: [Part, Part]): Figure {
  return {
    body,
    head,
    wings,
    pivots: { head: HEAD_PIVOT, wings: [WING_PIVOT, sx(-1, WING_PIVOT)] },
    wingRest: 0.3,
    flapAmp: 0.38,
    lean: 0.38,
    leanAbout: HIP_Y,
    headLift: -0.3,
  };
}

/** Thigh, shin and shoe, hanging from the hip, in whichever shapes the style uses. */
function legs(p: Part, limb: (len: number, w: number, at: V3) => void, shoe: (at: V3) => void): void {
  for (const { x, thigh, shin } of LEGS) {
    p.within(place([x, HIP_Y, 0], { rx: thigh }), () => {
      limb(0.55, 0.38, [0, -0.28, 0]);
      p.within(place([0, -0.55, 0], { rx: shin }), () => {
        limb(0.55, 0.34, [0, -0.28, 0]);
        shoe([0, -0.62, 0.08]);
      });
    });
  }
}

// ---------------------------------------------------------------------------
// A, close match

export function fairyA(color: number): Figure {
  const body = new Part();
  legs(
    body,
    (len, w, at) => body.box(SKIN, [w, len, w + 0.04], at),
    (at) => body.box(SHOE, [0.42, 0.26, 0.6], at),
  );
  // Petal skirt: eight flat slabs flaring from the waist.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    body.within(place([Math.sin(a) * 0.42, 1.55, Math.cos(a) * 0.36], { ry: a, rx: -0.6 }), () => {
      body.box(PETALS[i % 3], [0.62, 0.72, 0.1], [0, -0.32, 0]);
    });
  }
  body.box(color, [1.0, 0.42, 0.82], [0, 1.52, 0]);
  body.box(color, [0.86, 0.72, 0.62], [0, 1.98, 0]);
  for (const s of SIDES) {
    body.within(place([0.5 * s, 2.24, 0], { rz: 0.75 * s, rx: -0.35 }), () => {
      body.box(SKIN, [0.26, 0.82, 0.28], [0, -0.38, 0]);
    });
  }
  body.box(SKIN_SHADE, [0.3, 0.22, 0.3], [0, 2.4, 0]);

  const head = new Part();
  head.box(SKIN, [1.6, 1.5, 1.4], [0, 0.72, 0.05]);
  // Lavender bob: a cap, a back, two sides to the jaw, a stepped fringe and a quiff.
  head.box(HAIR, [1.8, 0.42, 1.62], [0, 1.5, -0.02]);
  head.box(HAIR, [1.8, 1.25, 0.32], [0, 0.95, -0.78]);
  for (const s of SIDES) head.box(HAIR, [0.3, 1.05, 1.36], [0.88 * s, 0.85, -0.04]);
  head.box(HAIR, [0.64, 0.4, 0.22], [-0.48, 1.24, 0.72]);
  head.box(HAIR, [0.6, 0.3, 0.22], [0.08, 1.3, 0.74]);
  head.box(HAIR, [0.5, 0.44, 0.22], [0.56, 1.21, 0.72]);
  head.box(HAIR_DEEP, [0.8, 0.22, 0.7], [-0.3, 1.8, 0.25]);
  for (const s of SIDES) {
    head.box(TEAL, [0.38, 0.48, 0.06], [0.37 * s, 0.7, 0.76]);
    head.box(TEAL_DEEP, [0.22, 0.3, 0.06], [0.37 * s, 0.66, 0.78]);
    head.box(WHITE, [0.12, 0.12, 0.06], [0.37 * s - 0.08, 0.84, 0.8]);
    head.box(BLUSH, [0.26, 0.12, 0.04], [0.6 * s, 0.42, 0.76]);
  }
  head.box(MOUTH, [0.24, 0.1, 0.04], [0, 0.36, 0.76]);

  const wings: Part[] = SIDES.map((s) => {
    const w = new Part();
    w.box(WING_RIM, [0.5, 0.6, 0.18], sx(s, [0.2, 0.05, 0]));
    // Upper wing: a lavender rim round a mint pane, its outer tip stepping
    // out; lower wing: a rim round pink. Spread wide of the head, so they
    // never read as ears from the front.
    w.box(WING_RIM, [1.75, 1.6, 0.1], sx(s, [1.25, 0.62, 0]));
    w.box(WING_MINT, [1.52, 1.38, 0.14], sx(s, [1.26, 0.63, 0]));
    w.box(WING_RIM, [0.45, 0.5, 0.1], sx(s, [2.25, 1.0, 0]));
    w.box(WING_RIM, [1.25, 1.1, 0.1], sx(s, [0.95, -0.62, 0]));
    w.box(WING_PINK, [1.02, 0.88, 0.14], sx(s, [0.96, -0.63, 0]));
    return w;
  });

  return figure(body, head, [wings[0], wings[1]]);
}

// ---------------------------------------------------------------------------
// B, in between

export function fairyB(color: number): Figure {
  const body = new Part();
  legs(
    body,
    (len, w, at) => body.pill(SKIN, w / 2, len - w / 2, at),
    (at) => body.rbox(SHOE, [0.44, 0.3, 0.62], 0.14, at, {}, { seg: 1 }),
  );
  // Petal skirt: two rings of rounded petals, mint peeking under lavender and pink.
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * Math.PI * 2;
    body.within(place([Math.sin(a) * 0.36, 1.45, Math.cos(a) * 0.3], { ry: a, rx: -0.45 }), () => {
      body.ball(MINT, 0.4, [0, -0.36, 0], { scale: [0.72, 1.05, 0.22], seg: [8, 5] });
    });
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    body.within(place([Math.sin(a) * 0.42, 1.6, Math.cos(a) * 0.36], { ry: a, rx: -0.62 }), () => {
      body.ball(i % 2 ? PETALS[1] : PETALS[0], 0.42, [0, -0.32, 0.02], { scale: [0.78, 1.0, 0.24], seg: [8, 5] });
    });
  }
  body.rbox(color, [1.0, 0.46, 0.84], 0.2, [0, 1.55, 0], {}, { seg: 1 });
  body.rbox(color, [0.86, 0.74, 0.64], 0.26, [0, 2.0, 0]);
  for (const s of SIDES) {
    body.within(place([0.5 * s, 2.24, 0], { rz: 0.75 * s, rx: -0.35 }), () => {
      body.pill(SKIN, 0.14, 0.58, [0, -0.38, 0]);
    });
  }
  body.pill(SKIN_SHADE, 0.15, 0.1, [0, 2.38, 0]);

  const head = new Part();
  head.rbox(SKIN, [1.65, 1.55, 1.45], 0.6, [0, 0.74, 0.05]);
  // Soft bob: a rounded cap and back, side locks that flick out at the jaw,
  // and a swoop of fringe across the brow.
  head.ball(HAIR, 1, [0, 1.15, -0.3], { scale: [1.02, 0.86, 1.0], seg: [14, 8] });
  // The hem of the bob curls up all round the back, in five soft flicks.
  for (const deg of [100, 140, 180, 220, 260]) {
    const a = (deg * Math.PI) / 180;
    head.ball(HAIR, 0.34, [Math.sin(a) * 0.92, 0.42, -0.3 + Math.cos(a) * 0.92], { scale: [1, 0.78, 1] });
  }
  for (const s of SIDES) {
    head.ball(HAIR, 0.5, [0.86 * s, 0.78, 0.02], { scale: [0.55, 1.0, 0.95] });
    head.ball(HAIR, 0.28, [0.9 * s, 0.3, 0.34], { scale: [0.9, 0.75, 1.0] });
  }
  head.ball(HAIR, 0.5, [-0.25, 1.38, 0.62], { scale: [1.4, 0.55, 0.6], rot: { rz: 0.3 } });
  head.ball(HAIR, 0.38, [0.5, 1.28, 0.62], { scale: [1.0, 0.62, 0.55], rot: { rz: -0.5 } });
  head.ball(HAIR, 0.45, [-0.35, 1.72, 0.42], { scale: [1.4, 0.6, 0.85], rot: { rz: 0.35 } });
  for (const s of SIDES) {
    head.within(place([0.37 * s, 0.74, 0.76], { ry: 0.18 * s }), () => {
      head.ball(TEAL_DEEP, 0.3, [0, 0, 0], { scale: [0.88, 1.12, 0.3], finish: 'gloss' });
      head.ball(TEAL, 0.245, [0, -0.04, 0.03], { scale: [0.86, 1.02, 0.3], finish: 'gloss' });
      head.ball(TEAL_DEEP, 0.145, [0, -0.02, 0.06], { scale: [0.9, 1.1, 0.3], finish: 'gloss' });
      head.ball(WHITE, 0.07, [-0.07, 0.11, 0.1], { seg: [8, 6], finish: 'gloss' });
      head.ball(WHITE, 0.032, [0.07, -0.09, 0.1], { seg: [6, 4], finish: 'gloss' });
      head.box(INK, [0.2, 0.065, 0.07], [0.25 * s, 0.22, 0.0], { rz: 0.55 * s });
      head.box(INK, [0.15, 0.055, 0.06], [0.28 * s, 0.08, -0.02], { rz: 0.2 * s });
    });
    head.ball(BLUSH, 0.2, [0.58 * s, 0.42, 0.72], { scale: [1, 0.55, 0.25], rot: { ry: 0.35 * s }, seg: [10, 6] });
  }
  head.ball(MOUTH, 0.15, [0, 0.36, 0.78], { scale: [1.1, 0.8, 0.5], rot: { rx: Math.PI }, hemi: true, seg: [10, 4] });
  head.ball(TONGUE, 0.08, [0, 0.29, 0.8], { scale: [1, 0.6, 0.4], seg: [8, 4] });

  const wings: Part[] = SIDES.map((s) => {
    const w = new Part();
    w.ball(WING_RIM, 0.3, sx(s, [0.2, 0.05, 0]), { scale: [1.2, 1.2, 0.7] });
    w.ball(WING_RIM, 1, sx(s, [1.3, 0.62, 0]), { scale: [1.08, 0.86, 0.06], rot: { rz: 0.35 * s }, seg: [16, 8] });
    w.ball(WING_MINT, 1, sx(s, [1.36, 0.66, 0]), { scale: [0.96, 0.75, 0.09], rot: { rz: 0.35 * s }, seg: [16, 8] });
    w.ball(WING_RIM, 1, sx(s, [0.98, -0.66, 0]), { scale: [0.7, 0.56, 0.06], rot: { rz: -0.45 * s }, seg: [12, 6] });
    w.ball(WING_PINK, 1, sx(s, [1.02, -0.68, 0]), { scale: [0.6, 0.47, 0.09], rot: { rz: -0.45 * s }, seg: [12, 6] });
    return w;
  });

  return figure(body, head, [wings[0], wings[1]]);
}
