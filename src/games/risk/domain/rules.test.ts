import { describe, expect, it } from 'vitest';
import {
  canAttack,
  canFortify,
  connectedOwned,
  deployReserve,
  endAttack,
  endReinforce,
  endTurn,
  fortify,
  hasUnclaimed,
  newGame,
  placeArmy,
  reinforcementCount,
  resolveAttack,
  territoriesOf,
} from './rules';
import type { GameState, MapTopology, TerritoryState } from './types';

/** A tiny 6-territory, 2-continent test map: a-b-c ring to d-e-f. */
const MAP: MapTopology = {
  id: 'test',
  name: 'Test',
  territoryIds: ['a', 'b', 'c', 'd', 'e', 'f'],
  continents: [
    { id: 'X', name: 'X', bonus: 2, territoryIds: ['a', 'b', 'c'] },
    { id: 'Y', name: 'Y', bonus: 3, territoryIds: ['d', 'e', 'f'] },
  ],
  adjacency: {
    a: ['b', 'f', 'd'],
    b: ['a', 'c'],
    c: ['b', 'd'],
    d: ['c', 'e', 'a'],
    e: ['d', 'f'],
    f: ['e', 'a'],
  },
};

/** Build a state directly (bypassing the random deal) for precise tests. */
function state(owners: Record<string, [number, number]>, over: Partial<GameState> = {}): GameState {
  const territories: Record<string, TerritoryState> = {};
  for (const t of MAP.territoryIds) {
    const [owner, armies] = owners[t];
    territories[t] = { owner, armies };
  }
  return {
    mapId: 'test',
    players: [
      { id: 0, name: 'P0', color: '#f00', alive: true },
      { id: 1, name: 'P1', color: '#00f', alive: true },
    ],
    territories,
    current: 0,
    phase: 'attack',
    toPlace: 0,
    conqueredThisTurn: false,
    winner: null,
    ...over,
  };
}

/** An RNG that plays back a fixed sequence of [0,1) values. */
function scriptedRng(seq: number[]): () => number {
  let i = 0;
  return () => seq[i++ % seq.length];
}

describe('newGame', () => {
  it('opens with every territory unclaimed and the first general claiming', () => {
    const g = newGame(MAP, [{ name: 'A', color: '#f00' }, { name: 'B', color: '#00f' }], scriptedRng([0.5]));
    expect(Object.values(g.territories).every((t) => t.owner === -1 && t.armies === 0)).toBe(true);
    expect(hasUnclaimed(g)).toBe(true);
    expect(g.phase).toBe('setup');
    expect(g.current).toBe(0);
    // 2 players → the whole 40-army allotment is still in hand.
    expect(g.toPlace).toBe(40);
    expect(deployReserve(g, 1)).toBe(40);
  });
});

describe('setup — claim then deploy, one army per turn', () => {
  const twoPlayer = () =>
    newGame(MAP, [{ name: 'A', color: '#f00' }, { name: 'B', color: '#00f' }], scriptedRng([0.5]));
  const armiesOf = (g: GameState, p: number) =>
    territoriesOf(g, p).reduce((s, t) => s + g.territories[t].armies, 0);
  /** Play one legal setup placement for whoever is current. */
  const playOne = (g: GameState): GameState => {
    const target = hasUnclaimed(g)
      ? MAP.territoryIds.find((t) => g.territories[t].owner === -1)!
      : territoriesOf(g, g.current)[0];
    return placeArmy(g, target, MAP);
  };

  it('claiming a free land takes it with one army and rotates automatically', () => {
    let g = twoPlayer();
    g = placeArmy(g, 'a', MAP);
    expect(g.territories.a).toEqual({ owner: 0, armies: 1 });
    expect(g.current).toBe(1); // play passed straight on
    expect(g.toPlace).toBe(40); // player 1's whole reserve
    expect(deployReserve(g, 0)).toBe(39);

    // Player 1 cannot steal a claimed land during the claim stage…
    expect(placeArmy(g, 'a', MAP)).toBe(g);
    // …and claims of their own rotate back.
    g = placeArmy(g, 'b', MAP);
    expect(g.territories.b).toEqual({ owner: 1, armies: 1 });
    expect(g.current).toBe(0);
  });

  it('alternating claims split the board, then deploys fill it, then reinforce opens', () => {
    let g = twoPlayer();
    // Claim all 6 lands: alternation gives each general 3.
    for (let i = 0; i < 6; i++) g = playOne(g);
    expect(hasUnclaimed(g)).toBe(false);
    expect(territoriesOf(g, 0)).toHaveLength(3);
    expect(territoriesOf(g, 1)).toHaveLength(3);
    expect(g.phase).toBe('setup'); // deploy stage continues

    // During deploy a general cannot stack an opponent's land.
    const enemy = territoriesOf(g, 1 - g.current)[0];
    expect(placeArmy(g, enemy, MAP)).toBe(g);

    // Drain both reserves; the campaign then opens at player 0's reinforce.
    for (let guard = 0; guard < 200 && g.phase === 'setup'; guard++) g = playOne(g);
    expect(g.phase).toBe('reinforce');
    expect(g.current).toBe(0);
    expect(armiesOf(g, 0)).toBe(40);
    expect(armiesOf(g, 1)).toBe(40);
    expect(g.toPlace).toBeGreaterThanOrEqual(3);
  });
});

