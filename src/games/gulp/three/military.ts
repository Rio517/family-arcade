/**
 * The Gulp Universe military base: a toy army set of tanks, a helicopter, a
 * lookout tower, huts, a radar, a hangar, and the bomber that flies over big
 * holes. Same kit and rules as props.ts. Everything is chunky and rounded in
 * cheerful olive and sand, with white stars, so it reads as a plastic play
 * set rather than real hardware.
 */
import * as THREE from 'three';
import type { PropKind } from '../domain/catalog';
import { type Builder, type V3, FLUSH, HALF_PI, Kit, ON_GROUND, PAL, archDoor, darker, lighter, paneAt, placement } from './kit';

export type MilitaryKind = Extract<
  PropKind,
  'tank' | 'helicopter' | 'watchtower' | 'barracks' | 'radar' | 'hangar' | 'bomber'
>;

const OLIVE = 0x7d9a45;
const OLIVE_DARK = 0x5f7a34;
const KHAKI = 0xcdb97e;
const STAR = 0xfbfbf4;
const ROUNDEL = 0x2f5fb8;
const TRACK = 0x4a4e55;
const CONCRETE = 0xd4d0c8;
const YELLOW = 0xffc933;

// ---------------------------------------------------------------------------
// Helpers

/** A chunky five-pointed star in the XY plane, pointing up (+y), extruded toward +z. */
function starGeometry(r: number, depth: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = HALF_PI + (i * Math.PI) / 5;
    // A fatter inner radius than a real star, so it stays a star when small.
    const rr = i % 2 ? r * 0.46 : r;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 1 });
}

/** A star lying flat with its base on y, one point toward +z (turned by ry). */
function flatStar(k: Kit, color: number, r: number, c: V3, ry = 0, t = 0.06): void {
  k.add(starGeometry(r, t), color, placement(c[0], c[1], c[2], { rx: -HALF_PI, ry: Math.PI + ry }));
}

/** A star standing on a wall that faces +z (turned by ry), its back on z. */
function wallStar(k: Kit, color: number, r: number, c: V3, ry = 0, t = 0.08): void {
  k.add(starGeometry(r, t), color, placement(c[0], c[1], c[2], { ry }));
}

/** A blue disc with a white star, lying flat on y: the marking on wings and roofs. */
function roundel(k: Kit, r: number, c: V3, seg = 14): void {
  k.cyl(ROUNDEL, r, r, 0.06, seg, c[0], c[1], c[2]);
  flatStar(k, STAR, r * 0.8, [c[0], c[1] + 0.06, c[2]], 0, 0.04);
}

/** Main rotor: two long blades crossed on a hub, blades in the XZ plane at y = 0. */
const ROTOR_R = 5.4;
function rotor(k: Kit): void {
  const blade = 0x454b52;
  for (const ry of [0, HALF_PI]) {
    k.within(placement(0, 0, 0, { ry }), () => {
      k.box(blade, 2 * ROTOR_R - 1.2, 0.08, 0.46, 0, -0.04, 0);
      // Yellow tips make the rotor read as a rotor even when it is spinning.
      for (const s of [-1, 1]) k.box(YELLOW, 0.6, 0.1, 0.46, s * (ROTOR_R - 0.3), -0.05, 0);
    });
  }
  k.cyl(OLIVE_DARK, 0.36, 0.42, 0.26, 8, 0, -0.1, 0);
  k.sphere(OLIVE_DARK, 0.26, [0, 0.16, 0], 8, 3, { hemi: true });
}

/**
 * The helicopter's main rotor on its own, centred on the hub with the blades
 * in the XZ plane, so the scene can spin it on a flying helicopter.
 */
export function buildRotorGeometry(): THREE.BufferGeometry {
  const k = new Kit();
  rotor(k);
  return k.build();
}

// ---------------------------------------------------------------------------
// Tank

const TANKS = [
  { body: 0x7a9a40, turret: 0x86a64b },
  { body: 0xd2ae62, turret: 0xdcbb72 },
] as const;

