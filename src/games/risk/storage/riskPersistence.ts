/**
 * Risk campaign persistence — a family Risk game rarely finishes in one
 * sitting, so the whole GameState (already a pure JSON value: territories,
 * players, phase, dice bag and all) is saved to localStorage after every
 * action and offered as a "Resume campaign" card on the setup screen.
 * Finished games clear themselves.
 */

import type { GameState } from '../domain/types';

const KEY = 'risk-campaign-v1';

export interface StoredRisk {
  v: 1;
  savedAt: number;
  state: GameState;
}

export function saveRiskGame(state: GameState, now: number = Date.now()): void {
  try {
    const stored: StoredRisk = { v: 1, savedAt: now, state };
    localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    /* storage full or blocked — the game just won't resume */
  }
}

export function loadRiskGame(): StoredRisk | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredRisk;
    if (
      parsed?.v !== 1 ||
      !parsed.state ||
      !Array.isArray(parsed.state.players) ||
      parsed.state.players.length < 2 ||
      typeof parsed.state.mapId !== 'string' ||
      parsed.state.phase === 'over'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearRiskGame(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
