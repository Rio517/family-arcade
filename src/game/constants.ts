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

// ── Cosmetic fleet skins ───────────────────────────────────────────────────
// Skins are pure cosmetics — they never affect the game rules. Free skins are
// available to everyone; premium skins are unlocked by spending points earned
// from playing.

export interface Skin {
  id: string;
  name: string;
  /** Emoji shown in each ship cell. */
  icon: string;
  /** Accent colour (CSS) used for the hull glow. */
  color: string;
  /** Points required to unlock. 0 = free. */
  cost: number;
  blurb: string;
}

export const SKINS: readonly Skin[] = [
  { id: 'aqua', name: 'Aqua Corps', icon: '🛸', color: '#22d3ee', cost: 0, blurb: 'Standard-issue hydrofoils.' },
  { id: 'ember', name: 'Ember Raiders', icon: '🔥', color: '#fb923c', cost: 0, blurb: 'Runs hot, hits hard.' },
  { id: 'verdant', name: 'Verdant Wing', icon: '🐢', color: '#4ade80', cost: 0, blurb: 'Bio-armoured cruisers.' },
  { id: 'void', name: 'Void Stalkers', icon: '🛰️', color: '#a78bfa', cost: 300, blurb: 'Cloaked until they strike.' },
  { id: 'solar', name: 'Solar Flare', icon: '☀️', color: '#fbbf24', cost: 600, blurb: 'Plasma-forged hulls.' },
  { id: 'phantom', name: 'Phantom Fleet', icon: '💀', color: '#e2e8f0', cost: 1000, blurb: 'The last thing they see.' },
];

export const DEFAULT_UNLOCKED = SKINS.filter((s) => s.cost === 0).map((s) => s.id);

export function skinById(id: string): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}

// ── Scoring ────────────────────────────────────────────────────────────────
// Winners earn a base bounty plus a bonus for every ship cell that survived
// unhit — rewarding a decisive victory. Losers get a small consolation so
// playing always makes progress toward the next skin.

export const WIN_BASE_POINTS = 100;
export const POINTS_PER_SURVIVING_CELL = 15;
export const LOSS_CONSOLATION_POINTS = 25;
