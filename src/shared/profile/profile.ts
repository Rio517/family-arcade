/**
 * The player's persistent, game-neutral profile: points, win/loss record,
 * unlocked cosmetics, and game history. All functions here are pure — they take
 * a profile and return a *new* one, so the UI reducer and the tests share the
 * exact same transitions. Reading/writing localStorage lives in profileStore.ts.
 *
 * This module is deliberately game-agnostic: `unlocked` / `lastSkinId` are
 * opaque cosmetic ids and `survivingCells` is just a bonus amount the calling
 * game supplies. Each game layers its own meaning on top (see, e.g.,
 * games/battleship/domain/skins.ts). Nothing here imports a game.
 */

// Points economy (shared across games).
const WIN_BASE_POINTS = 100;
const POINTS_PER_BONUS = 15;
const LOSS_CONSOLATION_POINTS = 25;

export const DEFAULT_PRONOUNS = 'he/him';

export interface GameHistoryEntry {
  code: string;
  /** Registry id of the game this was ('' on rows saved before we recorded it). */
  game: string;
  opponent: string;
  result: 'win' | 'loss';
  pointsEarned: number;
  finishedAt: number;
}

export interface Profile {
  name: string;
  pronouns: string;
  points: number;
  wins: number;
  losses: number;
  /** Opaque cosmetic ids the player has unlocked (a game interprets them). */
  unlocked: string[];
  /** The last cosmetic the player chose (opaque id; '' means none yet). */
  lastSkinId: string;
  history: GameHistoryEntry[];
}

const MAX_HISTORY = 25;

export function defaultProfile(): Profile {
  return {
    name: '',
    pronouns: DEFAULT_PRONOUNS,
    points: 0,
    wins: 0,
    losses: 0,
    unlocked: [],
    lastSkinId: '',
    history: [],
  };
}

/**
 * Points awarded for a finished game. Winning pays a base bounty plus a bonus
 * per `bonus` unit the game passes (Ship Battle passes surviving ship cells;
 * Chess passes 0). Losing still pays a small consolation.
 */
export function pointsForResult(won: boolean, bonus: number): number {
  if (!won) return LOSS_CONSOLATION_POINTS;
  return WIN_BASE_POINTS + Math.max(0, bonus) * POINTS_PER_BONUS;
}

export interface ResultInput {
  won: boolean;
  /** Bonus units toward the win bounty (game-specific; 0 if none). */
  survivingCells: number;
  code: string;
  /** Registry id of the game recording this result. */
  game?: string;
  opponent: string;
  finishedAt: number;
}

/** Fold a finished game into the profile: points, tally, and a history row. */
export function recordResult(profile: Profile, input: ResultInput): Profile {
  const pointsEarned = pointsForResult(input.won, input.survivingCells);
  const entry: GameHistoryEntry = {
    code: input.code,
    game: input.game ?? '',
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

/** Has the player unlocked this cosmetic id? (A game may also treat free ones as owned.) */
export function isUnlocked(profile: Profile, id: string): boolean {
  return profile.unlocked.includes(id);
}

export function canAfford(profile: Profile, cost: number): boolean {
  return profile.points >= cost;
}

/**
 * Spend points to unlock a cosmetic. Returns the updated profile, or `null` if
 * it's already owned or unaffordable (so the caller can show feedback).
 */
export function unlockSkin(profile: Profile, id: string, cost: number): Profile | null {
  if (isUnlocked(profile, id)) return null;
  if (!canAfford(profile, cost)) return null;
  return { ...profile, points: profile.points - cost, unlocked: [...profile.unlocked, id] };
}

/** Choose a cosmetic as current. The caller decides ownership rules. */
export function selectSkin(profile: Profile, id: string): Profile {
  return { ...profile, lastSkinId: id };
}

export function setName(profile: Profile, name: string): Profile {
  return { ...profile, name: name.trim().slice(0, 20) };
}

export function pronounCodePointLength(value: string): number {
  return [...value].length;
}

export function normalizePronouns(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_PRONOUNS;
  const clean = value.trim();
  return clean.length > 0 && pronounCodePointLength(clean) <= 24 ? clean : DEFAULT_PRONOUNS;
}

export function setPronouns(profile: Profile, pronouns: string): Profile {
  return { ...profile, pronouns: normalizePronouns(pronouns) };
}

/**
 * The household roster, in the family's chosen order — offered as one-tap
 * name chips wherever a game asks "who's playing?". (The Yahtzee logger
 * carries its own copy: it's a standalone HTML page that can't import this.)
 */
export const FAMILY_NAMES = ['Rio', 'Klara', 'Flora', 'Mommy', 'Papa'];

/** Merge a possibly-partial stored object onto defaults (forward-compatible). */
export function normalizeProfile(raw: unknown): Profile {
  const base = defaultProfile();
  if (typeof raw !== 'object' || raw === null) return base;
  const r = raw as Partial<Profile>;
  const unlocked = Array.isArray(r.unlocked)
    ? r.unlocked.filter((x) => typeof x === 'string')
    : base.unlocked;
  return {
    name: typeof r.name === 'string' ? r.name : base.name,
    pronouns: normalizePronouns(r.pronouns),
    points: Number.isFinite(r.points) ? (r.points as number) : base.points,
    wins: Number.isFinite(r.wins) ? (r.wins as number) : base.wins,
    losses: Number.isFinite(r.losses) ? (r.losses as number) : base.losses,
    unlocked,
    lastSkinId: typeof r.lastSkinId === 'string' ? r.lastSkinId : base.lastSkinId,
    history: Array.isArray(r.history)
      ? (r.history as Partial<GameHistoryEntry>[]).slice(0, MAX_HISTORY).map((e) => ({
          code: typeof e.code === 'string' ? e.code : '',
          game: typeof e.game === 'string' ? e.game : '',
          opponent: typeof e.opponent === 'string' ? e.opponent : 'Opponent',
          result: e.result === 'loss' ? 'loss' : 'win',
          pointsEarned: Number.isFinite(e.pointsEarned) ? (e.pointsEarned as number) : 0,
          finishedAt: Number.isFinite(e.finishedAt) ? (e.finishedAt as number) : 0,
        }))
      : [],
  };
}
