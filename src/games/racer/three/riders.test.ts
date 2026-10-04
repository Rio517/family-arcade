import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { MOUNT_IDS, type MountId } from '../domain/mounts';
import { createRider, drawCost, type CharacterId, type RiderPose } from './riders';

const CRUISE: RiderPose = { speed: 26, bank: 0, climb: 0, tier: 0, boosting: false };

const POSES: RiderPose[] = [
  CRUISE,
  { speed: 60, bank: 1, climb: 1, tier: 3, boosting: true, wings: 1 },
  { speed: 12, bank: -1, climb: -1, tier: 1.6, boosting: false, wings: 0.4 },
  { speed: Number.NaN, bank: Number.POSITIVE_INFINITY, climb: 0, tier: -2, boosting: false, wings: Number.NaN },
];

/** Every racer as it can fly: the two who fly alone, and the two riders on each ride. */
const CAST: Array<[CharacterId, MountId | undefined]> = [
  ['unicorn', undefined],
  ['fairy', undefined],
  ...(['princess', 'bunny'] as const).flatMap((c) => MOUNT_IDS.map((m) => [c, m] as [CharacterId, MountId])),
];

/** The budget: a handful of draw calls and under 3,000 triangles, rider and ride together. */
const MIN_CALLS = 4;
const MAX_CALLS = 6;
const MAX_TRIANGLES = 3000;

/** group > tilt > bob > scaleRoot: the node whose scale carries star growth. */
const scaleRootOf = (group: THREE.Object3D): THREE.Object3D => group.children[0].children[0].children[0];

function wingsOf(group: THREE.Object3D): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  group.traverse((o) => {
    if (o.name === 'wing') out.push(o);
  });
  return out;
}

function assertFiniteTree(group: THREE.Object3D): void {
  group.updateWorldMatrix(true, true);
  group.traverse((o) => {
    for (const n of o.matrixWorld.elements) expect(Number.isFinite(n)).toBe(true);
  });
}

describe('createRider', () => {
  it.each(CAST)('%s (on %s) stays inside the draw budget, with one material', (character, mount) => {
    const rider = createRider(character, 0xff7fc4, { reducedMotion: true, seed: 1, mount });
    const { calls, triangles } = drawCost(rider.group);
    expect(calls).toBeGreaterThanOrEqual(MIN_CALLS);
    expect(calls).toBeLessThanOrEqual(MAX_CALLS);
    expect(triangles).toBeGreaterThan(500);
    expect(triangles).toBeLessThan(MAX_TRIANGLES);
    const materials = new Set<THREE.Material>();
    rider.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) materials.add(mesh.material as THREE.Material);
    });
    expect(materials.size).toBe(1);
    rider.dispose();
  });

  it.each(CAST)('%s (on %s) stays finite through every pose, a stalled tab, and a second dispose', (character, mount) => {
    for (const reducedMotion of [false, true]) {
      const rider = createRider(character, 0x6cc6ff, { reducedMotion, seed: 9, mount });
      for (const pose of POSES) {
        rider.update(1 / 60, pose);
        rider.update(Number.NaN, pose);
        assertFiniteTree(rider.group);
      }
      rider.update(5, CRUISE);
      assertFiniteTree(rider.group);
      expect(() => rider.dispose()).not.toThrow();
      expect(() => rider.dispose()).not.toThrow();
    }
  });

  it.each(CAST)('%s (on %s) has two wings on hinges that flap in mirror, and hold still under reduced motion', (character, mount) => {
    const moving = createRider(character, 0xff7fc4, { reducedMotion: false, seed: 3, mount });
    const wings = wingsOf(moving.group);
    expect(wings).toHaveLength(2);
    const before = wings[0].rotation.z;
    moving.update(0.1, { ...CRUISE, wings: 1 });
    expect(wings[0].rotation.z).not.toBeCloseTo(before, 4);
    expect(wings[1].rotation.z).toBeCloseTo(-wings[0].rotation.z, 6);
    moving.dispose();

    const still = createRider(character, 0xff7fc4, { reducedMotion: true, seed: 3, mount });
    const rest = wingsOf(still.group)[0].rotation.z;
    still.update(0.1, CRUISE);
    still.update(0.37, CRUISE);
    expect(wingsOf(still.group)[0].rotation.z).toBeCloseTo(rest, 6);
    still.dispose();
  });

  it('builds the same racer for the same seed', () => {
    const positions = (seed: number): number[] => {
      const rider = createRider('bunny', 0x6cc6ff, { reducedMotion: false, seed, mount: 'bird' });
      rider.update(1 / 60, CRUISE);
      rider.group.updateWorldMatrix(true, true);
      const list: number[] = [];
      rider.group.traverse((o) => list.push(...o.matrixWorld.elements));
      rider.dispose();
      return list;
    };
    expect(positions(6)).toEqual(positions(6));
  });

  it('two riders never share a material', () => {
    const materialsOf = (group: THREE.Object3D): THREE.Material[] => {
      const list: THREE.Material[] = [];
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) list.push(mesh.material as THREE.Material);
      });
      return list;
    };
    const a = createRider('bunny', 0xff0000, { reducedMotion: false, seed: 9 });
    const b = createRider('bunny', 0x00ff00, { reducedMotion: false, seed: 9 });
    for (const m of materialsOf(a.group)) expect(materialsOf(b.group)).not.toContain(m);
    a.dispose();
    b.dispose();
  });
});

