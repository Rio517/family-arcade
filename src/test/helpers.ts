/**
 * Shared test helpers. Kept in a non-`*.test` file so importing them elsewhere
 * doesn't re-register (and re-run) another file's suite.
 */

import { FLEET } from '@games/battleship/domain/constants';
import type { Fleet, Placement } from '@games/battleship/domain/types';

/** Deterministic PRNG for tests — the shared util, re-exported for brevity. */
export { seededRng } from '@shared/rng';

/** A hand-built legal fleet, every ship laid horizontally in its own row. */
export function stackFleet(): Fleet {
  const placements: Placement[] = FLEET.map((spec, i) => ({
    shipId: spec.id,
    row: i,
    col: 0,
    orientation: 'H' as const,
  }));
  return placements;
}
