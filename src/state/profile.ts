/**
 * The player's persistent profile: points, win/loss record, unlocked skins,
 * and game history. All functions here are pure — they take a profile and
 * return a *new* one, so the UI reducer and the tests share the exact same
 * transitions. Reading/writing localStorage lives in storage/persistence.ts.
 */

import {
  DEFAULT_UNLOCKED,
  LOSS_CONSOLATION_POINTS,
  POINTS_PER_SURVIVING_CELL,
  WIN_BASE_POINTS,
  type Skin,
} from '../game/constants';

export interface GameHistoryEntry {
  code: string;
  opponent: string;
  result: 'win' | 'loss';
  pointsEarned: number;
  finishedAt: number;
}

export interface Profile {
  name: string;
  points: number;
  wins: number;
  losses: number;
  unlocked: string[];
  lastSkinId: string;
  history: GameHistoryEntry[];
}

const MAX_HISTORY = 25;

export function defaultProfile(): Profile {
  return {
    name: '',
    points: 0,
    wins: 0,
    losses: 0,
    unlocked: [...DEFAULT_UNLOCKED],
    lastSkinId: DEFAULT_UNLOCKED[0],
    history: [],
  };
}

/**
 * Points awarded for a finished game. Winning pays a base bounty plus a bonus
 * for every ship cell that survived unhit — a clean sweep is worth far more
 * than a squeaker. Losing still pays a small consolation so every game moves
 * you toward the next skin.
 */
export function pointsForResult(won: boolean, survivingCells: number): number {
  if (!won) return LOSS_CONSOLATION_POINTS;
  return WIN_BASE_POINTS + Math.max(0, survivingCells) * POINTS_PER_SURVIVING_CELL;
}

export interface ResultInput {
  won: boolean;
  survivingCells: number;
  code: string;
  opponent: string;
  finishedAt: number;
}

/** Fold a finished game into the profile: points, tally, and a history row. */
export function recordResult(profile: Profile, input: ResultInput): Profile {
  const pointsEarned = pointsForResult(input.won, input.survivingCells);
  const entry: GameHistoryEntry = {
    code: input.code,
    opponent: input.opponent || 'Opponent',
    result: input.won ? 'win' : 'loss',
    pointsEarned,
    finishedAt: input.finishedAt,
  };
  return {
    ...profile,
    points: profile.points + pointsEarned,
    wins: profile.wins + (input.won ? 1 : 0),
    losses: profile.losses + (input.won ? 0 : 1),
    history: [entry, ...profile.history].slice(0, MAX_HISTORY),
  };
}

export function isUnlocked(profile: Profile, skinId: string): boolean {
  return profile.unlocked.includes(skinId);
}

export function canAfford(profile: Profile, skin: Skin): boolean {
  return profile.points >= skin.cost;
}

/**
 * Spend points to unlock a skin. Returns the updated profile, or `null` if the
 * skin is already owned or unaffordable (so the caller can show feedback).
 */
export function unlockSkin(profile: Profile, skin: Skin): Profile | null {
  if (isUnlocked(profile, skin.id)) return null;
  if (!canAfford(profile, skin)) return null;
  return {
    ...profile,
    points: profile.points - skin.cost,
    unlocked: [...profile.unlocked, skin.id],
  };
}

export function selectSkin(profile: Profile, skinId: string): Profile {
  if (!isUnlocked(profile, skinId)) return profile;
  return { ...profile, lastSkinId: skinId };
}

export function setName(profile: Profile, name: string): Profile {
  return { ...profile, name: name.trim().slice(0, 20) };
}

/** Merge a possibly-partial stored object onto defaults (forward-compatible). */
export function normalizeProfile(raw: unknown): Profile {
  const base = defaultProfile();
  if (typeof raw !== 'object' || raw === null) return base;
  const r = raw as Partial<Profile>;
  const unlocked = Array.isArray(r.unlocked)
    ? Array.from(new Set([...DEFAULT_UNLOCKED, ...r.unlocked.filter((x) => typeof x === 'string')]))
    : base.unlocked;
  return {
    name: typeof r.name === 'string' ? r.name : base.name,
    points: Number.isFinite(r.points) ? (r.points as number) : base.points,
    wins: Number.isFinite(r.wins) ? (r.wins as number) : base.wins,
    losses: Number.isFinite(r.losses) ? (r.losses as number) : base.losses,
    unlocked,
    lastSkinId: typeof r.lastSkinId === 'string' && unlocked.includes(r.lastSkinId)
      ? r.lastSkinId
      : base.lastSkinId,
    history: Array.isArray(r.history) ? (r.history as GameHistoryEntry[]).slice(0, MAX_HISTORY) : [],
  };
}
