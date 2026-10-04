/**
 * Rainbow Racer riders: the four characters a player can pick, rigged to fly.
 *
 * Cloud Kingdom rules (the lead designer's decree): a character that can fly
 * flies by itself (fairy, unicorn); a character that can't fly rides
 * something that flies: the princess and the bunny each ride a cloud, a bird
 * or a unicorn (princess defaults to the unicorn, bunny to the cloud). Stars
 * make you bigger and faster: `RiderPose.tier` (0..3) drives that growth,
 * eased smoothly rather than snapping; the fairy's wings grow instead of her.
 *
 * Every character is soft blocks built in code (`chunky/`), merged into one
 * vertex-coloured mesh per rigid part and drawn with one shared material:
 * four to six draw calls a racer. The only animation is hinges: the wings
 * flap, the body bobs, heads tilt, the tail sways. Framework-free like
 * scene.ts, so a rider builds without a renderer and is testable in jsdom.
 * `update()` only ever touches objects inside `group`; the scene owns
 * `group`'s position and rotation.
 */
import * as THREE from 'three';
import { CRUISE_SPEED } from '../domain/flight';
import type { MountId } from '../domain/mounts';
import { bird } from './chunky/bird';
import { bunny } from './chunky/bunny';
import { cloud } from './chunky/cloud';
import { fairy } from './chunky/fairy';
import type { Figure, Rides } from './chunky/figure';
import { chunkyMaterial, type Part, type V3 } from './chunky/kit';
import { princess } from './chunky/princess';
import { unicorn } from './chunky/unicorn';

export type CharacterId = 'fairy' | 'princess' | 'unicorn' | 'bunny';

export interface RiderPose {
  /** World units/s, cruise ~26, boosted up to ~60. */
  speed: number;
  /** -1..1, current turning (negative = turning left). */
  bank: number;
  /** -1..1, climbing (+) or diving (-). */
  climb: number;
  /** 0..3 power tier from stars; animate smoothly between tiers. */
  tier: number;
  /** True during a speed burst. */
  boosting: boolean;
  /** 0..1 while a wings power-up is on: bigger wings (a cloud mount opens a pair). */
  wings?: number;
}

export interface Rider {
  /** The scene positions/rotates this; a rider never moves it itself. */
  group: THREE.Group;
  /** Animate internals (wings, bob, bank roll, pitch, tier growth). */
  update(dt: number, pose: RiderPose): void;
  /** Free the geometries and the material this rider created. */
  dispose(): void;
}

// Gentle enough that a seven-year-old reads "flying", not "shaking".
const MAX_ROLL = 0.55; // radians of bank roll at full turn
const MAX_PITCH = 0.32; // radians of nose pitch at full climb/dive
const EASE_RATE = 7; // 1/s smoothing for roll/pitch/tier scale
const BOB_AMP = 0.32;
const BOB_FREQ = 1.7; // rad/s base hover bob rate
const FLAP_FREQ = 5.2; // rad/s base wing-flap rate
const FLAP_FREQ_BOOST = 9.5;
const WINGS_POWER_GROWTH = 0.65; // extra wing size while a wings power-up is on
/** How far each wing is swept back from straight out (radians). */
const WING_SWEEP = 0.3;

/**
 * How a racer flies: its size in the world (so each stands 15–18% of the
 * chase camera's frame at cruise), how fast its wings beat against the
 * unicorn's, and what each star grows: the whole racer, or only the wings.
 */
interface Flight {
  size: number;
  flutter: number;
  growth: { body: number; wings: number };
}
const STAR_GROWTH = { body: 0.22, wings: 0 };
const FLIGHT: Record<'unicorn' | 'fairy', Flight> = {
  unicorn: { size: 0.96, flutter: 1, growth: STAR_GROWTH },
  // A butterfly's quicker beat; stars grow her wings, not her.
  fairy: { size: 1.16, flutter: 1.6, growth: { body: 0, wings: 0.45 } },
};
/** A rider's flight is their ride's. */
const RIDE_FLIGHT: Record<MountId, Flight> = {
  unicorn: FLIGHT.unicorn,
  bird: { size: 0.96, flutter: 1, growth: STAR_GROWTH },
  cloud: { size: 0.9, flutter: 1, growth: STAR_GROWTH },
};

