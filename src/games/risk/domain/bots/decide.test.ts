import { describe, expect, it } from 'vitest';
import { seededRng } from '@shared/rng';
import { decide } from './decide';
import { personaById, RISK_PERSONAS } from './personas';
import type { GameState, MapTopology, TerritoryState } from '../types';

/** Same tiny 6-territory, 2-continent map the rules tests use. */
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

function state(owners: Record<string, [number, number]>, over: Partial<GameState> = {}): GameState {
  const territories: Record<string, TerritoryState> = {};
  for (const t of MAP.territoryIds) {
    const [owner, armies] = owners[t];
    territories[t] = { owner, armies };
  }
  return {
    mapId: 'test',
    players: [
      { id: 0, name: 'Bot', color: '#f00', alive: true, bot: 'vex' },
      { id: 1, name: 'Foe', color: '#00f', alive: true },
    ],
    territories,
    current: 0,
    phase: 'attack',
    toPlace: 0,
    conqueredThisTurn: false,
    winner: null,
    diceMode: 'random',
    diceBag: [],
    defenseBag: [],
    ...over,
  };
}

const cadet = personaById('cadet');
const vex = personaById('vex');

describe('personas', () => {
  it('ships four, ordered weakest to strongest', () => {
    expect(RISK_PERSONAS).toHaveLength(4);
    expect(RISK_PERSONAS.map((p) => p.rung)).toEqual([1, 2, 3, 4]);
  });

  it('personaById falls back to the weakest for unknown ids', () => {
    expect(personaById('nope').rung).toBe(1);
  });
});

describe('decide — claim & reinforce', () => {
  it('claims an unclaimed territory during the claim stage', () => {
    const s = state(
      { a: [0, 1], b: [-1, 0], c: [-1, 0], d: [1, 1], e: [-1, 0], f: [-1, 0] },
      { phase: 'setup', toPlace: 10 },
    );
    const step = decide(s, MAP, vex, seededRng(1));
    expect(step.kind).toBe('place');
    if (step.kind === 'place') expect(s.territories[step.territoryId].owner).toBe(-1);
  });

  it('reinforces a frontier territory, not a safe interior one', () => {
    // Bot owns all of X (a,b,c) + d; only d and a touch the enemy on e/f... in
    // this map b is interior (neighbours a,c — both owned, no enemy contact).
    const s = state(
      { a: [0, 3], b: [0, 3], c: [0, 3], d: [0, 3], e: [1, 5], f: [1, 5] },
      { phase: 'reinforce', toPlace: 3 },
    );
    const step = decide(s, MAP, vex, seededRng(2));
    expect(step.kind).toBe('place');
    if (step.kind === 'place') expect(step.territoryId).not.toBe('b');
  });

  it('ends reinforcement once every army is placed', () => {
    const s = state(
      { a: [0, 3], b: [1, 3], c: [0, 3], d: [1, 3], e: [1, 3], f: [1, 3] },
      { phase: 'reinforce', toPlace: 0 },
    );
    expect(decide(s, MAP, vex, seededRng(3)).kind).toBe('doneReinforce');
  });
});

describe('decide — attack', () => {
  it('a timid persona stands down where a bold one attacks', () => {
    // One viable border: bot's a(5) vs enemy d(3) — a +1 edge after the
    // garrison. Cadet (needs +2) declines; Vex (accepts −1) goes in.
    const s = state({ a: [0, 5], b: [0, 1], c: [1, 3], d: [1, 3], e: [1, 3], f: [1, 3] });
    expect(decide(s, MAP, cadet, seededRng(4)).kind).toBe('doneAttack');
    const bold = decide(s, MAP, vex, seededRng(4));
    expect(bold.kind).toBe('attack');
    if (bold.kind === 'attack') {
      expect(bold.from).toBe('a');
      expect(['d', 'f']).toContain(bold.to);
    }
  });

  it('never attacks from a territory with a single army', () => {
    const s = state({ a: [0, 1], b: [0, 1], c: [0, 1], d: [1, 1], e: [1, 1], f: [1, 1] });
    expect(decide(s, MAP, vex, seededRng(5)).kind).toBe('doneAttack');
  });
});

describe('decide — fortify', () => {
  it('marches spare interior armies toward the front', () => {
    // b is deep interior with a pile; a faces the enemy.
    const s = state(
      { a: [0, 2], b: [0, 8], c: [0, 2], d: [1, 4], e: [1, 4], f: [1, 4] },
      { phase: 'fortify' },
    );
    const step = decide(s, MAP, vex, seededRng(6));
    expect(step.kind).toBe('fortify');
    if (step.kind === 'fortify') {
      expect(step.from).toBe('b');
      expect(step.count).toBe(7);
    }
  });

  it('a persona that never fortifies just ends the turn', () => {
    const s = state(
      { a: [0, 2], b: [0, 8], c: [0, 2], d: [1, 4], e: [1, 4], f: [1, 4] },
      { phase: 'fortify' },
    );
    expect(decide(s, MAP, cadet, seededRng(7)).kind).toBe('doneTurn');
  });
});

describe('determinism', () => {
  it('the same seed makes the same choice', () => {
    const s = state(
      { a: [-1, 0], b: [-1, 0], c: [-1, 0], d: [-1, 0], e: [-1, 0], f: [-1, 0] },
      { phase: 'setup', toPlace: 10 },
    );
    const one = decide(s, MAP, cadet, seededRng(9));
    const two = decide(s, MAP, cadet, seededRng(9));
    expect(one).toEqual(two);
  });
});
