import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { damageEffectKinds, EffectPool } from './effects';

describe('bounded naval effect pool', () => {
  it('preallocates a fixed resource set and never grows after warmup', () => {
    const scene = new THREE.Scene();
    const effects = new EffectPool(scene, 4, false);

    expect(effects.metrics()).toMatchObject({
      active: 0,
      capacity: 4,
      resources: { meshes: 5, geometries: 5, materials: 5 },
    });
    effects.spawn('flash', 0, 1, 2);
    effects.spawn('smoke', 1, 1, 2);
    effects.spawn('splash', 2, 1, 2);
    effects.spawn('debris', 3, 1, 2);
    expect(effects.metrics().active).toBe(4);
    expect(scene.children).toHaveLength(5);
    expect(scene.children.every((child) => child instanceof THREE.InstancedMesh)).toBe(true);
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

  it('keeps reduced-motion cues static and limits each kind to one active cue', () => {
    const effects = new EffectPool(new THREE.Scene(), 8, true);
    const cue = effects.spawn('smoke', 1, 2, 3, { life: 2, velocityX: 5, velocityY: 4 });
    effects.spawn('smoke', 7, 8, 9, { life: 2 });
    const before = {
      position: cue.position.clone(),
      scale: cue.scale,
      rotation: cue.rotation,
    };

    effects.update(0.25);

    expect(cue.position).toEqual(before.position);
    expect(cue.scale).toBe(before.scale);
    expect(cue.rotation).toBe(before.rotation);
    expect(effects.metrics()).toMatchObject({ active: 1, capacity: 8 });
  });

  it('provides a distinct rig-damage cue while keeping saturated draw batches bounded', () => {
    const scene = new THREE.Scene();
    const effects = new EffectPool(scene, 96, false);

    for (let index = 0; index < 96; index += 1) {
      effects.spawn(index === 0 ? 'rig' : (['flash', 'smoke', 'splash', 'debris'][index % 4] as 'flash'), index, 1, 2);
    }
    effects.update(0);

    expect(effects.metrics()).toMatchObject({
      active: 96,
      capacity: 96,
      activeByKind: expect.objectContaining({ rig: 1 }),
      resources: { meshes: 5, geometries: 5, materials: 5 },
    });
    expect(scene.children.filter((child) => child.visible)).toHaveLength(5);
  });

  it('maps sail damage to a distinct rig cue as well as bounded debris', () => {
    expect(damageEffectKinds({ hull: 0, sails: 7, crew: 0, cannon: 0 })).toEqual([
      'rig',
      'debris',
      'debris',
    ]);
  });

  it('disposes all five instanced batches and their GPU instance attributes', () => {
    const scene = new THREE.Scene();
    const effects = new EffectPool(scene, 4, false);
    const disposeEvents: string[] = [];
    for (const child of scene.children) {
      if (!(child instanceof THREE.InstancedMesh)) throw new Error('Expected only instanced effect batches');
      child.addEventListener('dispose', () => disposeEvents.push(child.name));
    }

    effects.dispose();

    expect(disposeEvents).toEqual([
      'NavalEffectBatch_flash',
      'NavalEffectBatch_smoke',
      'NavalEffectBatch_splash',
      'NavalEffectBatch_debris',
      'NavalEffectBatch_rig',
    ]);
    expect(scene.children).toHaveLength(0);
  });
});
