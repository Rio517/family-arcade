/**
 * Wire protocol for online chess + log reconciliation.
 *
 * Mirrors the Ship Battle protocol: a tiny set of framed messages, an inbound
 * shape-validator (`isChessMessage`) that fully checks anything off the network
 * before it touches game logic, and the generic "longer log wins" reconcile.
 *
 * The single-writer invariant carries over cleanly: each ply is authored by the
 * side whose turn it is, and turns strictly alternate, so two peers' logs are
 * always prefix-compatible — reconciliation is just "adopt a peer's log iff it
 * extends mine."
 */

import type { GameLog, Ply, PromotionType, Side } from './types';

export const CHESS_PROTOCOL_VERSION = 1;

export interface HelloMsg {
  t: 'hello';
  v: number;
  side: Side;
  name: string;
}

/** Full-state resync sent on every (re)connect. */
export interface SyncMsg {
  t: 'sync';
  log: GameLog;
  wantRematch: boolean;
  /**
   * The sender's game epoch (bumped on every rematch reset). A sync from an
   * older epoch is stale — its finished log must never resurrect a game that
   * both sides already reset. Optional for back-compat: builds that predate
   * epochs send syncs without it, which readers treat as epoch 0.
   */
  epoch?: number;
}

/** A single played move. */
export interface MoveMsg {
  t: 'move';
  ply: Ply;
}

export interface RematchMsg {
  t: 'rematch';
}

export type ChessMessage = HelloMsg | SyncMsg | MoveMsg | RematchMsg;

const SIDES: Side[] = ['host', 'guest'];
const PROMOS: PromotionType[] = ['q', 'r', 'b', 'n'];

function isSquare(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.row === 'number' && Number.isInteger(s.row) && s.row >= 0 && s.row < 8 &&
    typeof s.col === 'number' && Number.isInteger(s.col) && s.col >= 0 && s.col < 8
  );
}

function isPly(v: unknown): v is Ply {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Record<string, unknown>;
  if (!isSquare(p.from) || !isSquare(p.to)) return false;
  if (p.promotion !== undefined && !PROMOS.includes(p.promotion as PromotionType)) return false;
  return true;
}

/** Hard ceiling on a synced log's length (see the sync case below). */
export const MAX_LOG_PLIES = 1000;

/**
 * Validate an arbitrary value off the wire as a well-formed ChessMessage. This
 * is the single choke point (called in the transport) that guarantees every
 * `ply` carries in-range squares, so a malformed or malicious peer can never
 * feed an out-of-bounds coordinate into the engine.
 */
export function isChessMessage(value: unknown): value is ChessMessage {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  switch (m.t) {
    case 'hello':
      return (
        typeof m.v === 'number' &&
        SIDES.includes(m.side as Side) &&
        typeof m.name === 'string'
      );
    case 'sync':
      return (
        typeof m.wantRematch === 'boolean' &&
        Array.isArray(m.log) &&
        // Longest recorded serious games sit under 300 plies; the cap only
        // exists so a forged giant log can't stall replay() on the receiver.
        m.log.length <= MAX_LOG_PLIES &&
        m.log.every(isPly) &&
        // Epoch is optional (older builds omit it = epoch 0) but when present
        // it must be a sane small integer, never NaN/negative/fractional.
        (m.epoch === undefined ||
          (typeof m.epoch === 'number' &&
            Number.isInteger(m.epoch) &&
            m.epoch >= 0 &&
            m.epoch <= 1e6))
      );
    case 'move':
      return isPly(m.ply);
    case 'rematch':
      return true;
    default:
      return false;
  }
}

/** True if `short` is a (non-strict) prefix of `long`. */
function isPrefix(short: GameLog, long: GameLog): boolean {
  if (short.length > long.length) return false;
  for (let i = 0; i < short.length; i++) {
    const a = short[i];
    const b = long[i];
    if (
      a.from.row !== b.from.row || a.from.col !== b.from.col ||
      a.to.row !== b.to.row || a.to.col !== b.to.col ||
      a.promotion !== b.promotion
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Adopt the peer's log only if it strictly extends ours (longer *and* a prefix
 * match). A longer-but-divergent log is treated as corrupt and rejected, which
 * preserves the single-writer guarantee.
 */
export function reconcileLogs(ours: GameLog, theirs: GameLog): GameLog {
  if (theirs.length > ours.length && isPrefix(ours, theirs)) return theirs;
  return ours;
}
