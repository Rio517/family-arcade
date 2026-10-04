/**
 * The toolbox the racers are built with. A character is a handful of rigid
 * parts (body, head, each wing, the tail), and each part is a pile of soft
 * blocks, balls and locks of hair, each painted in flat colour. A part merges
 * into one vertex-coloured geometry, glossy bits (eyes, horn, crown) included:
 * the shared material reads the gloss from each vertex, so a part draws in
 * one call whatever it is made of.
 *
 * Framework-free and renderer-free, so a character builds in jsdom and its
 * budgets can be tested.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type V3 = readonly [number, number, number];

export interface Rot {
  rx?: number;
  ry?: number;
  rz?: number;
}

/**
 * A flat colour, or a colour picked per face from the face's centre in the
 * piece's own frame (bands, hooves, the inside of an ear). With `smooth` the
 * function is asked per corner instead, and the colours blend (an iris).
 */
export type Paint = number | ((p: THREE.Vector3, face: number) => number);

interface Finish {
  /** Glossy: eyes, the horn, the crown. */
  gloss?: boolean;
  /** Blend a painted colour across each face instead of one per face. */
  smooth?: boolean;
}

const ONE: V3 = [1, 1, 1];

/** Translation, then rotation (Y, X, then Z, as Euler 'YXZ'), then scale. */
export function place(at: V3, rot: Rot = {}, scale: V3 = ONE): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot.rx ?? 0, rot.ry ?? 0, rot.rz ?? 0, 'YXZ'));
  return new THREE.Matrix4().compose(new THREE.Vector3(...at), q, new THREE.Vector3(...scale));
}

/** Mirror a point across the body's centre line: side is +1 (left, +x) or -1. */
export const sx = (side: number, p: V3): V3 => [p[0] * side, p[1], p[2]];

const signedPow = (v: number, k: number): number => Math.sign(v) * Math.abs(v) ** k;

/**
 * A ball pushed toward a box (a superellipsoid) of full size `size`: `round`
 * 1 is an egg, 0.5 a soft block, 0.3 nearly a box. Its normals are exact, so
 * a few segments shade as smoothly as many; `hemi` keeps the top half only.
 */
function blobGeometry(size: V3, round: number, seg: readonly [number, number], hemi: boolean): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, seg[0], seg[1], 0, Math.PI * 2, 0, hemi ? Math.PI / 2 : Math.PI);
  geo.deleteAttribute('uv');
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
  const [a, b, c] = [size[0] / 2, size[1] / 2, size[2] / 2];
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    pos.setXYZ(i, a * signedPow(x, round), b * signedPow(y, round), c * signedPow(z, round));
    const n = new THREE.Vector3(signedPow(x, 2 - round) / a, signedPow(y, 2 - round) / b, signedPow(z, 2 - round) / c);
    if (n.lengthSq() < 1e-12) n.set(x, y, z);
    n.normalize();
    nrm.setXYZ(i, n.x, n.y, n.z);
  }
  return geo;
}

/** How a lock of hair is shaped along its length. */
export interface LockShape {
  /** Half-width across the stripes, and half-thickness, at the widest. */
  width: number;
  thick: number;
  /** Size along the lock, root (0) to tip (1), as a share of the widest. */
  taper?: (t: number) => number;
  /** The direction the lock's thickness runs at the root: x shows the stripes in profile. */
  side?: V3;
  /** Turn of the stripes about the lock (radians): a total, spread evenly root to tip, or set along it. */
  twist?: number | ((t: number) => number);
  /** Segments along the lock. */
  along?: number;
}

/** Full at a third of the way, a point at the tip. */
const SWELL = (t: number): number => (t < 0.3 ? 0.75 + (0.25 * t) / 0.3 : Math.max(0.08, 1 - ((t - 0.3) / 0.7) ** 1.6));

/**
 * A flowing lock: a tube swept along `path`, flattened into a ribbon whose
 * faces carry `colors` as stripes running its whole length, first colour on
 * the outer edge. Each face has one segment per stripe, spaced so every
 * stripe looks equally wide side-on. Returns the geometry and, per face, the
 * stripe it belongs to.
 */
