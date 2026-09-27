import { describe, expect, it } from 'vitest';
import {
  CRUISE_ALTITUDE,
  CRUISE_SPEED,
  MAX_TIER,
  SKY_CEILING,
  SKY_FLOOR,
  bumpRacers,
  collectStar,
  createFlyer,
  flyThroughRing,
  goalSpeed,
  sizeOf,
  stepFlight,
} from './flight';

const fly = (f: ReturnType<typeof createFlyer>, seconds: number, input = { steer: 0, lift: 0 }) => {
  for (let i = 0; i < seconds * 60; i++) stepFlight(f, 1 / 60, input);
  return f;
};

describe('flight', () => {
  it('flies forward on its own at cruise speed', () => {
    const f = fly(createFlyer(), 2);
    expect(f.z).toBeGreaterThan(CRUISE_SPEED * 1.9);
    expect(f.x).toBeCloseTo(0, 5);
    expect(f.y).toBe(CRUISE_ALTITUDE);
  });

  it('has no edge: a racer can fly as far as it likes', () => {
    const f = fly(createFlyer(), 60);
    expect(f.z).toBeGreaterThan(2000);
  });

  it('turns right with the stick right — toward screen right, which is world -X — and leans into it', () => {
    const f = fly(createFlyer(), 1, { steer: 1, lift: 0 });
    expect(f.heading).toBeLessThan(-1.5);
    expect(f.x).toBeLessThan(0);
    expect(f.bank).toBeCloseTo(1, 5);
  });

  it('climbs and dives between a soft floor and ceiling', () => {
    const up = fly(createFlyer(), 20, { steer: 0, lift: 1 });
    expect(up.y).toBe(SKY_CEILING);
    const down = fly(createFlyer(), 20, { steer: 0, lift: -1 });
    expect(down.y).toBe(SKY_FLOOR);
  });

  it('ignores a broken stick instead of flying off to NaN', () => {
    const f = fly(createFlyer(), 1, { steer: Number.NaN, lift: Infinity });
    expect(Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.heading)).toBe(true);
  });

  it('a star makes a racer bigger and faster, then fades back a step at a time', () => {
    const f = createFlyer();
    collectStar(f);
    expect(f.tier).toBe(1);
    expect(sizeOf(f)).toBeGreaterThan(1);
    expect(goalSpeed(f)).toBeGreaterThan(CRUISE_SPEED);
    for (let i = 0; i < 5; i++) collectStar(f);
    expect(f.tier).toBe(MAX_TIER);
    fly(f, 15);
    expect(f.tier).toBe(MAX_TIER - 1);
    fly(f, 60);
    expect(f.tier).toBe(0);
  });

  it('a rainbow ring is one burst per ring, however long you stay in it', () => {
    const f = createFlyer();
    expect(flyThroughRing(f, 'r:1:1')).toBe(true);
    expect(f.burst).toBeGreaterThan(0);
    expect(flyThroughRing(f, 'r:1:1')).toBe(false);
    expect(flyThroughRing(f, 'r:2:1')).toBe(true);
    fly(f, 0.5);
    expect(f.speed).toBeGreaterThan(CRUISE_SPEED + 5);
  });

  it('bumping: the bigger racer barely moves and the smaller one is pushed aside', () => {
    const big = createFlyer(0, 0);
    const small = createFlyer(1, 0);
    collectStar(big);
    collectStar(big);
    bumpRacers([big, small]);
    expect(Math.abs(big.x)).toBeLessThan(Math.abs(small.x - 1));
    expect(small.x - big.x).toBeGreaterThan(6);
  });

  it('two racers exactly on top of each other still part', () => {
    const a = createFlyer();
    const b = createFlyer();
    bumpRacers([a, b]);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(5);
  });
});

describe('height help', () => {
  it('eases a racer toward the height of the pickup ahead, and only ahead', async () => {
    const { heightHelp } = await import('./pickups');
    const f = createFlyer(0, 0, 0, 30);
    expect(heightHelp(f, [{ x: 0, y: 50, z: 40 }])).toBeGreaterThan(0.5);
    expect(heightHelp(f, [{ x: 0, y: 10, z: 40 }])).toBeLessThan(-0.5);
    // Behind, beside, or far away: no help.
    expect(heightHelp(f, [{ x: 0, y: 50, z: -40 }])).toBe(0);
    expect(heightHelp(f, [{ x: 60, y: 50, z: 10 }])).toBe(0);
    expect(heightHelp(f, [{ x: 0, y: 50, z: 400 }])).toBe(0);
    // Already level with it: nothing to do.
    expect(heightHelp(f, [{ x: 0, y: 30, z: 40 }])).toBe(0);
  });
});
