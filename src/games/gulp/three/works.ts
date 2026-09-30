/**
 * The chemical works and the airport shuttle: a chemical tank, a flare stack,
 * the works' control shed, and a three-car airport train. Same kit and rules as
 * props.ts: toy shapes, bold colours, and tops that read from the high camera.
 */
import * as THREE from 'three';
import { type Builder, type Face, type Kit, type V3, FLUSH, ON_GROUND, PAL, darker, placement, translate } from './kit';

const TANK_WHITE = 0xf4f6f8;
const STEEL = 0x8f98a5;
const CONCRETE = 0xc9cdd3;
const STAIR_ORANGE = 0xff8a1f;
const HAZARD_YELLOW = 0xffc61a;
const HAZARD_BLACK = 0x25272e;
const VALVE_RED = 0xe63946;
const FLAME = 0xff8a1f;
const FLAME_CORE = 0xffd23f;
/** Toxic green: the chemical works' bands, trim and warning marks. */
const TOXIC = 0x7ddc1f;

const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const ENDS: readonly Face[] = ['py', 'ny'];

/** A round rod from a to b, for pipes, stair rails and guy wires. */
function pipe(k: Kit, color: number, a: V3, b: V3, r: number, seg = 6): void {
  const va = new THREE.Vector3(a[0], a[1], a[2]);
  const dir = new THREE.Vector3(b[0], b[1], b[2]).sub(va);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
  g.translate(0, len / 2, 0);
  k.add(g, color, new THREE.Matrix4().compose(va, new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()), ONE));
}

/** A ring of yellow and black segments: a railing painted in hazard stripes. */
function hazardRing(k: Kit, r: number, h: number, y: number, n = 12): void {
  const step = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    k.cyl(i % 2 ? HAZARD_BLACK : HAZARD_YELLOW, r, r, h, 2, 0, y, 0, { open: true, theta: [i * step, step] });
  }
}

/**
 * The hazard kit every chemical tank carries: a pipe dropping to the ground and
 * running out to the lot's edge with a red valve wheel, and a yellow warning
 * diamond on a post by the path. `x0` is where the pipe leaves the tank.
 */
function tankFittings(k: Kit, x0: number, y0: number): void {
  pipe(k, STEEL, [x0, 0.35, 1.2], [x0, y0, 1.2], 0.2);
  pipe(k, STEEL, [x0, 0.35, 1.2], [3.9, 0.35, 1.2], 0.2);
  k.cyl(STEEL, 0.32, 0.32, 0.18, 8, 3.2, 0.17, 1.2);
  k.ring(VALVE_RED, 0.34, 0.06, [3.2, 0.9, 1.2], { rx: Math.PI / 2 }, 3, 8);
  pipe(k, STEEL, [3.2, 0.35, 1.2], [3.2, 0.9, 1.2], 0.05, 4);
  // Warning placard: a yellow diamond with a black border and a red flame mark.
  k.box(STEEL, 0.1, 1.4, 0.1, -2.6, 0, 3.7, undefined, ENDS);
  k.within(placement(-2.6, 1.7, 3.76, { rz: Math.PI / 4 }), () => {
    k.box(HAZARD_BLACK, 0.95, 0.95, 0.04, 0, -0.475, 0);
    k.box(HAZARD_YELLOW, 0.8, 0.8, 0.04, 0, -0.4, 0.03);
  });
  k.gem(TOXIC, 0.16, [-2.6, 1.7, 3.84]);
}

/**
 * A chemical tank. Variant 0 is a big white sphere on legs with a stair
 * winding up to a railed top; variant 1 is a squat cylinder with a domed roof
 * and a stair spiralling round its wall. Both carry a toxic-green band,
 * hazard-striped railings, a warning placard, and a pipe out to a red valve.
 */
