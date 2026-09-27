/**
 * Rainbow Racer riders — the four flying characters a player can pick.
 *
 * Cloud Kingdom rules (the lead designer's decree): a character that can fly
 * flies by itself (fairy, unicorn); a character that can't fly rides
 * something that flies (princess on a unicorn, bunny on a cloud). Stars make
 * you bigger and faster — `RiderPose.tier` (0..3) drives that growth, eased
 * smoothly rather than snapping.
 *
 * Framework-free like scene.ts: every character is procedural geometry (the
 * bunny alone loads a bundled GLB, mirroring scene.ts's `mountSteed`), so a
 * rider builds and updates without a renderer and is fully testable in
 * jsdom. `update()` only ever touches objects *inside* `group` — the scene
 * owns `group`'s position/rotation.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import bunnyUrl from '../assets/bunny.glb?url';

export type CharacterId = 'fairy' | 'princess' | 'unicorn' | 'bunny';

export interface RiderPose {
  /** World units/s, cruise ~36, boosted up to ~70. */
  speed: number;
  /** -1..1, current turning (negative = turning left). */
  bank: number;
  /** -1..1, climbing (+) or diving (-). */
  climb: number;
  /** 0..3 power tier from stars; animate smoothly between tiers. */
  tier: number;
  /** True during a speed burst. */
  boosting: boolean;
}

export interface Rider {
  /** The scene positions/rotates this; a rider never moves it itself. */
  group: THREE.Group;
  /** Animate internals (wings, bob, bank roll, pitch, tier growth). */
  update(dt: number, pose: RiderPose): void;
  /** Free geometries/materials this rider created (never shared GLB-cache resources). */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Deterministic 0–1 "noise" from a number — no Math.random (CLAUDE.md). */
function hash(n: number): number {
  return Math.abs(Math.sin(n * 12.9898 + 78.233) * 43758.5453) % 1;
}

/** Collects the geometries/materials one rider creates so `dispose()` frees
 *  exactly those and nothing shared (a cloned GLB's untouched meshes keep
 *  their geometry/material from the cached template — see `mountBunnyGltf`). */
class Disposables {
  private items: Array<{ dispose(): void }> = [];
  track<T extends { dispose(): void }>(item: T): T {
    this.items.push(item);
    return item;
  }
  disposeAll(): void {
    for (const item of this.items) item.dispose();
    this.items = [];
  }
}

function mat(disp: Disposables, params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return disp.track(new THREE.MeshStandardMaterial(params));
}

/** A capsule mesh spanning two points, radius `r`, sharing `material`. */
function limb(disp: Disposables, a: THREE.Vector3, b: THREE.Vector3, r: number, material: THREE.Material): THREE.Mesh {
  const length = Math.max(0.05, a.distanceTo(b) - r * 2 * 0.6);
  const geo = disp.track(new THREE.CapsuleGeometry(r, length, 3, 7));
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  const dir = b.clone().sub(a).normalize();
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  mesh.castShadow = true;
  return mesh;
}

/** Small easing bag: named scalars that ease toward a target each call, or
 *  snap instantly when `instant` (reducedMotion). Keeps every character's
 *  update() free of hand-rolled per-field lerp bookkeeping. */
class Anim {
  t = 0;
  private vals = new Map<string, number>();
  advance(dt: number): void {
    this.t += dt;
  }
  ease(key: string, target: number, k: number, instant: boolean): number {
    const cur = this.vals.get(key) ?? target;
    const next = instant ? target : cur + (target - cur) * k;
    this.vals.set(key, next);
    return next;
  }
}

// Shared tuning — kept gentle so a 7-year-old reads "flying", not "shaking".
const MAX_ROLL = 0.55; // radians of bank roll at full turn
const MAX_PITCH = 0.32; // radians of nose pitch at full climb/dive
const EASE_RATE = 7; // 1/s smoothing for roll/pitch/tier scale
const BOB_AMP = 0.32;
const BOB_FREQ = 1.7; // rad/s base hover bob rate
const FLAP_FREQ = 5.2; // rad/s base wing-flap rate
const FLAP_FREQ_BOOST = 9.5;
const FLAP_AMP = 0.62;
const TIER_GROWTH = 0.22; // default whole-character growth per tier
const FAIRY_WING_GROWTH = 0.45; // fairy's wings-only growth per tier

/** Clamp dt so a stalled tab or a huge test dt can't blow up the easing. */
function clampDt(dt: number): number {
  if (!Number.isFinite(dt) || dt < 0) return 0;
  return Math.min(dt, 0.25);
}

function clampUnit(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-1, Math.min(1, v));
}

interface Rig {
  group: THREE.Group;
  tilt: THREE.Group; // bank roll (z) + nose pitch (x) — the "inner child"
  bob: THREE.Group; // hover translate (y)
  scaleRoot: THREE.Group; // tier-scaled visual
  anim: Anim;
}

