import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { KINDS } from '../domain/catalog';
import { BOXES, CONTAINER, buildContainerGeometry, buildShipHullGeometry, shipCargo } from './park';
import { buildKindGeometry } from './props';

/** Whether `g` has a vertex of colour `color` within a hair of (x, y, z). */
function hasVertex(g: THREE.BufferGeometry, color: number, x: number, y: number, z: number): boolean {
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color');
  const c = new THREE.Color(color);
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(pos.getX(i) - x) > 0.03 || Math.abs(pos.getY(i) - y) > 0.03 || Math.abs(pos.getZ(i) - z) > 0.03) continue;
    if (Math.abs(col.getX(i) - c.r) < 1e-3 && Math.abs(col.getY(i) - c.g) < 1e-3 && Math.abs(col.getZ(i) - c.b) < 1e-3) return true;
  }
  return false;
}

describe('a cargo ship spilling its containers', () => {
  for (let v = 0; v < KINDS.ship.variants; v++) {
    it(`lists the containers ship ${v} carries, where its model draws them`, () => {
      const ship = buildKindGeometry('ship', v);
      const boxes = shipCargo(v);
      expect(boxes.length).toBeGreaterThan(20);
      for (const b of boxes) {
        expect(BOXES as readonly number[]).toContain(b.color);
        // The top corners of each container, in its colour, on the ship as drawn.
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            const x = b.x + (sx * CONTAINER.w) / 2;
            const z = b.z + (sz * CONTAINER.d) / 2;
            expect(hasVertex(ship, b.color, x, b.y + CONTAINER.h / 2, z), `container at (${b.x}, ${b.y}, ${b.z})`).toBe(true);
          }
        }
      }
    });

    it(`draws ship ${v}'s bare hull in the ship's own frame, without its containers`, () => {
      const ship = buildKindGeometry('ship', v);
      const hull = buildShipHullGeometry(v);
      ship.computeBoundingBox();
      hull.computeBoundingBox();
      // The same hull, waterline and bridge: only the containers are gone.
      expect(hull.boundingBox!.min.toArray()).toEqual(ship.boundingBox!.min.toArray());
      expect(hull.boundingBox!.max.y).toBeCloseTo(ship.boundingBox!.max.y, 5);
      // Each container on the deck is five faces (its underside sits on the deck): ten triangles.
      expect(ship.getAttribute('position').count - hull.getAttribute('position').count).toBe(shipCargo(v).length * 30);
      for (const b of shipCargo(v)) expect(hasVertex(hull, b.color, b.x + CONTAINER.w / 2, b.y + CONTAINER.h / 2, b.z + CONTAINER.d / 2)).toBe(false);
    });
  }

  it('wraps an odd variant the way the ship model does, so the colours still match', () => {
    expect(shipCargo(KINDS.ship.variants + 1)).toEqual(shipCargo(1));
    expect(shipCargo(Number.NaN)).toEqual(shipCargo(0));
  });

  it('builds a spilled container closed on every side, round its middle', () => {
    const g = buildContainerGeometry(BOXES[0]);
    g.computeBoundingBox();
    const size = g.boundingBox!.getSize(new THREE.Vector3());
    expect(size.toArray()).toEqual([CONTAINER.w, CONTAINER.h, CONTAINER.d].map((n) => expect.closeTo(n, 5)));
    expect(g.boundingBox!.getCenter(new THREE.Vector3()).length()).toBeCloseTo(0, 5);
    // Six faces, two triangles each.
    expect(g.getAttribute('position').count).toBe(36);
  });
});
