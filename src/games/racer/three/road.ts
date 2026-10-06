/**
 * The rainbow road and the rings over it.
 *
 * The road is a raised, glossy ribbon of six stripes with a soft bright lip
 * along both edges, banking gently into its bends. It follows the same
 * points, at the same width, as it always has: only its look is here, the
 * line it runs along is domain/sky.ts's. Its stripes and the rings' bands
 * are drawn in their own colours (not tone-mapped) with a sheen added on
 * top from skyLook's gloss texture, so they stay as saturated as the
 * concept frame and still read as glossy.
 */
import * as THREE from 'three';
import { RING_RADIUS, trailPoint } from '../domain/sky';

/** The road runs this far below the line racers fly along, and is this wide. */
export const ROAD_DROP = 4;
export const ROAD_WIDTH = 13;
/** Curve samples per road point: enough that bends read smooth. */
const ROAD_SAMPLES = 6;

/** The six stripes, red on the right of the road (as you fly) to purple on the left. */
export const STRIPES = ['#ff5f7e', '#ffa04a', '#ffe34f', '#6edc8e', '#5cb3ff', '#b27aff'].map((c) => new THREE.Color(c));
const LIP = new THREE.Color('#fff2fb');
/** Seen from underneath, the stripes are a shade deeper. */
const UNDER = 0.8;

/** How far the road leans into a bend, per radian of turn per unit, and at most. */
const BANK_PER_TURN = 22;
const MAX_BANK = 0.2;

interface ProfilePoint {
  /** Across the road and up from its surface. */
  a: number;
  h: number;
  /** The surface's normal, across and up. */
  na: number;
  nh: number;
  color: THREE.Color;
}

/**
 * The road's cross-section as strips of joined points: each stripe its own
 * strip (so the colours meet crisply), then each lip with the wall under
 * it, then the underside, striped too, so diving under the road still
 * shows a rainbow overhead.
 */
function roadProfile(): ProfilePoint[][] {
  const E = ROAD_WIDTH / 2;
  const strips: ProfilePoint[][] = STRIPES.map((color, k) => [
    { a: (k / STRIPES.length - 0.5) * ROAD_WIDTH, h: 0, na: 0, nh: 1, color },
    { a: ((k + 1) / STRIPES.length - 0.5) * ROAD_WIDTH, h: 0, na: 0, nh: 1, color },
  ]);
  for (const side of [-1, 1]) {
    const wall = (side < 0 ? STRIPES[0] : STRIPES[STRIPES.length - 1]).clone().multiplyScalar(0.75);
    strips.push([
      { a: side * E, h: 0, na: -side * 0.35, nh: 0.94, color: LIP },
      { a: side * (E + 0.2), h: 0.3, na: -side * 0.6, nh: 0.8, color: LIP },
      { a: side * (E + 0.5), h: 0.46, na: 0, nh: 1, color: LIP },
      { a: side * (E + 0.8), h: 0.3, na: side * 0.7, nh: 0.7, color: LIP },
      { a: side * (E + 0.95), h: 0, na: side, nh: 0.1, color: wall },
      { a: side * (E + 0.95), h: -0.9, na: side, nh: -0.1, color: wall },
      { a: side * (E + 0.7), h: -1.1, na: side * 0.5, nh: -0.87, color: wall },
      { a: side * E, h: -1.1, na: 0, nh: -1, color: wall },
    ]);
  }
  STRIPES.forEach((stripe, k) => {
    const color = stripe.clone().multiplyScalar(UNDER);
    strips.push([
      { a: (k / STRIPES.length - 0.5) * ROAD_WIDTH, h: -1.1, na: 0, nh: -1, color },
      { a: ((k + 1) / STRIPES.length - 0.5) * ROAD_WIDTH, h: -1.1, na: 0, nh: -1, color },
    ]);
  });
  return strips;
}

const PROFILE = roadProfile();

/** Samples built between two yields: a frame's share of the road. */
const CHUNK = 40;

/** Where the road is at one sample along it: its middle, the way across and up (banked), and its fade. */
interface Frame {
  at: THREE.Vector3;
  side: THREE.Vector3;
  up: THREE.Vector3;
  alpha: number;
}

/**
 * The road's frames from road point `from` for `span` points, faded in at
 * the start (unless that is the start line) and out at the far end.
 */
