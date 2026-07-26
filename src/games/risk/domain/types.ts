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
}

export interface TerritoryState {
  /** Owning player id, or -1 while unclaimed during setup. */
  owner: number;
  armies: number;
}

export type Phase = 'setup' | 'reinforce' | 'attack' | 'fortify' | 'over';

export interface GameState {
  mapId: string;
  players: PlayerState[];
  territories: Record<string, TerritoryState>;
  /** Index of the player whose turn it is. */
  current: number;
  phase: Phase;
  /** Armies still to place this reinforce (or setup) phase. */
  toPlace: number;
  /** Set true once the current player captures a territory this turn. */
  conqueredThisTurn: boolean;
  winner: number | null;
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
