import * as THREE from 'three';

interface BearingPoint {
  x: number;
  z: number;
}

export function createBearingLineGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.08, 0, 0, 0.08, 0], 3));
  geometry.setAttribute('lineDistance', new THREE.Float32BufferAttribute([0, 0], 1));
  return geometry;
}

export function updateBearingLineGeometry(
  geometry: THREE.BufferGeometry,
  player: BearingPoint,
  opponent: BearingPoint,
): void {
  const position = geometry.getAttribute('position');
  const lineDistance = geometry.getAttribute('lineDistance');
  position.setXYZ(0, player.x, 0.08, player.z);
  position.setXYZ(1, opponent.x, 0.08, opponent.z);
  lineDistance.setX(0, 0);
  lineDistance.setX(1, Math.hypot(opponent.x - player.x, opponent.z - player.z));
  position.needsUpdate = true;
  lineDistance.needsUpdate = true;
}