/** A chunky toy tank facing +z: rounded tracks, a soft hull, a puck turret and a short fat barrel. */
const tank: Builder = (k, v) => {
  const c = TANKS[v];
  const dark = darker(c.body, 0.28);
  for (const sx of [-1, 1]) {
    const xc = sx * 1.26;
    // Track: a stadium shape (two rounded ends) pushed out along x.
    const pts: V3[] = [];
    for (const x of [xc - 0.42, xc + 0.42]) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        pts.push([x, 0.56 + 0.56 * Math.sin(a), -2.55 + 0.56 * Math.cos(a)]);
        pts.push([x, 0.62 + 0.62 * Math.sin(a), 2.45 + 0.62 * Math.cos(a)]);
      }
    }
    k.hull(TRACK, pts);
    // Road wheels on the outer face.
    for (let i = 0; i < 5; i++) {
      k.rod(dark, 0.36, 0.08, 7, [sx * 1.7, 0.56, -2.2 + i * 1.1], { rz: HALF_PI });
      k.rod(lighter(c.body, 0.3), 0.15, 0.12, 5, [sx * 1.7, 0.56, -2.2 + i * 1.1], { rz: HALF_PI });
    }
  }
  k.box(dark, 1.7, 0.7, 5.2, 0, 0.35, 0, undefined, ON_GROUND);
  // Hull, with fenders that run over the tracks.
  k.rbox(c.body, 3.36, 0.62, 6.0, 0.5, 0.24, 0, 1.08, 0, { under: true });
  // Rear deck: an engine grille and two stowage boxes.
  k.box(dark, 1.9, 0.06, 0.9, 0, 1.68, -2.35);
  for (const sx of [-1, 1]) k.cbox(darker(c.body, 0.12), 0.7, 0.36, 0.5, 0.06, sx * 1.1, 1.68, -2.6);
  // Headlights on the front fenders.
  for (const sx of [-1, 1]) k.rod(PAL.head, 0.15, 0.16, 6, [sx * 1.0, 1.45, 3.0], { rx: HALF_PI });
  // Turret: a soft puck with a mantlet, a thick short barrel and a hatch.
  k.rbox(c.turret, 2.3, 0.74, 2.6, 1.05, 0.32, 0, 1.7, -0.35, { seg: 3 });
  k.cbox(c.body, 1.0, 0.62, 0.5, 0.12, 0, 1.78, 0.98);
  k.rod(c.body, 0.21, 2.1, 8, [0, 2.09, 2.2], { rx: HALF_PI });
  k.rod(dark, 0.3, 0.42, 8, [0, 2.09, 3.03], { rx: HALF_PI });
  k.cyl(dark, 0.28, 0.31, 0.18, 8, 0.5, 2.38, -0.98);
  flatStar(k, STAR, 0.6, [0, 2.44, 0]);
};

// ---------------------------------------------------------------------------
// Helicopter

/**
 * A toy helicopter on its skids, nose +z. Parked ones carry their still main
 * rotor; flying ones leave it off so the scene can spin its own on the mast.
 */
function heli(k: Kit, withRotor: boolean): void {
  // Drawn around the rotor mast, then slid forward so the long tail fits the footprint.
  k.within(placement(0, 0, 1.2), () => {
    const belly = 0xdcd6b8;
    const cy = 1.55;
    const cz = 0.3;
    // Round body: olive on top, a light belly underneath.
    k.sphere(OLIVE, 1.0, [0, cy, cz], 12, 5, { hemi: true, scale: [1.45, 1.2, 2.3] });
    k.sphere(belly, 1.0, [0, cy, cz], 12, 3, { hemi: true, scale: [1.45, 1.0, 2.3], rot: { rx: Math.PI } });
    // Big bubble cockpit at the nose.
    k.sphere(PAL.glass, 1.15, [0, cy + 0.15, cz + 1.45], 12, 6, { scale: [1.1, 0.98, 1.1] });
    // Engine cowl on the roof, with a star to show from above.
    k.cbox(OLIVE_DARK, 1.5, 0.5, 2.3, 0.18, 0, 2.45, cz - 0.95);
    flatStar(k, STAR, 0.5, [0, 2.95, cz - 1.5]);
    k.cyl(PAL.metal, 0.14, 0.18, 0.4, 6, 0, 2.95, -0.2);
    // Tail boom, fin, stabiliser and tail rotor.
    k.rod(OLIVE, 0.55, 4.6, 8, [0, 2.0, -3.6], { rx: -HALF_PI }, 0.24);
    k.rod(STAR, 0.48, 0.4, 8, [0, 2.0, -3.1], { rx: -HALF_PI }, 0.46);
    k.hull(OLIVE_DARK, [
      [-0.1, 1.85, -5.3],
      [0.1, 1.85, -5.3],
      [-0.1, 1.85, -6.1],
      [0.1, 1.85, -6.1],
      [-0.07, 3.2, -5.95],
      [0.07, 3.2, -5.95],
      [-0.07, 3.2, -6.4],
      [0.07, 3.2, -6.4],
    ]);
    k.box(OLIVE_DARK, 2.3, 0.1, 0.7, 0, 1.95, -5.0);
    for (const s of [-1, 1]) k.box(YELLOW, 0.2, 0.12, 0.7, s * 1.15, 1.94, -5.0);
    const tr: V3 = [0.22, 2.7, -6.0];
    for (const a of [0.8, 0.8 + HALF_PI]) {
      const dy = Math.cos(a) * 0.8;
      const dz = Math.sin(a) * 0.8;
      k.beam(0x454b52, [tr[0], tr[1] - dy, tr[2] - dz], [tr[0], tr[1] + dy, tr[2] + dz], 0.05, 0.2);
    }
    k.rod(YELLOW, 0.13, 0.16, 6, [tr[0], tr[1], tr[2]], { rz: HALF_PI });
    // Skids and their struts.
    for (const sx of [-1, 1]) {
      const x = sx * 1.4;
      k.rod(PAL.chassis, 0.11, 4.2, 6, [x, 0.11, 0.3], { rx: HALF_PI });
      k.beam(PAL.chassis, [x, 0.11, 2.35], [x, 0.45, 2.75], 0.2);
      for (const z of [1.3, -0.8]) k.beam(PAL.chassis, [x, 0.11, z], [sx * 0.9, 0.8, z], 0.14);
    }
    if (withRotor) k.within(placement(0, 3.4, -0.2, { ry: Math.PI / 4 }), () => rotor(k));
  });
}

