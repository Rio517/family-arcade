import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { assertDrawCallBudget, composeWakeMatrix, fitEngagementCamera } from './sceneMath';

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
  ])('fits both ship bounds inside the safe frustum on %s', (_name, width, height) => {
    const fitted = fitEngagementCamera({
      player: { x: -12, z: -18 },
      opponent: { x: 25, z: 11 },
      playerHeading: Math.PI / 3,
      width,
      height,
      shipRadius: 6,
      safeFraction: 0.84,
    });
    const camera = new THREE.PerspectiveCamera(fitted.fov, width / height, 0.1, 500);
    camera.position.set(fitted.position.x, fitted.position.y, fitted.position.z);
    camera.lookAt(fitted.target.x, fitted.target.y, fitted.target.z);
    camera.updateMatrixWorld(true);

    for (const center of [{ x: -12, z: -18 }, { x: 25, z: 11 }]) {
      for (const x of [-6, 6]) for (const y of [-6, 6]) for (const z of [-6, 6]) {
        const projected = new THREE.Vector3(center.x + x, 1.5 + y, center.z + z).project(camera);
        expect(Math.abs(projected.x)).toBeLessThanOrEqual(0.84);
        expect(Math.abs(projected.y)).toBeLessThanOrEqual(0.84);
        expect(projected.z).toBeLessThan(1);
      }
    }
  });

  it('accepts the hard renderer cap and rejects the first over-budget frame', () => {
    expect(() => assertDrawCallBudget(120)).not.toThrow();
    expect(() => assertDrawCallBudget(121)).toThrow(/121.*120/);
  });
});
