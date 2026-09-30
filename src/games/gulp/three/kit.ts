/**
 * The toolbox the Gulp Universe props are built with. Every part is turned into
 * plain non-indexed triangles with one flat vertex colour, so a whole prop
 * merges into a single geometry that the scene draws with one shared
 * vertex-coloured, flat-shaded material.
 */
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type V3 = readonly [number, number, number];
/** A box face, named by its outward normal. Hidden faces are dropped to save triangles. */
export type Face = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';
export interface Rot {
  rx?: number;
  ry?: number;
  rz?: number;
}
/**
 * Draws one kind into the kit. `v` is already wrapped into the kind's
 * variant range; `s` is the height scale (1 for kinds that do not scale).
 */
export type Builder = (k: Kit, v: number, s: number) => void;

// ---------------------------------------------------------------------------
// Colours

/** Blends two sRGB hex colours; `t` = 0 gives `a`, 1 gives `b`. */
export function mix(a: number, b: number, t: number): number {
  const ch = (shift: number) =>
    Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
export const darker = (c: number, t = 0.25): number => mix(c, 0x000000, t);
export const lighter = (c: number, t = 0.25): number => mix(c, 0xffffff, t);

/** Shared palette, so every kind agrees on what glass, tyres and trim look like. */
export const PAL = {
  ink: 0x2d3142,
  chassis: 0x3a3f4b,
  metal: 0xb8c0cc,
  white: 0xf7f8fa,
  carGlass: 0x34506b,
  glass: 0x86c8ef,
  glassDeep: 0x4f86c6,
  head: 0xfff1a8,
  tail: 0xe23b3b,
  brass: 0xf2c14e,
  wood: 0xc08a55,
  bark: 0x8a5a3b,
  leaf: 0x55b35c,
  leafLight: 0x79cf6c,
  stone: 0xd9d2c5,
  stoneDark: 0xa9a293,
  brick: 0xb5523b,
  roofDeck: 0xaeb6c0,
  water: 0x5fbff0,
  waterLight: 0xa9e1fb,
} as const;

// ---------------------------------------------------------------------------
// Placement

const ONE = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);

/** Translation, then rotation (applied Z, X, then Y), then optional scale. */
export function placement(x: number, y: number, z: number, rot?: Rot, scale?: V3): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rot?.rx ?? 0, rot?.ry ?? 0, rot?.rz ?? 0, 'YXZ'),
  );
  const s = scale ? new THREE.Vector3(scale[0], scale[1], scale[2]) : ONE;
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, s);
}

// Each face: outward normal n and in-plane axes u, v with u x v = n, so the
// two triangles below wind counter-clockwise when seen from outside.
const FACES: ReadonlyArray<{ id: Face; n: V3; u: V3; v: V3 }> = [
  { id: 'px', n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  { id: 'nx', n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { id: 'py', n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] },
  { id: 'ny', n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { id: 'pz', n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { id: 'nz', n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] },
];
const QUAD: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, -1],
  [1, 1],
  [-1, 1],
];