const helicopter: Builder = (k) => heli(k, true);

/**
 * The helicopter without its main rotor, in the same frame as the kind: the
 * mast stays, and a rotor from buildRotorGeometry() sits on it at (0, 3.4, 1.0).
 */
export function buildHeliBodyGeometry(): THREE.BufferGeometry {
  const k = new Kit();
  heli(k, false);
  const g = k.build();
  // Snap to the ground the way buildKindGeometry does, so both frames agree.
  const minY = g.boundingBox?.min.y ?? 0;
  if (minY !== 0) g.translate(0, -minY, 0);
  return g;
}

// ---------------------------------------------------------------------------
// Watchtower

/** A wooden lookout on four legs, with a little hut, a pyramid roof and a ladder. */
const watchtower: Builder = (k) => {
  const wood = PAL.wood;
  const woodDark = darker(PAL.wood, 0.2);
  const top = 3.8;
  const legAt = (y: number) => 1.28 - (0.3 * y) / top;
  const corners: ReadonlyArray<readonly [number, number]> = [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ];
  const at = (s: readonly [number, number], y: number): V3 => [s[0] * legAt(y), y, s[1] * legAt(y)];
  for (const s of corners) k.beam(wood, at(s, 0), at(s, top), 0.24);
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    k.beam(woodDark, at(a, 0.3), at(b, 2.1), 0.12);
    k.beam(woodDark, at(b, 2.1), at(a, 3.9), 0.12);
    k.beam(woodDark, at(a, 2.1), at(b, 2.1), 0.14);
  }
  // Platform and a hut with half walls, corner posts and a pyramid roof.
  k.box(woodDark, 2.7, 0.22, 2.7, 0, top, 0);
  const wy = top + 0.22;
  for (const sz of [-1, 1]) k.box(OLIVE, 2.5, 0.95, 0.14, 0, wy, sz * 1.18, undefined, ON_GROUND);
  for (const sx of [-1, 1]) k.box(OLIVE, 0.14, 0.95, 2.22, sx * 1.18, wy, 0, undefined, ON_GROUND);
  k.box(OLIVE_DARK, 2.62, 0.1, 0.24, 0, wy + 0.95, 1.18, undefined, ON_GROUND);
  for (const s of corners) k.box(wood, 0.14, 1.2, 0.14, s[0] * 1.18, wy + 0.95, s[1] * 1.18, undefined, ON_GROUND);
  k.cyl(KHAKI, 0.12, 2.1, 1.0, 4, 0, wy + 2.1, 0, { ry: Math.PI / 4 });
  // A searchlight on the front rail and a pennant on the roof.
  k.rod(PAL.metal, 0.2, 0.34, 8, [0.7, wy + 1.28, 1.3], { rx: HALF_PI });
  k.rod(PAL.head, 0.17, 0.04, 8, [0.7, wy + 1.28, 1.48], { rx: HALF_PI });
  k.cyl(PAL.metal, 0.03, 0.03, 0.55, 5, 0, wy + 3.05, 0);
  k.hull(YELLOW, [
    [0.02, wy + 3.2, 0],
    [0.02, wy + 3.6, 0],
    [0.9, wy + 3.4, 0],
    [0.02, wy + 3.4, 0.05],
  ]);
  // Ladder up the front to a hatch in the platform.
  for (const sx of [-1, 1]) k.beam(wood, [sx * 0.34, 0, 1.55], [sx * 0.34, top + 0.2, 1.3], 0.08);
  for (let i = 0; i < 7; i++) {
    const y = 0.45 + i * 0.55;
    k.box(wood, 0.7, 0.06, 0.08, 0, y, 1.55 - (0.25 * y) / top);
  }
};

