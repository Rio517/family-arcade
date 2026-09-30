import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { MOUNT_IDS, type MountId } from '../domain/mounts';
import { createRider, preloadRiderAssets, type CharacterId, type RiderPose } from './riders';

const CHARACTERS: CharacterId[] = ['fairy', 'princess', 'unicorn', 'bunny'];

const CRUISE: RiderPose = { speed: 26, bank: 0, climb: 0, tier: 0, boosting: false };

function poses(): RiderPose[] {
  return [
    { speed: 26, bank: 0, climb: 0, tier: 0, boosting: false },
    { speed: 60, bank: 1, climb: 1, tier: 3, boosting: true },
    { speed: 12, bank: -1, climb: -1, tier: 1.6, boosting: false },
    { speed: 0, bank: 0, climb: 0, tier: 3, boosting: true },
  ];
}

/** Every world-space number under `group` must stay finite (no NaN/Infinity
 *  from a bad rotation/scale slipping through). */
function assertFiniteTree(group: THREE.Object3D): void {
  group.updateWorldMatrix(true, true);
  group.traverse((o) => {
    for (const v of [o.position, o.scale]) {
      expect(Number.isFinite(v.x)).toBe(true);
      expect(Number.isFinite(v.y)).toBe(true);
      expect(Number.isFinite(v.z)).toBe(true);
    }
    expect(Number.isFinite(o.rotation.x)).toBe(true);
    expect(Number.isFinite(o.rotation.y)).toBe(true);
    expect(Number.isFinite(o.rotation.z)).toBe(true);
    const m = o.matrixWorld.elements;
    for (const n of m) expect(Number.isFinite(n)).toBe(true);
  });
}

function countMeshes(group: THREE.Object3D): number {
  let n = 0;
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) n++;
  });
  return n;
}

