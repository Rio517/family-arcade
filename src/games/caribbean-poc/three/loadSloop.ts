import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import sloopUrl from '../assets/caribbean-sloop.glb';

let sourcePromise: Promise<THREE.Group> | null = null;

function loadSource(): Promise<THREE.Group> {
  sourcePromise ??= new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(sloopUrl)
    .then((gltf) => gltf.scene);
  return sourcePromise;
}

/** Returns a resource-independent clone so scene teardown cannot poison the
 * cached source used by a later restart/remount. */
export async function createSloop(teamColor: THREE.ColorRepresentation): Promise<THREE.Group> {
  const source = await loadSource();
  const model = source.clone(true);
  model.updateMatrixWorld(true);
  const batches = new Map<string, { geometries: THREE.BufferGeometry[]; material: THREE.Material }>();
  const meshes: THREE.Mesh[] = [];
  model.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (materials.length !== 1) throw new Error(`Unexpected multi-material sloop part: ${object.name}`);
    const sourceMaterial = materials[0];
    const batch = batches.get(sourceMaterial.name) ?? {
      geometries: [],
      material: sourceMaterial.clone(),
    };
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    batch.geometries.push(geometry);
    batches.set(sourceMaterial.name, batch);
    meshes.push(mesh);
  });
  for (const mesh of meshes) mesh.removeFromParent();
  for (const [name, batch] of batches) {
    const geometry = mergeGeometries(batch.geometries, false);
    if (!geometry) throw new Error(`Could not batch sloop material: ${name}`);
    if (name === 'Signal Vermilion Team' && 'color' in batch.material) {
      (batch.material as THREE.MeshStandardMaterial).color.set(teamColor);
    }
    const mesh = new THREE.Mesh(geometry, batch.material);
    mesh.name = `Runtime_${name}`;
    mesh.castShadow = name === 'Hull Deep Sound' || name === 'Sunlit Sail';
    mesh.receiveShadow = name === 'Hull Deep Sound' || name === 'Sunlit Timber';
    model.add(mesh);
    batch.geometries.forEach((part) => part.dispose());
  }

  // Blender +Y is the authored bow; glTF maps it toward Three -Z.
  model.rotation.y = Math.PI;
  model.scale.setScalar(0.68);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y = -0.14;

  const wrapper = new THREE.Group();
  wrapper.add(model);
  return wrapper;
}
