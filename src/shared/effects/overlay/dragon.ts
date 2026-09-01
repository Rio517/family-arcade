/**
 * The Fire Dragon head, in two forms.
 *
 * `buildDragonMask()` instances the modelled mask — hand-authored in Blender,
 * exported as a GLB and meshopt-compressed into the bundle (ADR 0010: nothing
 * is fetched at runtime; the file ships and precaches like the ship meshes).
 * It carries its own rig contract in node extras: `DragonJaw` opens with the
 * tracked `jawOpen`, and `FireSocket` marks where the breath leaves the mouth.
 *
 * `buildDragonHead()` is the procedural head (ADR 0006), kept as the face worn
 * until the model arrives — and on any device where it never does.
 *
 * Both come back in the same convention: origin between the eyes, 1 unit = one
 * tracked face width, +y up, +z toward the viewer. The scene only has to place
 * the group over the face and scale it by the face's width in pixels.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import maskUrl from '../assets/fire-dragon-mask.glb';

const SCALES_GREEN = 0x3d9c50;
const BELLY_GREEN = 0x86d68f;
const HORN_CREAM = 0xf3e9c6;
const DARK = 0x1c2a1e;

/**
 * Ear to ear, in model units, of the head the mask was fitted to in Blender
 * (the wearer proxy in the review renders). Dividing by it turns the mask into
 * face widths, so it lands on a tracked face at any distance from the camera.
 */
const DESIGN_FACE_WIDTH = 1.24;

/**
 * How much head the mask is worn over, in tracked face widths. The tracker
 * measures across the face oval (MediaPipe 234↔454), which runs inside the
 * ears, so a mask cut to exactly that width sits high on the face and leaves
 * the chin out. Measured against a face on camera.
 */
const HEAD_FIT = 1.1;

/**
 * The tracked anchor is the bridge between the eyes (MediaPipe 168), a little
 * above the pupils. Dropping the mask by this many face widths lands the eye
 * holes on the eyes rather than the brows.
 */
const ANCHOR_DROP = 0.027;

/** The rig contract published by the asset, with the values it ships with. */
const JAW_NODE = 'DragonJaw';
const FIRE_SOCKET_NODE = 'FireSocket';
const EYE_NODES = ['EyeRim_L', 'EyeRim_R'];
const JAW_OPEN_RADIANS = 0.314159;

/** A dragon head ready to wear, plus the parts the scene animates. */
export interface DragonHead {
  group: THREE.Group;
  /** Rotates with `jawOpen`, or null on the procedural head. */
  jaw: THREE.Object3D | null;
  /** How far the jaw swings, in radians, when the mouth is fully open. */
  jawOpenRadians: number;
  /** Where the fire leaves the mouth, or null when there's no rig. */
  fireSocket: THREE.Object3D | null;
}

let source: THREE.Group | null = null;
let loading: Promise<void> | null = null;

/**
 * Decode the mask once for the page. Resolves either way: a missing or corrupt
 * model must never take the mirror down — the procedural head stays on.
 */
export function loadDragonMask(): Promise<void> {
  loading ??= new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(maskUrl)
    .then((gltf) => {
      source = gltf.scene;
    })
    .catch(() => {
      source = null;
    });
  return loading;
}

/**
 * One wearable copy of the mask, or null until `loadDragonMask()` has landed.
 *
 * The clone shares geometry, materials, and textures with the decoded source,
 * so the group is marked `cachedResources` — disposing it would evict the GPU
 * buffers every other dragon is drawing from.
 */
export function buildDragonMask(): DragonHead | null {
  if (!source) return null;

  const model = source.clone(true);

  // The eye rims are the mask's own read of where the wearer's eyes are, and
  // the tracker anchors on the point between them.
  const eyes = new THREE.Box3();
  for (const name of EYE_NODES) {
    const rim = model.getObjectByName(name);
    if (rim) eyes.expandByObject(rim);
  }
  const scale = HEAD_FIT / DESIGN_FACE_WIDTH;
  if (!eyes.isEmpty()) model.position.sub(eyes.getCenter(new THREE.Vector3()));
  model.position.y -= ANCHOR_DROP / scale;

  const group = new THREE.Group();
  group.add(model);
  group.scale.setScalar(scale);
  group.userData.cachedResources = true;

  const jaw = model.getObjectByName(JAW_NODE) ?? null;
  const open = jaw?.userData.open_rotation_x;

  return {
    group,
    jaw,
    jawOpenRadians: typeof open === 'number' ? open : JAW_OPEN_RADIANS,
    fireSocket: model.getObjectByName(FIRE_SOCKET_NODE) ?? null,
  };
}

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
export function buildDragonHead(rng: () => number): DragonHead {
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

  // Built around a unit head; 0.72 is the fit that reads as a mask over a face
  // of width 1 (the same job DESIGN_FACE_WIDTH does for the modelled mask).
  const group = new THREE.Group();
  group.add(head);
  group.scale.setScalar(0.72);

  return { group, jaw: null, jawOpenRadians: 0, fireSocket: null };
}