const gastank: Builder = (k, v) => {
  k.rbox(CONCRETE, 7.8, 0.2, 7.8, 0.8, 0.06, 0, 0, 0, { seg: 1 });
  const band = TOXIC;
  if (v === 0) {
    const R = 3.2;
    const cy = 5.0;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI * 2) / 8 + Math.PI / 8;
      k.box(STEEL, 0.28, cy, 0.28, 3.05 * Math.sin(a), 0.2, 3.05 * Math.cos(a), undefined, ENDS);
    }
    k.ring(STEEL, 3.05, 0.1, [0, 1.8, 0], { rx: Math.PI / 2 }, 3, 16);
    k.sphere(TANK_WHITE, R, [0, cy, 0], 14, 8);
    k.ring(band, R + 0.02, 0.18, [0, cy, 0], { rx: Math.PI / 2 }, 3, 20);
    // The stair: a straight flight up to the equator, then a spiral over the top.
    pipe(k, STAIR_ORANGE, [3.7, 0.2, 2.2], [3.35, cy, -0.6], 0.09);
    pipe(k, STAIR_ORANGE, [3.95, 1.1, 2.2], [3.6, cy + 0.9, -0.6], 0.06, 4);
    const at = (t: number): V3 => {
      const p = (t * Math.PI) / 2.3;
      const a = Math.atan2(3.35, -0.6) - t * 2.4;
      const rr = (R + 0.25) * Math.cos(p);
      return [rr * Math.sin(a), cy + (R + 0.25) * Math.sin(p), rr * Math.cos(a)];
    };
    for (let i = 0; i < 10; i++) pipe(k, STAIR_ORANGE, at(i / 10), at((i + 1) / 10), 0.1, 4);
    k.cyl(STEEL, 1.1, 1.1, 0.12, 10, 0, cy + R - 0.15, 0);
    hazardRing(k, 1.1, 0.4, cy + R - 0.03);
    tankFittings(k, 1.6, cy - R + 0.6);
  } else {
    const R = 3.4;
    const H = 6.0;
    k.cyl(CONCRETE, R + 0.3, R + 0.3, 0.4, 16, 0, 0.2, 0);
    k.cyl(TANK_WHITE, R, R, H, 16, 0, 0.6, 0, { open: true });
    k.cyl(band, R + 0.03, R + 0.03, 0.7, 16, 0, 3.6, 0, { open: true });
    const top = 0.6 + H;
    k.sphere(TANK_WHITE, R, [0, top, 0], 16, 4, { hemi: true, scale: [1, 0.36, 1] });
    hazardRing(k, R + 0.05, 0.45, top, 16);
    k.cyl(STEEL, 0.5, 0.6, 0.5, 8, 0, top + R * 0.36 - 0.1, 0);
    // A stair spiralling up the wall, with a hand rail.
    const at = (t: number, lift: number): V3 => {
      const a = 1.9 - t * 3.3;
      return [(R + 0.3) * Math.sin(a), 0.6 + t * H + lift, (R + 0.3) * Math.cos(a)];
    };
    for (let i = 0; i < 10; i++) {
      pipe(k, STAIR_ORANGE, at(i / 10, 0), at((i + 1) / 10, 0), 0.12, 4);
      pipe(k, STAIR_ORANGE, at(i / 10, 0.8), at((i + 1) / 10, 0.8), 0.05, 4);
    }
    tankFittings(k, 2.7, 1.0);
  }
};

/**
 * A flare stack: a tall thin chimney in red and white bands on a concrete
 * block, a ladder up one side, three guy wires to anchors, and a burning
 * flame on the tip, orange round a yellow heart.
 */