describe('createRider', () => {
  it.each(CHARACTERS)('%s builds a non-empty group without WebGL', (character) => {
    const rider = createRider(character, 0xff5d8f, { reducedMotion: false, seed: 7 });
    expect(rider.group).toBeInstanceOf(THREE.Group);
    expect(countMeshes(rider.group)).toBeGreaterThan(0);
    rider.dispose();
  });

  it.each(CHARACTERS)('%s update() runs every pose (including reducedMotion) without throwing and stays finite', (character) => {
    for (const reducedMotion of [false, true]) {
      const rider = createRider(character, 0x4aa3ff, { reducedMotion, seed: 42 });
      for (const pose of poses()) {
        expect(() => rider.update(1 / 60, pose)).not.toThrow();
        assertFiniteTree(rider.group);
      }
      // A large dt (tab was backgrounded) must not blow up the easing.
      expect(() => rider.update(5, CRUISE)).not.toThrow();
      assertFiniteTree(rider.group);
      rider.dispose();
    }
  });

  it.each(CHARACTERS)('%s dispose() runs cleanly and repeatedly', (character) => {
    const rider = createRider(character, 0x9b6bff, { reducedMotion: false, seed: 3 });
    rider.update(1 / 60, CRUISE);
    expect(() => rider.dispose()).not.toThrow();
    // A second dispose (e.g. an unmount race) must not throw either.
    expect(() => rider.dispose()).not.toThrow();
  });

  /** group > tilt > bob > scaleRoot (see `makeRig`) — the node whose own
   *  `.scale` carries tier growth for every character but the fairy. */
  function scaleRootOf(group: THREE.Object3D): THREE.Object3D {
    return group.children[0].children[0].children[0];
  }

  it.each(['unicorn', 'bunny'] as const)('%s tier growth increases overall scale', (character) => {
    const low = createRider(character, 0xffe14a, { reducedMotion: true, seed: 1 });
    low.update(1 / 60, { ...CRUISE, tier: 0 });
    const lowScale = scaleRootOf(low.group).scale.x;
    low.dispose();

    const high = createRider(character, 0xffe14a, { reducedMotion: true, seed: 1 });
    high.update(1 / 60, { ...CRUISE, tier: 3 });
    const highScale = scaleRootOf(high.group).scale.x;
    high.dispose();

    expect(highScale).toBeGreaterThan(lowScale);
  });

  it('princess tier growth grows the whole mount', () => {
    const low = createRider('princess', 0xffe14a, { reducedMotion: true, seed: 1 });
    low.update(1 / 60, { ...CRUISE, tier: 0 });
    const lowScale = scaleRootOf(low.group).scale.x;
    low.dispose();

    const high = createRider('princess', 0xffe14a, { reducedMotion: true, seed: 1 });
    high.update(1 / 60, { ...CRUISE, tier: 3 });
    const highScale = scaleRootOf(high.group).scale.x;
    high.dispose();

    expect(highScale).toBeGreaterThan(lowScale);
  });

  it('fairy wings grow with tier while the body does not', () => {
    // The fairy's body sits at rig.scaleRoot's first child (`body`), whose
    // scale must stay pinned at 1 regardless of tier; only the wings group
    // (the scaleRoot's other child) should grow.
    function bodyAndWingScale(tier: number): { body: number; wings: number } {
      const rider = createRider('fairy', 0xff5d8f, { reducedMotion: true, seed: 5 });
      rider.update(1 / 60, { ...CRUISE, tier });
      const scaleRoot = rider.group.children[0].children[0].children[0]; // group>tilt>bob>scaleRoot
      const [body, wings] = scaleRoot.children;
      const result = { body: body.scale.x, wings: wings.scale.x };
      rider.dispose();
      return result;
    }

    const t0 = bodyAndWingScale(0);
    const t3 = bodyAndWingScale(3);
    expect(t0.body).toBeCloseTo(1, 5);
    expect(t3.body).toBeCloseTo(1, 5);
    expect(t3.wings).toBeGreaterThan(t0.wings);
  });

  it('two riders of the same character do not share tinted materials', () => {
    const a = createRider('bunny', 0xff0000, { reducedMotion: false, seed: 9 });
    const b = createRider('bunny', 0x00ff00, { reducedMotion: false, seed: 9 });
    const materialsOf = (group: THREE.Object3D): THREE.Material[] => {
      const list: THREE.Material[] = [];
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && mesh.material) list.push(mesh.material as THREE.Material);
      });
      return list;
    };
    const aMats = materialsOf(a.group);
    const bMats = materialsOf(b.group);
    for (const m of aMats) expect(bMats).not.toContain(m);
    a.dispose();
    b.dispose();
  });
});

const RIDERS_WITH_MOUNTS = ['princess', 'bunny'] as const;

