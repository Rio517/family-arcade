/**
 * The game engine: pure reductions over the shared event log.
 *
 * ── Why event sourcing ──────────────────────────────────────────────────
 * The only durable, shared truth is an ordered `GameLog`. Each player also
 * holds one private input: their own `Fleet`. Every view the UI needs is a
 * pure function of `(log)` and, for one's own board, `(log, myFleet)`.
 *
 * This buys us two things for free:
 *   1. Reconnect/resume — replay the log and you are exactly where you left
 *      off. Two peers reconcile by keeping the longer log (see protocol.ts).
 *   2. Testability — no mutable board, no hidden state, no network mocks
 *      needed to test the rules.
 *
 * ── Single-writer invariant ─────────────────────────────────────────────
 * A `ShotEvent` is minted by the *defender* (the player who owns the targeted
 * board), because only they can resolve hit/sunk against their private fleet.
 * Since turns strictly alternate, exactly one player is the defender at any
 * moment — so no two peers ever author the same log position. That is what
 * makes "longer log wins" a safe merge.
 */

import { FLEET, otherSide, shipSpec } from './constants';
import {
  BOARD_SIZE,
  type Coord,
  type Fleet,
  type GameLog,
  type ShipId,
  type ShotEvent,
  type Side,
} from './types';
import { coordKey, occupantAt, shipCells } from './board';

/** Every shot fired *by* a given side, in order. */
export function shotsBy(log: GameLog, side: Side): ShotEvent[] {
  return log.filter((e): e is ShotEvent => e.type === 'shot' && e.by === side);
}

/** Has the opening `start` event been written yet? */
export function hasStarted(log: GameLog): boolean {
  return log.length > 0 && log[0].type === 'start';
}

function firstMover(log: GameLog): Side | null {
  const head = log[0];
  return head && head.type === 'start' ? head.first : null;
}

/**
 * Whose turn it is to fire, or null if the game hasn't started or is over.
 * Turns alternate starting from the `start` event's `first`.
 */
export function currentTurn(log: GameLog): Side | null {
  const first = firstMover(log);
  if (first === null) return null;
  if (winner(log) !== null) return null;
  const shots = log.filter((e) => e.type === 'shot').length;
  return shots % 2 === 0 ? first : otherSide(first);
}

/** The side that has sunk all enemy ships, or null if the game is ongoing. */
export function winner(log: GameLog): Side | null {
  for (const e of log) {
    if (e.type === 'shot' && e.allSunk) return e.by;
  }
  return null;
}

export function isGameOver(log: GameLog): boolean {
  return winner(log) !== null;
}

/**
 * Resolve a shot at `target` against `defenderFleet`, given every shot the
 * attacker has *already* landed (not including the new one). Pure: the caller
 * decides whether/where to append the resulting event.
 */
export function resolveShot(
  defenderFleet: Fleet,
  priorAttackerShots: Coord[],
  target: Coord,
  by: Side,
): ShotEvent {
  const hitShip = occupantAt(defenderFleet, target.row, target.col);
  const landed = new Set(priorAttackerShots.map((c) => coordKey(c.row, c.col)));
  landed.add(coordKey(target.row, target.col));

  const isSunk = (shipId: ShipId): boolean => {
    const placement = defenderFleet.find((p) => p.shipId === shipId);
    if (!placement) return false;
    return shipCells(placement).every((c) => landed.has(coordKey(c.row, c.col)));
  };

  const sunk = hitShip && isSunk(hitShip) ? hitShip : null;
  const allSunk = defenderFleet.length === FLEET.length && FLEET.every((s) => isSunk(s.id));

  return {
    type: 'shot',
    by,
    row: target.row,
    col: target.col,
    hit: hitShip !== null,
    sunk,
    allSunk,
  };
}

