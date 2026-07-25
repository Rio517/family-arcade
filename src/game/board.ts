/**
 * Board geometry & fleet placement — all pure functions.
 *
 * A "board" is never stored as a 2-D array here; it is derived on demand from
 * a `Fleet` (list of placements). Keeping placement as the source of truth
 * avoids the classic bug where the grid and the ship list drift apart.
 */

import { BOARD_SIZE, type Coord, type Fleet, type Orientation, type Placement, type ShipId } from './types';
import { FLEET, shipSpec } from './constants';

export function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

export function coordKey(row: number, col: number): string {
  return `${row},${col}`;
}

/** The cells a placement occupies, in bow→stern order. */
export function shipCells(placement: Placement): Coord[] {
  const spec = shipSpec(placement.shipId);
  const cells: Coord[] = [];
  for (let i = 0; i < spec.size; i++) {
    cells.push({
      row: placement.orientation === 'V' ? placement.row + i : placement.row,
      col: placement.orientation === 'H' ? placement.col + i : placement.col,
    });
  }
  return cells;
}

/** True if every cell of the placement is on the board. */
export function placementInBounds(placement: Placement): boolean {
  return shipCells(placement).every((c) => inBounds(c.row, c.col));
}

/**
 * Can `placement` be added to `fleet` without going off-board or overlapping
 * another ship? A placement for a ship already in the fleet is allowed to
 * overlap *its own* previous position (so re-placing a ship works).
 */
export function canPlace(fleet: Fleet, placement: Placement): boolean {
  if (!placementInBounds(placement)) return false;
  const occupied = new Set<string>();
  for (const p of fleet) {
    if (p.shipId === placement.shipId) continue;
    for (const c of shipCells(p)) occupied.add(coordKey(c.row, c.col));
  }
  return shipCells(placement).every((c) => !occupied.has(coordKey(c.row, c.col)));
}

/** Add or replace a ship's placement, returning a new fleet (immutable). */
export function placeShip(fleet: Fleet, placement: Placement): Fleet {
  const without = fleet.filter((p) => p.shipId !== placement.shipId);
  return [...without, placement];
}

export function removeShip(fleet: Fleet, shipId: ShipId): Fleet {
  return fleet.filter((p) => p.shipId !== shipId);
}

/** Which ship (if any) occupies a given cell. */
export function occupantAt(fleet: Fleet, row: number, col: number): ShipId | null {
  for (const p of fleet) {
    if (shipCells(p).some((c) => c.row === row && c.col === col)) return p.shipId;
  }
  return null;
}

/** A fleet is complete when every ship in FLEET has a legal placement. */
export function isFleetComplete(fleet: Fleet): boolean {
  if (fleet.length !== FLEET.length) return false;
  const ids = new Set(fleet.map((p) => p.shipId));
  if (ids.size !== FLEET.length) return false;
  // Re-validate the whole fleet: each ship legal against all the others.
  return fleet.every((p) => canPlace(removeShip(fleet, p.shipId), p));
}

export const ORIENTATIONS: Orientation[] = ['H', 'V'];

/**
 * Randomly place the whole fleet. Takes an injectable RNG so tests are
 * deterministic. Throws only if it somehow can't place after many tries,
 * which is statistically impossible on a 10×10 board with this fleet.
 */
export function autoPlace(rng: () => number = Math.random): Fleet {
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
  for (let attempt = 0; attempt < 500; attempt++) {
    let fleet: Fleet = [];
    let ok = true;
    for (const spec of FLEET) {
      let placed = false;
      for (let tries = 0; tries < 200 && !placed; tries++) {
        const placement: Placement = {
          shipId: spec.id,
          orientation: pick(ORIENTATIONS),
          row: Math.floor(rng() * BOARD_SIZE),
          col: Math.floor(rng() * BOARD_SIZE),
        };
        if (canPlace(fleet, placement)) {
          fleet = placeShip(fleet, placement);
          placed = true;
        }
      }
      if (!placed) {
        ok = false;
        break;
      }
    }
    if (ok && isFleetComplete(fleet)) return fleet;
  }
  throw new Error('autoPlace failed to generate a legal fleet');
}