// ---------------------------------------------------------------------------
// Barracks

const BARRACKS = [
  { body: OLIVE, rib: OLIVE_DARK, door: 0x8a5a3b },
  { body: KHAKI, rib: darker(KHAKI, 0.18), door: OLIVE_DARK },
] as const;

/** Points of a half-ellipse arch (a wide, b tall, base y0) across z, at x. */
function archPts(x: number, a: number, b: number, y0: number, n: number): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const p = (Math.PI * i) / n;
    pts.push([x, y0 + b * Math.sin(p), a * Math.cos(p)]);
  }
  return pts;
}

/** A long rounded Quonset hut with a porch, little windows, and a flagpole. */
const barracks: Builder = (k, v) => {
  const c = BARRACKS[v];
  const L = 5.3;
  const a = 2.85;
  const b = 3.65;
  const y0 = 0.3;
  k.box(CONCRETE, 11.3, y0, 6.7, 0, 0, 0);
  k.hull(c.body, [...archPts(-L, a, b, y0, 12), ...archPts(L, a, b, y0, 12)]);
  // Ribs over the arch, like the joints of a tin hut.
  for (let i = 0; i < 6; i++) {
    const x = -L + 0.1 + (i * (2 * L - 0.2)) / 5;
    k.hull(c.rib, [...archPts(x - 0.09, a + 0.07, b + 0.07, y0, 12), ...archPts(x + 0.09, a + 0.07, b + 0.07, y0, 12)]);
  }
  // Round windows in the end walls.
  for (const sx of [-1, 1]) {
    k.rod(PAL.white, 0.62, 0.12, 10, [sx * (L + 0.24), 2.1, 0], { rz: HALF_PI });
    k.rod(PAL.glass, 0.46, 0.14, 10, [sx * (L + 0.26), 2.1, 0], { rz: HALF_PI });
  }
  // Little windows along both sides, leaning back with the curve of the roof.
  for (const sz of [-1, 1]) {
    for (const u of [-3.8, -2.1, 2.1, 3.8]) {
      k.within(placement(u, y0 + 0.8, sz * (a - 0.1), { ry: sz > 0 ? 0 : Math.PI, rx: -0.3 }), () =>
        paneAt(k, PAL.glass, PAL.white, 0, 0, 0.8, 0.75, false, 1),
      );
    }
  }
  // Porch at the front door, under a flat canopy, and a big star on the crown.
  const pz = a + 0.45;
  k.rbox(c.body, 2.3, 2.5, 1.9, 0.3, 0.12, 0, y0, pz - 0.95);
  k.cbox(c.rib, 2.8, 0.18, 1.2, 0.06, 0, y0 + 2.3, pz - 0.3);
  k.within(placement(0, y0, pz), () => archDoor(k, PAL.white, c.door, 0, 0, 1.1, 1.9));
  k.box(CONCRETE, 1.9, 0.18, 0.45, 0, 0, pz + 0.22);
  flatStar(k, STAR, 0.8, [0, y0 + b - 0.02, 0]);
  // Sandbags by the door.
  for (let i = 0; i < 4; i++) {
    for (const sx of [-1, 1]) k.ico(KHAKI, 0.34, 0, [sx * (1.65 + (i % 2) * 0.55), 0.22 + (i > 1 ? 0.36 : 0), a + 0.2], [1.2, 0.6, 0.8], i);
  }
  // Flagpole at the front corner.
  const fx = 5.75;
  const fz = 2.8;
  k.box(CONCRETE, 0.6, 0.25, 0.6, fx, 0, fz);
  k.cyl(PAL.metal, 0.06, 0.08, 5.0, 6, fx, 0.25, fz);
  k.gem(PAL.brass, 0.14, [fx, 5.3, fz]);
  k.box(ROUNDEL, 1.3, 0.8, 0.05, fx - 0.7, 4.3, fz);
  wallStar(k, STAR, 0.26, [fx - 0.7, 4.7, fz + 0.025], 0, 0.04);
};

// ---------------------------------------------------------------------------
// Radar

