/**
 * Wire protocol between the two peers, plus the pure reconciliation logic that
 * makes reconnect/resume work.
 *
 * Messages are small JSON objects sent over the PeerJS data channel. The
 * transport (net/) never interprets game rules — it just ships these and hands
 * them to the reducer in the UI layer.
 */

import type { GameLog, Side } from './types';

export const PROTOCOL_VERSION = 1;

// ── Messages ────────────────────────────────────────────────────────────────

/** Identity + cosmetic handshake, sent by both peers on (re)connect. */
export interface HelloMsg {
  t: 'hello';
  v: number;
  side: Side;
  name: string;
  skinId: string;
}

/** "My ships are placed and I'm ready to start." */
export interface ReadyMsg {
  t: 'ready';
  ready: boolean;
}

/**
 * Sync handshake. On every (re)connect each peer announces how much of the log
 * it has; whoever is behind receives the authoritative (longer) log. Ready
 * flags ride along so a mid-placement reconnect restores lobby state too.
 */
export interface SyncMsg {
  t: 'sync';
  log: GameLog;
  ready: boolean;
}

/** A fire *request* from the attacker. The defender resolves and replies. */
export interface FireMsg {
  t: 'fire';
  row: number;
  col: number;
}

/**
 * A settled shot, authored by the defender, to be appended to both logs. The
 * event itself already carries by/row/col/hit/sunk/allSunk.
 */
export interface ShotMsg {
  t: 'shot';
  event: Extract<GameLog[number], { type: 'shot' }>;
}

/** Host tells guest the game is starting and who fires first. */
export interface StartMsg {
  t: 'start';
  first: Side;
}

/** Either player proposes a rematch; when both have, the host restarts. */
export interface RematchMsg {
  t: 'rematch';
}

export type Message =
  | HelloMsg
  | ReadyMsg
  | SyncMsg
  | FireMsg
  | ShotMsg
  | StartMsg
  | RematchMsg;

// ── Reconciliation ──────────────────────────────────────────────────────────

/**
 * Given our log and a peer's log, return the authoritative one.
 *
 * Invariant (see engine.ts): every log position is written by exactly one
 * peer, and both peers process events in the same order, so one log is always a
 * prefix of the other (proven by the `isPrefix` tests). The longer log
 * therefore supersedes the shorter with no merge conflict; on a tie we keep our
 * own copy so the result is stable and idempotent.
 */
export function reconcileLogs(ours: GameLog, theirs: GameLog): GameLog {
  return theirs.length > ours.length ? theirs : ours;
}

/** Is `a` a prefix of `b` (by structural equality of each event)? */
export function isPrefix(a: GameLog, b: GameLog): boolean {
  if (a.length > b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!eventsEqual(a[i], b[i])) return false;
  }
  return true;
}

function eventsEqual(x: GameLog[number], y: GameLog[number]): boolean {
  return JSON.stringify(x) === JSON.stringify(y);
}

/** Runtime guard for messages arriving off the wire. */
export function isMessage(value: unknown): value is Message {
  if (typeof value !== 'object' || value === null) return false;
  const t = (value as { t?: unknown }).t;
  return (
    t === 'hello' ||
    t === 'ready' ||
    t === 'sync' ||
    t === 'fire' ||
    t === 'shot' ||
    t === 'start' ||
    t === 'rematch'
  );
}
