/**
 * The fairy: a girl in soft blocks with a lavender bob that curls up at the
 * hem, big glossy teal eyes with lashes, blush and an open smile, a petal
 * dress tied with a mint sash, and mint and pink butterfly wings. Faces +z,
 * shoes near y = 0, about 4.4 units tall with a head nearly half of that. In
 * flight she leans into the wind, one knee bent, arms out, while her head
 * stays up to look ahead.
 *
 * From behind, where the chase camera sees her, a big pink bow sits on the
 * back of her hair and another ties her sash, over petals in three colours.
 */
import { Part, place, sx, type V3 } from './kit';
import { blush, bow, eye, smile } from './face';
import type { Figure } from './figure';
import { HAIR, HAIR_DEEP, MINT, PETALS, SHOE, SKIN, SKIN_SHADE, TEAL, TEAL_DEEP, WING_MINT, WING_PINK, WING_RIM } from './palette';

const SIDES = [1, -1] as const;

const HEAD_PIVOT: V3 = [0, 2.42, 0.02];
const WING_PIVOT: V3 = [0.12, 2.15, -0.5];
const HIP_Y = 1.3;

/** Thigh and shin angles per leg (radians about x, + trails back): one straight, one bent. */
const LEGS: ReadonlyArray<{ x: number; thigh: number; shin: number }> = [
  { x: 0.24, thigh: 0.35, shin: 0.25 },
  { x: -0.24, thigh: 0.15, shin: 1.15 },
];

const EYES = { deep: TEAL_DEEP, iris: TEAL, light: 0x8ff0e4 };

/** One butterfly wing panel: a lavender rim round a coloured pane, in one flat oval. */
function pane(p: Part, color: number, size: readonly [number, number], at: V3, rz: number): void {
  const [w, h] = size;
  p.within(place(at, { rz }), () => {
    p.blob((q) => (Math.hypot(q.x / (w / 2), q.z / (h / 2)) > 0.8 ? WING_RIM : color), [w, 0.14, h], [0, 0, 0], {
      round: 1,
      seg: [16, 3],
      rot: { rx: Math.PI / 2 },
    });
  });
}