describe('mounts', () => {
  const combos = RIDERS_WITH_MOUNTS.flatMap((character) => MOUNT_IDS.map((mount) => [character, mount] as const));

  it.each(combos)('%s on a %s builds, runs every pose finite, and disposes', (character, mount) => {
    for (const reducedMotion of [false, true]) {
      const rider = createRider(character, 0xffa94d, { reducedMotion, seed: 11, mount });
      expect(countMeshes(rider.group)).toBeGreaterThan(0);
      for (const pose of [...poses(), { ...CRUISE, wings: 1 }, { ...CRUISE, wings: 0.4, boosting: true }]) {
        expect(() => rider.update(1 / 60, pose)).not.toThrow();
        assertFiniteTree(rider.group);
      }
      expect(() => rider.update(5, CRUISE)).not.toThrow();
      assertFiniteTree(rider.group);
      expect(() => rider.dispose()).not.toThrow();
    }
  });

  it.each(['fairy', 'unicorn'] as const)('%s ignores the mount option', (character) => {
    const plain = createRider(character, 0xff7fc4, { reducedMotion: true, seed: 4 });
    const plainCount = countMeshes(plain.group);
    plain.dispose();
    for (const mount of MOUNT_IDS) {
      const rider = createRider(character, 0xff7fc4, { reducedMotion: true, seed: 4, mount });
      expect(countMeshes(rider.group)).toBe(plainCount);
      rider.dispose();
    }
  });

  it('keeps the default rides: princess on a unicorn, bunny on a cloud', () => {
    const count = (character: CharacterId, mount?: MountId): number => {
      const rider = createRider(character, 0x6cc6ff, { reducedMotion: true, seed: 2, mount });
      const n = countMeshes(rider.group);
      rider.dispose();
      return n;
    };
    expect(count('princess')).toBe(count('princess', 'unicorn'));
    expect(count('bunny')).toBe(count('bunny', 'cloud'));
    expect(count('princess', 'bird')).not.toBe(count('princess', 'unicorn'));
  });

  it('the bird is deterministic for a seed', () => {
    const a = createRider('bunny', 0x6cc6ff, { reducedMotion: true, seed: 6, mount: 'bird' });
    const b = createRider('bunny', 0x6cc6ff, { reducedMotion: true, seed: 6, mount: 'bird' });
    a.update(1 / 60, CRUISE);
    b.update(1 / 60, CRUISE);
    a.group.updateWorldMatrix(true, true);
    b.group.updateWorldMatrix(true, true);
    const positions = (g: THREE.Object3D): number[] => {
      const list: number[] = [];
      g.traverse((o) => list.push(o.position.x, o.position.y, o.position.z));
      return list;
    };
    expect(positions(a.group)).toEqual(positions(b.group));
    a.dispose();
    b.dispose();
  });

  /** Shoulder pivots: groups whose first child group carries extruded wing panels. */
  function wingPivotsOf(group: THREE.Object3D): THREE.Object3D[] {
    const pivots: THREE.Object3D[] = [];
    group.traverse((o) => {
      const panel = o.children[0];
      const first = panel?.children[0] as THREE.Mesh | undefined;
      if (first?.geometry?.type === 'ExtrudeGeometry') pivots.push(o);
    });
    return pivots;
  }

  it.each(RIDERS_WITH_MOUNTS)('the bird under a %s has two wing pivots that grow with the wings power-up', (character) => {
    const scales = [0, 1].map((wings) => {
      const rider = createRider(character, 0x6cc6ff, { reducedMotion: true, seed: 1, mount: 'bird' });
      rider.update(1 / 60, { ...CRUISE, wings });
      const pivots = wingPivotsOf(rider.group);
      expect(pivots).toHaveLength(2);
      const s = pivots[0].scale.x;
      rider.dispose();
      return s;
    });
    expect(scales[1]).toBeGreaterThan(scales[0]);
  });

  it('the cloud opens its wings with the wings power-up', () => {
    const rider = createRider('bunny', 0x6cc6ff, { reducedMotion: true, seed: 1, mount: 'cloud' });
    rider.update(1 / 60, { ...CRUISE, wings: 0 });
    const closed = wingPivotsOf(rider.group).map((p) => p.visible);
    rider.update(1 / 60, { ...CRUISE, wings: 1 });
    const open = wingPivotsOf(rider.group).map((p) => p.visible);
    expect(closed).toEqual([false, false]);
    expect(open).toEqual([true, true]);
    rider.dispose();
  });
});

describe('preloadRiderAssets', () => {
  it('resolves in jsdom without rejecting, even after a failed GLB load', async () => {
    await expect(preloadRiderAssets()).resolves.toBeUndefined();
    // Calling it again returns the same settled (cached) promise.
    await expect(preloadRiderAssets()).resolves.toBeUndefined();
  });

  it('bunny still builds a usable group after preload settles (GLB or fallback)', async () => {
    await preloadRiderAssets();
    const rider = createRider('bunny', 0x53d08a, { reducedMotion: false, seed: 2 });
    expect(countMeshes(rider.group)).toBeGreaterThan(0);
    expect(() => rider.update(1 / 60, CRUISE)).not.toThrow();
    rider.dispose();
  });
});
