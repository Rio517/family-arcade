/**
 * The unicorn: pearly white soft blocks, big glossy violet eyes with lashes,
 * blush, an open smile, a spiral gold horn, a flowing rainbow mane and tail,
 * three rounded feathers over a white covert on each wing. Faces +z, hooves
 * near y = 0, about five units nose to tail. The body is level in flight:
 * front legs reach forward, hind legs trail, wings stand up in a V so the
 * chase camera sees their face. She flies alone, and a princess or the bunny
 * can ride her.
 */
import { Part, place, sx, type Rot, type V3 } from './kit';
import { blush, eye, smile } from './face';
import type { Figure, Rides } from './figure';
import { EAR_PINK, FEATHER, GOLD, GOLD_DEEP, HOOF, MUZZLE, PEARL, PEARL_SHADE, RAINBOW, VIOLET, VIOLET_DEEP, WHITE } from './palette';

const SIDES = [1, -1] as const;

const smoothstep = (a: number, b: number, x: number): number => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

const HEAD_PIVOT: V3 = [0, 2.85, 1.05];
const WING_PIVOT: V3 = [0.72, 2.4, 0.3];
const TAIL_PIVOT: V3 = [0, 2.15, -1.25];
/** Where a rider sits: on the back, just behind the withers. */
const UNICORN_SADDLE: V3 = [0, 2.42, -0.2];

/** Hip positions and flight angles: front legs reach forward, hind legs trail. */
const LEGS: ReadonlyArray<{ hip: V3; rot: Rot }> = [
  { hip: [0.5, 1.3, 0.6], rot: { rx: -0.55 } },
  { hip: [-0.5, 1.3, 0.6], rot: { rx: -0.35 } },
  { hip: [0.5, 1.3, -0.85], rot: { rx: 0.75 } },
  { hip: [-0.5, 1.3, -0.85], rot: { rx: 0.95 } },
];

/** The violet of her eyes, lightest where the light pools. */
const EYES = { deep: VIOLET_DEEP, iris: VIOLET, light: 0xc3a2ff };

/** A rounded feather from `root`, `len` long and `w` wide, drooping by `droop` radians. */
export function feather(p: Part, color: number, side: number, root: V3, len: number, w: number, droop: number): void {
  p.within(place(root, { rz: -droop * side }), () => {
    // Flat across z: the blob's poles go on the thin axis, so its outline is smooth.
    p.blob(color, [len, w * 0.42, w], [(len / 2) * side, 0, 0], { round: 0.8, seg: [10, 3], rot: { rx: Math.PI / 2 } });
  });
}

/**
 * One wing (left for side +1): a covert at the shoulder over four rounded
 * feathers, `feathers` listed lowest first; the top one lies over the rest.
 */
export function featherWing(side: number, covert: number, feathers: readonly [number, number, number, number]): Part {
  const w = new Part();
  w.ball(covert, 0.34, sx(side, [0.1, -0.1, 0]), { scale: [1, 1, 0.6], seg: [8, 3] });
  feather(w, feathers[0], side, sx(side, [0.05, -0.55, -0.04]), 1.4, 0.48, 0.55);
  feather(w, feathers[1], side, sx(side, [0.05, -0.38, -0.02]), 1.85, 0.52, 0.32);
  feather(w, feathers[2], side, sx(side, [0.05, -0.2, 0.0]), 2.3, 0.54, 0.12);
  feather(w, feathers[3], side, sx(side, [0.0, 0.0, 0.03]), 2.15, 0.6, -0.05);
  return w;
}

/** The unicorn's wing: white, with lavender, sky and the player's colour beneath. */
const unicornWing = (color: number, side: number): Part => featherWing(side, WHITE, [FEATHER[2], FEATHER[1], color, WHITE]);

