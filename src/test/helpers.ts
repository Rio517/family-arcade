/**
 * Shared test helpers. Kept in a non-`*.test` file so importing them elsewhere
 * doesn't re-register (and re-run) another file's suite.
 */

import { FLEET } from '../game/constants';
import type { Fleet, Placement } from '../game/types';

/** Deterministic PRNG (mulberry32) so fleet/shuffle tests are reproducible. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
