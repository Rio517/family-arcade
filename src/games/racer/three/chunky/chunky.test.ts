import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import type { RiderPose } from '../riders';
import { createChunkyRider, drawCost, type ChunkyCharacter, type ChunkyStyle } from './index';

const CASES: Array<[ChunkyStyle, ChunkyCharacter]> = [
  ['a', 'unicorn'],
  ['a', 'fairy'],
  ['b', 'unicorn'],
  ['b', 'fairy'],
];

/** The budgets the mockup promises: a handful of draw calls, few triangles. */
const MAX_CALLS = 8;
const MAX_TRIANGLES: Record<ChunkyStyle, number> = { a: 1000, b: 8000 };

const POSES: RiderPose[] = [
  { speed: 26, bank: 0, climb: 0, tier: 0, boosting: false },
  { speed: 60, bank: 1, climb: 1, tier: 3, boosting: true, wings: 1 },
  { speed: 12, bank: -1, climb: -1, tier: 1.6, boosting: false },
  { speed: Number.NaN, bank: Number.POSITIVE_INFINITY, climb: 0, tier: -2, boosting: false },
];

function wingPivots(group: THREE.Object3D): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  group.traverse((o) => {
    if (o.rotation.order === 'YXZ') out.push(o);
  });
  return out;
}

describe('chunky riders', () => {
  it.each(CASES)('style %s %s stays inside the draw budget', (style, character) => {
    const rider = createChunkyRider(style, character, 0xff7fc4, { reducedMotion: true, seed: 1 });
    const { calls, triangles } = drawCost(rider.group);
    expect(calls).toBeGreaterThanOrEqual(4);
    expect(calls).toBeLessThanOrEqual(MAX_CALLS);
    expect(triangles).toBeGreaterThan(100);
    expect(triangles).toBeLessThanOrEqual(MAX_TRIANGLES[style]);
    rider.dispose();
  });

  it.each(CASES)('style %s %s shares at most two materials across every part', (style, character) => {
    const rider = createChunkyRider(style, character, 0xa78bfa, { reducedMotion: true, seed: 1 });
    const mats = new Set<THREE.Material>();
    rider.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mats.add(mesh.material as THREE.Material);
    });
    expect(mats.size).toBeLessThanOrEqual(style === 'a' ? 1 : 2);
    rider.dispose();
  });

  it.each(CASES)('style %s %s has two wings on hinges that flap, and hold still under reduced motion', (style, character) => {
    const moving = createChunkyRider(style, character, 0xff7fc4, { reducedMotion: false, seed: 3 });
    const wings = wingPivots(moving.group);
    expect(wings).toHaveLength(2);
    const before = wings[0].rotation.z;
    moving.update(0.1, POSES[0]);
    expect(wings[0].rotation.z).not.toBeCloseTo(before, 4);
    // The two wings mirror each other.
    expect(wings[1].rotation.z).toBeCloseTo(-wings[0].rotation.z, 6);
    moving.dispose();

    const still = createChunkyRider(style, character, 0xff7fc4, { reducedMotion: true, seed: 3 });
    const rest = wingPivots(still.group)[0].rotation.z;
    still.update(0.1, POSES[0]);
    still.update(0.37, POSES[0]);
    expect(wingPivots(still.group)[0].rotation.z).toBeCloseTo(rest, 6);
    still.dispose();
  });

  it.each(CASES)('style %s %s stays finite through every pose', (style, character) => {
    for (const reducedMotion of [false, true]) {
      const rider = createChunkyRider(style, character, 0x6cc6ff, { reducedMotion, seed: 9 });
      for (const pose of POSES) {
        rider.update(1 / 60, pose);
        rider.update(Number.NaN, pose);
        rider.group.updateWorldMatrix(true, true);
        rider.group.traverse((o) => {
          for (const n of o.matrixWorld.elements) expect(Number.isFinite(n)).toBe(true);
        });
      }
      rider.dispose();
    }
  });

  it('a wings power-up makes the wings bigger', () => {
    const rider = createChunkyRider('b', 'unicorn', 0xff7fc4, { reducedMotion: true, seed: 1 });
    rider.update(0.016, { ...POSES[0], wings: 1 });
    for (const w of wingPivots(rider.group)) expect(w.scale.x).toBeGreaterThan(1.5);
    rider.dispose();
  });
});
