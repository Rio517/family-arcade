/**
 * What the city throws at the hole, each its own toy: a bomber's cartoon bomb,
 * a helicopter's rocket and a tank's big brass shell. Procedural, flat-shaded
 * and merged into one vertex-coloured geometry per kind (the rocket's flame is
 * a separate shared child so it can flicker). Every model points along +Y.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Part = THREE.BufferGeometry;

const SIDES = 8;

function paint(geo: Part, color: number): Part {
  const c = new THREE.Color(color);
  const n = geo.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function lathe(profile: Array<[number, number]>, color: number): Part {
  return paint(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), SIDES), color);
}

function cyl(rTop: number, rBottom: number, h: number, y: number, color: number): Part {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, SIDES);
  g.translate(0, y, 0);
  return paint(g, color);
}

function box(w: number, h: number, d: number, y: number, color: number): Part {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, y, 0);
  return paint(g, color);
}

function merge(parts: Part[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return g;
}

/** Teardrop body, a yellow band near the nose, a red cross of fins in a ring. */
function buildBomb(): THREE.BufferGeometry {
  const ring = new THREE.TorusGeometry(0.6, 0.06, 4, 12);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, -1.0, 0);
  return merge([
    lathe(
      [
        [0, -1.3],
        [0.26, -1.25],
        [0.36, -0.8],
        [0.5, -0.2],
        [0.57, 0.4],
        [0.48, 0.9],
        [0.28, 1.22],
        [0, 1.32],
      ],
      0x4d5d78,
    ),
    cyl(0.5, 0.56, 0.26, 0.75, 0xffc933),
    box(1.2, 0.7, 0.08, -1.0, 0xe23b2e),
    box(0.08, 0.7, 1.2, -1.0, 0xe23b2e),
    paint(ring, 0xb82a20),
  ]);
}

/** Slim white body, red cone nose, four red tail fins, a dark nozzle. */
function buildRocket(): THREE.BufferGeometry {
  const nose = new THREE.ConeGeometry(0.34, 0.9, SIDES);
  nose.translate(0, 1.15, 0);
  return merge([
    cyl(0.34, 0.34, 1.7, -0.1, 0xeef1f6),
    paint(nose, 0xe23b2e),
    cyl(0.36, 0.36, 0.2, 0.7, 0xe23b2e),
    cyl(0.26, 0.3, 0.25, -1.05, 0x3a3d45),
    box(1.3, 0.62, 0.07, -0.72, 0xe23b2e),
    box(0.07, 0.62, 1.3, -0.72, 0xe23b2e),
  ]);
}

/** Brass casing, copper ogive tip, a darker rim at the base. */
function buildShell(): THREE.BufferGeometry {
  return merge([
    cyl(0.5, 0.5, 1.7, -0.35, 0xd9a441),
    cyl(0.6, 0.6, 0.2, -1.2, 0xa87420),
    cyl(0.54, 0.54, 0.14, 0.45, 0x8a4b22),
    lathe(
      [
        [0.5, 0.5],
        [0.47, 0.8],
        [0.37, 1.15],
        [0.19, 1.45],
        [0, 1.62],
      ],
      0xb5622b,
    ),
  ]);
}

/** Orange outer flame with a yellow core; the origin is the nozzle, it points down -Y. */
function buildFlame(): THREE.BufferGeometry {
  const outer = new THREE.ConeGeometry(0.26, 1.1, 6);
  outer.rotateX(Math.PI);
  outer.translate(0, -0.55, 0);
  const core = new THREE.ConeGeometry(0.13, 0.6, 6);
  core.rotateX(Math.PI);
  core.translate(0, -0.3, 0);
  return merge([paint(outer, 0xff7a1a), paint(core, 0xffe066)]);
}

const dir = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class ProjectileKit {
  readonly bombGeo = buildBomb();
  readonly rocketGeo = buildRocket();
  readonly shellGeo = buildShell();
  private flameGeo = buildFlame();
  private mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55, metalness: 0.1 });
  private flameMat = new THREE.MeshBasicMaterial({ vertexColors: true });

  /** One of each, for the shader warm-up. */
  warmMeshes(): THREE.Mesh[] {
    return [this.make('bomber'), this.make('heli'), this.make('tank')];
  }

  make(kind: 'bomber' | 'heli' | 'tank'): THREE.Mesh {
    const mesh = new THREE.Mesh(kind === 'bomber' ? this.bombGeo : kind === 'heli' ? this.rocketGeo : this.shellGeo, this.mat);
    mesh.castShadow = true;
    if (kind === 'heli') {
      const flame = new THREE.Mesh(this.flameGeo, this.flameMat);
      flame.name = 'flame';
      flame.position.y = -1.1;
      mesh.add(flame);
    }
    return mesh;
  }

  /** Nose straight down, as a bomb falls. */
  pointDown(mesh: THREE.Mesh): void {
    mesh.rotation.set(Math.PI, 0, 0);
  }

  /** Nose along a direction of travel (need not be normalised). */
  pointAlong(mesh: THREE.Mesh, dx: number, dy: number, dz: number): void {
    dir.set(dx, dy, dz).normalize();
    mesh.quaternion.setFromUnitVectors(UP, dir);
  }

  /** Flicker a rocket's flame; steady when motion is reduced. */
  flicker(mesh: THREE.Mesh, time: number, phase: number, reduced: boolean): void {
    const flame = mesh.children[0];
    if (!flame) return;
    flame.scale.set(1, reduced ? 1 : 0.8 + 0.35 * Math.sin(time * 40 + phase) * Math.cos(time * 23 + phase * 2), 1);
  }

  dispose(): void {
    this.bombGeo.dispose();
    this.rocketGeo.dispose();
    this.shellGeo.dispose();
    this.flameGeo.dispose();
    this.mat.dispose();
    this.flameMat.dispose();
  }
}