function makeRig(): Rig {
  const group = new THREE.Group();
  const tilt = new THREE.Group();
  const bob = new THREE.Group();
  const scaleRoot = new THREE.Group();
  group.add(tilt);
  tilt.add(bob);
  bob.add(scaleRoot);
  return { group, tilt, bob, scaleRoot, anim: new Anim() };
}

/** Common tilt/bob/tier-scale step every rider shares. Returns the eased k
 *  (0..1) so callers can drive their own decorations off the same clock.
 *  Bank/pitch track the pose exactly (instantly under reducedMotion, eased
 *  otherwise) since they read as gameplay feedback, not decoration; bob and
 *  wing flap are the purely decorative bits reducedMotion turns off. */
function stepRig(rig: Rig, dt: number, pose: RiderPose, reducedMotion: boolean, growth = TIER_GROWTH): number {
  const dtc = clampDt(dt);
  rig.anim.advance(dtc);
  const k = 1 - Math.exp(-EASE_RATE * dtc);

  rig.tilt.rotation.z = rig.anim.ease('roll', -clampUnit(pose.bank) * MAX_ROLL, k, reducedMotion);
  rig.tilt.rotation.x = rig.anim.ease('pitch', -clampUnit(pose.climb) * MAX_PITCH, k, reducedMotion);

  const scale = rig.anim.ease('scale', 1 + growth * Math.max(0, pose.tier), k, reducedMotion);
  rig.scaleRoot.scale.setScalar(scale);

  rig.bob.position.y = reducedMotion ? 0 : Math.sin(rig.anim.t * BOB_FREQ * gait(pose.speed)) * BOB_AMP;
  return k;
}

function gait(speed: number): number {
  return Math.min(1.4, Math.max(0.25, speed / 36));
}

/** Flap speed for this frame, shared by every winged rider. */
function flapFreq(pose: RiderPose): number {
  return pose.boosting ? FLAP_FREQ_BOOST : FLAP_FREQ;
}

interface Built {
  rig: Rig;
  update(dt: number, pose: RiderPose): void;
}

// ---------------------------------------------------------------------------
// Fairy — flies herself
// ---------------------------------------------------------------------------

