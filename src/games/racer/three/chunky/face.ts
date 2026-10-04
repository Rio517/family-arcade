/**
 * The face every racer shares: big glossy eyes with a highlight and two
 * lashes, a blush on each cheek and a small open smile. Each character picks
 * its own eye colours and sizes; the shapes are the same, so the cast reads
 * as one family.
 */
import * as THREE from 'three';
import { place, type Part, type Rot, type V3 } from './kit';
import { BLUSH, BOW, BOW_DEEP, INK, MOUTH, TONGUE, WHITE } from './palette';

const SIDES = [1, -1] as const;

export interface EyeColors {
  /** Pupil and rim. */
  deep: number;
  iris: number;
  /** The lower iris, where the light pools. */
  light: number;
}

/**
 * One eye on the face at `at`, turned outward by `turn` radians, `w` wide and
 * `h` tall. `side` is +1 for the left eye (+x), -1 for the right; the lashes
 * go at the outer corner.
 */
export function eye(
  p: Part,
  side: number,
  at: V3,
  o: { w: number; h: number; turn: number; colors: EyeColors; lashes?: boolean; seg?: readonly [number, number] },
): void {
  const { w, h, colors } = o;
  const depth = w * 0.3;
  const deep = new THREE.Color(colors.deep);
  const iris = new THREE.Color(colors.iris);
  const light = new THREE.Color(colors.light);
  const c = new THREE.Color();
  p.within(place(at, { ry: o.turn * side }), () => {
    // The lens bulges toward +z; its own y axis is the depth (see blob's hemi),
    // and up on the face is its -z.
    p.blob(
      (q) => {
        const x = q.x / (w / 2);
        const y = -q.z / (h / 2);
        const d = Math.hypot(x, y);
        if (d < 0.45 || d > 0.97) return colors.deep;
        // Iris: deeper at the top, lighter where the light pools below.
        c.copy(iris).lerp(light, Math.max(0, Math.min(1, -y * 0.9 + 0.1)));
        return d > 0.85 ? c.lerp(deep, 0.35).getHex() : c.getHex();
      },
      [w, depth * 2, h],
      [0, 0, 0],
      // Smaller eyes on screen (a rider's) can take a coarser lens.
      { round: 1, hemi: true, seg: o.seg ?? [12, 4], rot: { rx: Math.PI / 2 }, gloss: true, smooth: true },
    );
    // Two highlights sitting on the lens, from one light up and to the left.
    for (const [x, y, r] of [
      [-0.32, 0.36, 0.14],
      [0.3, -0.3, 0.065],
    ] as const) {
      const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
      const n = new THREE.Vector3(x / (w / 2), y / (h / 2), z / depth).normalize();
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3((x * w) / 2, (y * h) / 2, z * depth).addScaledVector(n, 0.006),
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n),
        new THREE.Vector3(1, 1, 1),
      );
      p.add(new THREE.CircleGeometry(r * w, 8), WHITE, m, { gloss: true });
    }
    if (o.lashes !== false) {
      const k = w / 0.54;
      p.box(INK, [0.2 * k, 0.07 * k, 0.07 * k], [0.27 * k * side, h * 0.44, 0.02 * k], { rz: 0.55 * side });
      p.box(INK, [0.16 * k, 0.06 * k, 0.06 * k], [0.31 * k * side, h * 0.2, 0], { rz: 0.2 * side });
    }
  });
}

/** A pink blush on the cheek at `at`, turned outward by `turn`. */
export function blush(p: Part, side: number, at: V3, r: number, turn: number): void {
  // Flat across z, so its outline is the smooth one; a small blush can be coarser.
  p.blob(BLUSH, [2 * r, 0.5 * r, 1.1 * r], at, { round: 1, rot: { ry: turn * side, rx: Math.PI / 2 }, seg: r < 0.18 ? [8, 3] : [10, 3] });
}

/** A small open smile centred on `at`, `w` wide, with a tongue. */
export function smile(p: Part, at: V3, w: number): void {
  p.ball(MOUTH, w / 2, at, { scale: [1, 0.68, 0.45], rot: { rx: Math.PI }, hemi: true, seg: [8, 3] });
  p.ball(TONGUE, w * 0.3, [at[0], at[1] - w * 0.2, at[2] + w * 0.06], { scale: [1, 0.55, 0.35], seg: [6, 2] });
}

/**
 * A bow, `w` wide: two loops either side of a knot and two ribbon tails,
 * flat across z so it reads from the front and from behind. Pink unless
 * `colors` says otherwise.
 */
export function bow(p: Part, at: V3, w: number, turn: Rot = {}, colors: readonly [number, number] = [BOW, BOW_DEEP]): void {
  const [loop, deep] = colors;
  p.within(place(at, turn), () => {
    // Flat across z, so each loop's outline (what the camera sees) is smooth.
    const flat = { rx: Math.PI / 2 };
    const small = w < 0.6;
    for (const s of SIDES) {
      p.within(place([s * w * 0.26, 0, 0], { rz: 0.25 * s }), () => {
        p.blob(loop, [w * 0.5, w * 0.2, w * 0.36], [0, 0, 0], { round: 0.8, seg: small ? [8, 3] : [10, 3], rot: flat });
      });
      // A small bow (at a bunny's ear) is just the loops and knot.
      if (!small) {
        p.within(place([s * w * 0.11, -w * 0.32, 0.02], { rz: -0.35 * s }), () => {
          p.blob(deep, [w * 0.13, w * 0.07, w * 0.5], [0, 0, 0], { round: 0.8, seg: [6, 3], rot: flat });
        });
      }
    }
    p.ball(deep, w * 0.11, [0, 0, -w * 0.05], { seg: small ? [6, 3] : [6, 4] });
  });
}
