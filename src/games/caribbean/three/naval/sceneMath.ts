import * as THREE from 'three';

import type { Point } from '../../domain/naval/types';

const position = new THREE.Vector3();
const rotation = new THREE.Quaternion();
const scale = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

export function composeWakeMatrix(point: Point, heading: number, speed: number): THREE.Matrix4 {
  position.set(point.x, 0.09, point.z);
  rotation.setFromAxisAngle(up, heading);
  scale.set(1, 1, 0.45 + Math.max(0, speed) * 0.11);
  return new THREE.Matrix4().compose(position, rotation, scale);
}
