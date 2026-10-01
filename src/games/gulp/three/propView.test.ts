import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { seededRng } from '@shared/rng';
import { makeProp, type Prop } from '../domain/catalog';
import { round } from '../domain/testing';
import { PropView } from './propView';

/** Where every thing the city's batches draw stands, as sorted "x:z" keys. */
function drawn(scene: THREE.Scene, material: THREE.Material): string[] {
  const out: string[] = [];
  const m = new THREE.Matrix4();
  const at = new THREE.Vector3();
  scene.traverse((o) => {
    if (!(o instanceof THREE.InstancedMesh) || o.material !== material) return;
    // A batch with nothing to show is not drawn at all.
    expect(o.visible || o.count === 0).toBe(true);
    if (o.count === 0) expect(o.visible).toBe(false);
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m);
      at.setFromMatrixPosition(m);
      out.push(`${at.x.toFixed(2)}:${at.z.toFixed(2)}`);
    }
  });
  return out.sort();
}

const standing = (props: Iterable<Prop>): string[] => [...props].map((p) => `${p.x.toFixed(2)}:${p.z.toFixed(2)}`).sort();

describe('the city as drawn', () => {
  // jsdom has no 2D canvas: the vehicles' soft patch is painted on one.
  const paint = new Proxy({} as Record<string | symbol, unknown>, {
    get: (t, k) => (k in t ? t[k] : () => ({ addColorStop: () => {} })),
    set: (t, k, v) => {
      t[k] = v;
      return true;
    },
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(paint as never);

  it('draws exactly what stands: eaten things leave their batch, grown-back and new ones join it', () => {
    const w = round(1, 0, { map: 'town' });
    const scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true });
    const view = new PropView(scene, material, material.clone(), w, true);
    expect(drawn(scene, material)).toEqual(standing(w.props.values()));

    // Eat a good share of the town, some with a fall and some without a fuss.
    const rng = seededRng(7);
    const eaten: Prop[] = [];
    const all = [...w.props.values()].filter((p) => p.kind !== 'ship');
    for (let i = 0; i < 400; i++) {
      const p = all.splice(Math.floor(rng() * all.length), 1)[0];
      w.props.delete(p.id);
      if (i % 2) view.swallow(p, 0);
      else view.vanish(p);
      eaten.push(p);
    }
    expect(drawn(scene, material)).toEqual(standing(w.props.values()));

    // Some grow back where they stood.
    for (const p of eaten.slice(0, 60)) {
      w.props.set(p.id, p);
      view.show(p);
    }
    expect(drawn(scene, material)).toEqual(standing(w.props.values()));

    // New houses go up in one square, more than one batch holds; some are
    // taken away again and others put up in their place.
    const raised: Prop[] = [];
    for (let i = 0; i < 50; i++) {
      const p = makeProp(100000 + i, 'house', 3 + (i % 10) * 9, 3 + Math.floor(i / 10) * 9, 0);
      w.props.set(p.id, p);
      view.raise(p);
      raised.push(p);
    }
    expect(drawn(scene, material)).toEqual(standing(w.props.values()));
    for (const p of raised.filter((_, i) => i % 3 === 0)) {
      w.props.delete(p.id);
      view.clear(p);
    }
    for (let i = 0; i < 20; i++) {
      const p = makeProp(200000 + i, 'house', 5 + i * 4, 60, 0);
      w.props.set(p.id, p);
      view.raise(p);
    }
    expect(drawn(scene, material)).toEqual(standing(w.props.values()));

    // From high up the tiny things go, and come back.
    view.showTiny(false);
    view.showTiny(true);
    expect(drawn(scene, material)).toEqual(standing(w.props.values()));
  });
});
