import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import sloopUrl from '../../assets/caribbean-sloop.glb';

export type SloopSourceLoader = () => Promise<THREE.Group>;

let sourcePromise: Promise<THREE.Group> | null = null;

function bundledSource(): Promise<THREE.Group> {
  if (!sourcePromise) {
    sourcePromise = new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .loadAsync(sloopUrl)
      .then(({ scene }) => scene)
      .catch((error: unknown) => {
        sourcePromise = null;
        throw error;
      });
  }
  return sourcePromise;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Creates a material-batched sloop whose geometry and materials belong only to
 * this returned group. The cached decoded source stays immutable, so disposing
 * one battle cannot damage a later retry or rematch.
 */
export async function createSloop(
  teamColor: THREE.ColorRepresentation,
  sourceLoader: SloopSourceLoader = bundledSource,
): Promise<THREE.Group> {
  let source: THREE.Group;
  try {
    source = await sourceLoader();
  } catch (error) {
    throw new Error(`Bundled Caribbean sloop failed to load: ${errorMessage(error)}`);
  }

  const model = source.clone(true);
  model.updateMatrixWorld(true);
  const batches = new Map<string, {
    geometries: THREE.BufferGeometry[];
    material: THREE.Material;
  }>();
  const sourceMeshes: THREE.Mesh[] = [];

  model.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (materials.length !== 1) {
      throw new Error(`Unexpected multi-material sloop part: ${object.name}`);
    }

    const sourceMaterial = materials[0];
    const batch = batches.get(sourceMaterial.name) ?? {
      geometries: [],
      material: sourceMaterial.clone(),
    };
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    batch.geometries.push(geometry);
    batches.set(sourceMaterial.name, batch);
    sourceMeshes.push(mesh);
  });

  for (const mesh of sourceMeshes) mesh.removeFromParent();
  for (const [name, batch] of batches) {
    const geometry = mergeGeometries(batch.geometries, false);
    batch.geometries.forEach((part) => part.dispose());
    if (!geometry) {
      batch.material.dispose();
      throw new Error(`Could not batch sloop material: ${name}`);
    }
    if (name === 'Signal Vermilion Team' && 'color' in batch.material) {
      (batch.material as THREE.MeshStandardMaterial).color.set(teamColor);
    }
    const mesh = new THREE.Mesh(geometry, batch.material);
    mesh.name = `Runtime_${name}`;
    mesh.castShadow = name === 'Hull Deep Sound' || name === 'Sunlit Sail';
    mesh.receiveShadow = name === 'Hull Deep Sound' || name === 'Sunlit Timber';
    model.add(mesh);
  }

  // Blender +Y is the authored bow; glTF maps it toward Three -Z.
  model.rotation.y = Math.PI;
  model.scale.setScalar(0.68);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -0.14, -center.z);
  model.name = 'Caribbean_Sloop_Runtime';
  return model;
}