/** A lattice tower with a big white dish tilted to the sky, and a little control hut. */
const radar: Builder = (k) => {
  const leg = 0x8b9a6a;
  const top = 7.2;
  const legAt = (y: number) => 1.9 - (1.05 * y) / top;
  const corners: ReadonlyArray<readonly [number, number]> = [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ];
  const at = (s: readonly [number, number], y: number): V3 => [s[0] * legAt(y), y, s[1] * legAt(y)];
  for (const s of corners) {
    k.box(CONCRETE, 0.8, 0.3, 0.8, s[0] * 1.9, 0, s[1] * 1.9);
    k.beam(leg, at(s, 0), at(s, top), 0.3);
  }
  const levels = [0.3, 2.6, 4.9, top];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    for (let j = 1; j < levels.length; j++) {
      k.beam(leg, at(a, levels[j]), at(b, levels[j]), 0.16);
      k.beam(leg, at(a, levels[j - 1]), at(b, levels[j]), 0.1);
    }
  }
  // Platform with a yellow edge, a turntable and a pedestal.
  k.cyl(PAL.metal, 1.6, 1.5, 0.3, 12, 0, top, 0);
  k.cyl(YELLOW, 1.62, 1.62, 0.14, 12, 0, top + 0.12, 0, { open: true });
  k.cyl(OLIVE_DARK, 0.9, 1.0, 0.35, 10, 0, top + 0.3, 0);
  k.cyl(OLIVE, 0.4, 0.5, 1.4, 8, 0, top + 0.65, 0);
  // The dish: a shallow bowl on its back, tilted up toward +z, with a feed on three struts.
  const tilt = 1.0;
  const pivot: V3 = [0, 9.35, 0.1];
  const dish = new THREE.LatheGeometry(
    (
      [
        [0, 0],
        [0.62, 0.03],
        [1.5, 0.25],
        [2.3, 0.63],
        [2.82, 0.95],
        [2.95, 1.05],
        [2.76, 1.07],
        [2.2, 0.77],
        [1.32, 0.4],
        [0.44, 0.18],
        [0, 0.16],
      ] as const
    ).map(([r, y]) => new THREE.Vector2(r, y)),
    16,
  );
  k.add(dish, PAL.white, placement(pivot[0], pivot[1], pivot[2], { rx: tilt }));
  k.within(placement(pivot[0], pivot[1], pivot[2], { rx: tilt }), () => {
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3 + HALF_PI;
      k.beam(PAL.metal, [2.2 * Math.cos(a), 0.74, 2.2 * Math.sin(a)], [0, 2.0, 0], 0.07);
    }
    k.cyl(YELLOW, 0.1, 0.26, 0.4, 8, 0, 1.6, 0);
    k.sphere(0xe63946, 0.24, [0, 2.05, 0], 8, 4);
  });
  // Control hut at the foot of the tower.
  const hz = 3.0;
  k.rbox(KHAKI, 2.8, 2.1, 1.9, 0.25, 0.1, 0, 0, hz);
  k.cbox(OLIVE_DARK, 3.1, 0.26, 2.2, 0.08, 0, 2.1, hz);
  flatStar(k, STAR, 0.55, [-0.35, 2.36, hz]);
  k.within(placement(0, 0, hz + 0.95), () => {
    archDoor(k, PAL.white, OLIVE_DARK, -0.6, 0, 0.8, 1.6);
    paneAt(k, PAL.glass, PAL.white, 0.65, 0.8, 0.8, 0.7, true, 1);
  });
  k.cyl(PAL.metal, 0.03, 0.04, 1.1, 5, 1.1, 2.36, hz - 0.4);
  k.gem(0xe63946, 0.1, [1.1, 3.5, hz - 0.4]);
};

// ---------------------------------------------------------------------------
// Hangar