/** Where and how big a seated rider is on each ride: nudged from the ride's seat. */
const SEATS: Record<MountId, Record<'princess' | 'bunny', { dy: number; dz: number; scale: number }>> = {
  // Big enough, and far enough back, to be seen over the unicorn's head.
  unicorn: { princess: { dy: 0.08, dz: -0.5, scale: 1.35 }, bunny: { dy: 0.02, dz: -0.45, scale: 1.35 } },
  bird: { princess: { dy: 0, dz: -0.1, scale: 1.25 }, bunny: { dy: -0.05, dz: -0.1, scale: 1.3 } },
  cloud: { princess: { dy: 0.12, dz: 0, scale: 1.45 }, bunny: { dy: 0.05, dz: 0.1, scale: 1.7 } },
};

function figureFor(character: CharacterId, color: number, mount: MountId): { fig: Figure; flight: Flight } {
  if (character === 'fairy' || character === 'unicorn') {
    return { fig: character === 'fairy' ? fairy(color) : unicorn(color), flight: FLIGHT[character] };
  }
  const seat = SEATS[mount][character];
  const draw = character === 'princess' ? princess(color, seat.scale) : bunny(color, seat.scale);
  const rides: Rides = (body, at) => draw(body, [at[0], at[1] + seat.dy, at[2] + seat.dz]);
  const ride = mount === 'unicorn' ? unicorn(color, rides) : mount === 'bird' ? bird(color, rides) : cloud(color, rides);
  return { fig: ride, flight: RIDE_FLIGHT[mount] };
}

function clampDt(dt: number): number {
  if (!Number.isFinite(dt) || dt < 0) return 0;
  return Math.min(dt, 0.25);
}

function clampUnit(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-1, Math.min(1, v));
}

/**
 * `mount` applies only to the princess (default unicorn) and the bunny
 * (default cloud); the fairy and unicorn fly by themselves and ignore it.
 */
