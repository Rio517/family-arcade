/**
 * The last lineup each game was played with, so Risk night opens with the
 * same six chairs already filled. One key, `arcade.lineup.v1`, a map of game
 * id → Lineup; normalized on read like the roster, read through
 * useSyncExternalStore (never a synchronous parse in render).
 */

import { safeGet, safeSet } from '@shared/storage/kv';
import { normalizeLineups, type Lineup } from './seats';

export const LINEUP_KEY = 'arcade.lineup.v1';

function load(): Record<string, Lineup> {
  const raw = safeGet(LINEUP_KEY);
  if (!raw) return {};
  try {
    return normalizeLineups(JSON.parse(raw));
  } catch {
    return {};
  }
}

let current: Record<string, Lineup> = load();
const listeners = new Set<() => void>();

export function getLineupsSnapshot(): Record<string, Lineup> {
  return current;
}

export function subscribeLineups(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setLineup(gameId: string, lineup: Lineup): void {
  current = { ...current, [gameId]: lineup };
  safeSet(LINEUP_KEY, JSON.stringify(current));
  listeners.forEach((cb) => cb());
}

/** Re-read from storage. For tests, to isolate between cases. */
export function resetLineupStore(): void {
  current = load();
}