/** A big arched hangar with its doors pushed open, a control tower and a windsock. */
const hangar: Builder = (k) => {
  const a = 9.4;
  const b = 9.0;
  const z0 = -8.4;
  const z1 = 5.6;
  const n = 16;
  // Arch points across x at depth z (the hangar runs along z, doors at +z).
  const arch = (z: number, da = 0): V3[] => {
    const pts: V3[] = [];
    for (let i = 0; i <= n; i++) {
      const p = (Math.PI * i) / n;
      pts.push([(a + da) * Math.cos(p), (b + da) * Math.sin(p), z]);
    }
    return pts;
  };
  k.hull(OLIVE, [...arch(z0), ...arch(z1)]);
  for (let i = 0; i < 5; i++) {
    const z = z0 + 0.25 + (i * (z1 - z0 - 0.5)) / 4;
    k.hull(OLIVE_DARK, [...arch(z - 0.14, 0.1), ...arch(z + 0.14, 0.1)]);
  }
  // Front wall: a lighter arch slab standing proud of the roof.
  k.hull(KHAKI, [...arch(z1, 0.25), ...arch(z1 + 0.5, 0.25)]);
  const zf = z1 + 0.5;
  // The doorway: dark inside, a hazard-striped lintel, and the doors slid aside.
  const dw = 12.2;
  const dh = 6.3;
  k.box(0x4a5263, dw, dh, 0.08, 0, 0, zf, undefined, ['ny', 'nz']);
  k.box(0x3d424b, dw, 0.05, 1.2, 0, 0, zf - 0.55);
  for (let i = 0; i < 9; i++) {
    const w = (dw + 0.4) / 9;
    k.box(i % 2 ? 0x2d3142 : YELLOW, w, 0.4, 0.14, -(dw + 0.4) / 2 + (i + 0.5) * w, dh, zf, undefined, FLUSH);
  }
  for (const sx of [-1, 1]) {
    for (let j = 0; j < 2; j++) {
      const x = sx * (dw / 2 + 0.55 + j * 0.9);
      const h = 5.0 - j * 0.3;
      k.box(OLIVE_DARK, 1.2, h, 0.14, x, 0, zf + 0.08 + j * 0.14, undefined, FLUSH);
      for (let r = 1; r < 4; r++) k.box(OLIVE, 1.2, 0.1, 0.06, x, (h * r) / 4, zf + 0.22 + j * 0.14, undefined, FLUSH);
    }
  }
  // A little yellow trainer plane nosing out of the doorway.
  const py = 1.35;
  k.rod(YELLOW, 0.75, 3.4, 10, [0, py, zf + 0.6], { rx: HALF_PI }, 0.62);
  k.rod(0xe63946, 0.42, 0.6, 8, [0, py, zf + 2.6], { rx: HALF_PI }, 0.06);
  k.beam(0x454b52, [-0.35, py - 1.15, zf + 2.4], [0.35, py + 1.15, zf + 2.4], 0.22, 0.06);
  k.sphere(PAL.glass, 0.5, [0, py + 0.5, zf + 0.35], 8, 3, { hemi: true, scale: [1, 0.9, 1.7] });
  k.box(YELLOW, 7.2, 0.2, 1.6, 0, py - 0.45, zf + 0.35);
  for (const sx of [-1, 1]) {
    k.box(0xe63946, 0.8, 0.22, 1.62, sx * 3.25, py - 0.46, zf + 0.35);
    k.beam(PAL.chassis, [sx * 1.0, py - 0.45, zf + 0.9], [sx * 1.1, 0.35, zf + 1.0], 0.1);
    k.wheel(0.35, 0.22, [sx * 1.1, 0.35, zf + 1.0], 8);
  }
  // Star-and-bar marking over the door.
  k.within(placement(0, 7.8, zf), () => {
    k.add(new THREE.CircleGeometry(1.2, 16), ROUNDEL, placement(0, 0, 0.1));
    wallStar(k, STAR, 0.95, [0, 0, 0.12], 0, 0.06);
    for (const sx of [-1, 1]) {
      k.box(ROUNDEL, 2.2, 0.8, 0.1, sx * 2.2, -0.4, 0, undefined, FLUSH);
      k.box(STAR, 1.9, 0.5, 0.12, sx * 2.3, -0.25, 0, undefined, FLUSH);
    }
  });
  // A light ridge vent along the crown and skylights down both slopes.
  k.box(0xd9ddd2, 1.1, 0.3, z1 - z0 - 0.6, 0, b - 0.1, (z0 + z1) / 2);
  for (const sx of [-1, 1]) {
    const p = HALF_PI - sx * 0.42;
    const px = (a + 0.02) * Math.cos(p);
    const py = (b + 0.02) * Math.sin(p);
    for (const zc of [-5.3, -1.7, 1.9]) {
      k.box(PAL.glass, 1.4, 0.08, 2.2, px, py, zc, { rz: -sx * 0.42 });
    }
  }
  // Apron in front of the doors with a yellow guide line.
  k.box(CONCRETE, 16, 0.06, 3.2, 0, 0, zf + 1.6);
  k.box(YELLOW, 0.35, 0.03, 3.0, 0, 0.06, zf + 1.6);
  // Control tower beside the hangar.
  const tx = -10.35;
  const tz = 3.2;
  k.rbox(KHAKI, 2.6, 5.4, 2.6, 0.3, 0.08, tx, 0, tz);
  k.within(placement(tx, 0, tz + 1.3), () => {
    archDoor(k, PAL.white, OLIVE_DARK, 0, 0, 0.9, 1.7);
    paneAt(k, PAL.glass, PAL.white, 0, 2.8, 0.9, 0.9, false, 1);
  });
  k.box(PAL.glass, 2.9, 1.4, 2.9, tx, 5.4, tz, undefined, ON_GROUND);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(PAL.white, 0.14, 1.4, 0.14, tx + sx * 1.42, 5.4, tz + sz * 1.42);
  k.cbox(OLIVE_DARK, 3.3, 0.3, 3.3, 0.1, tx, 6.8, tz);
  k.cyl(PAL.metal, 0.04, 0.05, 1.3, 5, tx + 0.6, 7.1, tz - 0.6);
  k.gem(0xe63946, 0.14, [tx + 0.6, 8.45, tz - 0.6]);
  // Windsock on the other side.
  const wx = 10.4;
  const wz = 6.8;
  k.cyl(PAL.metal, 0.05, 0.07, 4.2, 5, wx, 0, wz);
  for (let i = 0; i < 3; i++) {
    const r0 = 0.42 - i * 0.08;
    k.rod(i % 2 ? PAL.white : 0xff7a1a, r0, 0.55, 8, [wx - 0.3 - i * 0.55, 3.9 - i * 0.12, wz], { rz: HALF_PI }, r0 - 0.08);
  }
};

