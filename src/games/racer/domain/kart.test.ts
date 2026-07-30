import { describe, expect, it } from 'vitest';
import {
  ARENA_RADIUS,
  COIN_TARGET,
  collectCoins,
  createCoinField,
  createKart,
  forward,
  refillCoins,
  startPositions,
  stepMotion,
  type CoinField,
  type KartInput,
  type Rng,
} from './kart';

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

const COAST: KartInput = { steer: 0, boost: false, brake: false };

describe('kart motion', () => {
  it('rolls forward on its own (auto-cruise)', () => {
    const k = createKart();
    for (let i = 0; i < 30; i++) stepMotion(k, 1 / 60, COAST);
    expect(Math.hypot(k.x, k.z)).toBeGreaterThan(5);
  });

  it('turns when you steer', () => {
    const k = createKart();
    const h0 = k.heading;
    for (let i = 0; i < 30; i++) stepMotion(k, 1 / 60, { steer: 1, boost: false, brake: false });
    expect(k.heading).not.toBeCloseTo(h0);
  });

  it('goes faster with boost than while braking', () => {
    const a = createKart();
    const b = createKart();
    for (let i = 0; i < 60; i++) {
      stepMotion(a, 1 / 60, { steer: 0, boost: true, brake: false });
      stepMotion(b, 1 / 60, { steer: 0, boost: false, brake: true });
    }
    expect(a.speed).toBeGreaterThan(b.speed);
  });

  it('keeps the kart inside the arena fence', () => {
    const k = createKart();
    for (let i = 0; i < 60 * 20; i++) stepMotion(k, 1 / 60, { steer: 0, boost: true, brake: false });
    expect(Math.hypot(k.x, k.z)).toBeLessThanOrEqual(ARENA_RADIUS + 0.001);
  });

  it('bounces off the fence instead of getting pinned', () => {
    const k = createKart();
    k.heading = Math.PI / 2; // drive straight toward the +x wall
    for (let i = 0; i < 60 * 8; i++) stepMotion(k, 1 / 60, { steer: 0, boost: true, brake: false });
    expect(Math.hypot(k.x, k.z)).toBeLessThan(ARENA_RADIUS - 5);
  });

  it('forward() is a unit vector', () => {
    const k = createKart(0, 0, 0.9);
    const f = forward(k);
    expect(Math.hypot(f.x, f.z)).toBeCloseTo(1);
  });

  it('spreads two karts apart at the start', () => {
    const spots = startPositions(2);
    expect(spots).toHaveLength(2);
    expect(Math.abs(spots[0].x - spots[1].x)).toBeGreaterThan(20);
  });
});

describe('coin field', () => {
  it('fills the arena to the target', () => {
    const f = createCoinField(seeded(1));
    expect(f.coins.length).toBe(COIN_TARGET);
    for (const c of f.coins) expect(Math.hypot(c.x, c.z)).toBeLessThanOrEqual(ARENA_RADIUS);
  });

  it('awards a coin to a kart standing on it', () => {
    const f = createCoinField(seeded(2));
    const c = f.coins[0];
    const hits = collectCoins(f, [{ x: c.x, z: c.z }]);
    expect(hits[0]).toBe(1);
    expect(f.coins).not.toContainEqual(c);
  });

  it('gives an overlapping coin to the first kart only', () => {
    const f: CoinField = { coins: [{ id: 1, x: 0, z: 0, hue: 0 }], nextId: 2 };
    const hits = collectCoins(f, [{ x: 0, z: 0 }, { x: 0, z: 0 }]);
    expect(hits).toEqual([1, 0]);
    expect(f.coins).toHaveLength(0);
  });

  it('counts coins for two separate karts', () => {
    const f: CoinField = {
      coins: [
        { id: 1, x: -50, z: 0, hue: 0 },
        { id: 2, x: 50, z: 0, hue: 0 },
      ],
      nextId: 3,
    };
    const hits = collectCoins(f, [{ x: -50, z: 0 }, { x: 50, z: 0 }]);
    expect(hits).toEqual([1, 1]);
  });

  it('refills back to the target after collecting', () => {
    const f = createCoinField(seeded(3));
    collectCoins(f, [{ x: f.coins[0].x, z: f.coins[0].z }]);
    refillCoins(f, [], seeded(4));
    expect(f.coins.length).toBe(COIN_TARGET);
  });
});
