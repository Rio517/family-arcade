/**
 * The wire protocol for two-player Rainbow Racer.
 *
 * Each device drives its own kart locally (so steering feels instant) and tells
 * the other where it is with `pos`. The HOST additionally owns the coins and the
 * score: it runs coin pickups for BOTH karts (it knows its own position and the
 * guest's, from `pos`) and broadcasts the authoritative `world` — coins, both
 * scores, and whether someone has won. Host is always racer 0, guest racer 1.
 *
 * `isRacerMsg` is the single choke point that validates inbound wire data before
 * it reaches the game, so malformed or forged messages can't corrupt the race.
 */

import type { Coin } from '../domain/kart';

export interface HelloMsg {
  t: 'hello';
  name: string;
  /** The sender's chosen driver id (e.g. "unicorn"). */
  driver: string;
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

/** Host → guest, ~12/sec: the authoritative coins + scores + outcome. */
export interface WorldMsg {
  t: 'world';
  coins: Coin[];
  /** [hostScore, guestScore]. */
  scores: [number, number];
  status: 'racing' | 'over';
  /** Winning racer index (0 host, 1 guest), or null while racing/on a tie both. */
  winner: number | null;
  elapsed: number;
}

/** Either side asking to run it back after a finish. */
export interface RematchMsg {
  t: 'rematch';
}

export type RacerMsg = HelloMsg | GoMsg | PosMsg | WorldMsg | RematchMsg;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

function isCoin(v: unknown): v is Coin {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return isNum(c.id) && isNum(c.x) && isNum(c.z) && isNum(c.hue);
}

export function isRacerMsg(value: unknown): value is RacerMsg {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  switch (m.t) {
    case 'hello':
      return isStr(m.name) && isStr(m.driver);
    case 'go':
      return isNum(m.target);
    case 'pos':
      return isNum(m.x) && isNum(m.z) && isNum(m.heading) && isNum(m.speed);
    case 'world':
      return (
        Array.isArray(m.coins) &&
        m.coins.every(isCoin) &&
        Array.isArray(m.scores) &&
        m.scores.length === 2 &&
        m.scores.every(isNum) &&
        (m.status === 'racing' || m.status === 'over') &&
        (m.winner === null || isNum(m.winner)) &&
        isNum(m.elapsed)
      );
    case 'rematch':
      return true;
    default:
      return false;
  }
}
