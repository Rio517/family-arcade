import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { EffectPool } from './effects';

describe('bounded naval effect pool', () => {
  it('preallocates a fixed resource set and never grows after warmup', () => {
    const scene = new THREE.Scene();
    const effects = new EffectPool(scene, 4, false);

    expect(effects.metrics()).toEqual({
      active: 0,
      capacity: 4,
      resources: { meshes: 4, geometries: 4, materials: 4 },
    });
    effects.spawn('flash', 0, 1, 2);
    effects.spawn('smoke', 1, 1, 2);
    effects.spawn('splash', 2, 1, 2);
    effects.spawn('debris', 3, 1, 2);
    expect(effects.metrics().active).toBe(4);
    expect(scene.children).toHaveLength(4);
  });

  it('reuses the oldest entry at capacity and expires entries in place', () => {
    const effects = new EffectPool(new THREE.Scene(), 2, false);
    const oldest = effects.spawn('flash', 1, 0, 0, { life: 1 });
    effects.spawn('smoke', 2, 0, 0, { life: 2 });

    const reused = effects.spawn('splash', 3, 0, 0, { life: 0.5 });
    expect(reused).toBe(oldest);
    expect(reused.position.x).toBe(3);
    expect(effects.metrics().active).toBe(2);

    effects.update(2.1);
    expect(effects.metrics().active).toBe(0);
  });

  it('can reduce effect lifetime without changing the pool budget', () => {
    const effects = new EffectPool(new THREE.Scene(), 1, true);
    const mesh = effects.spawn('smoke', 0, 0, 0, { life: 2 });

    effects.update(0.51);
    expect(mesh.visible).toBe(false);
    expect(effects.metrics()).toMatchObject({ active: 0, capacity: 1 });
  });
});
