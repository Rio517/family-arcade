/**
 * Wire protocol between the two peers, plus the pure reconciliation logic that
 * makes reconnect/resume work.
 *
 * Messages are small JSON objects sent over the PeerJS data channel. The
 * transport (net/) never interprets game rules — it just ships these and hands
 * them to the reducer in the UI layer.
 */

import { BOARD_SIZE, type GameEvent, type GameLog, type ShipId, type Side } from './types';
import { FLEET } from './constants';

export const PROTOCOL_VERSION = 1;

const SHIP_IDS = new Set<string>(FLEET.map((s) => s.id));

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

/** A finished game is at most one shot per cell per side, plus a few framing
 * events. Anything past this is malformed/hostile and rejected outright. */
export const MAX_LOG_EVENTS = 2 * BOARD_SIZE * BOARD_SIZE + 4;

/** True when `short` is an exact prefix of `long` (same events, same order). */
function isPrefix(short: GameLog, long: GameLog): boolean {
  if (short.length > long.length) return false;
  for (let i = 0; i < short.length; i++) {
    if (JSON.stringify(short[i]) !== JSON.stringify(long[i])) return false;
  }
  return true;
}

/**
 * Given our log and a peer's log, return the authoritative one.
 *
 * Invariant (see engine.ts): every log position is written by exactly one
 * peer, and both peers process events in the same order, so one log is always a
 * prefix of the other. The longer log therefore supersedes the shorter with no
 * merge conflict; on a tie we keep our own copy so the result is stable and
 * idempotent. (The `full-game-through-a-disconnect` integration test exercises
 * this convergence end to end.)
 *
 * We only adopt a longer peer log when it genuinely *extends* ours. A longer log
 * that diverges from our history can't have come from an honest peer following
 * the invariant — it's corrupt or forged — so we keep our own rather than let it
 * overwrite a valid game. (Shape is already checked by `isMessage`; this is the
 * consistency check on top of it.)
 */
export function reconcileLogs(ours: GameLog, theirs: GameLog): GameLog {
  if (theirs.length > ours.length && isPrefix(ours, theirs)) return theirs;
  return ours;
}

// ── Inbound validation ───────────────────────────────────────────────────────
// Messages arrive from *another device* — a peer that may be buggy, running a
// mismatched app version, or (since anyone with the game code can dial in)
// hostile. We therefore validate the full *shape* of every message before it
// reaches game logic, not just its `t` tag. An out-of-range coordinate fed into
// the engine would index off the board and crash the whole React tree (a
// white-screen DoS), so anything malformed is dropped at this single choke
// point (see net/peer.ts, which only forwards messages that pass `isMessage`).

function isInt(n: unknown, min: number, max: number): boolean {
  return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;
}

function isCell(o: { row?: unknown; col?: unknown }): boolean {
  return isInt(o.row, 0, BOARD_SIZE - 1) && isInt(o.col, 0, BOARD_SIZE - 1);
}

function isSide(s: unknown): s is Side {
  return s === 'host' || s === 'guest';
}

function isShipId(s: unknown): s is ShipId {
  return typeof s === 'string' && SHIP_IDS.has(s);
}

function isGameEvent(e: unknown): e is GameEvent {
  if (typeof e !== 'object' || e === null) return false;
  const ev = e as Record<string, unknown>;
  if (ev.type === 'start') return isSide(ev.first);
  if (ev.type === 'shot') {
    return (
      isSide(ev.by) &&
      isCell(ev) &&
      typeof ev.hit === 'boolean' &&
      (ev.sunk === null || isShipId(ev.sunk)) &&
      typeof ev.allSunk === 'boolean'
    );
  }
  return false;
}

/**
 * Runtime guard for messages arriving off the wire: validates both the `t` tag
 * and the payload shape for that tag. Returns false (→ message dropped) for
 * anything malformed, out of range, or of the wrong type.
 */
export function isMessage(value: unknown): value is Message {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  switch (m.t) {
    case 'hello':
      return typeof m.v === 'number' && isSide(m.side) && typeof m.name === 'string' && typeof m.skinId === 'string';
    case 'ready':
      return typeof m.ready === 'boolean';
    case 'sync':
      return (
        Array.isArray(m.log) &&
        m.log.length <= MAX_LOG_EVENTS &&
        m.log.every(isGameEvent) &&
        typeof m.ready === 'boolean'
      );
    case 'fire':
      return isCell(m);
    case 'shot':
      return isGameEvent(m.event) && (m.event as GameEvent).type === 'shot';
    case 'start':
      return isSide(m.first);
    case 'rematch':
      return true;
    default:
      return false;
  }
}
