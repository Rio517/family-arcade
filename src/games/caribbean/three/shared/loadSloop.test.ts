import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { createSloop } from './loadSloop';

function sourceSloop(): THREE.Group {
  const source = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(4, 1, 9),
    new THREE.MeshStandardMaterial({ name: 'Hull Deep Sound', color: '#17313a' }),
  );
  const signal = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshStandardMaterial({ name: 'Signal Vermilion Team', color: '#d94b3d' }),
  );
  signal.position.set(0, 4, 0);
  source.add(hull, signal);
  return source;
}

function runtimeMesh(group: THREE.Group, name: string): THREE.Mesh {
  const mesh = group.getObjectByName(`Runtime_${name}`) as THREE.Mesh | undefined;
  if (!mesh) throw new Error(`Missing runtime mesh ${name}`);
  return mesh;
}

describe('production sloop loader boundary', () => {
  it('returns independently disposable batched resources and applies the team signal colour', async () => {
    const source = sourceSloop();
    const first = await createSloop('#4ec5c1', async () => source);
    const second = await createSloop('#d94b3d', async () => source);

    const firstHull = runtimeMesh(first, 'Hull Deep Sound');
    const secondHull = runtimeMesh(second, 'Hull Deep Sound');
    const firstSignal = runtimeMesh(first, 'Signal Vermilion Team');
    const secondSignal = runtimeMesh(second, 'Signal Vermilion Team');

    expect(firstHull.geometry).not.toBe(secondHull.geometry);
    expect(firstHull.material).not.toBe(secondHull.material);
    expect(firstSignal.geometry).not.toBe(secondSignal.geometry);
    expect((firstSignal.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('4ec5c1');
    expect((secondSignal.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('d94b3d');
    expect(first.rotation.y).toBe(Math.PI);
  });

  it('reports a bundled offline-asset failure without returning a partial group', async () => {
    await expect(createSloop('#4ec5c1', async () => {
      throw new Error('fetch failed');
    })).rejects.toThrow('Bundled Caribbean sloop failed to load: fetch failed');
  });
});
