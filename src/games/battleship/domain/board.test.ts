import { describe, expect, it } from 'vitest';
import {
  autoPlace,
  canPlace,
  isFleetComplete,
  occupantAt,
  placeShip,
  placementInBounds,
  removeShip,
  shipCells,
} from './board';
import { FLEET, TOTAL_SHIP_CELLS } from './constants';
import { seededRng, stackFleet } from '@test/helpers';
import type { Fleet } from './types';

describe('shipCells', () => {
  it('lays a horizontal ship left→right from the anchor', () => {
    const cells = shipCells({ shipId: 'cruiser', row: 2, col: 3, orientation: 'H' });
    expect(cells).toEqual([
      { row: 2, col: 3 },
      { row: 2, col: 4 },
      { row: 2, col: 5 },
    ]);
  });

  it('lays a vertical ship top→bottom from the anchor', () => {
    const cells = shipCells({ shipId: 'destroyer', row: 7, col: 1, orientation: 'V' });
    expect(cells).toEqual([
      { row: 7, col: 1 },
      { row: 8, col: 1 },
    ]);
  });
});

describe('placementInBounds', () => {
  it('rejects a ship that runs off the right edge', () => {
    expect(placementInBounds({ shipId: 'carrier', row: 0, col: 6, orientation: 'H' })).toBe(false);
  });
  it('rejects a ship that runs off the bottom edge', () => {
    expect(placementInBounds({ shipId: 'carrier', row: 6, col: 0, orientation: 'V' })).toBe(false);
  });
  it('accepts a ship snug against the far edge', () => {
    expect(placementInBounds({ shipId: 'carrier', row: 0, col: 5, orientation: 'H' })).toBe(true);
  });
});

describe('canPlace', () => {
  const base: Fleet = [{ shipId: 'destroyer', row: 0, col: 0, orientation: 'H' }];

  it('forbids overlapping a different ship', () => {
    expect(canPlace(base, { shipId: 'cruiser', row: 0, col: 1, orientation: 'H' })).toBe(false);
  });

  it('allows a non-overlapping placement', () => {
    expect(canPlace(base, { shipId: 'cruiser', row: 2, col: 0, orientation: 'H' })).toBe(true);
  });

  it('lets a ship re-occupy its own previous cells', () => {
    // Re-placing the destroyer onto an overlapping spot with itself is fine.
    expect(canPlace(base, { shipId: 'destroyer', row: 0, col: 0, orientation: 'V' })).toBe(true);
  });
});

describe('placeShip / removeShip', () => {
  it('replaces an existing ship rather than duplicating it', () => {
    let fleet: Fleet = [];
    fleet = placeShip(fleet, { shipId: 'cruiser', row: 0, col: 0, orientation: 'H' });
    fleet = placeShip(fleet, { shipId: 'cruiser', row: 5, col: 5, orientation: 'V' });
    expect(fleet.filter((p) => p.shipId === 'cruiser')).toHaveLength(1);
    expect(fleet[0].row).toBe(5);
  });

  it('removes a ship by id', () => {
    const fleet: Fleet = [
      { shipId: 'cruiser', row: 0, col: 0, orientation: 'H' },
      { shipId: 'destroyer', row: 5, col: 5, orientation: 'V' },
    ];
    expect(removeShip(fleet, 'cruiser')).toEqual([
      { shipId: 'destroyer', row: 5, col: 5, orientation: 'V' },
    ]);
  });
});

describe('occupantAt', () => {
  const fleet: Fleet = [{ shipId: 'cruiser', row: 3, col: 3, orientation: 'H' }];
  it('finds the ship on an occupied cell', () => {
    expect(occupantAt(fleet, 3, 4)).toBe('cruiser');
  });
  it('returns null on open water', () => {
    expect(occupantAt(fleet, 0, 0)).toBeNull();
  });
});

describe('isFleetComplete', () => {
  it('is false for an empty fleet', () => {
    expect(isFleetComplete([])).toBe(false);
  });

  it('is true once every ship is legally placed', () => {
    const fleet = stackFleet();
    expect(isFleetComplete(fleet)).toBe(true);
  });
});

describe('autoPlace', () => {
  it('produces a complete, legal fleet', () => {
    const fleet = autoPlace(seededRng(42));
    expect(isFleetComplete(fleet)).toBe(true);
    expect(fleet).toHaveLength(FLEET.length);
  });

  it('never overlaps ships (checked across many seeds)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const fleet = autoPlace(seededRng(seed));
      const seen = new Set<string>();
      let cellCount = 0;
      for (const p of fleet) {
        for (const c of shipCells(p)) {
          const key = `${c.row},${c.col}`;
          expect(seen.has(key)).toBe(false);
          seen.add(key);
          cellCount++;
        }
      }
      expect(cellCount).toBe(TOTAL_SHIP_CELLS);
    }
  });

  it('is deterministic for a given seed', () => {
    expect(autoPlace(seededRng(7))).toEqual(autoPlace(seededRng(7)));
  });
});