// ---------------------------------------------------------------------------
// Bomber

/**
 * A friendly toy bomber, nose +z: a round olive fuselage with a glass nose,
 * straight wings with four propeller engines, twin tail fins, star roundels
 * on the wings, and the bomb-bay doors hanging open underneath. It is only
 * seen flying overhead, so the tops of the wings carry most of it.
 */
const bomber: Builder = (k) => {
  const body = 0x74904a;
  const wingC = 0x6f8a44;
  const grey = 0xa9b1a3;
  const cy = 2.8;
  const along = (profile: ReadonlyArray<readonly [number, number]>, color: number, seg: number) =>
    k.add(
      new THREE.LatheGeometry(
        profile.map(([r, t]) => new THREE.Vector2(r, t)),
        seg,
      ),
      color,
      placement(0, cy, 0, { rx: HALF_PI }),
    );
  along(
    [
      [0, -11.7],
      [0.55, -11.4],
      [1.15, -9.4],
      [1.7, -5.5],
      [1.95, -1.5],
      [1.95, 6.5],
      [1.75, 8.6],
      [1.42, 9.9],
    ],
    body,
    12,
  );
  along(
    [
      [1.42, 9.9],
      [1.45, 10.3],
    ],
    YELLOW,
    12,
  );
  along(
    [
      [1.45, 10.3],
      [1.15, 11.2],
      [0.6, 11.75],
      [0, 11.9],
    ],
    PAL.glass,
    12,
  );
  k.sphere(PAL.glass, 0.45, [0, cy, -11.5], 8, 4);
  // Cockpit canopy and a glass turret on the back.
  k.hull(PAL.glass, [
    [-1.0, cy + 1.3, 6.8],
    [1.0, cy + 1.3, 6.8],
    [-1.0, cy + 1.3, 9.0],
    [1.0, cy + 1.3, 9.0],
    [-0.65, cy + 2.05, 7.2],
    [0.65, cy + 2.05, 7.2],
    [-0.6, cy + 1.75, 8.6],
    [0.6, cy + 1.75, 8.6],
  ]);
  k.sphere(PAL.glass, 0.8, [0, cy + 1.8, 3.9], 10, 4, { hemi: true });
  k.cyl(darker(body, 0.2), 0.86, 0.86, 0.14, 10, 0, cy + 1.7, 3.9);
  // Wings: flat on top so the roundels sit on them, thinner toward the tips.
  const wy = cy + 0.75;
  for (const s of [-1, 1]) {
    k.hull(wingC, [
      [s * 1.5, wy, 4.9],
      [s * 1.5, wy, -1.0],
      [s * 1.5, wy - 0.85, 4.4],
      [s * 1.5, wy - 0.85, -0.8],
      [s * 14.2, wy, 3.0],
      [s * 14.2, wy, 0.1],
      [s * 14.2, wy - 0.35, 2.9],
      [s * 14.2, wy - 0.35, 0.2],
      [s * 14.85, wy, 2.5],
      [s * 14.85, wy, 0.6],
      [s * 14.85, wy - 0.22, 2.4],
      [s * 14.85, wy - 0.22, 0.7],
    ]);
    roundel(k, 1.4, [s * 11.6, wy, 1.63]);
    // Four engines in the wing colour with a grey cowl, so they read as engines rather
    // than cargo, each with a pale propeller disc, dark blades and a yellow spinner.
    for (const ex of [4.4, 8.6]) {
      const x = s * ex;
      const ey = wy - 0.25;
      k.rod(lighter(wingC, 0.08), 0.8, 2.9, 10, [x, ey, 3.85], { rx: HALF_PI }, 0.72);
      k.rod(grey, 0.76, 0.4, 10, [x, ey, 5.1], { rx: HALF_PI }, 0.74);
      k.rod(wingC, 0.62, 1.3, 8, [x, ey, 1.75], { rx: -HALF_PI }, 0.3);
      k.add(new THREE.CircleGeometry(1.45, 16), 0xe9edf1, placement(x, ey, 5.35));
      k.add(new THREE.CircleGeometry(1.45, 16), 0xe9edf1, placement(x, ey, 5.35, { ry: Math.PI }));
      for (const a of [0.4, 0.4 + (Math.PI * 2) / 3, 0.4 + (Math.PI * 4) / 3]) {
        k.beam(0x454b52, [x, ey, 5.4], [x + Math.cos(a) * 1.35, ey + Math.sin(a) * 1.35, 5.4], 0.22, 0.05);
      }
      k.rod(YELLOW, 0.4, 0.85, 8, [x, ey, 5.8], { rx: HALF_PI }, 0.05);
    }
  }
  // Tailplane with twin fins at its tips.
  const ty = cy + 0.2;
  k.hull(wingC, [
    [-0.9, ty, -8.1],
    [0.9, ty, -8.1],
    [-0.9, ty, -11.0],
    [0.9, ty, -11.0],
    [-5.6, ty + 0.1, -9.3],
    [5.6, ty + 0.1, -9.3],
    [-5.6, ty + 0.1, -10.9],
    [5.6, ty + 0.1, -10.9],
    [-0.9, ty + 0.35, -8.4],
    [0.9, ty + 0.35, -8.4],
    [-5.6, ty + 0.3, -9.5],
    [5.6, ty + 0.3, -9.5],
  ]);
  for (const s of [-1, 1]) {
    const x = s * 5.55;
    const yb = cy - 0.8;
    const yt = cy + 4.35;
    // Fin outline: front edge leaning back as it rises, back edge nearly upright.
    const edge = (y: number): [number, number] => {
      const t = (y - yb) / (yt - yb);
      return [-8.8 - 1.2 * t, -11.4 - 0.1 * t];
    };
    const fin = (y0: number, y1: number, color: number, round = false) => {
      const [f0, b0] = edge(y0);
      const [f1, b1] = edge(y1);
      const pts: V3[] = [];
      for (const dx of [-0.16, 0.16]) {
        pts.push([x + dx, y0, f0], [x + dx, y0, b0]);
        if (round) {
          // A rounded top, so the fin reads as a toy piece rather than a blade.
          pts.push([x + dx, y1 - 0.25, f1 + 0.1], [x + dx, y1, f1 - 0.35], [x + dx, y1, b1 + 0.3], [x + dx, y1 - 0.2, b1]);
        } else {
          pts.push([x + dx, y1, f1], [x + dx, y1, b1]);
        }
      }
      k.hull(color, pts);
    };
    fin(yb, cy + 3.2, body);
    fin(cy + 3.2, cy + 3.7, STAR);
    fin(cy + 3.7, yt, body, true);
  }
  // Stars on the fuselage sides by the tail.
  for (const sx of [-1, 1]) {
    k.add(new THREE.CircleGeometry(0.85, 12), ROUNDEL, placement(sx * 1.74, cy, -5.2, { ry: sx * HALF_PI }));
    wallStar(k, STAR, 0.66, [sx * 1.75, cy, -5.2], sx * HALF_PI, 0.03);
  }
  // Bomb bay: a dark slot in the belly with its two doors hanging open.
  k.box(PAL.ink, 1.7, 0.3, 4.2, 0, cy - 2.0, 0.6);
  for (const sx of [-1, 1]) {
    k.hull(grey, [
      [sx * 0.82, cy - 1.8, -1.5],
      [sx * 0.82, cy - 1.8, 2.7],
      [sx * 0.9, cy - 1.8, -1.5],
      [sx * 0.9, cy - 1.8, 2.7],
      [sx * 1.2, cy - 2.8, -1.5],
      [sx * 1.2, cy - 2.8, 2.7],
      [sx * 1.28, cy - 2.8, -1.5],
      [sx * 1.28, cy - 2.8, 2.7],
    ]);
  }
};

export const MILITARY: Record<MilitaryKind, Builder> = {
  tank,
  helicopter,
  watchtower,
  barracks,
  radar,
  hangar,
  bomber,
};
