import * as THREE from 'three';

/**
 * Free every geometry, material, and texture under `root`. Only safe when the
 * subtree owns its resources (a scene at teardown, marks rebuilt per update) —
 * meshes that share another subtree's geometry must not pass through here.
 *
 * Imported only by the lazy-loaded 3D scenes, so it lives in their chunk and
 * never drags three.js into the eager bundle.
 */
export function disposeDeep(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const m of mats) {
      (m as THREE.MeshStandardMaterial).map?.dispose();
      m.dispose();
    }
  });
}
