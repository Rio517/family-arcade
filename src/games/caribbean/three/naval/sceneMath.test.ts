import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { normalizeAngle } from '../../domain/naval/geometry';

import {
  assertDrawCallBudget,
  composeWakeMatrix,
  dampAngle,
  dampScalar,
  decayCameraShake,
  fitEngagementCamera,
  NAVAL_PRESENTATION_RESPONSE,
  settleShipRecoilForReducedMotion,
  writeDampedPose,
  writeCameraShake,
  writeShipRecoil,
} from './sceneMath';

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
  it('moves a render pose part-way toward a new snapshot in one 60 Hz frame', () => {
    const output = { x: 0, z: 0, heading: 0 };

    expect(writeDampedPose(output, { x: 12, z: -6, heading: 1 }, 1 / 60, false, output)).toBe(output);
    expect(output.x).toBeGreaterThan(0);
    expect(output.x).toBeLessThan(12);
    expect(output.z).toBeLessThan(0);
    expect(output.z).toBeGreaterThan(-6);
    expect(output.heading).toBeGreaterThan(0);
    expect(output.heading).toBeLessThan(1);
  });

  it('is exponentially partition-invariant for scalar presentation motion', () => {
    const oneFrame = dampScalar(0, 10, 1 / 30);
    const twoFrames = dampScalar(dampScalar(0, 10, 1 / 60), 10, 1 / 60);

    expect(twoFrames).toBeCloseTo(oneFrame, 12);
  });

  it.each([
    [Math.PI - 0.04, -Math.PI + 0.04, 1],
    [-Math.PI + 0.04, Math.PI - 0.04, -1],
  ])('takes the shortest heading path across the wrap boundary', (current, target, direction) => {
    const next = dampAngle(current, target, 1 / 60);
    const travelled = normalizeAngle(next - current);

    expect(Math.sign(travelled)).toBe(direction);
    expect(Math.abs(travelled)).toBeLessThan(0.08);
  });

  it('stays finite for zero, negative, non-finite, and clamped-large frame deltas', () => {
    const values = [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 5].map((delta) => (
      dampScalar(2, 9, delta)
    ));

    expect(values.every(Number.isFinite)).toBe(true);
    expect(values[0]).toBe(2);
    expect(values[1]).toBe(2);
    expect(values[2]).toBe(2);
    expect(values[3]).toBe(2);
    expect(values[4]).toBeCloseTo(dampScalar(2, 9, 0.1), 12);
  });

  it('snaps exactly under reduced motion and reuses the caller-owned output', () => {
    const current = { x: -4, z: 3, heading: Math.PI - 0.2 };
    const target = { x: 8, z: -7, heading: -Math.PI + 0.2 };
    const output = { x: 0, z: 0, heading: 0 };

    expect(writeDampedPose(current, target, 1 / 60, true, output)).toBe(output);
    expect(output).toEqual(target);
  });

  it('converges inside the locked 250 ms presentation-lag bound', () => {
    let x = 0;
    let heading = 0;
    for (let frame = 0; frame < 15; frame += 1) {
      x = dampScalar(x, 1, 1 / 60);
      heading = dampAngle(heading, 0.1, 1 / 60);
    }

    expect(NAVAL_PRESENTATION_RESPONSE).toBeGreaterThan(0);
    expect(Math.abs(1 - x)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(0.1 - heading)).toBeLessThanOrEqual(0.002);
  });

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

  it('writes deterministic camera shake into reusable scratch vectors and decays to exact fitted restore', () => {
    const fittedPosition = new THREE.Vector3(3, 31, 42);
    const fittedTarget = new THREE.Vector3(2, 1.5, 4);
    const positionScratch = new THREE.Vector3();
    const targetScratch = new THREE.Vector3();

    expect(writeCameraShake(fittedPosition, fittedTarget, 0.125, 1, positionScratch, targetScratch)).toBe(positionScratch);
    expect(positionScratch.equals(fittedPosition)).toBe(false);
    const expectedPosition = positionScratch.clone();
    const expectedTarget = targetScratch.clone();
    writeCameraShake(fittedPosition, fittedTarget, 0.125, 1, positionScratch, targetScratch);
    expect(positionScratch).toEqual(expectedPosition);
    expect(targetScratch).toEqual(expectedTarget);

    let intensity = 1;
    for (let frame = 0; frame < 12; frame += 1) intensity = decayCameraShake(intensity, 1 / 60, true);
    expect(intensity).toBe(0);
    writeCameraShake(fittedPosition, fittedTarget, 1, intensity, positionScratch, targetScratch);
    expect(positionScratch).toEqual(fittedPosition);
    expect(targetScratch).toEqual(fittedTarget);
  });

  it('restores the exact fitted camera under reduced motion while ship recoil remains independent', () => {
    const fittedPosition = new THREE.Vector3(3, 31, 42);
    const fittedTarget = new THREE.Vector3(2, 1.5, 4);
    const cameraScratch = new THREE.Vector3();
    const targetScratch = new THREE.Vector3();
    const recoilScratch = new THREE.Vector3();
    const modelRest = new THREE.Vector3(1, 2, 3);

    expect(decayCameraShake(1, 0, false)).toBe(0);
    writeCameraShake(fittedPosition, fittedTarget, 0.125, 0, cameraScratch, targetScratch);
    expect(cameraScratch).toEqual(fittedPosition);
    expect(targetScratch).toEqual(fittedTarget);
    expect(writeShipRecoil(modelRest, -1, 0, 1, recoilScratch)).toBe(recoilScratch);
    expect(recoilScratch.x).toBeCloseTo(0.68, 12);
    expect(recoilScratch.y).toBe(2);
    expect(recoilScratch.z).toBe(3);
  });

  it('restores active recoil before the next frame when reduced motion changes live and permits future recoil after disabling it', () => {
    const rest = new THREE.Vector3(1, 2, 3);
    const modelPosition = new THREE.Vector3();
    writeShipRecoil(rest, -1, 0.5, 1, modelPosition);
    expect(modelPosition.equals(rest)).toBe(false);

    let recoil = settleShipRecoilForReducedMotion(true, 1, rest, modelPosition);
    expect(recoil).toBe(0);
    expect(modelPosition).toEqual(rest);
    for (let frame = 0; frame < 4; frame += 1) {
      writeShipRecoil(rest, -1, 0.5, recoil, modelPosition);
      expect(modelPosition).toEqual(rest);
    }

    recoil = settleShipRecoilForReducedMotion(false, recoil, rest, modelPosition);
    expect(recoil).toBe(0);
    recoil = 1;
    writeShipRecoil(rest, -1, 0.5, recoil, modelPosition);
    expect(modelPosition.equals(rest)).toBe(false);
  });
});
