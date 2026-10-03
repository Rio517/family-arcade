/**
 * Chunky racers: the unicorn and the fairy built from a handful of blocks,
 * in two styles, behind the same `Rider` contract as riders.ts so either can
 * stand in for today's riders. Nothing in the game builds these yet; the
 * cast preview (preview-cast.tsx) is the only caller.
 *
 * Every rigid part is one merged, vertex-coloured mesh, and every character
 * shares one matte material (plus one glossy one for eyes and horn in style
 * B), so a character costs one draw call per part: four or five, at most
 * seven. The only animation is hinges: the wings flap, the body bobs, the
 * head tilts, the tail sways; bank, climb and tier growth work as they do
 * for today's riders.
 */
import * as THREE from 'three';
import { CRUISE_SPEED } from '../../domain/flight';
import type { Rider, RiderPose } from '../riders';
import type { Figure, Finish, Part, V3 } from './kit';
import { fairyA, fairyB } from './fairy';
import { unicornA, unicornB } from './unicorn';

export type ChunkyStyle = 'a' | 'b';
export type ChunkyCharacter = 'unicorn' | 'fairy';

const BUILDERS: Record<ChunkyCharacter, Record<ChunkyStyle, (color: number) => Figure>> = {
  unicorn: { a: unicornA, b: unicornB },
  fairy: { a: fairyA, b: fairyB },
};

// The same feel as today's riders (riders.ts): gentle enough that a
// seven-year-old reads "flying", not "shaking".
const MAX_ROLL = 0.55;
const MAX_PITCH = 0.32;
const EASE_RATE = 7;
const BOB_AMP = 0.32;
const BOB_FREQ = 1.7;
const FLAP_FREQ = 5.2;
const FLAP_FREQ_BOOST = 9.5;
const TIER_GROWTH = 0.22;
const WINGS_POWER_GROWTH = 0.65;
/** The fairy's wings beat faster than the unicorn's, like a butterfly's. */
const FLUTTER = { unicorn: 1, fairy: 1.6 } as const;
/** World size, so both stand 15–18% of the chase camera's frame at cruise. */
const SIZE = { unicorn: 0.96, fairy: 1.16 } as const;
/** The fairy grows her wings with stars, not herself, as she does today. */
const GROWTH = { unicorn: { body: TIER_GROWTH, wings: 0 }, fairy: { body: 0, wings: 0.45 } } as const;

function materials(style: ChunkyStyle): Record<Finish, THREE.MeshStandardMaterial> {
  if (style === 'a') {
    // Flat colour on hard faces: each face one shade, as in the reference.
    const flat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });
    return { matte: flat, gloss: flat };
  }
  return {
    matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 }),
    gloss: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, envMapIntensity: 1.6 }),
  };
}

/** The meshes of one part, under a hinge placed at `at`. */
function hinge(part: Part, mats: Record<Finish, THREE.Material>, at: V3, geos: THREE.BufferGeometry[]): THREE.Group {
  const g = new THREE.Group();
  g.position.set(at[0], at[1], at[2]);
  const built = part.build();
  for (const finish of ['matte', 'gloss'] as const) {
    const geo = built[finish];
    if (!geo) continue;
    geos.push(geo);
    const mesh = new THREE.Mesh(geo, mats[finish]);
    mesh.name = finish;
    g.add(mesh);
  }
  return g;
}

function clampDt(dt: number): number {
  if (!Number.isFinite(dt) || dt < 0) return 0;
  return Math.min(dt, 0.25);
}

function clampUnit(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-1, Math.min(1, v));
}

export function createChunkyRider(
  style: ChunkyStyle,
  character: ChunkyCharacter,
  color: number,
  opts: { reducedMotion: boolean; seed: number },
): Rider {
  const { reducedMotion } = opts;
  const fig = BUILDERS[character][style](color);
  const mats = materials(style);
  const geos: THREE.BufferGeometry[] = [];

  const group = new THREE.Group();
  const tilt = new THREE.Group();
  const bob = new THREE.Group();
  const scaleRoot = new THREE.Group();
  // The fixed flight lean turns about a height inside the figure (the
  // fairy's hips), not her feet.
  const lean = new THREE.Group();
  lean.position.y = fig.leanAbout;
  lean.rotation.x = fig.lean;
  const figure = new THREE.Group();
  figure.position.y = -fig.leanAbout;
  const sized = new THREE.Group();
  sized.scale.setScalar(SIZE[character]);
  group.add(tilt);
  tilt.add(bob);
  bob.add(scaleRoot);
  scaleRoot.add(sized);
  sized.add(lean);
  lean.add(figure);

  figure.add(hinge(fig.body, mats, [0, 0, 0], geos));
  const head = hinge(fig.head, mats, fig.pivots.head, geos);
  figure.add(head);
  const wings = fig.wings.map((w, i) => {
    const pivot = hinge(w, mats, fig.pivots.wings[i], geos);
    // Flap in the wing's own plane first, then the sweep back.
    pivot.rotation.order = 'YXZ';
    pivot.rotation.y = (i === 0 ? 1 : -1) * 0.3;
    figure.add(pivot);
    return pivot;
  });
  const tail = fig.tail && fig.pivots.tail ? hinge(fig.tail, mats, fig.pivots.tail, geos) : null;
  if (tail) figure.add(tail);

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
    tilt.rotation.z = ease('roll', clampUnit(pose.bank) * MAX_ROLL, k);
    tilt.rotation.x = ease('pitch', -clampUnit(pose.climb) * MAX_PITCH, k);
    const tier = Number.isFinite(pose.tier) ? Math.max(0, pose.tier) : 0;
    const power = Number.isFinite(pose.wings) ? Math.max(0, Math.min(1, pose.wings ?? 0)) : 0;
    scaleRoot.scale.setScalar(ease('scale', 1 + GROWTH[character].body * tier, k));
    const wingScale = ease('wings', (1 + GROWTH[character].wings * tier) * (1 + WINGS_POWER_GROWTH * power), k);

    const speed = Number.isFinite(pose.speed) ? pose.speed : CRUISE_SPEED;
    const gait = Math.min(1.4, Math.max(0.25, speed / CRUISE_SPEED));
    const freq = (pose.boosting ? FLAP_FREQ_BOOST : FLAP_FREQ) * FLUTTER[character];
    const flap = reducedMotion ? 0 : Math.sin(t * freq) * fig.flapAmp;
    wings.forEach((w, i) => {
      const side = i === 0 ? 1 : -1;
      w.rotation.z = side * (fig.wingRest + flap);
      w.scale.setScalar(wingScale);
    });
    bob.position.y = reducedMotion ? 0 : Math.sin(t * BOB_FREQ * gait) * BOB_AMP;
    head.rotation.x = fig.headLift + (reducedMotion ? 0 : Math.sin(t * 0.9) * 0.05);
    head.rotation.z = reducedMotion ? 0 : Math.sin(t * 1.3) * 0.08;
    if (tail) tail.rotation.y = reducedMotion ? 0 : Math.sin(t * 2.1) * 0.18;
  };
  update(0, { speed: CRUISE_SPEED, bank: 0, climb: 0, tier: 0, boosting: false });

  return {
    group,
    update,
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of new Set(Object.values(mats))) m.dispose();
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
