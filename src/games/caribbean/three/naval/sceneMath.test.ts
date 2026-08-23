import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { assertDrawCallBudget, composeWakeMatrix, fitEngagementCamera } from './sceneMath';

const canonicalEngagement = {
  player: { x: 0, z: -36 },
  opponent: { x: 0, z: 36 },
  playerHeading: 0,
  shipRadius: 6,
  safeFraction: 0.84,
};

function cameraFor(width: number, height: number) {
  const fitted = fitEngagementCamera({ ...canonicalEngagement, width, height });
  const camera = new THREE.PerspectiveCamera(fitted.fov, width / height, 0.1, 500);
  camera.position.set(fitted.position.x, fitted.position.y, fitted.position.z);
  camera.lookAt(fitted.target.x, fitted.target.y, fitted.target.z);
  camera.updateMatrixWorld(true);
  return camera;
}

describe('naval scene visual transforms', () => {
  it('keeps a heading-zero wake flat on the water and behind world +Z travel', () => {
    const matrix = composeWakeMatrix({ x: 4, z: 7 }, 0, 5);
    const wakeTail = new THREE.Vector3(0, 0, -15).applyMatrix4(matrix);

    expect(wakeTail.x).toBeCloseTo(4, 8);
    expect(wakeTail.y).toBeCloseTo(0.09, 8);
    expect(wakeTail.z).toBeCloseTo(-8, 8);
  });

  it('turns the flat wake behind the canonical ship heading', () => {
    const matrix = composeWakeMatrix({ x: 0, z: 0 }, Math.PI / 2, 5);
    const wakeTail = new THREE.Vector3(0, 0, -15).applyMatrix4(matrix);

    expect(wakeTail.x).toBeCloseTo(-15, 8);
    expect(wakeTail.y).toBeCloseTo(0.09, 8);
    expect(wakeTail.z).toBeCloseTo(0, 8);
  });

  it('reuses the caller-owned wake matrix scratch object', () => {
    const target = new THREE.Matrix4();

    expect(composeWakeMatrix({ x: 4, z: 7 }, 0, 5, target)).toBe(target);
  });

  it.each([
    ['actual phone slot', 366, 363],
    ['tablet landscape', 1024, 768],
    ['desktop landscape', 1280, 720],
  ])('keeps canonical bounds and tactical silhouettes readable on %s', (_name, width, height) => {
    const camera = cameraFor(width, height);
    const centers = [canonicalEngagement.player, canonicalEngagement.opponent];
    const projectedCenters = centers.map((center) => new THREE.Vector3(center.x, 1.5, center.z).project(camera));
    const depths = centers.map((center) => {
      const cameraSpace = camera.worldToLocal(new THREE.Vector3(center.x, 1.5, center.z));
      return -cameraSpace.z;
    });
    const projectedRadii = centers.map((center, index) => {
      const edge = new THREE.Vector3(center.x, 7.5, center.z).project(camera);
      return Math.abs(edge.y - projectedCenters[index].y);
    });

    for (const center of centers) {
      for (const x of [-6, 6]) for (const y of [-6, 6]) for (const z of [-6, 6]) {
        const projected = new THREE.Vector3(center.x + x, 1.5 + y, center.z + z).project(camera);
        expect(Math.abs(projected.x)).toBeLessThanOrEqual(0.84);
        expect(Math.abs(projected.y)).toBeLessThanOrEqual(0.84);
        expect(projected.z).toBeLessThan(1);
      }
    }
    expect(Math.max(...depths) / Math.min(...depths)).toBeLessThanOrEqual(1.15);
    expect(projectedCenters[1].x - projectedCenters[0].x).toBeGreaterThanOrEqual(0.8);
    expect(Math.min(...projectedRadii)).toBeGreaterThanOrEqual(0.06);
    expect(Math.max(...projectedRadii) / Math.min(...projectedRadii)).toBeLessThanOrEqual(1.15);
  });

  it('uses a finite deterministic fallback when the engagement axis is near-coincident', () => {
    const input = {
      player: { x: 4, z: 7 },
      opponent: { x: 4 + Number.EPSILON, z: 7 - Number.EPSILON },
      playerHeading: Math.PI / 4,
      width: 366,
      height: 363,
      shipRadius: 6,
      safeFraction: 0.84,
    };

    expect(fitEngagementCamera(input)).toEqual(fitEngagementCamera(input));
    expect(Object.values(fitEngagementCamera(input).position).every(Number.isFinite)).toBe(true);
  });

  it('accepts the hard renderer cap and rejects the first over-budget frame', () => {
    expect(() => assertDrawCallBudget(120)).not.toThrow();
    expect(() => assertDrawCallBudget(121)).toThrow(/121.*120/);
  });
});