function buildFairy(color: number, seed: number, reducedMotion: boolean, disp: Disposables): Built {
  const rig = makeRig();
  const body = new THREE.Group();
  rig.scaleRoot.add(body);
  const tint = new THREE.Color(color);
  const skin = mat(disp, { color: 0xffdcc0, roughness: 0.7 });
  const dressMat = mat(disp, { color: tint.getHex(), roughness: 0.55 });
  const hairMat = mat(disp, { color: 0x8a5a3c, roughness: 0.8 });
  const darkMat = mat(disp, { color: 0x2a2030, roughness: 0.5 });
  const blushMat = mat(disp, { color: 0xffa9c0, roughness: 0.8, transparent: true, opacity: 0.75 });

  // Head + face, facing +Z (the flight direction).
  const head = new THREE.Mesh(disp.track(new THREE.SphereGeometry(0.82, 14, 12)), skin);
  head.position.set(0, 1.55, 0.55);
  head.castShadow = true;
  body.add(head);

  const eyeGeo = disp.track(new THREE.SphereGeometry(0.1, 8, 6));
  const blushGeo = disp.track(new THREE.SphereGeometry(0.16, 8, 6));
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, darkMat);
    eye.position.set(0.26 * side, 1.58, 1.28);
    body.add(eye);
    const blush = new THREE.Mesh(blushGeo, blushMat);
    blush.scale.set(1, 0.8, 0.35);
    blush.position.set(0.42 * side, 1.4, 1.12);
    body.add(blush);
  }

  // Hair: a puffed cap plus a ponytail streaming backward from the speed.
  const hairCap = new THREE.Mesh(disp.track(new THREE.SphereGeometry(0.92, 12, 10)), hairMat);
  hairCap.position.set(0, 1.68, 0.3);
  hairCap.scale.set(1.02, 1, 1.05);
  body.add(hairCap);
  const ponytail = new THREE.Mesh(disp.track(new THREE.ConeGeometry(0.32, 1.3, 8)), hairMat);
  ponytail.position.set(0, 1.55, -0.65);
  ponytail.rotation.x = Math.PI * 0.52;
  body.add(ponytail);

  // Bell-shaped petal dress over the torso/hips.
  const dress = new THREE.Mesh(disp.track(new THREE.CylinderGeometry(0.42, 0.92, 1.35, 10)), dressMat);
  dress.position.set(0, 0.55, 0.1);
  dress.castShadow = true;
  body.add(dress);
  const shoulders = new THREE.Mesh(disp.track(new THREE.SphereGeometry(0.46, 10, 8)), dressMat);
  shoulders.position.set(0, 1.18, 0.25);
  body.add(shoulders);

  // Arms reaching forward, flanking the head, superman-style.
  for (const side of [-1, 1]) {
    body.add(limb(disp, new THREE.Vector3(0.42 * side, 1.15, 0.15), new THREE.Vector3(0.55 * side, 1.0, 1.25), 0.13, skin));
  }
  // Legs trail behind and slightly down.
  for (const side of [-1, 1]) {
    body.add(limb(disp, new THREE.Vector3(0.22 * side, 0.05, -0.35), new THREE.Vector3(0.3 * side, -0.25, -2.5), 0.16, skin));
  }

  // Wings: two translucent pairs on their own flap pivots, inside a group
  // that scales on its own so tier growth hits wings, not the body.
  const wingsPivotGroup = new THREE.Group();
  wingsPivotGroup.position.set(0, 1.05, -0.1);
  rig.scaleRoot.add(wingsPivotGroup);
  const wingMat = mat(disp, {
    color: tint.getHex(),
    transparent: true,
    opacity: 0.5,
    roughness: 0.25,
    emissive: tint.getHex(),
    emissiveIntensity: 0.25,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const wingPivots: THREE.Group[] = [];
  function wingPair(y: number, z: number, radius: number, elongate: number, spread: number): void {
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0.18 * side, y, z);
      const wing = new THREE.Mesh(disp.track(new THREE.SphereGeometry(radius, 10, 8)), wingMat);
      wing.scale.set(0.32, elongate, 0.06);
      wing.rotation.z = (Math.PI / 2.1) * -side;
      wing.position.set(spread * side, 0, 0);
      pivot.add(wing);
      wingsPivotGroup.add(pivot);
      wingPivots.push(pivot);
    }
  }
  wingPair(0.35, 0, 1.35, 1.55, 1.1); // upper pair — index 0,1
  wingPair(-0.15, -0.1, 0.95, 1.25, 0.75); // lower pair — index 2,3

  // A few tiny sparkle points that brighten with tier.
  const sparkleMat = mat(disp, { color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.2 });
  const sparkleGeo = disp.track(new THREE.SphereGeometry(0.07, 6, 6));
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(sparkleGeo, sparkleMat);
    const a = hash(seed + i * 3.1) * Math.PI * 2;
    const r = 1.1 + hash(seed + i * 5.3) * 0.9;
    s.position.set(Math.cos(a) * r, 0.1 + hash(seed + i * 2.2) * 0.7, -0.1 + Math.sin(a) * 0.4);
    wingsPivotGroup.add(s);
  }

  return {
    rig,
    update(dt, pose) {
      // The fairy's body never tier-scales (growth 0) — only her wings do.
      const k = stepRig(rig, dt, pose, reducedMotion, 0);
      const wingScale = rig.anim.ease('wingScale', 1 + FAIRY_WING_GROWTH * Math.max(0, pose.tier), k, reducedMotion);
      wingsPivotGroup.scale.setScalar(wingScale);

      if (!reducedMotion) {
        const freq = flapFreq(pose);
        const upperFlap = Math.sin(rig.anim.t * freq) * FLAP_AMP;
        const lowerFlap = Math.sin(rig.anim.t * freq + 0.5) * FLAP_AMP * 0.85;
        wingPivots[0].rotation.z = upperFlap;
        wingPivots[1].rotation.z = -upperFlap;
        wingPivots[2].rotation.z = lowerFlap;
        wingPivots[3].rotation.z = -lowerFlap;
      }

      const tierFrac = Math.min(1, Math.max(0, pose.tier) / 3);
      wingMat.emissiveIntensity = 0.25 + tierFrac * 0.55;
      sparkleMat.emissiveIntensity = 0.5 + tierFrac * 0.9;
    },
  };
}

// ---------------------------------------------------------------------------
// Unicorn — flies by itself (also the mount for the princess)
// ---------------------------------------------------------------------------

const MANE_COLORS = [0xff6f91, 0xffb14a, 0xffe14a, 0x6fdc8c, 0x5cb8ff, 0xb68bff];
/** How fast mane/tail strands wave, and by how much (radians), when !reducedMotion. */
const STRAND_WAVE_FREQ = 2.1;
const STRAND_WAVE_AMP = 0.14;
const WAVE_AXIS = new THREE.Vector3(1, 0, 0);

/** A mane/tail strand that gently waves around its resting orientation. */
interface Sway {
  mesh: THREE.Mesh;
  baseQuat: THREE.Quaternion;
  phase: number;
}

interface UnicornBuild {
  root: THREE.Group; // add under rig.scaleRoot
  wingPivots: [THREE.Group, THREE.Group];
  swayStrands: Sway[]; // mane + tail, waved by `swayAll` when !reducedMotion
  backSeat: THREE.Vector3; // saddle point for a princess, local to `root`
}

/** A tapered strand (thick at `root`, narrowing to a point at `tip`) — the
 *  flowing mane/tail, unlike the uniform-radius capsules `limb()` makes. */
