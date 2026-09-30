/**
 * Gulp Universe's scores: every finished round on this device, kept in one
 * versioned localStorage record. Two views are read from it: the family top 5
 * for a map and difficulty (an arcade table, so one player can hold several
 * places) and a player's own recent rounds.
 *
 * Everything here is pure except `loadScores`, `saveScores` and
 * `loadLegacyBests`, which only read and write the two keys.
 *
 * Personal bests used to live in `gulp:best:v1` as `{ "<userId>:<map>[:<level>]":
 * score }`, with no names. The roster is out of a game's reach, so a best
 * moves into this record under the name of the player it belongs to when that
 * player is next signed in (`adoptLegacyBests`). Until then it stays where it
 * is; the old key is only read, never written or deleted.
 */
import { MAPS, type MapId } from '../domain/city';
import type { Difficulty } from '../domain/rivals';

const SCORES_KEY = 'gulp:scores:v1';
const LEGACY_BEST_KEY = 'gulp:best:v1';

/** Rounds kept per player, besides any that hold a place on a board. */
const KEEP_PER_PLAYER = 30;
/** Places on a family board. */
export const BOARD_SIZE = 5;

export interface ScoreRound {
  userId: string;
  /** The player's name when the round was played. */
  name: string;
  map: MapId;
  difficulty: Difficulty;
  score: number;
  /** The hole's level at the end; 0 for a best carried over from before rounds were kept. */
  level: number;
  /** Place among the holes in the round (1 = biggest); 0 when not known. */
  rank: number;
  /** When the round finished (ms since epoch); 0 for a carried-over best. */
  at: number;
}

export interface ScoreStore {
  v: 1;
  rounds: ScoreRound[];
  /** Players whose `gulp:best:v1` bests have been carried over. */
  adopted: string[];
}

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

export const emptyScores = (): ScoreStore => ({ v: 1, rounds: [], adopted: [] });

const isMap = (m: unknown): m is MapId => typeof m === 'string' && Object.prototype.hasOwnProperty.call(MAPS, m);
const isDifficulty = (d: unknown): d is Difficulty => DIFFICULTIES.includes(d as Difficulty);
const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;

function cleanRound(x: unknown): ScoreRound | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  if (typeof r.userId !== 'string' || !r.userId) return null;
  if (!isMap(r.map) || !isDifficulty(r.difficulty)) return null;
  if (!isCount(r.score) || !isCount(r.level) || !isCount(r.rank) || !isCount(r.at)) return null;
  return {
    userId: r.userId,
    name: typeof r.name === 'string' && r.name.trim() ? r.name : 'Player',
    map: r.map,
    difficulty: r.difficulty,
    score: Math.round(r.score),
    level: Math.round(r.level),
    rank: Math.round(r.rank),
    at: r.at,
  };
}

/** The stored record, or an empty one; rows that do not make sense are dropped. */
export function parseScores(raw: string | null): ScoreStore {
  if (!raw) return emptyScores();
  try {
    const data = JSON.parse(raw) as Partial<ScoreStore> | null;
    if (!data || data.v !== 1 || !Array.isArray(data.rounds)) return emptyScores();
    const rounds = data.rounds.map(cleanRound).filter((r): r is ScoreRound => r !== null);
    const adopted = Array.isArray(data.adopted) ? data.adopted.filter((a): a is string => typeof a === 'string') : [];
    return { v: 1, rounds, adopted };
  } catch {
    return emptyScores();
  }
}

/** Higher score first; on a tie, whoever got there first keeps the higher place. */
const byScore = (a: ScoreRound, b: ScoreRound) => b.score - a.score || a.at - b.at;

/** The best n rounds on one map and difficulty. A round of 0 never makes the board. */
export function familyTop(rounds: readonly ScoreRound[], map: MapId, difficulty: Difficulty, n = BOARD_SIZE): ScoreRound[] {
  return rounds
    .filter((r) => r.map === map && r.difficulty === difficulty && r.score > 0)
    .sort(byScore)
    .slice(0, n);
}

