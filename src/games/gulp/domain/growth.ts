/**
 * How a hole grows: its radius from what it has eaten, the level that radius
 * reaches, how fast it moves, and the combo multiplier for eating quickly.
 */
import { FIT, LEVELS } from './catalog';

/** A hole's radius at the start, and how it grows with what it has eaten. */
export const START_R = 1.6;
// Growth tapers off as a hole gets big (a power below a half), so the
// first levels come fast and the giant ones take a whole round.
const GROW = 0.27;
const GROW_POWER = 0.41;

/** A hole swallows another this many times smaller than itself. */
export const EAT_HOLE = 1.2;

/** Radius from what a hole has eaten: area grows with the food, no ceiling. */
export const radiusFor = (mass: number): number => START_R + GROW * Math.pow(Math.max(0, mass), GROW_POWER);
/** The mass a hole needs to be this big (the inverse of `radiusFor`). */
export const massFor = (r: number): number => Math.pow(Math.max(0, r - START_R) / GROW, 1 / GROW_POWER);

/** Past the last tier, a new level for every step this much bigger. */
const BEYOND = 1.35;

/** Level 1 at the start; one more for each tier a hole can now swallow, and on past the top. */
export function levelOf(r: number): number {
  const cap = r * FIT;
  const fits = LEVELS.filter((t) => t.size <= cap).length;
  const base = Math.max(1, fits - 1);
  if (fits < LEVELS.length) return base;
  return base + Math.floor(Math.log(cap / LEVELS[LEVELS.length - 1].size) / Math.log(BEYOND));
}

/** What the next level opens up, or null once everything fits. */
export function nextLabel(r: number): string | null {
  const fits = LEVELS.filter((t) => t.size <= r * FIT).length;
  return LEVELS[fits]?.label ?? null;
}

/** 0..1 of the way from this level to the next, for the level meter. */
export function levelProgress(r: number): number {
  const cap = r * FIT;
  const fits = LEVELS.filter((t) => t.size <= cap).length;
  const next = LEVELS[fits];
  if (!next) {
    const steps = Math.log(cap / LEVELS[LEVELS.length - 1].size) / Math.log(BEYOND);
    return steps - Math.floor(steps);
  }
  const prev = LEVELS[fits - 1]?.size ?? 0;
  const from = Math.max(START_R * FIT, prev);
  return Math.max(0, Math.min(1, (cap - from) / (next.size - from)));
}

/**
 * Top speed. It rises gently with size: a giant covers more ground than a
 * small hole, but with the camera pulled back it looks slower on screen.
 */
export const speedOf = (r: number): number => 9 * Math.pow(r / START_R, 0.38);

/**
 * Combos: eat again within this many seconds and the streak goes on; every
 * COMBO_STEP things in a streak adds one to the multiplier, up to COMBO_MAX.
 */
export const COMBO_WINDOW = 1.4;
const COMBO_STEP = 8;
const COMBO_MAX = 5;
export const comboOf = (streak: number): number => Math.min(COMBO_MAX, 1 + Math.floor(streak / COMBO_STEP));