/** A centred box as plain triangles, minus any faces nobody will see. */
function boxGeometry(w: number, h: number, d: number, omit: readonly Face[]): THREE.BufferGeometry {
  const half = [w / 2, h / 2, d / 2];
  const pos: number[] = [];
  const nor: number[] = [];
  for (const f of FACES) {
    if (omit.includes(f.id)) continue;
    for (const [su, sv] of QUAD) {
      for (let i = 0; i < 3; i++) pos.push((f.n[i] + su * f.u[i] + sv * f.v[i]) * half[i]);
      nor.push(f.n[0], f.n[1], f.n[2]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/**
 * Outline of a w/2 x h/2 rectangle with corners rounded by r, `seg` steps per
 * corner, counter-clockwise in the (a, b) plane.
 */
function roundRect(ha: number, hb: number, r: number, seg: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const corners: ReadonlyArray<readonly [number, number]> = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ];
  corners.forEach(([sa, sb], c) => {
    for (let i = 0; i <= seg; i++) {
      const a = ((c + i / seg) * Math.PI) / 2;
      pts.push([sa * (ha - r) + r * Math.cos(a), sb * (hb - r) + r * Math.sin(a)]);
    }
  });
  return pts;
}

/**
 * A rounded-rectangle panel facing +z, bottom edge on y = 0, from z = 0 to
 * `depth`. It has no back face because it always sits on a wall.
 */
function plateGeometry(w: number, h: number, r: number, depth: number, seg: number): THREE.BufferGeometry {
  const rr = Math.max(0.01, Math.min(r, Math.min(w, h) * 0.49));
  const o = roundRect(w / 2, h / 2, rr, seg).map(([a, b]) => [a, b + h / 2] as const);
  const pos: number[] = [];
  for (let i = 1; i < o.length - 1; i++) pos.push(o[0][0], o[0][1], depth, o[i][0], o[i][1], depth, o[i + 1][0], o[i + 1][1], depth);
  o.forEach((a, i) => {
    const b = o[(i + 1) % o.length];
    pos.push(a[0], a[1], 0, b[0], b[1], 0, b[0], b[1], depth);
    pos.push(a[0], a[1], 0, b[0], b[1], depth, a[0], a[1], depth);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Faces hidden when a part sits flat against a wall (local +z faces out). */
export const FLUSH: readonly Face[] = ['nz'];
/** Faces hidden when a part sits on the ground or on another part. */
export const ON_GROUND: readonly Face[] = ['ny'];

// ---------------------------------------------------------------------------
// The kit

/**
 * Collects coloured parts and merges them into one geometry. `within` pushes
 * a local frame (a wall of a building, a side of a car) so detail can be
 * written once and placed on every side.
 */
export class Kit {
  private readonly parts: THREE.BufferGeometry[] = [];
  private frame = new THREE.Matrix4();

  within(m: THREE.Matrix4, draw: () => void): void {
    const saved = this.frame;
    this.frame = saved.clone().multiply(m);
    draw();
    this.frame = saved;
  }

  /** Adds any geometry (it is flattened, stripped to position + normal, and coloured). */
  add(source: THREE.BufferGeometry, color: number, m?: THREE.Matrix4): void {
    const g = source.index ? source.toNonIndexed() : source;
    if (g !== source) source.dispose();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    }
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    g.applyMatrix4(m ? this.frame.clone().multiply(m) : this.frame);
    const c = new THREE.Color(color);
    const count = g.getAttribute('position').count;
    const rgb = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      rgb[i * 3] = c.r;
      rgb[i * 3 + 1] = c.g;
      rgb[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
    this.parts.push(g);
  }

  /** Box with its base centred on (x, y, z); rotation pivots on that base point. */
  box(
    color: number,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    rot?: Rot,
    omit: readonly Face[] = [],
  ): void {
    const g = boxGeometry(w, h, d, omit);
    g.translate(0, h / 2, 0);
    this.add(g, color, placement(x, y, z, rot));
  }

  /** Box with every edge chamfered by `b`: 44 triangles of soft toy edges. */
  cbox(
    color: number,
    w: number,
    h: number,
    d: number,
    b: number,
    x: number,
    y: number,
    z: number,
    rot?: Rot,
  ): void {
    const [hx, hy, hz] = [w / 2, h / 2, d / 2];
    const pts: THREE.Vector3[] = [];
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          pts.push(new THREE.Vector3(sx * hx, hy + sy * (hy - b), sz * (hz - b)));
          pts.push(new THREE.Vector3(sx * (hx - b), hy + sy * hy, sz * (hz - b)));
          pts.push(new THREE.Vector3(sx * (hx - b), hy + sy * (hy - b), sz * hz));
        }
      }
    }
    this.add(new ConvexGeometry(pts), color, placement(x, y, z, rot));
  }

  /**
   * Soft toy block: vertical edges rounded by r, the top edge rounded by b
   * (and the bottom edge too when `under` is set). Base centred on (x, y, z).
   * This is the main mass of every building, so they read as chunky toys
   * rather than architecture.
   */
  rbox(
    color: number,
    w: number,
    h: number,
    d: number,
    r: number,
    b: number,
    x: number,
    y: number,
    z: number,
    o: { seg?: number; ry?: number; under?: boolean } = {},
  ): void {
    const seg = o.seg ?? 2;
    const rr = Math.max(0.03, Math.min(r, w / 2 - 0.01, d / 2 - 0.01));
    const bb = Math.max(0, Math.min(b, rr - 0.02, o.under ? h / 2 - 0.01 : h - 0.01));
    // Each ring is (height, inset); two steps per rounded edge approximate a quarter circle.
    const q = bb * (1 - Math.SQRT1_2);
    const rings: Array<[number, number]> = [];
    if (o.under && bb > 0) rings.push([0, bb], [q, q], [bb, 0]);
    else rings.push([0, 0]);
    if (bb > 0) rings.push([h - bb, 0], [h - q, q], [h, bb]);
    else rings.push([h, 0]);
    const pts: THREE.Vector3[] = [];
    for (const [ry, inset] of rings) {
      for (const [a, c] of roundRect(w / 2 - inset, d / 2 - inset, rr - inset, seg)) pts.push(new THREE.Vector3(a, ry, c));
    }
    this.add(new ConvexGeometry(pts), color, placement(x, y, z, { ry: o.ry ?? 0 }));
  }

  /**
   * Rounded panel on the current wall frame (x along the wall, y up, +z out):
   * windows, doors and signs. Bottom edge at y, standing out from z by `depth`.
   */
  plate(color: number, w: number, h: number, r: number, depth: number, u: number, y: number, z = 0, seg = 1): void {
    this.add(plateGeometry(w, h, r, depth, seg), color, translate(u, y, z));
  }

  /** Cylinder or cone standing with its base centred on (x, y, z). */
  cyl(
    color: number,
    rTop: number,
    rBot: number,
    h: number,
    seg: number,
    x: number,
    y: number,
    z: number,
    o: { open?: boolean; theta?: readonly [number, number]; ry?: number } = {},
  ): void {
    const g = new THREE.CylinderGeometry(
      rTop,
      rBot,
      h,
      seg,
      1,
      o.open ?? false,
      o.theta?.[0] ?? 0,
      o.theta?.[1] ?? Math.PI * 2,
    );
    g.translate(0, h / 2, 0);
    this.add(g, color, placement(x, y, z, { ry: o.ry ?? 0 }));
  }

  /** Centred cylinder turned by `rot`: wheels ({ rz: PI/2 }), pipes, nozzles. */
  rod(color: number, r: number, len: number, seg: number, c: V3, rot: Rot = {}, rEnd = r): void {
    this.add(new THREE.CylinderGeometry(rEnd, r, len, seg), color, placement(c[0], c[1], c[2], rot));
  }

  /** A wheel with a hub, axle along x. */
  wheel(r: number, width: number, c: V3, seg = 10, hub: number = PAL.metal): void {
    this.rod(PAL.ink, r, width, seg, c, { rz: Math.PI / 2 });
    // The hub stands clear of the tyre's face, so the two never share a plane.
    this.rod(hub, r * 0.5, width + 0.1, 6, c, { rz: Math.PI / 2 });
  }

  /** Low-poly blob: canopies, bushes, flowers, scoops. */
  ico(color: number, r: number, detail: number, c: V3, scale?: V3, ry = 0): void {
    this.add(new THREE.IcosahedronGeometry(r, detail), color, placement(c[0], c[1], c[2], { ry }, scale));
  }

  /** Eight-triangle gem: tiny flowers, lamp bulbs, warning lights. */
  gem(color: number, r: number, c: V3): void {
    this.add(new THREE.OctahedronGeometry(r, 0), color, placement(c[0], c[1], c[2]));
  }

  sphere(
    color: number,
    r: number,
    c: V3,
    seg = 10,
    rings = 6,
    o: { hemi?: boolean; scale?: V3; rot?: Rot } = {},
  ): void {
    const g = new THREE.SphereGeometry(r, seg, rings, 0, Math.PI * 2, 0, o.hemi ? Math.PI / 2 : Math.PI);
    this.add(g, color, placement(c[0], c[1], c[2], o.rot, o.scale));
  }

  ring(color: number, r: number, tube: number, c: V3, rot: Rot = {}, radial = 3, tubular = 10): void {
    this.add(new THREE.TorusGeometry(r, tube, radial, tubular), color, placement(c[0], c[1], c[2], rot));
  }

  /** Convex solid around the given points: roofs, cabins, wedges, rocks. */
  hull(color: number, pts: readonly V3[]): void {
    this.add(new ConvexGeometry(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]))), color);
  }

  /** Box of cross-section t (x) by t2 (z) running from a to b: posts, struts, roof slabs. */
  beam(color: number, a: V3, b: V3, t: number, t2 = t, omit: readonly Face[] = []): void {
    const va = new THREE.Vector3(a[0], a[1], a[2]);
    const dir = new THREE.Vector3(b[0], b[1], b[2]).sub(va);
    const len = dir.length();
    const g = boxGeometry(t, len, t2, omit);
    g.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
    this.add(g, color, new THREE.Matrix4().compose(va, q, ONE));
  }

  /**
   * Solid of revolution about the y axis through (x, z). Profile points are
   * (radius, y); list them bottom-to-top along the outside, then inwards, so
   * the faces point out (the order a vase is drawn in).
   */
  lathe(color: number, profile: ReadonlyArray<readonly [number, number]>, seg: number, x = 0, z = 0): void {
    const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
    this.add(new THREE.LatheGeometry(pts, seg), color, placement(x, 0, z));
  }

  /** Striped umbrella: n wedges alternating two colours, with a short skirt. */
  canopy(colors: readonly [number, number], r: number, h: number, y: number, n: number, x = 0, z = 0): void {
    const step = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
      const c = colors[i % 2];
      this.cyl(c, r * 0.05, r, h, 2, x, y, z, { theta: [i * step, step] });
      this.cyl(c, r, r, h * 0.35, 2, x, y - h * 0.35, z, { open: true, theta: [i * step, step] });
    }
  }

  build(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
  }
}