function lockGeometry(colors: readonly number[], path: readonly V3[], o: LockShape): { geo: THREE.BufferGeometry; band: (face: number) => number } {
  const curve = new THREE.CatmullRomCurve3(path.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  const along = o.along ?? 8;
  const half = colors.length;
  // Edge (W = +1) to edge (W = -1) down one face, and back up the other.
  const angles: number[] = [];
  for (let k = 0; k <= half; k++) angles.push(Math.acos(1 - (2 * k) / half));
  for (let k = half - 1; k >= 1; k--) angles.push(Math.PI * 2 - Math.acos(1 - (2 * k) / half));
  const ring = angles.length;
  const taper = o.taper ?? SWELL;
  const side = new THREE.Vector3(...(o.side ?? [1, 0, 0])).normalize();
  const pos: number[] = [];
  const nrm: number[] = [];
  const T = new THREE.Vector3();
  const W = new THREE.Vector3();
  const S = new THREE.Vector3();
  const P = new THREE.Vector3();
  for (let i = 0; i <= along; i++) {
    const t = i / along;
    curve.getPointAt(t, P);
    curve.getTangentAt(t, T);
    W.crossVectors(side, T).normalize();
    S.crossVectors(T, W).normalize();
    const turn = typeof o.twist === 'function' ? o.twist(t) : (o.twist ?? 0) * t;
    if (turn) {
      W.applyAxisAngle(T, turn);
      S.applyAxisAngle(T, turn);
    }
    const s = taper(t);
    const hw = Math.max(1e-3, o.width * s);
    const ht = Math.max(1e-3, o.thick * s);
    for (const th of angles) {
      const c = Math.cos(th);
      const sn = Math.sin(th);
      pos.push(P.x + W.x * c * hw + S.x * sn * ht, P.y + W.y * c * hw + S.y * sn * ht, P.z + W.z * c * hw + S.z * sn * ht);
      const n = W.clone().multiplyScalar(c / hw).addScaledVector(S, sn / ht).normalize();
      nrm.push(n.x, n.y, n.z);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < along; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * ring + j;
      const b = i * ring + ((j + 1) % ring);
      const c = a + ring;
      const d = b + ring;
      index.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(index);
  // Wind the faces outward whichever way the path bends.
  const v = (k: number) => new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
  const [a, b, c] = [index[0], index[1], index[2]].map(v);
  const face = b.clone().sub(a).cross(c.clone().sub(a));
  if (face.dot(new THREE.Vector3(nrm[index[0] * 3], nrm[index[0] * 3 + 1], nrm[index[0] * 3 + 2])) < 0) {
    for (let k = 0; k < index.length; k += 3) [index[k + 1], index[k + 2]] = [index[k + 2], index[k + 1]];
    geo.setIndex(index);
  }
  const band = (f: number): number => {
    const j = Math.floor(f / 2) % ring;
    return j < half ? j : ring - 1 - j;
  };
  return { geo, band };
}

/**
 * Collects coloured pieces for one rigid part. `within` pushes a local frame
 * (a leg's hip, a wing's root, a rider's seat) so a run of pieces can be
 * written once in that frame.
 */
export class Part {
  private pieces: THREE.BufferGeometry[] = [];
  private frame: THREE.Matrix4;

  constructor(frame: THREE.Matrix4 = new THREE.Matrix4()) {
    this.frame = frame;
  }

  within(m: THREE.Matrix4, draw: () => void): void {
    const saved = this.frame;
    this.frame = saved.clone().multiply(m);
    draw();
    this.frame = saved;
  }

  /** Adds any geometry, flattened to position, normal, colour and gloss. */
  add(source: THREE.BufferGeometry, paint: Paint, m: THREE.Matrix4, o: Finish = {}): void {
    const g = source.index ? source.toNonIndexed() : source;
    if (g !== source) source.dispose();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    }
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const pos = g.getAttribute('position');
    const count = pos.count;
    const rgb = new Float32Array(count * 3);
    const c = new THREE.Color();
    const p = new THREE.Vector3();
    const q = new THREE.Vector3();
    for (let f = 0; f < count / 3; f++) {
      if (typeof paint === 'function' && !o.smooth) {
        p.set(0, 0, 0);
        for (let k = 0; k < 3; k++) p.add(q.fromBufferAttribute(pos, f * 3 + k));
        c.setHex(paint(p.divideScalar(3), f));
      }
      for (let k = 0; k < 3; k++) {
        const i = f * 3 + k;
        if (typeof paint === 'number') c.setHex(paint);
        else if (o.smooth) c.setHex(paint(p.fromBufferAttribute(pos, i), f));
        rgb.set([c.r, c.g, c.b], i * 3);
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
    g.setAttribute('gloss', new THREE.BufferAttribute(new Float32Array(count).fill(o.gloss ? 1 : 0), 1));
    g.applyMatrix4(this.frame.clone().multiply(m));
    this.pieces.push(g);
  }

  /** A hard-edged box centred on `at`. */
  box(paint: Paint, size: V3, at: V3, rot?: Rot, o?: Finish): void {
    this.add(new THREE.BoxGeometry(...size), paint, place(at, rot), o);
  }

  /**
   * A soft block of full size `size` centred on `at`: `round` 1 is an egg,
   * 0.5 (the default) a rounded block. `seg` is [around, top to bottom].
   */
  blob(
    paint: Paint,
    size: V3,
    at: V3,
    o: Finish & { round?: number; seg?: readonly [number, number]; rot?: Rot; hemi?: boolean } = {},
  ): void {
    this.add(blobGeometry(size, o.round ?? 0.5, o.seg ?? [10, 6], o.hemi ?? false), paint, place(at, o.rot), o);
  }

  /** A ball of radius `r`, or an egg when `scale` stretches it. */
  ball(paint: Paint, r: number, at: V3, o: Finish & { scale?: V3; rot?: Rot; seg?: readonly [number, number]; hemi?: boolean } = {}): void {
    const s = o.scale ?? ONE;
    this.blob(paint, [2 * r * s[0], 2 * r * s[1], 2 * r * s[2]], at, { ...o, round: 1 });
  }

  /** A cone or cylinder along local y, centred on `at`; `open` leaves off the ends (a band). */
  cone(paint: Paint, rTop: number, rBot: number, h: number, seg: readonly [number, number], at: V3, rot?: Rot, o: Finish & { open?: boolean } = {}): void {
    this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg[0], seg[1], o.open ?? false), paint, place(at, rot), o);
  }

  /** A flat round disc facing +z: a highlight in an eye. */
  disc(paint: Paint, r: number, at: V3, o: Finish & { rot?: Rot; scale?: V3; seg?: number } = {}): void {
    this.add(new THREE.CircleGeometry(r, o.seg ?? 8), paint, place(at, o.rot, o.scale ?? ONE), o);
  }

  /** A flowing lock of hair in rainbow stripes along `path` (see `lockGeometry`). */
  lock(colors: readonly number[], path: readonly V3[], shape: LockShape, o: Finish = {}): void {
    const { geo, band } = lockGeometry(colors, path, shape);
    this.add(geo, (_p, f) => colors[band(f)], new THREE.Matrix4(), o);
  }

  /** How many triangles so far. */
  get triangles(): number {
    return this.pieces.reduce((n, g) => n + g.getAttribute('position').count / 3, 0);
  }

  /** The part as one merged geometry. */
  build(): THREE.BufferGeometry {
    const merged = this.pieces.length ? mergeGeometries(this.pieces, false) : new THREE.BufferGeometry();
    for (const p of this.pieces) p.dispose();
    this.pieces.length = 0;
    merged.computeBoundingSphere();
    return merged;
  }
}

/**
 * The one material every racer is drawn with: vertex colours, soft and matte,
 * except where a vertex says gloss (eyes, the horn, the crown), which turns
 * smooth and catches more of the sky's reflection.
 */
export function chunkyMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float gloss;\nvarying float vGloss;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGloss = gloss;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGloss;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, 0.12, vGloss );')
      .replace(
        '#include <lights_fragment_maps>',
        '#include <lights_fragment_maps>\n#if defined( RE_IndirectSpecular )\nradiance *= 1.0 + 0.6 * vGloss;\n#endif',
      );
  };
  m.customProgramCacheKey = () => 'racer-gloss';
  return m;
}
