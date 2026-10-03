/**
 * The toolbox the chunky racers are built with. A character is a handful of
 * rigid parts (body, head, each wing, the tail), and each part is a pile of
 * boxes, rounded blocks and balls with one flat colour apiece. A part merges
 * into one vertex-coloured geometry per finish, so it draws in one call (two
 * when it has glossy bits such as eyes), whatever it is made of.
 *
 * Framework-free and renderer-free, like riders.ts, so a character builds in
 * jsdom and its budgets can be tested.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type V3 = readonly [number, number, number];

export interface Rot {
  rx?: number;
  ry?: number;
  rz?: number;
}

/** Matte for almost everything; gloss for eyes and the horn, so they catch the light. */
export type Finish = 'matte' | 'gloss';

const ONE: V3 = [1, 1, 1];

/** Translation, then rotation (Y, X, then Z, as Euler 'YXZ'), then scale. */
export function place(at: V3, rot: Rot = {}, scale: V3 = ONE): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot.rx ?? 0, rot.ry ?? 0, rot.rz ?? 0, 'YXZ'));
  return new THREE.Matrix4().compose(
    new THREE.Vector3(at[0], at[1], at[2]),
    q,
    new THREE.Vector3(scale[0], scale[1], scale[2]),
  );
}

/** Mirror a point across the body's centre line: side is +1 (left, +x) or -1. */
export const sx = (side: number, p: V3): V3 => [p[0] * side, p[1], p[2]];

/**
 * Collects coloured pieces for one rigid part. `within` pushes a local frame
 * (a leg's hip, a wing's root) so a run of pieces can be written once in that
 * frame.
 */
export class Part {
  private pieces: Record<Finish, THREE.BufferGeometry[]> = { matte: [], gloss: [] };
  private frame = new THREE.Matrix4();

  within(m: THREE.Matrix4, draw: () => void): void {
    const saved = this.frame;
    this.frame = saved.clone().multiply(m);
    draw();
    this.frame = saved;
  }

  /** Adds any geometry, flattened to position + normal + one colour. */
  add(source: THREE.BufferGeometry, color: number, m: THREE.Matrix4, finish: Finish = 'matte'): void {
    const g = source.index ? source.toNonIndexed() : source;
    if (g !== source) source.dispose();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    }
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    g.applyMatrix4(this.frame.clone().multiply(m));
    const c = new THREE.Color(color);
    const count = g.getAttribute('position').count;
    const rgb = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      rgb[i * 3] = c.r;
      rgb[i * 3 + 1] = c.g;
      rgb[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
    this.pieces[finish].push(g);
  }

  /** A hard-edged box centred on `at`. */
  box(color: number, size: V3, at: V3, rot?: Rot, finish?: Finish): void {
    this.add(new THREE.BoxGeometry(size[0], size[1], size[2]), color, place(at, rot), finish);
  }

  /** A box with rounded edges of radius `r`, centred on `at`. */
  rbox(color: number, size: V3, r: number, at: V3, rot?: Rot, o: { seg?: number; finish?: Finish } = {}): void {
    const geo = new RoundedBoxGeometry(size[0], size[1], size[2], o.seg ?? 2, r);
    this.add(geo, color, place(at, rot), o.finish);
  }

  /** A ball, squashed by `scale` into an egg, a disc or a lens. */
  ball(
    color: number,
    r: number,
    at: V3,
    o: { scale?: V3; rot?: Rot; seg?: readonly [number, number]; finish?: Finish; hemi?: boolean } = {},
  ): void {
    const [w, h] = o.seg ?? [10, 6];
    const geo = new THREE.SphereGeometry(r, w, h, 0, Math.PI * 2, 0, o.hemi ? Math.PI / 2 : Math.PI);
    this.add(geo, color, place(at, o.rot, o.scale ?? ONE), o.finish);
  }

  /** A pill along local y: limbs, feathers, petals. `scale` flattens it. */
  pill(color: number, r: number, len: number, at: V3, o: { rot?: Rot; scale?: V3; finish?: Finish; seg?: number } = {}): void {
    const geo = new THREE.CapsuleGeometry(r, len, 2, o.seg ?? 8);
    this.add(geo, color, place(at, o.rot, o.scale ?? ONE), o.finish);
  }

  /** A cone or cylinder along local y, centred on `at`. */
  cone(color: number, rTop: number, rBot: number, h: number, seg: number, at: V3, rot?: Rot, finish?: Finish): void {
    this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg), color, place(at, rot), finish);
  }

  /** Part of a ring in the local xy plane, from angle 0 to `arc`: curls of mane and tail. */
  curl(color: number, radius: number, tube: number, arc: number, at: V3, o: { rot?: Rot; scale?: V3; finish?: Finish } = {}): void {
    const geo = new THREE.TorusGeometry(radius, tube, 4, Math.max(4, Math.round(arc * 2)), arc);
    this.add(geo, color, place(at, o.rot, o.scale ?? ONE), o.finish);
  }

  /** One merged geometry per finish that has pieces. */
  build(): Partial<Record<Finish, THREE.BufferGeometry>> {
    const out: Partial<Record<Finish, THREE.BufferGeometry>> = {};
    for (const finish of ['matte', 'gloss'] as const) {
      const list = this.pieces[finish];
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      for (const p of list) p.dispose();
      list.length = 0;
      merged.computeBoundingSphere();
      out[finish] = merged;
    }
    return out;
  }
}

/** The pieces of one character, each a rigid part on its own hinge. */
export interface Figure {
  body: Part;
  head: Part;
  /** Index 0 is the left wing (+x), 1 the right. */
  wings: [Part, Part];
  tail?: Part;
  /** Where each hinge sits, in the body's frame. */
  pivots: { head: V3; wings: [V3, V3]; tail?: V3 };
  /** The wings' resting lift (radians about the body's long axis), and how far a flap swings. */
  wingRest: number;
  flapAmp: number;
  /** Fixed forward lean of the whole figure in flight (radians, head forward), about the height `leanAbout`. */
  lean: number;
  leanAbout: number;
  /** Counter-tilt on the head so the face still looks ahead while the body leans. */
  headLift: number;
}