// ---------------------------------------------------------------------------
// Building helpers

export type WallSide = 'front' | 'right' | 'back' | 'left';

/**
 * Frames for the four walls of a W x D block centred on the origin. In each
 * frame the wall face is z = 0, +z points out of the building, x runs along
 * the wall (length `len`) and y is height, so windows are written once.
 */
export function walls(W: number, D: number): Array<{ side: WallSide; len: number; m: THREE.Matrix4 }> {
  const frame = (angle: number, offset: number) =>
    new THREE.Matrix4().makeRotationY(angle).multiply(new THREE.Matrix4().makeTranslation(0, 0, offset));
  return [
    { side: 'front', len: W, m: frame(0, D / 2) },
    { side: 'right', len: D, m: frame(Math.PI / 2, W / 2) },
    { side: 'back', len: W, m: frame(Math.PI, D / 2) },
    { side: 'left', len: D, m: frame(-Math.PI / 2, W / 2) },
  ];
}

/** Centres of `count` equal cells along a wall of length `len`. */
export function cells(count: number, len: number): number[] {
  return Array.from({ length: count }, (_, i) => -len / 2 + ((i + 0.5) * len) / count);
}

export function translate(x: number, y: number, z: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeTranslation(x, y, z);
}

export interface WindowStyle {
  frame: number;
  glass: number;
  /** A horizontal glazing bar as well as the vertical one. */
  cross?: boolean;
  shutters?: number;
}