export function fairy(color: number): Figure {
  const body = new Part();
  for (const { x, thigh, shin } of LEGS) {
    body.within(place([x, HIP_Y, 0], { rx: thigh }), () => {
      body.blob(SKIN, [0.36, 0.72, 0.36], [0, -0.28, 0], { round: 0.85, seg: [8, 4] });
      body.within(place([0, -0.55, 0], { rx: shin }), () => {
        body.blob(SKIN, [0.32, 0.7, 0.32], [0, -0.28, 0], { round: 0.85, seg: [8, 4] });
        body.blob(SHOE, [0.44, 0.3, 0.62], [0, -0.62, 0.08], { round: 0.6, seg: [8, 4] });
      });
    });
  }
  // Petal skirt: mint petals peeking under a ring of lavender and pink.
  for (let i = 0; i < 5; i++) {
    const a = ((i + 0.5) / 5) * Math.PI * 2;
    body.within(place([Math.sin(a) * 0.36, 1.45, Math.cos(a) * 0.3], { ry: a, rx: -0.45 }), () => {
      body.blob(MINT, [0.66, 0.18, 0.84], [0, -0.36, 0], { round: 0.9, seg: [8, 3], rot: { rx: Math.PI / 2 } });
    });
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    body.within(place([Math.sin(a) * 0.42, 1.6, Math.cos(a) * 0.36], { ry: a, rx: -0.62 }), () => {
      body.blob(i % 2 ? PETALS[1] : PETALS[0], [0.66, 0.2, 0.84], [0, -0.32, 0.02], { round: 0.9, seg: [10, 3], rot: { rx: Math.PI / 2 } });
    });
  }
  body.blob(color, [1.0, 0.46, 0.84], [0, 1.55, 0], { round: 0.55, seg: [10, 5] });
  body.blob(color, [0.86, 0.74, 0.64], [0, 2.0, 0], { round: 0.55, seg: [10, 6] });
  // A mint sash round the waist, tied in a pink bow at the back.
  body.blob(MINT, [1.08, 0.2, 0.92], [0, 1.66, 0], { round: 0.7, seg: [10, 3] });
  bow(body, [0, 1.68, -0.5], 0.8, { rx: 0.2 });
  for (const s of SIDES) {
    body.within(place([0.5 * s, 2.24, 0], { rz: 0.75 * s, rx: -0.35 }), () => {
      body.blob(SKIN, [0.28, 0.86, 0.28], [0, -0.38, 0], { round: 0.85, seg: [8, 4] });
    });
  }
  body.blob(SKIN_SHADE, [0.3, 0.3, 0.3], [0, 2.38, 0], { round: 0.9, seg: [6, 4] });

  const head = new Part();
  head.blob(SKIN, [1.65, 1.55, 1.45], [0, 0.74, 0.05], { round: 0.6, seg: [12, 8] });
  // Soft bob: a rounded cap and back, side locks, and a swoop of fringe
  // across the brow.
  head.ball(HAIR, 1, [0, 0.98, -0.3], { scale: [1.02, 1.04, 1.0], seg: [14, 8] });
  // The hem of the bob curls up in one roll, from jaw to jaw round the back.
  const hem: V3[] = [55, 85, 120, 150, 180, 210, 240, 275, 305].map((deg) => {
    const a = (deg * Math.PI) / 180;
    return [Math.sin(a) * 0.9, 0.4, -0.3 + Math.cos(a) * 0.9];
  });
  head.lock([HAIR, HAIR, HAIR, HAIR], hem, {
    width: 0.22,
    thick: 0.22,
    along: 9,
    side: [0, 1, 0],
    taper: (t) => 0.75 + 0.25 * Math.sin(Math.PI * t),
  });
  for (const s of SIDES) head.ball(HAIR, 0.5, [0.86 * s, 0.82, 0.02], { scale: [0.55, 1.0, 0.95], seg: [10, 5] });
  // Fringe: one swoop from her right temple across the brow, a lighter stripe through it.
  head.lock(
    [HAIR, HAIR_DEEP, HAIR],
    [
      [0.72, 1.12, 0.42],
      [0.35, 1.42, 0.62],
      [-0.15, 1.46, 0.68],
      [-0.6, 1.24, 0.6],
      [-0.84, 0.92, 0.42],
    ],
    { width: 0.3, thick: 0.2, along: 6, side: [0, 0.35, 1], taper: (t) => 0.7 + 0.3 * Math.sin(Math.PI * t) },
  );
  // The big bow on the back of her head, what the chase camera sees first.
  bow(head, [0, 1.38, -1.22], 1.6, { rx: -0.3 });
  for (const s of SIDES) {
    eye(head, s, [0.37 * s, 0.74, 0.76], { w: 0.53, h: 0.67, turn: 0.18, colors: EYES });
    blush(head, s, [0.58 * s, 0.42, 0.72], 0.2, 0.35);
  }
  smile(head, [0, 0.36, 0.78], 0.3);

  const wings: Part[] = SIDES.map((s) => {
    const w = new Part();
    w.ball(WING_RIM, 0.3, sx(s, [0.2, 0.05, 0]), { scale: [1.2, 1.2, 0.7], seg: [6, 3] });
    pane(w, WING_MINT, [2.16, 1.72], sx(s, [1.3, 0.62, 0]), 0.35 * s);
    pane(w, WING_PINK, [1.4, 1.12], sx(s, [0.98, -0.66, 0]), -0.45 * s);
    return w;
  });

  return {
    body,
    head: { part: head, at: HEAD_PIVOT, lift: -0.3 },
    wings: { parts: [wings[0], wings[1]], at: WING_PIVOT, rest: 0.3, amp: 0.38 },
    lean: 0.38,
    leanAbout: HIP_Y,
  };
}
