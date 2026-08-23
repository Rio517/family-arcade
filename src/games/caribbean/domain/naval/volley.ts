import { SLOOP_CLASS } from '../../content/naval';
import { nextSeed } from './rng';
import type { Ammunition, Broadside, Damage, VolleyResult } from './types';

export interface ResolveVolleyInput {
  seed: number;
  volleyId: number;
  side: Broadside;
  ammunition: Ammunition;
  cannon: number;
  accuracy: number;
  damagePerHit: Damage;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function damageFor(ammunition: Ammunition, normalizedRange: number): Damage {
  const range = clamp(normalizedRange, 0, 1);

  if (ammunition === 'round') {
    return { hull: Math.round(12 - 3 * range), sails: 1, crew: 1, cannon: 2 };
  }
  if (ammunition === 'chain') {
    return {
      hull: Math.round(2 - range),
      sails: Math.round(14 - 8 * range),
      crew: Math.round(2 - range),
      cannon: 0,
    };
  }
  return {
    hull: Math.round(1 - range),
    sails: 0,
    crew: Math.round(12 - 10 * range),
    cannon: 0,
  };
}

export function accuracyFor(normalizedRange: number, crew: number, sails: number): number {
  const range = clamp(normalizedRange, 0, 1);
  const crewFactor = clamp(crew / SLOOP_CLASS.crew.safe, 0.45, 1);
  const damagedSailPenalty = sails < 30 ? 0.08 : 0;
  return clamp((0.78 - 0.36 * range) * crewFactor - damagedSailPenalty, 0.12, 0.88);
}

function multipliedDamage(damage: Damage, hits: number): Damage {
  return {
    hull: damage.hull * hits,
    sails: damage.sails * hits,
    crew: damage.crew * hits,
    cannon: damage.cannon * hits,
  };
}

export function resolveVolley(input: ResolveVolleyInput): VolleyResult {
  const fired = Math.max(0, Math.floor(input.cannon));
  const accuracy = clamp(input.accuracy, 0, 1);
  let seed = input.seed >>> 0;
  let hits = 0;
  const samples = [];

  for (let index = 0; index < fired; index++) {
    seed = nextSeed(seed);
    const normalized = seed / 0x1_0000_0000;
    const hit = normalized < accuracy;
    if (hit) hits += 1;
    samples.push({ index, normalizedSpread: normalized * 2 - 1, hit });
  }

  return {
    volleyId: input.volleyId,
    side: input.side,
    ammunition: input.ammunition,
    fired,
    hits,
    misses: fired - hits,
    damage: multipliedDamage(input.damagePerHit, hits),
    seedAfter: seed,
    samples,
  };
}
