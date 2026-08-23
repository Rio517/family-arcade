import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { composeWakeMatrix } from './sceneMath';

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
});