function* roadFrames(from: number, span: number): Generator<void, Frame[]> {
  const pts: THREE.Vector3[] = [];
  for (let i = from; i <= from + span; i++) {
    const p = trailPoint(i);
    pts.push(new THREE.Vector3(p.x, p.y - ROAD_DROP, p.z));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const length = curve.getLength();
  const n = span * ROAD_SAMPLES;
  const frames: Frame[] = [];
  const tan = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const du = 0.5 / n;
  for (let s = 0; s <= n; s++) {
    if (s % CHUNK === 0) yield;
    const u = s / n;
    const at = curve.getPointAt(u, new THREE.Vector3());
    curve.getTangentAt(u, tan);
    // Lean into the bend: how fast the heading turns here.
    curve.getTangentAt(Math.min(1, u + du), ahead);
    let turn = Math.atan2(ahead.x, ahead.z) - Math.atan2(tan.x, tan.z);
    if (turn > Math.PI) turn -= Math.PI * 2;
    if (turn < -Math.PI) turn += Math.PI * 2;
    const bank = Math.max(-MAX_BANK, Math.min(MAX_BANK, (turn / (du * length)) * BANK_PER_TURN));
    // Across the road, level, whichever way it runs; then tipped by the bank.
    const len = Math.hypot(tan.x, tan.z) || 1;
    side.set(tan.z / len, 0, -tan.x / len);
    const c = Math.cos(bank);
    const sn = Math.sin(bank);
    const d = u * span;
    // The start of the road is solid; anywhere else it fades in behind me.
    const fadeIn = from === 0 ? 1 : d / 2.5;
    frames.push({
      at,
      side: side.clone().multiplyScalar(c).addScaledVector(up, -sn),
      up: up.clone().multiplyScalar(c).addScaledVector(side, sn),
      alpha: Math.max(0, Math.min(1, fadeIn, (span - d) / 10)),
    });
  }
  return frames;
}

/**
 * The road from road point `from` for `span` points, and the light along its
 * edges, built in steps (it yields between them, so a frame builds only some
 * of it) and returned at the end.
 */
export function* roadGeometries(from: number, span: number): Generator<void, { road: THREE.BufferGeometry; glow: THREE.BufferGeometry }> {
  const frames = yield* roadFrames(from, span);
  const road = yield* roadGeometry(frames);
  const glow = yield* roadGlowGeometry(frames);
  return { road, glow };
}

function* roadGeometry(frames: Frame[]): Generator<void, THREE.BufferGeometry> {
  const n = frames.length - 1;
  const perSample = PROFILE.reduce((sum, strip) => sum + strip.length, 0);
  const pos = new Float32Array((n + 1) * perSample * 3);
  const nor = new Float32Array((n + 1) * perSample * 3);
  const col = new Float32Array((n + 1) * perSample * 4);
  const index: number[] = [];
  const v = new THREE.Vector3();
  const face = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  for (let s = 0; s < frames.length; s++) {
    if (s % CHUNK === 0) yield;
    const f = frames[s];
    let vtx = s * perSample;
    for (const strip of PROFILE) {
      for (const p of strip) {
        v.copy(f.at).addScaledVector(f.side, p.a).addScaledVector(f.up, p.h);
        pos.set([v.x, v.y, v.z], vtx * 3);
        v.copy(f.side).multiplyScalar(p.na).addScaledVector(f.up, p.nh).normalize();
        nor.set([v.x, v.y, v.z], vtx * 3);
        col.set([p.color.r, p.color.g, p.color.b, f.alpha], vtx * 4);
        vtx++;
      }
    }
  }
  // Join each strip's neighbouring points to the sample before, facing out.
  const quad = (a: number, b: number, c: number, d: number) => {
    // a, b on the earlier sample; c, d the same points on this one.
    e1.fromArray(pos, b * 3).sub(v.fromArray(pos, a * 3));
    e2.fromArray(pos, c * 3).sub(v.fromArray(pos, a * 3));
    face.crossVectors(e1, e2);
    v.fromArray(nor, a * 3).add(e1.fromArray(nor, d * 3));
    if (face.dot(v) >= 0) index.push(a, b, c, b, d, c);
    else index.push(a, c, b, b, c, d);
  };
  for (let s = 1; s <= n; s++) {
    if (s % CHUNK === 0) yield;
    let k = 0;
    for (const strip of PROFILE) {
      for (let j = 0; j < strip.length - 1; j++) {
        const a = (s - 1) * perSample + k + j;
        quad(a, a + 1, a + perSample, a + perSample + 1);
      }
      k += strip.length;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geo.setIndex(index);
  return geo;
}

/** The glow's cross-section out from each edge: across the road past its lip, and how bright. */
const GLOW: Array<[number, number]> = [
  [0.1, 0.8],
  [0.7, 0.55],
  [1.6, 0.22],
  [2.2, 0],
];
const GLOW_COLOR = new THREE.Color('#ff6fd8');

/**
 * A soft pink light along both edges of the road: a flat ribbon on each
 * side fading outward (pink, because added light would vanish into white
 * clouds).
 */
function* roadGlowGeometry(frames: Frame[]): Generator<void, THREE.BufferGeometry> {
  const E = ROAD_WIDTH / 2;
  const per = GLOW.length * 2;
  const pos = new Float32Array(frames.length * per * 3);
  const col = new Float32Array(frames.length * per * 4);
  const index: number[] = [];
  const v = new THREE.Vector3();
  for (let s = 0; s < frames.length; s++) {
    if (s % CHUNK === 0) yield;
    const f = frames[s];
    let vtx = s * per;
    for (const side of [-1, 1]) {
      for (const [out, glow] of GLOW) {
        v.copy(f.at).addScaledVector(f.side, side * (E + 0.3 + out)).addScaledVector(f.up, 0.45);
        pos.set([v.x, v.y, v.z], vtx * 3);
        const k = glow * f.alpha;
        col.set([GLOW_COLOR.r, GLOW_COLOR.g, GLOW_COLOR.b, k], vtx * 4);
        vtx++;
      }
    }
  }
  for (let s = 1; s < frames.length; s++) {
    for (let k = 0; k < 2; k++) {
      for (let j = 0; j < GLOW.length - 1; j++) {
        const a = (s - 1) * per + k * GLOW.length + j;
        const b = a + per;
        // Seen from above or below alike: the material is double-sided.
        index.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geo.setIndex(index);
  return geo;
}

/** The road's rim light: a pink haze that fades outward, writing no depth. */
export function roadGlowMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

/** What the road material needs to know to keep a diving racer in sight. */
export interface RoadSee {
  /** Where the racer is. */
  player: THREE.Vector3;
  /** 0 when the road is solid, up to 1 when the racer and the camera are on opposite sides of it. */
  through: { value: number };
}

/**
 * Its own colours, a sheen on top. Solid, so it reads as a raised ribbon,
 * except where the racer is hidden by it: when the racer and the camera are
 * on opposite sides of the road (diving under it, or climbing from below),
 * the stretch of road around the racer turns see-through (`see.through`),
 * and only that stretch. It still writes depth, so waterfalls and sparkles
 * behind it stay behind it.
 */
export function roadMaterial(gloss: THREE.Texture, see: RoadSee): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    toneMapped: false,
    envMap: gloss,
    combine: THREE.AddOperation,
    reflectivity: 0.5,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPlayer = { value: see.player };
    shader.uniforms.uThrough = see.through;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRoadWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoadWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRoadWorld;\nuniform vec3 uPlayer;\nuniform float uThrough;')
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.a *= 1.0 - uThrough * 0.72 * (1.0 - smoothstep(14.0, 55.0, distance(vRoadWorld, uPlayer)));',
      );
  };
  return mat;
}

/**
 * A rainbow ring: six fat glossy bands side by side, red outside to purple
 * inside, as one mesh. `far` is the lighter version for rings in the distance,
 * a third of the triangles.
 */
export function ringGeometry(far = false): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const index: number[] = [];
  STRIPES.forEach((color, i) => {
    const band = new THREE.TorusGeometry(RING_RADIUS + 1.9 - i * 0.62, 0.42, far ? 5 : 8, far ? 30 : 52);
    const base = pos.length / 3;
    const p = band.getAttribute('position');
    const nm = band.getAttribute('normal');
    for (let v = 0; v < p.count; v++) {
      pos.push(p.getX(v), p.getY(v), p.getZ(v));
      nor.push(nm.getX(v), nm.getY(v), nm.getZ(v));
      col.push(color.r, color.g, color.b);
    }
    const idx = band.getIndex()!;
    for (let k = 0; k < idx.count; k++) index.push(base + idx.getX(k));
    band.dispose();
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(index);
  return geo;
}

export function ringMaterial(gloss: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    vertexColors: true,
    toneMapped: false,
    envMap: gloss,
    combine: THREE.AddOperation,
    reflectivity: 0.4,
  });
}
