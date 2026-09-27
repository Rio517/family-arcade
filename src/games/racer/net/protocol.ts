/**
 * The wire protocol for two-player Rainbow Racer.
 *
 * Each device drives its own kart locally (so steering feels instant) and tells
 * the other where it is with `pos`. The HOST additionally owns the coins and the
 * score: it runs coin pickups for BOTH karts (it knows its own position and the
 * guest's, from `pos`) and keeps the guest's world in sync. Host is always
 * racer 0, guest racer 1.
 *
 * World sync is snapshot + deltas: a full `world` snapshot opens every race and
 * every fresh channel (so a reconnecting guest — or one that missed the final
 * "race over" packet — always catches up), then compact `worldDelta`s carry
 * only what changed. Small, rare messages matter here: everything shares one
 * reliable ordered channel, so a fat 12/s world rebroadcast would let a single
 * dropped packet head-of-line-block the 20 Hz position stream.
 *
 * `isRacerMsg` is the single choke point that validates inbound wire data before
 * it reaches the game, so malformed or forged messages can't corrupt the race.
 */

import { CRUISE_ALTITUDE, MAX_TIER } from '../domain/flight';
import { POWER_KINDS, type Coin, type Star } from '../domain/pickups';
import type { WorldDelta, WorldSnapshot } from '../domain/race';

export interface HelloMsg {
  t: 'hello';
  name: string;
  /** The sender's chosen driver id (e.g. "unicorn"). */
  driver: string;
  /**
   * True when the sender already has a live race. A reconnecting mid-race
   * guest says so, and the host re-syncs it with a `world` snapshot instead of
   * restarting; a fresh guest (first join or reload) still gets a `go`.
   */
  inRace?: boolean;
}

/** Host → guest: the race is on. */
export interface GoMsg {
  t: 'go';
  target: number;
}

/** Both ways, ~20/sec: where my racer is right now. */
export interface PosMsg {
  t: 'pos';
  x: number;
  /** Height. Optional so a device from before the sky still pairs. */
  y?: number;
  z: number;
  heading: number;
  speed: number;
}

/** Host → guest: the full authoritative world — race start and channel (re)open. */
export interface WorldMsg extends WorldSnapshot {
  t: 'world';
}

/** Host → guest: only what changed since the last world message (see race.ts). */
export interface WorldDeltaMsg extends WorldDelta {
  t: 'worldDelta';
}

/** Either side asking to run it back after a finish. */
export interface RematchMsg {
  t: 'rematch';
}

export type RacerMsg = HelloMsg | GoMsg | PosMsg | WorldMsg | WorldDeltaMsg | RematchMsg;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

/** More coins than any real field could hold — a forged giant array is an
 * attack on the guest's memory, not a game state. Caps `world.coins` and both
 * `worldDelta` arrays. */
const MAX_COINS = 64;

const isOptNum = (v: unknown): boolean => v === undefined || isNum(v);

/** A coin or star. Height is optional on the wire (an older host sends flat
 * coins); `withHeight` fills it in before the game sees it. */
function isPoint(c: Record<string, unknown>): boolean {
  return isNum(c.id) && isNum(c.x) && isNum(c.z) && isOptNum(c.y);
}

function isCoin(v: unknown): v is Coin {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return isPoint(c) && isNum(c.hue);
}

function isStar(v: unknown): v is Star {
  if (typeof v !== 'object' || v === null) return false;
  const st = v as Record<string, unknown>;
  // An unknown kind would make the renderer guess; refuse it at the door.
  return isPoint(st) && (st.kind === undefined || (POWER_KINDS as readonly unknown[]).includes(st.kind));
}

const isCoinArray = (v: unknown): v is Coin[] => Array.isArray(v) && v.length <= MAX_COINS && v.every(isCoin);
const isStarArray = (v: unknown): v is Star[] => Array.isArray(v) && v.length <= MAX_COINS && v.every(isStar);
const isOptStarArray = (v: unknown): boolean => v === undefined || isStarArray(v);
/** Two power tiers, each a whole number in range — they index the renderer's sizes. */
const isOptTiers = (v: unknown): boolean =>
  v === undefined ||
  (Array.isArray(v) && v.length === 2 && v.every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_TIER));