function strandLimb(disp: Disposables, root: THREE.Vector3, tip: THREE.Vector3, rootR: number, tipR: number, material: THREE.Material): THREE.Mesh {
  const length = Math.max(0.05, root.distanceTo(tip));
  const geo = disp.track(new THREE.CylinderGeometry(tipR, rootR, length, 6));
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(root).add(tip).multiplyScalar(0.5);
  const dir = tip.clone().sub(root).normalize();
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  mesh.castShadow = true;
  return mesh;
}

/** Gently wave every mane/tail strand around its resting pose (skipped
 *  entirely under reducedMotion — callers just don't call this then). */
function swayAll(strands: Sway[], t: number): void {
  for (const s of strands) {
    const wave = Math.sin(t * STRAND_WAVE_FREQ + s.phase) * STRAND_WAVE_AMP;
    s.mesh.quaternion.copy(s.baseQuat).multiply(new THREE.Quaternion().setFromAxisAngle(WAVE_AXIS, wave));
  }
}

/** One solid wing panel's outline (span-normalised: y 0..1 root→tip along
 *  what becomes the wing's local +Y axis, x a chord fraction), a curved
 *  leading edge and a scalloped trailing edge — a single continuous
 *  silhouette, not separate slats. The panel is oriented in 3D by aligning
 *  local +Y to a chosen world span direction (see `buildUnicornBody`'s wing
 *  loop), the same technique `strandLimb` uses for the mane/tail, so the
 *  chord reliably reads as a broad on-screen shape from any camera angle
 *  instead of foreshortening into a thin line. */
function wingOutline(): Array<[number, number]> {
  return [
    [0.22, 0],
    [0.48, 0.18],
    [0.58, 0.42],
    [0.5, 0.68],
    [0.3, 0.88],
    [0.06, 1],
    [-0.18, 0.95],
    [-0.08, 0.82],
    [-0.34, 0.74],
    [-0.14, 0.58],
    [-0.44, 0.5],
    [-0.17, 0.35],
    [-0.4, 0.27],
    [-0.12, 0.12],
    [-0.18, 0],
  ];
}

/** Just the outer ~40% of `wingOutline()`, in the same normalised space, so
 *  the player-colour tip patch sits flush on the main panel's own tip
 *  instead of floating past it. */
function wingTipOutline(): Array<[number, number]> {
  return [
    [0.52, 0.6],
    [0.5, 0.68],
    [0.3, 0.88],
    [0.06, 1],
    [-0.18, 0.95],
    [-0.08, 0.82],
    [-0.34, 0.74],
    [-0.2, 0.6],
  ];
}

function scaleOutline(pts: Array<[number, number]>, span: number): Array<[number, number]> {
  const chord = span * 0.42;
  return pts.map(([x, y]) => [x * chord, y * span] as [number, number]);
}

function shapeFromOutline(points: Array<[number, number]>): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  return shape;
}