/**
 * A framed window on the current wall frame, bottom of the glass at y. The
 * glass sits proud of its frame (it cannot be carved into the wall) and the
 * sill sticks out furthest, which reads as depth under flat shading.
 */
export function windowAt(k: Kit, s: WindowStyle, u: number, y: number, w: number, h: number): void {
  k.box(s.frame, w + 0.24, h + 0.24, 0.12, u, y - 0.12, 0, undefined, FLUSH);
  k.box(s.glass, w, h, 0.16, u, y, 0, undefined, FLUSH);
  k.box(s.frame, 0.08, h, 0.2, u, y, 0, undefined, FLUSH);
  if (s.cross) k.box(s.frame, w, 0.08, 0.2, u, y + h * 0.55, 0, undefined, FLUSH);
  k.box(s.frame, w + 0.4, 0.1, 0.32, u, y - 0.16, 0, undefined, FLUSH);
  if (s.shutters !== undefined) {
    const sw = w * 0.42;
    for (const side of [-1, 1]) {
      k.box(s.shutters, sw, h + 0.1, 0.1, u + side * (w / 2 + 0.14 + sw / 2), y - 0.05, 0, undefined, FLUSH);
    }
  }
}

/**
 * A chunky rounded window on the current wall frame, bottom of the glass at
 * y: an optional soft frame, the glass, and an optional light glint in the
 * top corner so it still reads as glass from far off. `seg` is the steps per
 * rounded corner (1 is cheaper, for buildings with many windows).
 */
