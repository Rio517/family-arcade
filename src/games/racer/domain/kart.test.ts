import { describe, expect, it } from 'vitest';
import {
  ARENA_RADIUS,
  createRace,
  forward,
  stepRace,
  type KartInput,
  type KartState,
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

describe('createRace', () => {
  it('starts at the centre with a full arena of coins', () => {
    const s = createRace({ rng: seeded(1) });
    expect(s.x).toBe(0);
    expect(s.z).toBe(0);
    expect(s.coins).toBe(0);
    expect(s.target).toBe(20);
    expect(s.status).toBe('racing');
    expect(s.items.length).toBeGreaterThan(0);
    for (const c of s.items) {
      expect(Math.hypot(c.x, c.z)).toBeLessThanOrEqual(ARENA_RADIUS);
    }
  });
});

describe('driving', () => {
  it('rolls forward on its own (auto-cruise)', () => {
    const s = createRace({ rng: seeded(2) });
    const before = { x: s.x, z: s.z };
    for (let i = 0; i < 30; i++) stepRace(s, 1 / 60, COAST, seeded(2));
    expect(Math.hypot(s.x - before.x, s.z - before.z)).toBeGreaterThan(5);
  });

  it('turns when you steer', () => {
    const s = createRace({ rng: seeded(3) });
    const h0 = s.heading;
    for (let i = 0; i < 30; i++) stepRace(s, 1 / 60, { steer: 1, boost: false, brake: false }, seeded(3));
    expect(s.heading).not.toBeCloseTo(h0);
  });

  it('goes faster with boost than while braking', () => {
    const a = createRace({ rng: seeded(4) });
    const b = createRace({ rng: seeded(4) });
    for (let i = 0; i < 60; i++) {
      stepRace(a, 1 / 60, { steer: 0, boost: true, brake: false }, seeded(4));
      stepRace(b, 1 / 60, { steer: 0, boost: false, brake: true }, seeded(4));
    }
    expect(a.speed).toBeGreaterThan(b.speed);
  });

  it('keeps the kart inside the arena fence', () => {
    const s = createRace({ rng: seeded(5) });
    for (let i = 0; i < 60 * 20; i++) stepRace(s, 1 / 60, { steer: 0, boost: true, brake: false }, seeded(5));
    expect(Math.hypot(s.x, s.z)).toBeLessThanOrEqual(ARENA_RADIUS + 0.001);
  });

  it('bounces off the fence instead of getting pinned', () => {
    const s = createRace({ rng: seeded(12) });
    s.heading = Math.PI / 2; // drive straight toward the +x wall
    // Hold forward long enough to hit the wall and keep pushing into it.
    for (let i = 0; i < 60 * 8; i++) stepRace(s, 1 / 60, { steer: 0, boost: true, brake: false }, seeded(12));
    // A pinned kart would sit at the fence; a bounced one drives back inward.
    expect(Math.hypot(s.x, s.z)).toBeLessThan(ARENA_RADIUS - 5);
  });

  it('forward() is a unit vector', () => {
    const s = createRace({ rng: seeded(6) });
    s.heading = 0.9;
    const f = forward(s);
    expect(Math.hypot(f.x, f.z)).toBeCloseTo(1);
  });
});

describe('coins & winning', () => {
  /** Put a single coin exactly on the kart so the next step scoops just it. */
  function driveOntoCoin(s: KartState): void {
    s.items = [{ id: s.nextCoinId++, x: s.x, z: s.z, hue: 0 }];
  }

  it('collects a coin the kart drives over', () => {
    const s = createRace({ rng: seeded(7) });
    driveOntoCoin(s);
    stepRace(s, 1 / 60, COAST, seeded(7));
    expect(s.coins).toBe(1);
  });

  it('always refills back to a full arena of coins', () => {
    const s = createRace({ rng: seeded(8) });
    const n = s.items.length;
    driveOntoCoin(s);
    stepRace(s, 1 / 60, COAST, seeded(8));
    expect(s.items.length).toBe(n);
  });

  it('ends the race at the target', () => {
    const s = createRace({ target: 3, rng: seeded(9) });
    for (let i = 0; i < 3; i++) {
      driveOntoCoin(s);
      stepRace(s, 1 / 60, COAST, seeded(9));
    }
    expect(s.coins).toBe(3);
    expect(s.status).toBe('over');
  });

  it('does nothing once the race is over', () => {
    const s = createRace({ target: 1, rng: seeded(10) });
    driveOntoCoin(s);
    stepRace(s, 1 / 60, COAST, seeded(10));
    expect(s.status).toBe('over');
    const coins = s.coins;
    driveOntoCoin(s);
    stepRace(s, 1 / 60, COAST, seeded(10));
    expect(s.coins).toBe(coins);
  });
});
