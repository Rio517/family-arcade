/**
 * Risk rules — all pure functions, no I/O. The engine is map-agnostic: every
 * function that needs geography takes a `MapTopology`.
 *
 * Turn shape: **reinforce** (place armies from territory count + continent
 * bonuses) → **attack** (dice, 3 v 2, defender wins ties) → **fortify** (one
 * move between connected owned territories) → next living player. Win by holding
 * every territory (equivalently, being the last player left).
 *
 * The game opens with a **setup** (deploy) phase: territories are split as
 * evenly as the count allows (one army each), then each general in turn places
 * their remaining starting armies on their own lands — the part players enjoy.
 * Once everyone has deployed, the strategic game begins at the first reinforce.
 */

import type {
  BattleResult,
  GameState,
  MapTopology,
  PlayerState,
  TerritoryState,
} from './types';

/** Classic starting-army counts by player count. */
const STARTING_ARMIES: Record<number, number> = { 2: 40, 3: 35, 4: 30, 5: 25, 6: 20 };

export interface NewPlayer {
  name: string;
  color: string;
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const die = (rng: () => number) => Math.floor(rng() * 6) + 1;

/** Deal the board (one army per territory); players then deploy in setup. */
export function newGame(map: MapTopology, newPlayers: NewPlayer[], rng: () => number = Math.random): GameState {
  const players: PlayerState[] = newPlayers.map((p, id) => ({
    id,
    name: p.name,
    color: p.color,
    alive: true,
  }));

  // Deal territories round-robin over a shuffled order, 1 army each.
  const dealt = shuffle(map.territoryIds, rng);
  const territories: Record<string, TerritoryState> = {};
  dealt.forEach((tid, i) => {
    territories[tid] = { owner: i % players.length, armies: 1 };
  });

  const state: GameState = {
    mapId: map.id,
    players,
    territories,
    current: 0,
    phase: 'setup',
    toPlace: 0,
    conqueredThisTurn: false,
    winner: null,
  };
  // The first general deploys their remaining starting armies by hand.
  state.toPlace = deployReserve(state, 0);
  return state;
}

/** How many starting armies a player still has to deploy (beyond the one
 *  already sitting on each of their territories). */
export function deployReserve(state: GameState, playerId: number): number {
  const starting = STARTING_ARMIES[state.players.length] ?? 30;
  return Math.max(0, starting - territoriesOf(state, playerId).length);
}

/**
 * Finish the current general's deployment and hand off. When the last general
 * has deployed, the campaign opens at the first player's reinforce.
 */
export function endSetup(state: GameState, map: MapTopology): GameState {
  if (state.phase !== 'setup' || state.toPlace > 0) return state;
  const next = state.current + 1;
  if (next < state.players.length) {
    const handed: GameState = { ...state, current: next, phase: 'setup', toPlace: 0 };
    handed.toPlace = deployReserve(handed, next);
    return handed;
  }
  // Everyone has deployed — begin the real game at player 0.
  const started: GameState = { ...state, current: 0, phase: 'reinforce', toPlace: 0, conqueredThisTurn: false };
  started.toPlace = reinforcementCount(started, map, 0);
  return started;
}

/** Territory ids owned by a player. */
export function territoriesOf(state: GameState, playerId: number): string[] {
  return Object.keys(state.territories).filter((t) => state.territories[t].owner === playerId);
}

/** Armies a player gets to place at the start of their turn. */
export function reinforcementCount(state: GameState, map: MapTopology, playerId: number): number {
  const owned = new Set(territoriesOf(state, playerId));
  let armies = Math.max(3, Math.floor(owned.size / 3));
  for (const cont of map.continents) {
    if (cont.territoryIds.every((t) => owned.has(t))) armies += cont.bonus;
  }
  return armies;
}

const current = (state: GameState) => state.players[state.current];

/** Place one army on an owned territory — during setup deploy or reinforce. */
export function placeArmy(state: GameState, territoryId: string): GameState {
  if ((state.phase !== 'reinforce' && state.phase !== 'setup') || state.toPlace <= 0) return state;
  const t = state.territories[territoryId];
  if (!t || t.owner !== state.current) return state;
  return {
    ...state,
    territories: { ...state.territories, [territoryId]: { ...t, armies: t.armies + 1 } },
    toPlace: state.toPlace - 1,
  };
}

/** Finish placing reinforcements and move to the attack phase. */
export function endReinforce(state: GameState): GameState {
  if (state.phase !== 'reinforce' || state.toPlace > 0) return state;
  return { ...state, phase: 'attack' };
}

/** Can the current player attack from → to right now? */
export function canAttack(state: GameState, map: MapTopology, from: string, to: string): boolean {
  if (state.phase !== 'attack') return false;
  const f = state.territories[from];
  const t = state.territories[to];
  if (!f || !t) return false;
  if (f.owner !== state.current || t.owner === state.current) return false;
  if (f.armies < 2) return false;
  return (map.adjacency[from] ?? []).includes(to);
}

/**
 * Resolve one attack roll. Returns the new state and a `BattleResult` for the
 * UI. A conquered territory is captured and the attacking dice count moves in.
 */
export function resolveAttack(
  state: GameState,
  map: MapTopology,
  from: string,
  to: string,
  rng: () => number = Math.random,
): { state: GameState; result: BattleResult } {
  const noop: BattleResult = { from, to, attackerDice: [], defenderDice: [], attackerLosses: 0, defenderLosses: 0, captured: false };
  if (!canAttack(state, map, from, to)) return { state, result: noop };

  const f = state.territories[from];
  const t = state.territories[to];
  const nAtt = Math.min(3, f.armies - 1);
  const nDef = Math.min(2, t.armies);
  const attackerDice = Array.from({ length: nAtt }, () => die(rng)).sort((a, b) => b - a);
  const defenderDice = Array.from({ length: nDef }, () => die(rng)).sort((a, b) => b - a);

  let attackerLosses = 0;
  let defenderLosses = 0;
  for (let i = 0; i < Math.min(nAtt, nDef); i++) {
    if (attackerDice[i] > defenderDice[i]) defenderLosses++;
    else attackerLosses++; // ties favour the defender
  }

  let fromArmies = f.armies - attackerLosses;
  let toArmies = t.armies - defenderLosses;
  const territories = { ...state.territories };
  let captured = false;
  let owner = t.owner;

  if (toArmies <= 0) {
    captured = true;
    owner = state.current;
    const move = Math.min(nAtt, fromArmies - 1); // advance the attacking force
    fromArmies -= move;
    toArmies = move;
  }

  territories[from] = { ...f, armies: fromArmies };
  territories[to] = { owner, armies: toArmies };

  let next: GameState = {
    ...state,
    territories,
    conqueredThisTurn: state.conqueredThisTurn || captured,
  };
  if (captured) next = settle(next, map);

  return { state: next, result: { from, to, attackerDice, defenderDice, attackerLosses, defenderLosses, captured } };
}

/** Mark wiped-out players dead and declare a winner if only one remains. */
function settle(state: GameState, _map: MapTopology): GameState {
  const players = state.players.map((p) => ({
    ...p,
    alive: p.alive && territoriesOf(state, p.id).length > 0,
  }));
  const aliveIds = players.filter((p) => p.alive).map((p) => p.id);
  const winner = aliveIds.length === 1 ? aliveIds[0] : null;
  return { ...state, players, winner, phase: winner !== null ? 'over' : state.phase };
}

/** End the attack phase and move to fortify. */
export function endAttack(state: GameState): GameState {
  if (state.phase !== 'attack') return state;
  return { ...state, phase: 'fortify' };
}

/** Territories reachable from `from` through the current player's own land. */
export function connectedOwned(state: GameState, map: MapTopology, from: string): Set<string> {
  const owner = state.territories[from]?.owner;
  const seen = new Set<string>([from]);
  const stack = [from];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const n of map.adjacency[cur] ?? []) {
      if (!seen.has(n) && state.territories[n]?.owner === owner) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  seen.delete(from);
  return seen;
}

export function canFortify(state: GameState, map: MapTopology, from: string, to: string): boolean {
  if (state.phase !== 'fortify') return false;
  const f = state.territories[from];
  const t = state.territories[to];
  if (!f || !t || f.owner !== state.current || t.owner !== state.current) return false;
  if (from === to || f.armies < 2) return false;
  return connectedOwned(state, map, from).has(to);
}

/** Move `count` armies between connected owned territories, then end the turn. */
export function fortify(state: GameState, map: MapTopology, from: string, to: string, count: number): GameState {
  if (!canFortify(state, map, from, to)) return state;
  const f = state.territories[from];
  const t = state.territories[to];
  const move = Math.max(1, Math.min(count, f.armies - 1));
  const moved: GameState = {
    ...state,
    territories: {
      ...state.territories,
      [from]: { ...f, armies: f.armies - move },
      [to]: { ...t, armies: t.armies + move },
    },
  };
  return nextTurn(moved, map);
}

/** Skip fortifying and pass to the next living player. */
export function endTurn(state: GameState, map: MapTopology): GameState {
  if (state.phase !== 'fortify' && state.phase !== 'attack') return state;
  return nextTurn(state, map);
}

function nextTurn(state: GameState, map: MapTopology): GameState {
  if (state.winner !== null) return { ...state, phase: 'over' };
  const n = state.players.length;
  let idx = state.current;
  for (let i = 0; i < n; i++) {
    idx = (idx + 1) % n;
    if (state.players[idx].alive) break;
  }
  const started: GameState = {
    ...state,
    current: idx,
    phase: 'reinforce',
    conqueredThisTurn: false,
    toPlace: 0,
  };
  started.toPlace = reinforcementCount(started, map, idx);
  return started;
}

export { current as currentPlayer };