const flarestack: Builder = (k) => {
  k.cbox(CONCRETE, 2.2, 0.6, 2.2, 0.1, 0, 0, 0);
  const H = 20.6;
  const bands = 8;
  const bh = H / bands;
  for (let i = 0; i < bands; i++) {
    const r0 = 0.55 - (0.15 * i) / bands;
    const r1 = 0.55 - (0.15 * (i + 1)) / bands;
    k.cyl(i % 2 ? PAL.white : VALVE_RED, r1, r0, bh, 10, 0, 0.6 + i * bh, 0, { open: i < bands - 1 });
  }
  const top = 0.6 + H;
  k.cyl(STEEL, 0.3, 0.42, 0.5, 8, 0, top, 0);
  // The flame: a soft orange ball with a tongue flickering up out of it, a
  // little tilted, and a yellow heart showing through at the front.
  const fy = top + 0.5;
  k.ico(FLAME, 0.62, 0, [0, fy + 0.45, 0], [1, 1.15, 1]);
  k.add(new THREE.ConeGeometry(0.42, 1.6, 6), FLAME, placement(0.08, fy + 1.55, 0, { rz: -0.12 }));
  k.ico(FLAME_CORE, 0.42, 0, [0, fy + 0.4, 0.3], [1, 1.2, 0.9]);
  k.add(new THREE.ConeGeometry(0.22, 0.8, 5), FLAME_CORE, placement(0, fy + 1.0, 0.36, { rz: 0.1 }));
  // Ladder up the +z side: two rails and rungs.
  for (const sx of [-1, 1]) k.box(STEEL, 0.06, H - 0.6, 0.06, sx * 0.2, 0.6, 0.62, undefined, ENDS);
  for (let y = 1.4; y < H; y += 1.4) k.box(STEEL, 0.4, 0.05, 0.05, 0, y, 0.62, undefined, ['nx', 'px']);
  // Guy wires from three anchor blocks.
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3 + Math.PI / 3;
    const ax = 1.35 * Math.sin(a);
    const az = 1.35 * Math.cos(a);
    k.box(CONCRETE, 0.4, 0.3, 0.4, ax, 0, az);
    pipe(k, PAL.ink, [ax, 0.3, az], [0.45 * Math.sin(a), 13.0, 0.45 * Math.cos(a)], 0.03, 3);
  }
};

/**
 * The chemical works' control shed: a low building with a band of windows, a flat
 * roof with an AC unit and a radio mast, a door with a little canopy at the
 * front, and a pipe rack along its right side carrying three coloured pipes.
 */
const plantshed: Builder = (k) => {
  const wall = 0xdfe6ee;
  const trim = TOXIC;
  const W = 8.2;
  const D = 5.6;
  const cz = -0.3;
  const x0 = -0.7;
  k.rbox(CONCRETE, W + 0.6, 0.3, D + 0.6, 0.5, 0.1, x0, 0, cz, { seg: 1 });
  k.rbox(wall, W, 3.6, D, 0.4, 0, x0, 0.3, cz, { seg: 1 });
  // A ribbon of windows round all four sides.
  k.rbox(0x5fb8e8, W + 0.08, 1.0, D + 0.08, 0.44, 0, x0, 1.8, cz, { seg: 1 });
  k.rbox(trim, W + 0.5, 0.45, D + 0.5, 0.6, 0.12, x0, 3.9, cz, { seg: 1 });
  const top = 4.35;
  k.box(0xb8c0cc, W - 0.4, 0.04, D - 0.4, x0, top - 0.1, cz, undefined, ON_GROUND);
  // Front door, canopy and a warning sign.
  k.within(translate(x0, 0, cz + D / 2), () => {
    k.box(darker(wall, 0.25), 1.4, 2.2, 0.12, -1.8, 0.3, 0, undefined, FLUSH);
    k.box(0x2f6fd6, 1.1, 2.0, 0.16, -1.8, 0.3, 0, undefined, FLUSH);
    k.box(trim, 2.2, 0.18, 1.0, -1.8, 2.7, 0.5);
    k.box(HAZARD_YELLOW, 1.2, 0.6, 0.12, 1.6, 1.0, 0, undefined, FLUSH);
  });
  // AC unit and a radio mast on the roof.
  k.cbox(0xb8c0cc, 1.8, 0.9, 1.3, 0.1, x0 - 1.8, top - 0.08, cz - 0.6);
  k.cyl(0x5d6470, 0.45, 0.45, 0.06, 8, x0 - 1.8, top + 0.82, cz - 0.6);
  k.box(STEEL, 0.12, 1.8, 0.12, x0 + 2.8, top - 0.08, cz - 1.4, undefined, ['ny']);
  k.gem(VALVE_RED, 0.14, [x0 + 2.8, top + 1.8, cz - 1.4]);
  // Pipe rack along the right side: three frames carrying three pipes.
  const rx = x0 + W / 2 + 0.75;
  for (const z of [-2.6, -0.3, 2.0]) {
    for (const dx of [-0.35, 0.35]) k.box(STEEL, 0.14, 3.0, 0.14, rx + dx, 0, z, undefined, ENDS);
    k.box(STEEL, 0.9, 0.14, 0.2, rx, 2.9, z);
  }
  const pipes: ReadonlyArray<readonly [number, number, number]> = [
    [-0.22, 3.2, HAZARD_YELLOW],
    [0.08, 3.2, STEEL],
    [0.3, 3.18, VALVE_RED],
  ];
  for (const [dx, y, col] of pipes) k.rod(col, 0.13, 6.2, 8, [rx + dx, y, -0.3], { rx: Math.PI / 2 });
};

