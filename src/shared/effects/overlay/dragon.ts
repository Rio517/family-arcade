/**
 * The Fire Dragon head — procedural three.js geometry (ADR 0006: spheres,
 * cones, and boxes; no fetched models). Built front-facing in a unit space
 * (head radius ≈ 1, +y up, +z toward the viewer); the scene positions and
 * scales the group over the tracked face so it wears like a mask.
 */

import * as THREE from 'three';

const SCALES_GREEN = 0x3d9c50;
const BELLY_GREEN = 0x86d68f;
const HORN_CREAM = 0xf3e9c6;
const DARK = 0x1c2a1e;

function part(
  geometry: THREE.BufferGeometry,
  color: number,
  parent: THREE.Object3D,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color }));
  parent.add(mesh);
  return mesh;
}

/**
 * `rng` (seeded, ADR 0005) adds tiny per-dragon asymmetries — horn tilt, eye
 * ridge angle — so two kids in frame get subtly different dragons.
 */
export function buildDragonHead(rng: () => number): THREE.Group {
  const head = new THREE.Group();
  const jitter = () => (rng() - 0.5) * 0.12;

  const cranium = part(new THREE.SphereGeometry(1, 24, 18), SCALES_GREEN, head);
  cranium.scale.set(1.12, 1.0, 0.85);

  // Snout: a squashed sphere pushed toward the viewer, lighter belly colour.
  const snout = part(new THREE.SphereGeometry(1, 20, 14), BELLY_GREEN, head);
  snout.scale.set(0.6, 0.42, 0.52);
  snout.position.set(0, -0.5, 0.62);

  for (const side of [-1, 1]) {
    const nostril = part(new THREE.SphereGeometry(0.07, 10, 8), DARK, head);
    nostril.position.set(side * 0.2, -0.38, 1.06);

    const eye = part(new THREE.SphereGeometry(0.2, 14, 12), 0xffffff, head);
    eye.position.set(side * 0.42, 0.18, 0.72);
    const pupil = part(new THREE.SphereGeometry(0.09, 10, 8), DARK, head);
    pupil.position.set(side * 0.44, 0.18, 0.9);

    // Brow ridge, tilted a touch differently per dragon.
    const brow = part(new THREE.BoxGeometry(0.42, 0.12, 0.22), SCALES_GREEN, head);
    brow.position.set(side * 0.42, 0.42, 0.68);
    brow.rotation.z = side * (0.35 + jitter());

    const horn = part(new THREE.ConeGeometry(0.16, 0.62, 10), HORN_CREAM, head);
    horn.position.set(side * 0.5, 1.0, -0.05);
    horn.rotation.z = -side * (0.5 + jitter());

    // Ear frill: a flattened cone behind the horn.
    const frill = part(new THREE.ConeGeometry(0.22, 0.5, 8), BELLY_GREEN, head);
    frill.scale.z = 0.3;
    frill.position.set(side * 0.95, 0.45, -0.15);
    frill.rotation.z = -side * 1.15;
  }

  // A short row of back spikes peeking over the top of the head.
  for (let i = 0; i < 3; i++) {
    const spike = part(new THREE.ConeGeometry(0.11, 0.34, 8), HORN_CREAM, head);
    spike.position.set((i - 1) * 0.34, 1.02 - Math.abs(i - 1) * 0.12, -0.4);
  }

  return head;
}