export function createRider(
  character: CharacterId,
  color: number,
  opts: { reducedMotion: boolean; seed: number; mount?: MountId },
): Rider {
  const { reducedMotion } = opts;
  const mount = opts.mount ?? (character === 'princess' ? 'unicorn' : 'cloud');
  const { fig, flight } = figureFor(character, color, mount);
  const material = chunkyMaterial();
  const geos: THREE.BufferGeometry[] = [];

  /** One part's mesh under a hinge placed at `at`. */
  const hinge = (part: Part, at: V3): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(...at);
    const geo = part.build();
    geos.push(geo);
    g.add(new THREE.Mesh(geo, material));
    return g;
  };

  const group = new THREE.Group();
  const tilt = new THREE.Group(); // bank roll (z) and nose pitch (x)
  const bob = new THREE.Group(); // hover
  const scaleRoot = new THREE.Group(); // star growth
  const sized = new THREE.Group();
  sized.scale.setScalar(flight.size);
  // The fairy's fixed lean into the wind turns about her hips, not her feet.
  const lean = new THREE.Group();
  lean.position.y = fig.leanAbout ?? 0;
  lean.rotation.x = fig.lean ?? 0;
  const figure = new THREE.Group();
  figure.position.y = -(fig.leanAbout ?? 0);
  group.add(tilt);
  tilt.add(bob);
  bob.add(scaleRoot);
  scaleRoot.add(sized);
  sized.add(lean);
  lean.add(figure);

  figure.add(hinge(fig.body, [0, 0, 0]));
  const head = fig.head ? hinge(fig.head.part, fig.head.at) : null;
  const riderHead = fig.rider ? hinge(fig.rider.part, fig.rider.at) : null;
  const tail = fig.tail ? hinge(fig.tail.part, fig.tail.at) : null;
  const wings = fig.wings.parts.map((w, i) => {
    const side = i === 0 ? 1 : -1;
    const at = fig.wings.at;
    const pivot = hinge(w, [at[0] * side, at[1], at[2]]);
    // Flap in the wing's own plane first, then the sweep back.
    pivot.rotation.order = 'YXZ';
    pivot.rotation.y = side * WING_SWEEP;
    pivot.name = 'wing';
    return pivot;
  });
  for (const g of [head, riderHead, tail, ...wings]) if (g) figure.add(g);

  // A seeded phase, so a pack of the same character doesn't flap in step.
  let t = (opts.seed * 0.618) % 1;
  const eased = new Map<string, number>();
  const ease = (key: string, target: number, k: number): number => {
    const cur = eased.get(key) ?? target;
    const next = reducedMotion ? target : cur + (target - cur) * k;
    eased.set(key, next);
    return next;
  };

  const update = (dt: number, pose: RiderPose): void => {
    const dtc = clampDt(dt);
    t += dtc;
    const k = 1 - Math.exp(-EASE_RATE * dtc);
    // Lean into the turn. Seen from behind, world +X is on the screen's left,
    // so a right turn (bank +1) lifts +X: a positive roll about Z.
    tilt.rotation.z = ease('roll', clampUnit(pose.bank) * MAX_ROLL, k);
    tilt.rotation.x = ease('pitch', -clampUnit(pose.climb) * MAX_PITCH, k);
    const tier = Number.isFinite(pose.tier) ? Math.max(0, pose.tier) : 0;
    const power = Number.isFinite(pose.wings) ? Math.max(0, Math.min(1, pose.wings ?? 0)) : 0;
    scaleRoot.scale.setScalar(ease('scale', 1 + flight.growth.body * tier, k));
    // Wings grow with stars (the fairy's) and with the wings power-up; a
    // cloud's folded pair opens from nothing.
    const grown = ease('wings', (1 + flight.growth.wings * tier) * (1 + WINGS_POWER_GROWTH * power), k);
    const open = fig.wings.folded ? ease('open', power, k) : 1;

    const speed = Number.isFinite(pose.speed) ? pose.speed : CRUISE_SPEED;
    const gait = Math.min(1.4, Math.max(0.25, speed / CRUISE_SPEED));
    const freq = (pose.boosting ? FLAP_FREQ_BOOST : FLAP_FREQ) * flight.flutter;
    const flap = reducedMotion ? 0 : Math.sin(t * freq) * fig.wings.amp;
    wings.forEach((w, i) => {
      const side = i === 0 ? 1 : -1;
      w.rotation.z = side * (fig.wings.rest + flap);
      w.scale.setScalar(fig.wings.folded ? Math.max(0.001, open) : grown);
      w.visible = open > 0.02;
    });
    bob.position.y = reducedMotion ? 0 : Math.sin(t * BOB_FREQ * gait) * BOB_AMP;
    if (head) {
      head.rotation.x = (fig.head?.lift ?? 0) + (reducedMotion ? 0 : Math.sin(t * 0.9) * 0.05);
      head.rotation.z = reducedMotion ? 0 : Math.sin(t * 1.3) * 0.08;
    }
    if (riderHead) {
      riderHead.rotation.x = reducedMotion ? 0 : Math.sin(t * 0.8 + 0.5) * 0.06;
      riderHead.rotation.z = reducedMotion ? 0 : Math.sin(t * 1.1 + 1) * 0.1;
    }
    if (tail) tail.rotation.y = reducedMotion ? 0 : Math.sin(t * 2.1) * 0.18;
  };
  update(0, { speed: CRUISE_SPEED, bank: 0, climb: 0, tier: 0, boosting: false });

  let disposed = false;
  return {
    group,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const g of geos) g.dispose();
      material.dispose();
    },
  };
}

/** What a rider costs to draw: one call per mesh, and its triangles. */
export function drawCost(root: THREE.Object3D): { calls: number; triangles: number } {
  let calls = 0;
  let triangles = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    calls += 1;
    const geo = mesh.geometry;
    triangles += (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
  });
  return { calls, triangles };
}