export function unicorn(color: number, rides?: Rides): Figure {
  const body = new Part();
  body.blob(PEARL, [1.7, 1.5, 2.3], [0, 1.75, -0.15], { round: 0.55, seg: [12, 8] });
  body.blob(PEARL, [1.15, 1.25, 1.0], [0, 2.45, 0.8], { round: 0.6, seg: [10, 5], rot: { rx: 0.4 } });
  for (const { hip, rot } of LEGS) {
    body.within(place(hip, rot), () => {
      // One soft block per leg, lavender at the hoof: the bottom two rows of faces, cut between rings.
      body.blob((p) => (p.y < -0.3 ? HOOF : PEARL_SHADE), [0.54, 1.25, 0.54], [0, -0.55, 0], { round: 0.7, seg: [8, 5] });
    });
  }

  const head = new Part();
  head.blob(PEARL, [1.9, 1.7, 1.7], [0, 0.6, 0.45], { round: 0.6, seg: [12, 8] });
  head.blob(MUZZLE, [1.3, 0.8, 0.75], [0, 0.02, 1.4], { round: 0.65, seg: [10, 5] });
  smile(head, [0, -0.12, 1.76], 0.4);
  for (const s of SIDES) {
    head.ball(EAR_PINK, 0.06, [0.24 * s, 0.22, 1.77], { seg: [5, 2] });
    // Big glossy eyes on the curve of the face, turned a little outward.
    eye(head, s, [0.5 * s, 0.78, 1.25], { w: 0.54, h: 0.67, turn: 0.32, colors: EYES, seg: [10, 4] });
    blush(head, s, [0.7 * s, 0.3, 1.1], 0.22, 0.7);
    head.within(place([0.6 * s, 1.5, 0.25], { rz: -0.18 * s }), () => {
      // Flat across z: pink inside, on the front face.
      head.blob((p) => (p.y > 0 && Math.hypot(p.x / 0.21, p.z / 0.33) < 0.75 ? EAR_PINK : PEARL), [0.42, 0.3, 0.66], [0, 0, 0], {
        round: 0.7,
        seg: [8, 4],
        rot: { rx: Math.PI / 2 },
      });
    });
  }
  // Spiral horn: gold, with a deeper gold stripe winding up it three times.
  head.within(place([0, 1.35, 0.85], { rx: 0.3 }), () => {
    head.cone(
      (p) => (Math.cos(Math.atan2(p.z, p.x) - (p.y / 1.05 + 0.5) * Math.PI * 6) > 0.25 ? GOLD_DEEP : GOLD),
      0,
      0.24,
      1.05,
      [8, 5],
      [0, 0.5, 0],
      {},
      { gloss: true },
    );
  });
  // The mane: one flowing lock in rainbow stripes. It lies flat over the top
  // of the head, a rainbow from ear to ear, then turns as it pours down the
  // crest of the neck so its stripes show in profile, and flicks out over the
  // withers.
  head.lock(
    RAINBOW,
    [
      [0, 1.3, 0.62],
      [0, 1.56, 0.2],
      [0, 1.38, -0.5],
      [0, 0.78, -0.8],
      [0, 0.1, -1.0],
      [0, -0.26, -1.4],
      [0, -0.1, -1.86],
    ],
    {
      width: 0.6,
      thick: 0.4,
      along: 7,
      twist: (t) => (Math.PI / 2) * (1 - smoothstep(0.12, 0.42, t)),
      taper: (t) => (t < 0.15 ? 0.8 + (0.2 * t) / 0.15 : Math.max(0.12, 1 - ((t - 0.15) / 0.85) ** 2)),
    },
  );
  // Forelock: a lavender, pink and sky swoop over one side of the brow.
  head.lock(
    [RAINBOW[5], RAINBOW[0], RAINBOW[4]],
    [
      [0.05, 1.45, 0.5],
      [-0.12, 1.6, 0.85],
      [-0.42, 1.42, 1.1],
      [-0.66, 1.12, 1.14],
      [-0.7, 0.9, 1.02],
    ],
    { width: 0.25, thick: 0.15, along: 4, side: [0, 0.45, 1] },
  );

  // Tail: one big rainbow lock rising off the rump, arcing back and curling
  // under, turning as it goes so its stripes face the chase camera too.
  const tail = new Part();
  tail.lock(
    RAINBOW,
    [
      [0, -0.05, 0.25],
      [0, 0.42, -0.35],
      [0.1, 0.74, -1.0],
      [0.22, 0.6, -1.62],
      [0.26, 0.05, -1.98],
      [0.16, -0.52, -1.9],
      [0, -0.88, -1.55],
    ],
    { width: 0.7, thick: 0.5, along: 7, twist: 0.9 },
  );

  return {
    body,
    head: { part: head, at: HEAD_PIVOT },
    rider: rides?.(body, UNICORN_SADDLE),
    wings: { parts: [unicornWing(color, 1), unicornWing(color, -1)], at: WING_PIVOT, rest: 0.5, amp: 0.5 },
    tail: { part: tail, at: TAIL_PIVOT },
  };
}