describe('reinforcementCount', () => {
  it('is at least 3, else territories / 3', () => {
    // P0 owns all 6 → floor(6/3)=2 → min 3, plus both continent bonuses (2+3).
    const g = state({ a: [0, 1], b: [0, 1], c: [0, 1], d: [0, 1], e: [0, 1], f: [0, 1] });
    expect(reinforcementCount(g, MAP, 0)).toBe(3 + 2 + 3);
  });

  it('adds a continent bonus only when the whole continent is held', () => {
    // P0 holds all of X (a,b,c) but not Y.
    const g = state({ a: [0, 1], b: [0, 1], c: [0, 1], d: [1, 1], e: [1, 1], f: [1, 1] });
    expect(reinforcementCount(g, MAP, 0)).toBe(3 + 2); // base 3 + X bonus
  });
});

describe('reinforce phase', () => {
  it('places armies on owned territories and advances to attack', () => {
    let g = state({ a: [0, 1], b: [0, 1], c: [0, 1], d: [1, 1], e: [1, 1], f: [1, 1] }, { phase: 'reinforce', toPlace: 2 });
    g = placeArmy(g, 'a');
    g = placeArmy(g, 'b');
    expect(g.territories.a.armies).toBe(2);
    expect(g.toPlace).toBe(0);
    expect(placeArmy(g, 'c')).toBe(g); // nothing left to place → no-op
    g = endReinforce(g);
    expect(g.phase).toBe('attack');
  });

  it('refuses to place on an enemy territory', () => {
    const g = state({ a: [0, 1], b: [0, 1], c: [0, 1], d: [1, 1], e: [1, 1], f: [1, 1] }, { phase: 'reinforce', toPlace: 2 });
    expect(placeArmy(g, 'd')).toBe(g);
  });
});

describe('attack', () => {
  it('permits an attack on an adjacent enemy from a 2+ army territory', () => {
    const g = state({ a: [0, 3], b: [0, 1], c: [0, 1], d: [1, 1], e: [1, 1], f: [1, 1] });
    expect(canAttack(g, MAP, 'a', 'd')).toBe(true); // a→d adjacent, enemy
    expect(canAttack(g, MAP, 'a', 'b')).toBe(false); // own territory
    expect(canAttack(g, MAP, 'b', 'a')).toBe(false); // only 1 army
  });

  it('captures a territory and advances the attacking dice when the defender is wiped out', () => {
    const g = state({ a: [0, 3], b: [0, 1], c: [0, 1], d: [1, 1], e: [1, 1], f: [1, 1] });
    // attacker rolls [6,6], defender rolls [1] → defender loses its one army.
    const { state: next, result } = resolveAttack(g, MAP, 'a', 'd', scriptedRng([0.99, 0.99, 0.0]));
    expect(result.captured).toBe(true);
    expect(next.territories.d.owner).toBe(0);
    expect(next.territories.d.armies).toBe(2); // min(nAtt=2, from-1=2)
    expect(next.territories.a.armies).toBe(1); // 3 - 2 advanced
    expect(next.conqueredThisTurn).toBe(true);
  });

  it('a tie favours the defender', () => {
    const g = state({ a: [0, 2], b: [0, 1], c: [0, 1], d: [1, 2], e: [1, 1], f: [1, 1] });
    // attacker 1 die [4], defender 2 dice [4,x] → top pair tie → attacker loses.
    const { state: next } = resolveAttack(g, MAP, 'a', 'd', scriptedRng([0.5, 0.5, 0.0]));
    expect(next.territories.a.armies).toBe(1); // attacker lost one
    expect(next.territories.d.owner).toBe(1); // held
  });

  it('declares a winner when the last enemy territory falls', () => {
    // P1 has only d (1 army); P0 captures it → P1 eliminated, P0 wins.
    const g = state({ a: [0, 3], b: [0, 2], c: [0, 2], d: [1, 1], e: [0, 2], f: [0, 2] });
    const { state: next } = resolveAttack(g, MAP, 'a', 'd', scriptedRng([0.99, 0.99, 0.0]));
    expect(next.winner).toBe(0);
    expect(next.phase).toBe('over');
    expect(next.players[1].alive).toBe(false);
  });
});

describe('fortify', () => {
  it('moves armies between connected owned territories and ends the turn', () => {
    const g = state({ a: [0, 5], b: [0, 1], c: [0, 1], d: [1, 1], e: [1, 1], f: [1, 1] }, { phase: 'fortify' });
    expect(connectedOwned(g, MAP, 'a').has('b')).toBe(true); // a-b-c all P0
    expect(canFortify(g, MAP, 'a', 'c')).toBe(true);
    const next = fortify(g, MAP, 'a', 'c', 3);
    expect(next.territories.a.armies).toBe(2);
    expect(next.territories.c.armies).toBe(4);
    expect(next.current).toBe(1); // turn passed
    expect(next.phase).toBe('reinforce');
  });

  it('refuses a fortify between disconnected territories', () => {
    // a (P0) and e (P0) but the path runs through enemy land.
    const g = state({ a: [0, 5], b: [1, 1], c: [1, 1], d: [1, 1], e: [0, 1], f: [1, 1] }, { phase: 'fortify' });
    expect(canFortify(g, MAP, 'a', 'e')).toBe(false);
  });
});

describe('turn order', () => {
  it('endAttack → fortify, and endTurn skips eliminated players', () => {
    let g = state({ a: [0, 2], b: [0, 1], c: [0, 1], d: [0, 1], e: [0, 1], f: [0, 1] }, { phase: 'attack' });
    // P1 owns nothing here; mark them dead so the turn skips back to P0.
    g = { ...g, players: [g.players[0], { ...g.players[1], alive: false }] };
    g = endAttack(g);
    expect(g.phase).toBe('fortify');
    const next = endTurn(g, MAP);
    expect(next.current).toBe(0); // only living player
    expect(next.phase).toBe('reinforce');
  });
});