/**
 * Resolve an incoming fire request as the defender. Returns the settled shot
 * event and whether it is a *resend* — i.e. we had already resolved this exact
 * cell. On a resend the caller re-transmits the existing event (so a peer whose
 * reply was lost recovers) but must NOT append it to the log again. This is the
 * pure core of the `fire` message handler, extracted so it can be tested
 * directly instead of only through the network glue.
 */
export function resolveIncomingFire(
  log: GameLog,
  defenderFleet: Fleet,
  defenderSide: Side,
  target: Coord,
): { event: ShotEvent; isResend: boolean } {
  const attacker = otherSide(defenderSide);
  const existing = shotsBy(log, attacker).find((e) => e.row === target.row && e.col === target.col);
  if (existing) return { event: existing, isResend: true };
  const prior = shotsBy(log, attacker).map((e) => ({ row: e.row, col: e.col }));
  return { event: resolveShot(defenderFleet, prior, target, attacker), isResend: false };
}

export type CellState = 'unknown' | 'miss' | 'hit' | 'sunk';

/**
 * The attacker's radar view: what `side` knows about the enemy board from the
 * results of their own shots. Cells they haven't fired at read 'unknown'.
 */
export function radarGrid(log: GameLog, side: Side): CellState[][] {
  const grid = emptyGrid<CellState>('unknown');
  for (const shot of shotsBy(log, side)) {
    grid[shot.row][shot.col] = shot.hit ? (shot.sunk ? 'sunk' : 'hit') : 'miss';
  }
  // Only the *finishing* shot on a ship is marked 'sunk'. The attacker can't
  // light up a ship's whole silhouette: the log alone doesn't say which of
  // their earlier hits belonged to that ship (they have no enemy geometry). The
  // move log announces the kill by name; the defender's own board (ownBoardView)
  // does show the full sunk silhouette because it has the fleet.
  return grid;
}

/**
 * The defender's own-fleet view: which of *my* cells the enemy has hit. Needs
 * my private fleet plus the enemy's shots (derived from the log).
 */
export interface OwnBoardView {
  /** Where the enemy has fired on me, indexed by cell. */
  incoming: CellState[][];
  /** Ships of mine that are fully sunk. */
  sunkShips: Set<ShipId>;
}

export function ownBoardView(log: GameLog, myFleet: Fleet, mySide: Side): OwnBoardView {
  const incoming = emptyGrid<CellState>('unknown');
  const enemyShots = shotsBy(log, otherSide(mySide));
  const landed = new Set<string>();
  for (const s of enemyShots) {
    incoming[s.row][s.col] = s.hit ? 'hit' : 'miss';
    if (s.hit) landed.add(coordKey(s.row, s.col));
  }

  const sunkShips = new Set<ShipId>();
  for (const p of myFleet) {
    if (shipCells(p).every((c) => landed.has(coordKey(c.row, c.col)))) {
      sunkShips.add(p.shipId);
      for (const c of shipCells(p)) incoming[c.row][c.col] = 'sunk';
    }
  }

  return { incoming, sunkShips };
}

/** How many of `side`'s ship-cells remain unhit (used for scoring). */
export function survivingCells(log: GameLog, myFleet: Fleet, mySide: Side): number {
  const enemyShots = shotsBy(log, otherSide(mySide));
  const hits = new Set(enemyShots.filter((s) => s.hit).map((s) => coordKey(s.row, s.col)));
  let alive = 0;
  for (const p of myFleet) {
    for (const c of shipCells(p)) if (!hits.has(coordKey(c.row, c.col))) alive++;
  }
  return alive;
}

/** Ships the attacker (`side`) has sunk so far, newest last. */
export function sunkByAttacker(log: GameLog, side: Side): ShipId[] {
  return shotsBy(log, side)
    .filter((s) => s.sunk !== null)
    .map((s) => s.sunk as ShipId);
}

export function shipName(id: ShipId): string {
  return shipSpec(id).name;
}

// ── helpers ────────────────────────────────────────────────────────────────

function emptyGrid<T>(fill: T): T[][] {
  return Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => fill));
}