const TRAIN_WHITE = 0xf4f6f8;
const TRAIN_WINDOWS = 0x24477f;
const TRAIN_STRIPE = 0x3a86ff;

/**
 * One car of the airport train, centred on z. Its body, window band and
 * stripe are soft blocks; `nose` (+1 or -1) adds a fully rounded nose at that
 * end, so the train is round at both ends and flat where cars meet.
 */
function trainCar(k: Kit, z: number, len: number, nose: 0 | 1 | -1): void {
  const W = 2.3;
  const parts: ReadonlyArray<readonly [number, number, number, number]> = [
    [TRAIN_WHITE, 0.7, 2.6, 0],
    [TRAIN_WINDOWS, 1.85, 0.85, 0.03],
    [TRAIN_STRIPE, 1.25, 0.22, 0.03],
  ];
  const noseLen = 2.6;
  const flatLen = nose ? len - noseLen / 2 : len;
  const flatZ = z - (nose * noseLen) / 4;
  for (const [col, y, h, out] of parts) {
    const b = col === TRAIN_WHITE ? 0.35 : 0;
    k.rbox(col, W + 2 * out, h, flatLen + 2 * out, 0.3 + out, b, 0, y, flatZ, { seg: 1 });
    if (nose) k.rbox(col, W + 2 * out, h, noseLen + 2 * out, W / 2 - 0.01 + out, b, 0, y, z + nose * (len / 2 - noseLen / 2), { seg: 2 });
  }
  // A grey roof pod for the top-down read, two bogies, and wheels on axles.
  k.box(0xc9cfd8, 1.3, 0.28, 2.0, 0, 3.3, z, undefined, ON_GROUND);
  for (const bz of [-len / 2 + 1.2, len / 2 - 1.2]) {
    k.box(PAL.chassis, 1.9, 0.4, 1.5, 0, 0.25, z + bz);
    for (const az of [-0.45, 0.45]) k.rod(PAL.ink, 0.3, 2.44, 6, [0, 0.3, z + bz + az], { rz: Math.PI / 2 });
  }
}

/**
 * The airport shuttle train: three short white cars with a blue window band
 * and stripe, rounded noses at both ends, dark bellows between the cars, and
 * bogies and wheels standing out below the body. The front is at +z.
 */
const train: Builder = (k) => {
  const len = 6.1;
  const gap = 0.45;
  const step = len + gap;
  trainCar(k, -step, len, -1);
  trainCar(k, 0, len, 0);
  trainCar(k, step, len, 1);
  for (const s of [-1, 1]) k.box(PAL.chassis, 1.8, 2.0, gap + 0.2, 0, 1.0, (s * step) / 2);
};

export const WORKS: Record<'gastank' | 'flarestack' | 'plantshed' | 'train', Builder> = {
  gastank,
  flarestack,
  plantshed,
  train,
};
