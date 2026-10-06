/**
 * Baked scenery: many small pieces merged into one mesh, lit once.
 *
 * The sky's islands, trees and clouds never move, and the sun never moves,
 * so their light is worked out once, as each piece is added, and stored as
 * vertex colours. A whole sky cell then draws as one unlit mesh — one draw
 * call where it used to take dozens — and its colours are exactly the ones
 * picked here, untouched by tone mapping (the material sets
 * `toneMapped: false`). Colours are linear, like everything else three.js
 * keeps in a `THREE.Color`.
 */
import * as THREE from 'three';

/** Colours one vertex from where it is and which way it faces (both in world space), and its number in the piece. */
export type Paint = (out: THREE.Color, at: THREE.Vector3, normal: THREE.Vector3, i: number) => void;

/** The sun's direction: the same as the light the racers are lit by. */
export const SUN_DIR = new THREE.Vector3(80, 140, 60).normalize();

const SKY_AMBIENT = new THREE.Color(0.6, 0.66, 0.8);
const GROUND_AMBIENT = new THREE.Color(0.4, 0.38, 0.52);
const SUN_LIGHT = new THREE.Color(0.62, 0.54, 0.42);

/**
 * A matte surface in the sky's light: warm where the sun reaches it, cool
 * blue-lilac in shadow and underneath. `ao` darkens hollows and undersides.
 */
export function lit(out: THREE.Color, base: THREE.Color, n: THREE.Vector3, ao = 1): THREE.Color {
  const sun = Math.max(0, n.dot(SUN_DIR));
  const sky = 0.5 + 0.5 * n.y;
  out.r = base.r * (GROUND_AMBIENT.r + (SKY_AMBIENT.r - GROUND_AMBIENT.r) * sky + SUN_LIGHT.r * sun) * ao;
  out.g = base.g * (GROUND_AMBIENT.g + (SKY_AMBIENT.g - GROUND_AMBIENT.g) * sky + SUN_LIGHT.g * sun) * ao;
  out.b = base.b * (GROUND_AMBIENT.b + (SKY_AMBIENT.b - GROUND_AMBIENT.b) * sky + SUN_LIGHT.b * sun) * ao;
  return out;
}

/** A small seeded generator (mulberry32) for the shape of one piece. Never Math.random. */
export function seeded(seed: number): () => number {
  let a = Math.floor(seed * 4294967296) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pieces of geometry gathered into one, each moved into place and coloured. */
export class Batch {
  private pos: number[] = [];
  private col: number[] = [];
  private uv: number[] = [];
  private index: number[] = [];
  private v = new THREE.Vector3();
  private n = new THREE.Vector3();
  private c = new THREE.Color();
  private normalMatrix = new THREE.Matrix3();

  /** With `rgba`, colours carry an alpha; with `uvs`, texture coordinates. */
  constructor(private opts: { rgba?: boolean; uvs?: boolean } = {}) {}

  get empty(): boolean {
    return this.index.length === 0;
  }

  /**
   * Adds `geo` moved by `matrix`, each vertex coloured by `paint`. `warp`
   * may move a vertex after it is placed (a cloud's flat underside).
   */
  add(geo: THREE.BufferGeometry, matrix: THREE.Matrix4, paint: Paint, warp?: (at: THREE.Vector3) => void): void {
    const p = geo.getAttribute('position');
    const nrm = geo.getAttribute('normal');
    const base = this.pos.length / 3;
    this.normalMatrix.getNormalMatrix(matrix);
    for (let i = 0; i < p.count; i++) {
      this.v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      this.n.fromBufferAttribute(nrm, i).applyMatrix3(this.normalMatrix).normalize();
      if (warp) warp(this.v);
      paint(this.c, this.v, this.n, i);
      this.pos.push(this.v.x, this.v.y, this.v.z);
      if (this.opts.rgba) this.col.push(this.c.r, this.c.g, this.c.b, 1);
      else this.col.push(this.c.r, this.c.g, this.c.b);
    }
    const idx = geo.getIndex();
    if (idx) for (let i = 0; i < idx.count; i++) this.index.push(base + idx.getX(i));
    else for (let i = 0; i < p.count; i++) this.index.push(base + i);
  }

  /** Adds one vertex by hand, returning its number for `triangle`. */
  vertex(x: number, y: number, z: number, color: THREE.Color, alpha = 1, u = 0, v = 0): number {
    this.pos.push(x, y, z);
    if (this.opts.rgba) this.col.push(color.r, color.g, color.b, alpha);
    else this.col.push(color.r, color.g, color.b);
    if (this.opts.uvs) this.uv.push(u, v);
    return this.pos.length / 3 - 1;
  }

  triangle(a: number, b: number, c: number): void {
    this.index.push(a, b, c);
  }

  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, this.opts.rgba ? 4 : 3));
    if (this.opts.uvs) geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    const count = this.pos.length / 3;
    geo.setIndex(count > 65535 ? new THREE.Uint32BufferAttribute(this.index, 1) : new THREE.Uint16BufferAttribute(this.index, 1));
    return geo;
  }
}

/** The material every baked batch draws with: its own colours, fogged, not tone-mapped. */
export function bakedMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
}
