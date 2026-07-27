import { describe, expect, it } from 'vitest';
import {
  createGame,
  FIELD_H,
  FIELD_W,
  leaders,
  MILESTONE,
  setDir,
  step,
  winners,
  type GameState,
  type PlayerConfig,
  type Rng,
} from './engine';

/** A deterministic RNG (mulberry32) so coin spawns are repeatable in tests. */
function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ONE: PlayerConfig[] = [{ id: 0, name: 'P1', color: '#f0f', emoji: '🧚' }];
const TWO: PlayerConfig[] = [
  { id: 0, name: 'P1', color: '#f0f', emoji: '🧚' },
  { id: 1, name: 'P2', color: '#0ff', emoji: '🐉' },
];

/** Drop a single coin exactly on top of a player so the next step scoops it. */
function planCoinOn(state: GameState, playerId: number): void {
  const p = state.players.find((pl) => pl.id === playerId)!;
  state.coins = [{ id: 999, pos: { x: p.pos.x, y: p.pos.y }, hue: 0 }];
}

describe('createGame', () => {
  it('places the players and fills the sky with coins', () => {
    const g = createGame({ world: 'sky', players: TWO, rng: seeded(1) });
    expect(g.players).toHaveLength(2);
    expect(g.status).toBe('playing');
    expect(g.target).toBe(20);
    expect(g.coins.length).toBeGreaterThan(0);
    for (const p of g.players) {
      expect(p.coins).toBe(0);
      expect(p.power).toBeNull();
      expect(p.pos.x).toBeGreaterThanOrEqual(0);
      expect(p.pos.x).toBeLessThanOrEqual(FIELD_W);
    }
  });

  it('carries the chosen world and target through', () => {
    const g = createGame({ world: 'ocean', players: ONE, target: 10, rng: seeded(2) });
    expect(g.world).toBe('ocean');
    expect(g.target).toBe(10);
  });
});

describe('steering', () => {
  it('moves a player in the direction they point', () => {
    const g = createGame({ world: 'sky', players: ONE, rng: seeded(3) });
    const startX = g.players[0].pos.x;
    setDir(g, 0, { x: 1, y: 0 });
    for (let i = 0; i < 20; i++) step(g, 1 / 60, seeded(3));
    expect(g.players[0].pos.x).toBeGreaterThan(startX);
  });

  it('keeps a player inside the field', () => {
    const g = createGame({ world: 'sky', players: ONE, rng: seeded(4) });
    setDir(g, 0, { x: 1, y: 1 });
    for (let i = 0; i < 600; i++) step(g, 1 / 60, seeded(4));
    expect(g.players[0].pos.x).toBeLessThanOrEqual(FIELD_W);
    expect(g.players[0].pos.y).toBeLessThanOrEqual(FIELD_H);
    expect(g.players[0].pos.x).toBeGreaterThanOrEqual(0);
    expect(g.players[0].pos.y).toBeGreaterThanOrEqual(0);
  });
});

describe('collecting coins', () => {
  it('adds a coin when a player touches one', () => {
    const g = createGame({ world: 'sky', players: ONE, rng: seeded(5) });
    planCoinOn(g, 0);
    step(g, 1 / 60, seeded(5));
    expect(g.players[0].coins).toBe(1);
  });

  it('gives the coin to the closer of two players', () => {
    const g = createGame({ world: 'sky', players: TWO, rng: seeded(6) });
    const near = g.players[0];
    const far = g.players[1];
    // A coin one pixel from player 0 and far from player 1.
    g.coins = [{ id: 999, pos: { x: near.pos.x + 1, y: near.pos.y }, hue: 0 }];
    far.pos = { x: near.pos.x + 900 > FIELD_W ? 0 : near.pos.x + 900, y: near.pos.y };
    step(g, 1 / 60, seeded(6));
    expect(near.coins).toBe(1);
    expect(far.coins).toBe(0);
  });
});

describe('power-ups', () => {
  it('earns a power-up on crossing a milestone', () => {
    const g = createGame({ world: 'sky', players: ONE, powers: ['magnet'], rng: seeded(7) });
    const p = g.players[0];
    for (let i = 0; i < MILESTONE; i++) {
      planCoinOn(g, 0);
      step(g, 1 / 60, seeded(7));
    }
    expect(p.coins).toBe(MILESTONE);
    expect(p.power?.kind).toBe('magnet');
  });

  it('lets a power-up expire', () => {
    const g = createGame({ world: 'sky', players: ONE, powers: ['speed'], rng: seeded(8) });
    const p = g.players[0];
    for (let i = 0; i < MILESTONE; i++) {
      planCoinOn(g, 0);
      step(g, 1 / 60, seeded(8));
    }
    expect(p.power).not.toBeNull();
    for (let i = 0; i < 60 * 10; i++) step(g, 1 / 60, seeded(8));
    expect(p.power).toBeNull();
  });
});

describe('winning', () => {
  it('ends the game when a player reaches the target', () => {
    const g = createGame({ world: 'sky', players: ONE, target: 3, rng: seeded(9) });
    for (let i = 0; i < 3; i++) {
      planCoinOn(g, 0);
      step(g, 1 / 60, seeded(9));
    }
    expect(g.status).toBe('over');
    expect(winners(g)).toHaveLength(1);
    expect(winners(g)[0].id).toBe(0);
  });

  it('reports the leader mid-game', () => {
    const g = createGame({ world: 'sky', players: TWO, target: 20, rng: seeded(10) });
    planCoinOn(g, 1);
    step(g, 1 / 60, seeded(10));
    expect(leaders(g)).toHaveLength(1);
    expect(leaders(g)[0].id).toBe(1);
  });

  it('does nothing once the round is over', () => {
    const g = createGame({ world: 'sky', players: ONE, target: 1, rng: seeded(11) });
    planCoinOn(g, 0);
    step(g, 1 / 60, seeded(11));
    expect(g.status).toBe('over');
    const coinsAtEnd = g.players[0].coins;
    planCoinOn(g, 0);
    step(g, 1 / 60, seeded(11));
    expect(g.players[0].coins).toBe(coinsAtEnd);
  });
});
