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

import type { Coin } from '../domain/kart';
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

/** Both ways, ~20/sec: where my kart is right now. */
export interface PosMsg {
  t: 'pos';
  x: number;
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

function isCoin(v: unknown): v is Coin {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return isNum(c.id) && isNum(c.x) && isNum(c.z) && isNum(c.hue);
}

const isCoinArray = (v: unknown): v is Coin[] => Array.isArray(v) && v.length <= MAX_COINS && v.every(isCoin);

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
      return isNum(m.x) && isNum(m.z) && isNum(m.heading) && isNum(m.speed);
    case 'world':
      return isCoinArray(m.coins) && isScoreboard(m);
    case 'worldDelta':
      return (
        isCoinArray(m.spawned) &&
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