export function paneAt(
  k: Kit,
  glass: number,
  frame: number | null,
  u: number,
  y: number,
  w: number,
  h: number,
  glint = false,
  seg = 2,
): void {
  // One step per corner can only chamfer, so it keeps the corners small to
  // read as a rounded rectangle rather than an octagon.
  const r = Math.min(w, h) * (seg > 1 ? 0.26 : 0.16);
  if (frame !== null) k.plate(frame, w + 0.4, h + 0.4, r + 0.2, 0.1, u, y - 0.2, 0, seg);
  k.plate(glass, w, h, r, frame !== null ? 0.18 : 0.14, u, y, 0, seg);
  if (glint) k.plate(lighter(glass, 0.6), w * 0.16, h * 0.42, w * 0.08, 0.24, u - w * 0.26, y + h * 0.42);
}

/** A round-topped door on the current wall frame, standing on y. */
export function archDoor(k: Kit, frame: number, door: number, u: number, y: number, w: number, h: number): void {
  const fw = w + 0.4;
  k.plate(frame, fw, h + 0.2, fw / 2, 0.1, u, y, 0, 2);
  k.box(frame, fw, (h + 0.2) / 2, 0.1, u, y, 0, undefined, FLUSH);
  k.plate(door, w, h, w / 2, 0.18, u, y, 0, 2);
  k.box(door, w, h / 2, 0.18, u, y, 0, undefined, FLUSH);
  k.gem(PAL.brass, 0.11, [u + w * 0.28, y + h * 0.42, 0.24]);
}

/** A door on the current wall frame, standing on y. */
export function doorAt(k: Kit, frame: number, door: number, u: number, y: number, w: number, h: number): void {
  k.box(frame, w + 0.3, h + 0.15, 0.12, u, y, 0, undefined, FLUSH);
  k.box(door, w, h, 0.18, u, y, 0, undefined, FLUSH);
  k.box(PAL.glass, w * 0.5, h * 0.22, 0.22, u, y + h * 0.66, 0, undefined, FLUSH);
  k.box(PAL.brass, 0.1, 0.1, 0.3, u + w * 0.32, y + h * 0.45, 0, undefined, FLUSH);
}

/** Flat roof edge: a parapet ring of thickness t and height h around a W x D roof at y. */
export function parapet(k: Kit, color: number, W: number, D: number, y: number, h: number, t: number): void {
  for (const sz of [-1, 1]) k.box(color, W, h, t, 0, y, sz * (D / 2 - t / 2), undefined, ON_GROUND);
  for (const sx of [-1, 1]) k.box(color, t, h, D - 2 * t, sx * (W / 2 - t / 2), y, 0, undefined, ON_GROUND);
}
