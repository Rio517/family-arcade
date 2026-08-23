import * as THREE from 'three';

import type { Point } from '../../domain/naval/types';

const position = new THREE.Vector3();
const rotation = new THREE.Quaternion();
const scale = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

export function composeWakeMatrix(
  point: Point,
  heading: number,
  speed: number,
  target = new THREE.Matrix4(),
): THREE.Matrix4 {
  position.set(point.x, 0.09, point.z);
  rotation.setFromAxisAngle(up, heading);
  scale.set(1, 1, 0.45 + Math.max(0, speed) * 0.11);
  return target.compose(position, rotation, scale);
}

export interface EngagementCameraInput {
  player: Point;
  opponent: Point;
  playerHeading: number;
  width: number;
  height: number;
  shipRadius: number;
  safeFraction: number;
}

export interface EngagementCameraFit {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  fov: number;
}

const MAX_NAVAL_DRAW_CALLS = 120;

export function assertDrawCallBudget(drawCalls: number): void {
  if (drawCalls > MAX_NAVAL_DRAW_CALLS) {
    throw new Error(`Naval renderer exceeded draw-call budget: ${drawCalls} > ${MAX_NAVAL_DRAW_CALLS}`);
  }
}

export function decayCameraShake(intensity: number, elapsed: number, enabled: boolean): number {
  if (!enabled) return 0;
  const next = Math.max(0, intensity - Math.max(0, elapsed) * 5);
  return next <= 1e-9 ? 0 : next;
}

export function writeCameraShake(
  fittedPosition: THREE.Vector3,
  fittedTarget: THREE.Vector3,
  time: number,
  intensity: number,
  positionOut: THREE.Vector3,
  targetOut: THREE.Vector3,
): THREE.Vector3 {
  positionOut.copy(fittedPosition);
  targetOut.copy(fittedTarget);
  const shake = Math.max(0, intensity) * 0.32;
  if (shake === 0) return positionOut;
  positionOut.x += Math.sin(time * 71) * shake;
  positionOut.y += Math.sin(time * 53) * shake * 0.55;
  targetOut.x += Math.sin(time * 47) * shake * 0.16;
  return positionOut;
}

export function writeShipRecoil(
  rest: THREE.Vector3,
  directionX: number,
  directionZ: number,
  intensity: number,
  output: THREE.Vector3,
): THREE.Vector3 {
  return output.set(
    rest.x + directionX * Math.max(0, intensity) * 0.32,
    rest.y,
    rest.z + directionZ * Math.max(0, intensity) * 0.32,
  );
}

export function fitEngagementCamera(
  input: EngagementCameraInput,
  output?: EngagementCameraFit,
): EngagementCameraFit {
  const width = Math.max(1, input.width);
  const height = Math.max(1, input.height);
  const aspect = width / height;
  const fov = width <= 480 ? 58 : aspect < 1 ? 55 : 48;
  const verticalHalfFov = THREE.MathUtils.degToRad(fov * 0.5);
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
  const safeFraction = THREE.MathUtils.clamp(input.safeFraction, 0.5, 0.95);
  const horizontalTangent = Math.tan(horizontalHalfFov) * safeFraction;
  const verticalTangent = Math.tan(verticalHalfFov) * safeFraction;
  const elevation = THREE.MathUtils.degToRad(58);
  const horizontal = Math.cos(elevation);
  const engagementX = input.opponent.x - input.player.x;
  const engagementZ = input.opponent.z - input.player.z;
  const engagementLength = Math.hypot(engagementX, engagementZ);
  const horizontalViewX = engagementLength > 0.001
    ? engagementZ / engagementLength
    : Math.sin(input.playerHeading);
  const horizontalViewZ = engagementLength > 0.001
    ? -engagementX / engagementLength
    : Math.cos(input.playerHeading);
  const viewX = horizontalViewX * horizontal;
  const viewY = -Math.sin(elevation);
  const viewZ = horizontalViewZ * horizontal;
  const rightLength = Math.hypot(viewZ, viewX);
  const rightX = -viewZ / rightLength;
  const rightZ = viewX / rightLength;
  const screenUpX = -rightZ * viewY;
  const screenUpY = rightZ * viewX - rightX * viewZ;
  const screenUpZ = rightX * viewY;
  const targetX = (input.player.x + input.opponent.x) * 0.5;
  const targetY = 1.5;
  const targetZ = (input.player.z + input.opponent.z) * 0.5;
  const radius = Math.max(0, input.shipRadius);
  let distance = 24;

  for (let pointIndex = 0; pointIndex < 2; pointIndex += 1) {
    const point = pointIndex === 0 ? input.player : input.opponent;
    for (let corner = 0; corner < 8; corner += 1) {
      const offsetX = point.x + (corner & 1 ? radius : -radius) - targetX;
      const offsetY = corner & 2 ? radius : -radius;
      const offsetZ = point.z + (corner & 4 ? radius : -radius) - targetZ;
      const depthOffset = offsetX * viewX + offsetY * viewY + offsetZ * viewZ;
      const horizontalOffset = offsetX * rightX + offsetZ * rightZ;
      const verticalOffset = offsetX * screenUpX + offsetY * screenUpY + offsetZ * screenUpZ;
      distance = Math.max(
        distance,
        Math.abs(horizontalOffset) / horizontalTangent - depthOffset,
        Math.abs(verticalOffset) / verticalTangent - depthOffset,
      );
    }
  }
  distance += 0.5;
  const result = output ?? {
    position: { x: 0, y: 0, z: 0 },
    target: { x: 0, y: 0, z: 0 },
    fov,
  };
  result.position.x = targetX - viewX * distance;
  result.position.y = targetY - viewY * distance;
  result.position.z = targetZ - viewZ * distance;
  result.target.x = targetX;
  result.target.y = targetY;
  result.target.z = targetZ;
  result.fov = fov;
  return result;
}
