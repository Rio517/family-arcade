/**
 * Risk campaign persistence — a family Risk game rarely finishes in one
 * sitting, so the whole GameState (already a pure JSON value: territories,
 * players, phase, dice bag and all) is saved to localStorage after every
 * action and offered as a "Resume campaign" card on the setup screen.
 * Finished games clear themselves.
 */

import { mintCampaignId } from '../domain/rules';
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
      parsed.state.phase === 'over' ||
      // A tampered or future-version save must not white-screen the board:
      // every field the engine indexes into gets a shape check.
      parsed.state.players.some((p) => typeof p !== 'object' || p === null || typeof p.name !== 'string') ||
      typeof parsed.state.territories !== 'object' ||
      parsed.state.territories === null ||
      !Number.isInteger(parsed.state.current) ||
      parsed.state.current < 0 ||
      parsed.state.current >= parsed.state.players.length ||
      !Array.isArray(parsed.state.diceBag) ||
      !parsed.state.diceBag.every((d) => typeof d === 'number')
    ) {
      return null;
    }
    // Saves from before the defender got an independent dice bag lack the
    // field; an empty bag is a fresh one (drawDice refills on first draw), so
    // old campaigns keep working without a storage-version bump.
    if (!Array.isArray(parsed.state.defenseBag)) {
      parsed.state.defenseBag = [];
    }
    // The campaign id arrived with everyone's history. A save from before it
    // — or a hand-edited one holding junk — gets a fresh id rather than none,
    // so the finish can still tell this war from the next when it credits
    // the winner's ticket.
    if (typeof parsed.state.id !== 'string' || parsed.state.id === '') {
      parsed.state.id = mintCampaignId();
    }
    // A seat's ticket id rides along so a finished war can credit the right
    // roster entry. Saves from before it simply have none (nobody is
    // credited), and a hand-edited one may hold junk — anything that isn't a
    // string is dropped rather than trusted.
    for (const p of parsed.state.players) {
      if (p.userId !== undefined && typeof p.userId !== 'string') delete p.userId;
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
