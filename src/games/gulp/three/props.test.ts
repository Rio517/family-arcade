import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { KINDS, type PropKind } from '../domain/catalog';
import { buildKindGeometry } from './props';

/**
 * Kinds whose budget is not their tier's: people are instanced by the
 * hundred, so they get less; a building site stands in for the building that
 * will go up on its lot, so it gets about as much as that building.
 */
const BUDGET: Partial<Record<PropKind, number>> = { person: 200, site: 900, bigsite: 2500 };

/** Triangle budgets by tier, so a city of instanced props stays fast on an iPad. */
function budget(kind: PropKind, tier: number): number {
  const own = BUDGET[kind];
  if (own !== undefined) return own;
  if (tier <= 1) return 300;
  if (tier <= 4) return 900;
  if (tier <= 7) return 2500;
  return 5000;
}

const kinds = Object.keys(KINDS) as PropKind[];

describe('buildKindGeometry', () => {
  for (const kind of kinds) {
    const info = KINDS[kind];
    const scales = info.scales ? [0.75, 1, 1.6] : [1];
    for (let v = 0; v < info.variants; v++) {
      for (const s of scales) {
        it(`${kind} variant ${v} at height x${s} fits its footprint and budget`, () => {
          const g = buildKindGeometry(kind, v, s);
          const pos = g.getAttribute('position');
          expect(pos.itemSize).toBe(3);
          expect(g.getAttribute('normal').count).toBe(pos.count);
          const color = g.getAttribute('color');
          expect(color.count).toBe(pos.count);
          expect(color.itemSize).toBe(3);
          expect(g.index).toBeNull();

          const tris = pos.count / 3;
          expect(tris).toBeGreaterThan(0);
          expect(tris).toBeLessThanOrEqual(budget(kind, info.tier));

          const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
          // Origin is the footprint centre, so each half-extent must fit half the footprint.
          expect(Math.max(-box.min.x, box.max.x)).toBeLessThanOrEqual((info.w / 2) * 1.1);
          expect(Math.max(-box.min.z, box.max.z)).toBeLessThanOrEqual((info.d / 2) * 1.1);
          expect(box.min.y).toBeGreaterThanOrEqual(-0.02);
          expect(box.min.y).toBeLessThanOrEqual(0.02);
          const h = info.h * s;
          expect(box.max.y).toBeGreaterThanOrEqual(h * 0.85);
          expect(box.max.y).toBeLessThanOrEqual(h * 1.15);

          for (const value of [...(pos.array as Float32Array), ...(color.array as Float32Array)]) {
            expect(Number.isFinite(value)).toBe(true);
          }
          g.dispose();
        });
      }
    }
  }

  it('wraps out-of-range and odd variants instead of failing', () => {
    for (const variant of [-1, 7, 99, 2.5, Number.NaN]) {
      const g = buildKindGeometry('car', variant);
      expect(g.getAttribute('position').count).toBeGreaterThan(0);
    }
    const wrapped = buildKindGeometry('house', 5).getAttribute('color').array;
    const direct = buildKindGeometry('house', 1).getAttribute('color').array;
    expect(Array.from(wrapped)).toEqual(Array.from(direct));
  });

  it('draws the same geometry every time', () => {
    const a = buildKindGeometry('tree', 1).getAttribute('position').array;
    const b = buildKindGeometry('tree', 1).getAttribute('position').array;
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('gives variants different colours', () => {
    const a = buildKindGeometry('car', 0).getAttribute('color').array;
    const b = buildKindGeometry('car', 1).getAttribute('color').array;
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('grows taller buildings by adding floors, not by ignoring the scale', () => {
    for (const kind of kinds.filter((k) => KINDS[k].scales)) {
      const short = buildKindGeometry(kind, 0, 1);
      const tall = buildKindGeometry(kind, 0, 1.6);
      expect(tall.getAttribute('position').count).toBeGreaterThan(short.getAttribute('position').count);
    }
  });

  it('ignores the height scale for kinds that do not scale', () => {
    const a = buildKindGeometry('car', 0, 1).getAttribute('position').array;
    const b = buildKindGeometry('car', 0, 2).getAttribute('position').array;
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