function buildUnicornBody(color: number, seed: number, disp: Disposables): UnicornBuild {
  const root = new THREE.Group();
  const tint = new THREE.Color(color);

  const coatMat = mat(disp, { color: 0xffffff, roughness: 0.65 });
  const hoofMat = mat(disp, { color: 0xf0e6d2, roughness: 0.5 });
  const hornMat = mat(disp, { color: 0xf6d979, roughness: 0.3, metalness: 0.55, emissive: 0x6b5215, emissiveIntensity: 0.15 });

  // Chibi body: round and short — barely longer than it is tall — so the
  // silhouette reads as a toy pegasus, not a sausage with a head stuck on.
  const body = new THREE.Mesh(disp.track(new THREE.SphereGeometry(1, 16, 12)), coatMat);
  body.scale.set(1.15, 1, 1.2);
  body.position.set(0, 1.55, -0.15);
  body.castShadow = true;
  root.add(body);

  // Short arched neck (two angled segments, not one long diagonal) up to a
  // big round head — the "barely there" chibi neck.
  const neckRoot = new THREE.Vector3(0, 2.05, 0.75);
  const neckMid = new THREE.Vector3(0, 2.5, 1.25);
  const neckTop = new THREE.Vector3(0, 2.8, 1.65);
  root.add(limb(disp, neckRoot, neckMid, 0.44, coatMat));
  root.add(limb(disp, neckMid, neckTop, 0.4, coatMat));

  // Big round head — ~57% of the body's width, per the chibi brief.
  const head = new THREE.Mesh(disp.track(new THREE.SphereGeometry(0.66, 16, 14)), coatMat);
  head.position.set(0, 3.05, 2.05);
  head.castShadow = true;
  root.add(head);
  const snout = new THREE.Mesh(disp.track(new THREE.CapsuleGeometry(0.22, 0.28, 3, 8)), coatMat);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 3.0, 2.68);
  root.add(snout);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(disp.track(new THREE.ConeGeometry(0.17, 0.45, 6)), coatMat);
    ear.position.set(0.28 * side, 3.62, 2.05);
    ear.rotation.z = 0.22 * -side;
    root.add(ear);
  }
  // Big friendly eyes (with a tiny highlight each), clearly visible in profile.
  const eyeGeo = disp.track(new THREE.SphereGeometry(0.17, 10, 8));
  const eyeMat = mat(disp, { color: 0x2a2030, roughness: 0.4 });
  const highlightGeo = disp.track(new THREE.SphereGeometry(0.06, 6, 6));
  const highlightMat = mat(disp, { color: 0xffffff, roughness: 0.3 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(0.53 * side, 3.08, 2.4);
    root.add(eye);
    const hl = new THREE.Mesh(highlightGeo, highlightMat);
    hl.position.set(0.57 * side, 3.15, 2.48);
    root.add(hl);
  }
  const nose = new THREE.Mesh(disp.track(new THREE.SphereGeometry(0.07, 6, 6)), mat(disp, { color: 0xff9fb0, roughness: 0.6 }));
  nose.position.set(0, 2.96, 2.96);
  root.add(nose);

  // Spiral-hinted horn: bigger than before, gold, with a few thin rings.
  const horn = new THREE.Mesh(disp.track(new THREE.ConeGeometry(0.15, 1.3, 8)), hornMat);
  horn.position.set(0, 3.88, 2.3);
  horn.rotation.x = -0.15;
  root.add(horn);
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(disp.track(new THREE.TorusGeometry(0.15 - i * 0.03, 0.025, 5, 10)), hornMat);
    ring.position.set(0, 3.55 + i * 0.34, 2.28 + i * 0.06);
    ring.rotation.set(Math.PI / 2 + 0.14, i * 0.7, 0);
    root.add(ring);
  }

  const swayStrands: Sway[] = [];
  function addStrand(rootPt: THREE.Vector3, tipPt: THREE.Vector3, rootR: number, tipR: number, strandColor: number, group: THREE.Group, phase: number): void {
    const strandMat = mat(disp, { color: strandColor, roughness: 0.5 });
    const strand = strandLimb(disp, rootPt, tipPt, rootR, tipR, strandMat);
    group.add(strand);
    swayStrands.push({ mesh: strand, baseQuat: strand.quaternion.clone(), phase });
  }

  // Rainbow mane: a flowing crest along the neck's topline plus a forelock,
  // rooted well clear of the neck's own surface (radius ~0.4) so it reads
  // as bright colour above the head from directly behind, not just in profile.
  const maneGroup = new THREE.Group();
  root.add(maneGroup);
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const along = new THREE.Vector3().lerpVectors(neckRoot, neckTop, t);
    const side = i % 2 === 0 ? 1 : -1;
    const rootPt = new THREE.Vector3(side * 0.08, along.y + 0.42, along.z - 0.06);
    const droopOut = 0.35 + hash(seed + i * 4.4) * 0.35;
    const len = 0.6 + hash(seed + i * 2.1) * 0.4;
    const tipPt = rootPt.clone().add(new THREE.Vector3(side * droopOut, 0.18 + len * 0.45, -len * 0.75));
    addStrand(rootPt, tipPt, 0.13, 0.02, MANE_COLORS[i % MANE_COLORS.length], maneGroup, hash(seed + i * 9.1) * Math.PI * 2);
  }
  // Forelock: two short strands hanging over the forehead, between the ears.
  for (const side of [-1, 1]) {
    const rootPt = new THREE.Vector3(side * 0.1, 3.58, 1.95);
    const tipPt = new THREE.Vector3(side * 0.24, 3.12, 2.48);
    addStrand(rootPt, tipPt, 0.09, 0.02, MANE_COLORS[side === 1 ? 0 : 3], maneGroup, hash(seed + side * 5.2 + 40) * Math.PI * 2);
  }

  // Rainbow tail: strands in strict rainbow order, streaming back and
  // slightly up from the rump — the bright plume the chase camera sees
  // centred behind the unicorn. Rooted clearly past the body's own rear
  // surface (a sphere of radius ~1.2 in z, centred z=-0.15 → rear ≈ -1.35 at
  // its widest) so the strands aren't swallowed by the body mesh.
  const tailGroup = new THREE.Group();
  root.add(tailGroup);
  // Rooted at rump/haunch height (well below the withers where the mane
  // sits) so from an elevated chase camera it projects to a screen region
  // below the mane instead of merging into one blob with it.
  const tailRoot = new THREE.Vector3(0, 1.55, -1.65);
  for (let i = 0; i < 7; i++) {
    const spread = (i - 3) * 0.2;
    const len = 1.3 + hash(seed + i * 2.4) * 0.7;
    const rootPt = tailRoot.clone().add(new THREE.Vector3(spread * 0.3, -Math.abs(spread) * 0.12, 0));
    const tipPt = rootPt.clone().add(new THREE.Vector3(spread * 2.1, 0.55 + len * 0.35, -len));
    addStrand(rootPt, tipPt, 0.2, 0.03, MANE_COLORS[i % MANE_COLORS.length], tailGroup, hash(seed + i * 6.6 + 80) * Math.PI * 2);
  }

  // Legs tucked close under the compact body, tiny round hooves.
  const legPositions: Array<[number, number]> = [
    [0.62, 0.55],
    [-0.62, 0.55],
    [0.6, -0.85],
    [-0.6, -0.85],
  ];
  for (const [x, z] of legPositions) {
    const hip = new THREE.Vector3(x, 1.15, z);
    const knee = new THREE.Vector3(x * 1.05, 0.6, z + (z > 0 ? 0.12 : -0.12));
    root.add(limb(disp, hip, knee, 0.22, coatMat));
    const hoof = new THREE.Mesh(disp.track(new THREE.SphereGeometry(0.17, 8, 6)), hoofMat);
    hoof.position.copy(knee).add(new THREE.Vector3(0, -0.14, 0));
    root.add(hoof);
  }

  // Big SOLID wings: each is one curved, scalloped panel (an extruded shape,
  // not separate slats), with a smaller "covert" panel layered on top for
  // feathered depth and a player-colour tip patch layered flush against the
  // main panel's own tip — attached, never a floating box. Swept back and
  // up so the resting pose already reads as spread for flight; the shoulder
  // pivot itself is reserved for the per-frame flap.
  const featherMat = mat(disp, { color: 0xffffff, roughness: 0.75, side: THREE.DoubleSide });
  const covertMatWing = mat(disp, { color: 0xf2f2f2, roughness: 0.7, side: THREE.DoubleSide });
  const tipMat = mat(disp, { color: tint.getHex(), roughness: 0.5, side: THREE.DoubleSide });
  const WING_SPAN = 3.0;
  const extrude = { depth: 0.1, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 1, curveSegments: 1 };
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  const pivots: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group(); // shoulder — the flap hinge, animated per frame
    pivot.position.set(0.85 * side, 2.15, 0.35);
    root.add(pivot);
    pivots.push(pivot);

    // Aim the panel's span axis (local +Y) outward, up (dihedral — this is
    // what makes the V/gull silhouette read from directly behind) and
    // swept back, the same setFromUnitVectors technique strandLimb() uses —
    // reliable regardless of camera angle, unlike chaining per-axis Euler
    // rotations (which is how the chord ended up aligned with the camera's
    // own view axis and foreshortened to a thin line last time).
    const wingGroup = new THREE.Group();
    const spanDir = new THREE.Vector3(side, 0.62, -0.3).normalize();
    wingGroup.quaternion.setFromUnitVectors(Y_AXIS, spanDir);
    wingGroup.rotateY(0.3 * side); // roll around the span axis, tuned visually
    pivot.add(wingGroup);

    const mainGeo = disp.track(new THREE.ExtrudeGeometry(shapeFromOutline(scaleOutline(wingOutline(), WING_SPAN)), extrude));
    wingGroup.add(new THREE.Mesh(mainGeo, featherMat));

    const covertGeo = disp.track(new THREE.ExtrudeGeometry(shapeFromOutline(scaleOutline(wingOutline(), WING_SPAN * 0.6)), extrude));
    const covertWing = new THREE.Mesh(covertGeo, covertMatWing);
    covertWing.position.z = -0.05;
    wingGroup.add(covertWing);

    const tipGeo = disp.track(new THREE.ExtrudeGeometry(shapeFromOutline(scaleOutline(wingTipOutline(), WING_SPAN)), extrude));
    const tipWing = new THREE.Mesh(tipGeo, tipMat);
    tipWing.position.z = -0.09;
    wingGroup.add(tipWing);
  }

  return {
    root,
    wingPivots: [pivots[0], pivots[1]],
    swayStrands,
    backSeat: new THREE.Vector3(0, 2.5, -0.05),
  };
}

