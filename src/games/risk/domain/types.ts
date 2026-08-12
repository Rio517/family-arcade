/**
 * Core domain types for Risk (world-conquest), a hot-seat game for 2–6 players
 * on a single shared board.
 *
 * The engine is **map-agnostic**: it operates on an abstract `MapTopology`
 * (which territories exist, how they're grouped into scoring continents, and
 * who borders whom). The actual geography — country shapes, projection — lives
 * in the map modules under ../maps and never touches the rules, so new maps are
 * pure data. Everything here is a pure value; nothing touches the DOM, network,
 * or storage.
 */

/** A scoring group of territories; owning all of them pays `bonus` armies/turn. */
export interface Continent {
  id: string;
  name: string;
  bonus: number;
  territoryIds: string[];
}

/** The topology the rules need — no geometry. Supplied by a map module. */
export interface MapTopology {
  id: string;
  name: string;
  territoryIds: string[];
  continents: Continent[];
  /** Undirected adjacency: `adjacency[a]` lists every territory bordering `a`. */
  adjacency: Record<string, string[]>;
}

export interface PlayerState {
  /** Stable index into the players array. */
  id: number;
  name: string;
  color: string;
  alive: boolean;
  /** Computer persona id (see domain/bots) — absent means a human seat. */
  bot?: string;
}

export interface TerritoryState {
  /** Owning player id, or -1 while unclaimed during setup. */
  owner: number;
  armies: number;
}

export type Phase = 'setup' | 'reinforce' | 'attack' | 'fortify' | 'over';

/**
 * How battle dice behave.
 * - `random`: every roll is pure, independent luck (classic).
 * - `balanced`: dice are drawn from a shuffled bag holding every face equally
 *   (refilled when empty), so results still vary but luck evens out over time
 *   and long cruel streaks can't happen — outcomes track the true odds.
 */
export type DiceMode = 'random' | 'balanced';

export interface GameState {
  mapId: string;
  players: PlayerState[];
  territories: Record<string, TerritoryState>;
  /** Index of the player whose turn it is. */
  current: number;
  phase: Phase;
  /** Armies still to place this reinforce (or setup) phase. */
  toPlace: number;
  /** The most recent capture, while extra armies may still be marched into it
   *  (see `advance`). Settled — null — by the next attack, or phase end.
   *  Optional because saves from before this field exist. */
  lastConquest?: { from: string; to: string } | null;
  winner: number | null;
  /** Battle-dice behaviour, chosen at setup. */
  diceMode: DiceMode;
  /** Remaining faces in the attacker's balanced-mode shuffle bag (empty in
   *  random mode). Attack and defense draw from SEPARATE bags — a shared bag
   *  would anti-correlate the rolls (a hot attacker draw would literally
   *  remove the good dice from the defender's pool). */
  diceBag: number[];
  /** Remaining faces in the defender's balanced-mode shuffle bag. */
  defenseBag: number[];
}

/** The outcome of one attack roll, kept for the UI to animate. */
export interface BattleResult {
  from: string;
  to: string;
  attackerDice: number[];
  defenderDice: number[];
  attackerLosses: number;
  defenderLosses: number;
  captured: boolean;
}
