/**
 * Core domain types for Battleship.
 *
 * The whole game is modelled as an *event-sourced* value: given a player's
 * private ship placement (their `Fleet`) and the shared, ordered `GameLog`,
 * every visible piece of state — whose turn it is, which cells are hit, who
 * has won — is a pure function of those two inputs. Nothing here touches the
 * DOM, the network, or `localStorage`, which is what makes it exhaustively
 * testable and safe to replay after a reconnect.
 */

export const BOARD_SIZE = 10;

export type ShipId =
  | 'carrier'
  | 'battleship'
  | 'cruiser'
  | 'submarine'
  | 'destroyer';

export type Orientation = 'H' | 'V';

/**
 * Which navy a captain sails in the 3D view — the classic WWII fleet or the
 * modern one. Purely cosmetic (same ships, same sizes, same rules) and purely
 * local: each player picks their own on the fleet screen, and nothing about
 * it crosses the wire.
 */
export type FleetEra = 'classic' | 'modern';

/** Which side of the connection a player is. Also drives turn order. */
export type Side = 'host' | 'guest';

export interface ShipSpec {
  id: ShipId;
  name: string;
  size: number;
}

export interface Coord {
  row: number;
  col: number;
}

/** A single ship placed on a board: its anchor (top/left-most cell) + heading. */
export interface Placement {
  shipId: ShipId;
  row: number;
  col: number;
  orientation: Orientation;
}

/** A complete, legal set of placements — one entry per ship in the fleet. */
export type Fleet = Placement[];

// ── Event log ────────────────────────────────────────────────────────────
// The shared timeline. Exactly one player "writes" each event (see engine),
// so two reconnecting peers can always reconcile by taking the longer log.

export interface StartEvent {
  type: 'start';
  /** Who fires first. */
  first: Side;
}

export interface ShotEvent {
  type: 'shot';
  /** Who fired this shot. */
  by: Side;
  row: number;
  col: number;
  hit: boolean;
  /** Set to the ship id if this shot completed a sinking. */
  sunk: ShipId | null;
  /** True when this shot sank the defender's final ship. */
  allSunk: boolean;
}

export type GameEvent = StartEvent | ShotEvent;
export type GameLog = GameEvent[];