function buildUnicorn(color: number, seed: number, reducedMotion: boolean, disp: Disposables): Built {
  const rig = makeRig();
  const build = buildUnicornBody(color, seed, disp);
  rig.scaleRoot.add(build.root);

  return {
    rig,
    update(dt, pose) {
      stepRig(rig, dt, pose, reducedMotion);
      if (!reducedMotion) {
        const flap = Math.sin(rig.anim.t * flapFreq(pose)) * FLAP_AMP;
        build.wingPivots[0].rotation.z = flap;
        build.wingPivots[1].rotation.z = -flap;
        swayAll(build.swayStrands, rig.anim.t);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Princess — rides a flying unicorn
// ---------------------------------------------------------------------------

function buildPrincess(color: number, seed: number, reducedMotion: boolean, disp: Disposables): Built {
  const rig = makeRig();
  const mount = buildUnicornBody(color, seed, disp);
  rig.scaleRoot.add(mount.root);

  const tint = new THREE.Color(color);
  const skin = mat(disp, { color: 0xffdcc0, roughness: 0.7 });
  const dressMat = mat(disp, { color: tint.getHex(), roughness: 0.5 });
  const hairMat = mat(disp, { color: 0x5a3a24, roughness: 0.8 });
  const goldMat = mat(disp, { color: 0xffd54a, roughness: 0.3, metalness: 0.6 });

  const rider = new THREE.Group();
  rider.position.copy(mount.backSeat);
  mount.root.add(rider);

  // Seated skirt draping over the unicorn's back.
  const skirt = new THREE.Mesh(disp.track(new THREE.CylinderGeometry(0.4, 0.85, 1.1, 10)), dressMat);
  skirt.position.set(0, 0.35, 0);
  skirt.castShadow = true;
  rider.add(skirt);
  const torso = new THREE.Mesh(disp.track(new THREE.CapsuleGeometry(0.36, 0.5, 3, 8)), dressMat);
  torso.position.set(0, 1.0, 0.05);
  rider.add(torso);

  const head = new THREE.Mesh(disp.track(new THREE.SphereGeometry(0.4, 12, 10)), skin);
  head.position.set(0, 1.65, 0.15);
  head.castShadow = true;
  rider.add(head);
  const hair = new THREE.Mesh(disp.track(new THREE.SphereGeometry(0.46, 10, 8)), hairMat);
  hair.position.set(0, 1.72, -0.05);
  hair.scale.set(1, 1, 1.15);
  rider.add(hair);
  const eyeGeo = disp.track(new THREE.SphereGeometry(0.05, 6, 6));
  const eyeMat = mat(disp, { color: 0x2a2030, roughness: 0.5 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(0.14 * side, 1.66, 0.5);
    rider.add(eye);
  }

  // Crown: a gold torus with small cone spikes.
  const crown = new THREE.Group();
  crown.position.set(0, 2.02, 0.2);
  rider.add(crown);
  crown.add(new THREE.Mesh(disp.track(new THREE.TorusGeometry(0.28, 0.05, 6, 12)), goldMat));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(disp.track(new THREE.ConeGeometry(0.05, 0.16, 5)), goldMat);
    spike.position.set(Math.cos(a) * 0.28, 0.1, Math.sin(a) * 0.28);
    crown.add(spike);
  }

  // Arms forward, hands holding the mane.
  for (const side of [-1, 1]) {
    rider.add(limb(disp, new THREE.Vector3(0.32 * side, 1.15, 0.25), new THREE.Vector3(0.14 * side, 0.75, 0.95), 0.1, skin));
  }

  return {
    rig,
    update(dt, pose) {
      stepRig(rig, dt, pose, reducedMotion);
      if (!reducedMotion) {
        const flap = Math.sin(rig.anim.t * flapFreq(pose)) * FLAP_AMP;
        mount.wingPivots[0].rotation.z = flap;
        mount.wingPivots[1].rotation.z = -flap;
        swayAll(mount.swayStrands, rig.anim.t);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Bunny — rides a cloud (GLB steed, with a procedural fallback)
// ---------------------------------------------------------------------------

/** Nose-to-tail length the bunny GLB is scaled to when seated on its cloud. */
const RIDER_BUNNY_LEN = 4.6;
/** Materials tinted toward the player colour — matches scene.ts's mountSteed. */
const BUNNY_TINT = new Set(['BunnyCoat', 'LavenderFurLocks']);

let bunnyTemplate: THREE.Group | null = null;
let bunnyPreload: Promise<void> | null = null;

/** Loads the bunny GLB once; resolves (never rejects) — on failure or before
 *  it lands, `createRider('bunny', …)` falls back to a procedural bunny. */
export function preloadRiderAssets(): Promise<void> {
  if (!bunnyPreload) {
    bunnyPreload = new Promise((resolve) => {
      try {
        new GLTFLoader()
          .setMeshoptDecoder(MeshoptDecoder)
          .load(
            bunnyUrl,
            (gltf) => {
              bunnyTemplate = gltf.scene;
              resolve();
            },
            undefined,
            (err) => {
              console.warn('rider bunny GLB failed to load, using procedural fallback', err);
              resolve();
            },
          );
      } catch (err) {
        // A bad/unfetchable bundled-asset URL (e.g. jsdom with no real dev
        // server) can throw synchronously instead of erroring async.
        console.warn('rider bunny GLB failed to load, using procedural fallback', err);
        resolve();
      }
    });
  }
  return bunnyPreload;
}

function mountBunnyGltf(color: number, disp: Disposables): THREE.Group | null {
  if (!bunnyTemplate) return null;
  const model = bunnyTemplate.clone(true);
  const tint = new THREE.Color(color);
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    const meshMat = mesh.material as THREE.MeshStandardMaterial;
    if (meshMat && BUNNY_TINT.has(meshMat.name)) {
      // Cloned+tinted materials are ours to dispose; the geometry and every
      // other material stay shared with the cached GLB template.
      const own = disp.track(meshMat.clone());
      own.color.lerp(tint, 0.4);
      mesh.material = own;
    }
  });
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const s = size.z > 0.001 ? RIDER_BUNNY_LEN / size.z : 1;
  model.scale.setScalar(s);
  model.position.y = -box.min.y * s;
  return model;
}

function buildProceduralBunny(color: number, disp: Disposables): THREE.Group {
  const g = new THREE.Group();
  const tint = new THREE.Color(color);
  const coat = mat(disp, { color: 0xffffff, roughness: 0.7 });
  const inner = mat(disp, { color: tint.getHex(), roughness: 0.6 });

  const body = new THREE.Mesh(disp.track(new THREE.CapsuleGeometry(0.85, 1.2, 3, 10)), coat);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0.95, 0);
  body.castShadow = true;
  g.add(body);

  const head = new THREE.Mesh(disp.track(new THREE.SphereGeometry(0.62, 12, 10)), coat);
  head.position.set(0, 1.35, 1.05);
  head.castShadow = true;
  g.add(head);

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(disp.track(new THREE.CapsuleGeometry(0.14, 1.1, 3, 8)), coat);
    ear.position.set(0.22 * side, 2.25, 0.95);
    ear.rotation.z = 0.12 * side;
    g.add(ear);
    const earInner = new THREE.Mesh(disp.track(new THREE.CapsuleGeometry(0.07, 0.9, 3, 6)), inner);
    earInner.position.set(0.22 * side, 2.22, 1.05);
    earInner.rotation.z = 0.12 * side;
    g.add(earInner);
  }

  const tail = new THREE.Mesh(disp.track(new THREE.SphereGeometry(0.3, 10, 8)), coat);
  tail.position.set(0, 1.05, -1.0);
  g.add(tail);

  return g;
}

function buildBunny(color: number, seed: number, reducedMotion: boolean, disp: Disposables): Built {
  const rig = makeRig();

  // Puffy cloud platform: a cluster of spheres, white on top with a faint
  // player-colour tint underneath.
  const cloudGroup = new THREE.Group();
  rig.scaleRoot.add(cloudGroup);
  const tint = new THREE.Color(color);
  const topColor = new THREE.Color(0xffffff);
  const underColor = new THREE.Color(0xffffff).lerp(tint, 0.22);
  const puffGeo = disp.track(new THREE.SphereGeometry(1, 10, 8));
  const puffs: Array<{ mesh: THREE.Mesh; base: number; phase: number }> = [];
  const puffLayout: Array<[number, number, number, number, boolean]> = [
    [0, 0.1, 0, 1.9, false],
    [1.5, -0.05, 0.4, 1.35, false],
    [-1.5, -0.05, -0.3, 1.35, false],
    [0.8, -0.25, -1.1, 1.15, true],
    [-0.9, -0.3, 1.0, 1.1, true],
    [0, -0.5, 0, 1.4, true],
  ];
  puffLayout.forEach(([x, y, z, r, under], i) => {
    const m = mat(disp, { color: (under ? underColor : topColor).getHex(), roughness: 1 });
    const puff = new THREE.Mesh(puffGeo, m);
    puff.position.set(x, y, z);
    puff.scale.setScalar(r);
    puff.castShadow = !under;
    puff.receiveShadow = true;
    cloudGroup.add(puff);
    puffs.push({ mesh: puff, base: r, phase: hash(seed + i * 5.7) * Math.PI * 2 });
  });

  // Sits into the fluff of the top puff (peaks at y≈2.0) rather than
  // perched above it.
  const rideHeight = 1.7;
  const bunnyGroup = mountBunnyGltf(color, disp) ?? buildProceduralBunny(color, disp);
  bunnyGroup.position.y += rideHeight;
  cloudGroup.add(bunnyGroup);

  return {
    rig,
    update(dt, pose) {
      stepRig(rig, dt, pose, reducedMotion);
      if (!reducedMotion) {
        for (const p of puffs) {
          const wobble = 1 + Math.sin(rig.anim.t * 1.3 + p.phase) * 0.045;
          p.mesh.scale.setScalar(p.base * wobble);
        }
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

export function createRider(character: CharacterId, color: number, opts: { reducedMotion: boolean; seed: number }): Rider {
  const disp = new Disposables();
  const { reducedMotion, seed } = opts;

  let built: Built;
  switch (character) {
    case 'fairy':
      built = buildFairy(color, seed, reducedMotion, disp);
      break;
    case 'unicorn':
      built = buildUnicorn(color, seed, reducedMotion, disp);
      break;
    case 'princess':
      built = buildPrincess(color, seed, reducedMotion, disp);
      break;
    case 'bunny':
      built = buildBunny(color, seed, reducedMotion, disp);
      break;
  }

  return {
    group: built.rig.group,
    update: built.update,
    dispose() {
      disp.disposeAll();
    },
  };
}