/** One player's latest rounds, newest first. */
export function myRounds(rounds: readonly ScoreRound[], userId: string, n = 10): ScoreRound[] {
  return rounds
    .filter((r) => r.userId === userId)
    .sort((a, b) => b.at - a.at)
    .slice(0, n);
}

/** A player's best score on one map and difficulty (0 if none). */
export function bestOf(rounds: readonly ScoreRound[], userId: string, map: MapId, difficulty: Difficulty): number {
  let best = 0;
  for (const r of rounds) if (r.userId === userId && r.map === map && r.difficulty === difficulty) best = Math.max(best, r.score);
  return best;
}

/** The same round, found by who played it and when. */
export const sameRound = (a: ScoreRound, b: Pick<ScoreRound, 'userId' | 'at'>) => a.userId === b.userId && a.at === b.at;

const boardOf = (r: ScoreRound) => `${r.map}:${r.difficulty}`;

/**
 * Keep each player's last 30 rounds, every round holding a place on a family
 * board, and each player's best on every board (so "Best on" never goes down).
 */
function prune(rounds: readonly ScoreRound[]): ScoreRound[] {
  const keep = new Set<ScoreRound>();
  const perPlayer = new Map<string, ScoreRound[]>();
  const perBoard = new Map<string, ScoreRound[]>();
  const push = (m: Map<string, ScoreRound[]>, k: string, r: ScoreRound) => {
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  };
  for (const r of rounds) {
    push(perPlayer, r.userId, r);
    push(perBoard, boardOf(r), r);
  }
  for (const list of perPlayer.values()) {
    for (const r of [...list].sort((a, b) => b.at - a.at).slice(0, KEEP_PER_PLAYER)) keep.add(r);
  }
  for (const list of perBoard.values()) {
    for (const r of familyTop(list, list[0].map, list[0].difficulty)) keep.add(r);
    const bestPer = new Map<string, ScoreRound>();
    for (const r of list) {
      const b = bestPer.get(r.userId);
      if (!b || byScore(r, b) < 0) bestPer.set(r.userId, r);
    }
    for (const r of bestPer.values()) keep.add(r);
  }
  return rounds.filter((r) => keep.has(r));
}

/** The record with one more finished round in it. */
export function addRound(store: ScoreStore, round: ScoreRound): ScoreStore {
  return { ...store, rounds: prune([...store.rounds, round]) };
}

/**
 * Carry a player's bests from `gulp:best:v1` into the record, under their
 * current name, once. Keys are `<userId>:<map>` (Easy) or
 * `<userId>:<map>:<difficulty>`.
 */
export function adoptLegacyBests(store: ScoreStore, legacy: Record<string, unknown>, userId: string, name: string): ScoreStore {
  if (store.adopted.includes(userId)) return store;
  const prefix = `${userId}:`;
  const carried: ScoreRound[] = [];
  for (const [key, score] of Object.entries(legacy)) {
    if (!key.startsWith(prefix) || !isCount(score) || score <= 0) continue;
    const [map, difficulty = 'easy', ...rest] = key.slice(prefix.length).split(':');
    if (rest.length > 0 || !isMap(map) || !isDifficulty(difficulty)) continue;
    // Skip one the record already beats or matches.
    if (bestOf(store.rounds, userId, map, difficulty) >= score) continue;
    carried.push({ userId, name, map, difficulty, score: Math.round(score), level: 0, rank: 0, at: 0 });
  }
  return { ...store, rounds: prune([...store.rounds, ...carried]), adopted: [...store.adopted, userId] };
}

/** "Today", "Yesterday", or a short date; "Earlier" for a carried-over best. */
export function whenLabel(at: number, now: number): string {
  if (at <= 0) return 'Earlier';
  const day = (t: number) => {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const days = Math.round((day(now) - day(at)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function loadScores(): ScoreStore {
  try {
    return parseScores(localStorage.getItem(SCORES_KEY));
  } catch {
    return emptyScores();
  }
}

export function saveScores(store: ScoreStore): void {
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(store));
  } catch {
    /* private mode or full: the round still shows, it just isn't kept */
  }
}

export function loadLegacyBests(): Record<string, unknown> {
  try {
    const data = JSON.parse(localStorage.getItem(LEGACY_BEST_KEY) ?? '{}') as unknown;
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
