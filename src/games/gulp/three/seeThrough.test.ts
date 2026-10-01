import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { round } from '../domain/testing';
import { SeeThrough } from './seeThrough';

describe('a building in the way of the camera', () => {
  it('fades only its near side, and falls in alone', () => {
    const w = round(1, 0, { map: 'city' });
    const tower = [...w.props.values()].find((p) => p.kind === 'tower')!;
    const me = w.holes[0];
    me.x = tower.x;
    me.z = tower.z - 12;
    const scene = new THREE.Scene();
    const shown = new Map<number, boolean>();
    const st = new SeeThrough(scene, new THREE.MeshStandardMaterial({ vertexColors: true }), false, (p, on) => shown.set(p.id, on));
    st.track(tower);
    st.update(w, me, new THREE.Vector3(me.x, 30, me.z + 30), 0, 1 / 60);

    const ghost = st.get(tower.id)!;
    expect(ghost).toBeDefined();
    expect(shown.get(tower.id)).toBe(false);
    // Its near side goes into the depth buffer first, drawing nothing, so
    // the faded copy shows one layer: not its far walls or the backs of its windows.
    const [near] = ghost.children as THREE.Mesh[];
    expect(near.geometry).toBe(ghost.geometry);
    expect((near.material as THREE.Material).colorWrite).toBe(false);
    expect((near.material as THREE.Material).depthWrite).toBe(true);
    expect((ghost.material as THREE.Material).depthWrite).toBe(false);
    expect(near.renderOrder).toBeLessThan(ghost.renderOrder);

    // Swallowed: the falling copy goes without its twin.
    expect(st.take(tower.id)?.children).toHaveLength(0);
    st.dispose();
  });
});