describe('stars and power-ups', () => {
  it.each(CAST.filter(([c]) => c !== 'fairy'))('a star makes %s (on %s) bigger', (character, mount) => {
    const scaleAt = (tier: number): number => {
      const rider = createRider(character, 0xffe14a, { reducedMotion: true, seed: 1, mount });
      rider.update(1 / 60, { ...CRUISE, tier });
      const s = scaleRootOf(rider.group).scale.x;
      rider.dispose();
      return s;
    };
    expect(scaleAt(0)).toBeCloseTo(1, 6);
    expect(scaleAt(1)).toBeGreaterThan(scaleAt(0));
    expect(scaleAt(3)).toBeGreaterThan(scaleAt(1));
  });

  it('a star grows the fairy’s wings, not her', () => {
    const at = (tier: number): { body: number; wing: number } => {
      const rider = createRider('fairy', 0xa78bfa, { reducedMotion: true, seed: 5 });
      rider.update(1 / 60, { ...CRUISE, tier });
      const out = { body: scaleRootOf(rider.group).scale.x, wing: wingsOf(rider.group)[0].scale.x };
      rider.dispose();
      return out;
    };
    expect(at(3).body).toBeCloseTo(1, 6);
    expect(at(3).wing).toBeGreaterThan(at(1).wing);
    expect(at(1).wing).toBeGreaterThan(at(0).wing);
  });

  it('growth eases in over a few frames instead of snapping, unless motion is reduced', () => {
    const rider = createRider('unicorn', 0xff7fc4, { reducedMotion: false, seed: 1 });
    rider.update(1 / 60, { ...CRUISE, tier: 3 });
    const first = scaleRootOf(rider.group).scale.x;
    for (let i = 0; i < 120; i++) rider.update(1 / 60, { ...CRUISE, tier: 3 });
    expect(first).toBeLessThan(scaleRootOf(rider.group).scale.x);
    expect(scaleRootOf(rider.group).scale.x).toBeCloseTo(1.66, 2);
    rider.dispose();
  });

  it.each([
    ['unicorn', undefined],
    ['fairy', undefined],
    ['princess', 'bird'],
    ['bunny', 'unicorn'],
  ] as Array<[CharacterId, MountId | undefined]>)('the wings power-up makes %s’s wings (on %s) bigger', (character, mount) => {
    const rider = createRider(character, 0xff7fc4, { reducedMotion: true, seed: 1, mount });
    rider.update(1 / 60, CRUISE);
    const plain = wingsOf(rider.group)[0].scale.x;
    rider.update(1 / 60, { ...CRUISE, wings: 1 });
    expect(wingsOf(rider.group)[0].scale.x).toBeGreaterThan(plain * 1.5);
    rider.dispose();
  });

  it('a cloud has no wings until the wings power-up opens a pair', () => {
    const rider = createRider('bunny', 0x6cc6ff, { reducedMotion: true, seed: 1, mount: 'cloud' });
    rider.update(1 / 60, { ...CRUISE, wings: 0 });
    expect(wingsOf(rider.group).map((w) => w.visible)).toEqual([false, false]);
    rider.update(1 / 60, { ...CRUISE, wings: 1 });
    expect(wingsOf(rider.group).map((w) => w.visible)).toEqual([true, true]);
    rider.dispose();
  });
});

describe('rides', () => {
  const triangles = (character: CharacterId, mount?: MountId): number => {
    const rider = createRider(character, 0x6cc6ff, { reducedMotion: true, seed: 2, mount });
    const n = drawCost(rider.group).triangles;
    rider.dispose();
    return n;
  };

  it('keeps the usual rides: the princess on the unicorn, the bunny on a cloud', () => {
    expect(triangles('princess')).toBe(triangles('princess', 'unicorn'));
    expect(triangles('bunny')).toBe(triangles('bunny', 'cloud'));
    expect(triangles('princess', 'bird')).not.toBe(triangles('princess', 'unicorn'));
  });

  it.each(['fairy', 'unicorn'] as const)('%s flies alone, whatever ride is asked for', (character) => {
    for (const mount of MOUNT_IDS) expect(triangles(character, mount)).toBe(triangles(character));
  });

  it.each(['princess', 'bunny'] as const)('%s turns their head on a hinge of their own', (character) => {
    const rider = createRider(character, 0xffa94d, { reducedMotion: false, seed: 4 });
    const before = new Map<THREE.Object3D, number>();
    rider.group.traverse((o) => before.set(o, o.rotation.z));
    rider.update(0.4, CRUISE);
    let turned = 0;
    rider.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) return;
      if (o.name !== 'wing' && o.children.some((c) => (c as THREE.Mesh).isMesh) && o.rotation.z !== before.get(o)) turned += 1;
    });
    // The ride's head (the cloud has none) and the rider's head.
    expect(turned).toBeGreaterThanOrEqual(1);
    rider.dispose();
  });
});