/** Two wings countdowns, in seconds, each a sane length. */
const isOptWings = (v: unknown): boolean =>
  v === undefined || (Array.isArray(v) && v.length === 2 && v.every((n) => isNum(n) && n >= 0 && n <= 60));

/** Fill in what an older device leaves out, so the game only sees whole data. */
function withHeight<T extends { y?: number }>(p: T): T & { y: number } {
  return { ...p, y: isNum(p.y) ? p.y : CRUISE_ALTITUDE };
}

/** The scoreboard fields every world-ish message carries. */
function isScoreboard(m: Record<string, unknown>): boolean {
  return (
    Array.isArray(m.scores) &&
    m.scores.length === 2 &&
    m.scores.every(isNum) &&
    (m.status === 'racing' || m.status === 'over') &&
    // winner indexes the two-kart arrays — anything but 0, 1, or null
    // would crash the guest's win overlay.
    (m.winner === null || m.winner === 0 || m.winner === 1) &&
    isNum(m.elapsed)
  );
}

export function isRacerMsg(value: unknown): value is RacerMsg {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  switch (m.t) {
    case 'hello':
      // Display strings are capped at the wire (like the party protocol's
      // MAX_NAME_LEN) so a hostile peer can't ship multi-MB payloads.
      return (
        isStr(m.name) &&
        m.name.length <= 100 &&
        isStr(m.driver) &&
        m.driver.length <= 100 &&
        (m.inRace === undefined || typeof m.inRace === 'boolean')
      );
    case 'go':
      return isNum(m.target);
    case 'pos':
      return isNum(m.x) && isOptNum(m.y) && isNum(m.z) && isNum(m.heading) && isNum(m.speed);
    case 'world':
      return (
        isCoinArray(m.coins) && isOptStarArray(m.stars) && isOptTiers(m.tiers) && isOptWings(m.wings) && isScoreboard(m)
      );
    case 'worldDelta':
      return (
        isCoinArray(m.spawned) &&
        isOptStarArray(m.starSpawned) &&
        isOptTiers(m.tiers) &&
        isOptWings(m.wings) &&
        Array.isArray(m.removed) &&
        m.removed.length <= MAX_COINS &&
        m.removed.every(isNum) &&
        isScoreboard(m)
      );
    case 'rematch':
      return true;
    default:
      return false;
  }
}

/**
 * The world as the game should see it. A message that passed `isRacerMsg` may
 * come from a device that predates the sky (no heights, stars or tiers); fill
 * those in here so everything past this point can rely on them.
 */
export function snapshotFrom(m: WorldMsg): WorldSnapshot {
  const w = m as WorldMsg & Partial<Pick<WorldSnapshot, 'stars' | 'tiers' | 'wings'>>;
  return {
    coins: w.coins.map(withHeight),
    stars: (w.stars ?? []).map(withHeight),
    tiers: w.tiers ?? [0, 0],
    wings: w.wings ?? [0, 0],
    scores: w.scores,
    status: w.status,
    winner: w.winner,
    elapsed: w.elapsed,
  };
}

export function deltaFrom(m: WorldDeltaMsg): WorldDelta {
  const d = m as WorldDeltaMsg & Partial<Pick<WorldDelta, 'starSpawned' | 'tiers' | 'wings'>>;
  return {
    spawned: d.spawned.map(withHeight),
    starSpawned: (d.starSpawned ?? []).map(withHeight),
    removed: d.removed,
    tiers: d.tiers ?? [0, 0],
    wings: d.wings ?? [0, 0],
    scores: d.scores,
    status: d.status,
    winner: d.winner,
    elapsed: d.elapsed,
  };
}
