import type { ShipSpec, Side } from './types';

/** The classic Milton-Bradley fleet: 5 ships, 17 cells total. */
export const FLEET: readonly ShipSpec[] = [
  { id: 'carrier', name: 'Carrier', size: 5 },
  { id: 'battleship', name: 'Battleship', size: 4 },
  { id: 'cruiser', name: 'Cruiser', size: 3 },
  { id: 'submarine', name: 'Submarine', size: 3 },
  { id: 'destroyer', name: 'Destroyer', size: 2 },
];

export const TOTAL_SHIP_CELLS = FLEET.reduce((n, s) => n + s.size, 0); // 17

export function shipSpec(id: ShipSpec['id']): ShipSpec {
  const spec = FLEET.find((s) => s.id === id);
  if (!spec) throw new Error(`Unknown ship id: ${id}`);
  return spec;
}

export function otherSide(side: Side): Side {
  return side === 'host' ? 'guest' : 'host';
}

// ── Fleet colour ───────────────────────────────────────────────────────────
// Every fleet wears one standard colour (Aqua Corps). The id still travels in
// the `hello` message so a peer on an older build keeps working; whatever id
// arrives, it is drawn in the standard colour.

export interface Skin {
  id: string;
  name: string;
  /** Accent colour (CSS) used for the hull glow and the board rim. */
  color: string;
}

export const STANDARD_SKIN: Skin = { id: 'aqua', name: 'Aqua Corps', color: '#22d3ee' };

/** The standard colour, for any id (an older peer may send any string). */
export function skinById(_id: string): Skin {
  return STANDARD_SKIN;
}
