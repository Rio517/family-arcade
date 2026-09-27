import { describe, expect, it } from 'vitest';
import { seededRng } from '@shared/rng';
import { CRUISE_SPEED, WINGS_TIME, createFlyer, goalSpeed, stepFlight } from './flight';
import { COIN_SHOWER, coinShower, collectPickups, createPickupField, type PickupField } from './pickups';
import { applyWorldDelta, applyWorldSnapshot, createRaceCore, stepRace, takeWorldSnapshot } from './race';
import { nearestTrailIndex, trailPoint } from './sky';
import { isRacerMsg } from '../net/protocol';

const still = { steer: 0, lift: 0 };

describe('power-ups', () => {
  it('come in three kinds, and a field has a mix of them', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed < 20; seed++) {
      for (const s of createPickupField([createFlyer()], seededRng(seed)).stars) kinds.add(s.kind ?? 'grow');
    }
    expect([...kinds].sort()).toEqual(['coins', 'grow', 'wings']);
  });

  it('wings: bigger wings and more speed for a while, then gone', () => {
    const core = createRaceCore('solo', 0, 20, seededRng(1), { rivals: 0, countdown: 0 });
    const field = core.field as PickupField;
    const me = core.karts[0];
    field.stars = [{ id: 999, x: me.x, y: me.y, z: me.z + 1, kind: 'wings' }];
    stepRace(core, 0.016, still, null);
    expect(me.wingTime).toBeGreaterThan(WINGS_TIME - 0.1);
    expect(me.tier).toBe(0);
    me.burst = 0;
    expect(goalSpeed(me)).toBeGreaterThan(CRUISE_SPEED);
    for (let i = 0; i < 60 * (WINGS_TIME + 1); i++) stepFlight(me, 1 / 60, still);
    expect(me.wingTime).toBe(0);
    expect(goalSpeed(me)).toBe(CRUISE_SPEED);
  });

  it('coins: a line of coins appears straight ahead, close enough to fly through', () => {
    const field: PickupField = { coins: [], stars: [], nextId: 1 };
    const me = createFlyer(10, 20, 0);
    const made = coinShower(field, me, seededRng(3));
    expect(made).toHaveLength(COIN_SHOWER);
    for (const c of made) {
      expect(c.x).toBeCloseTo(10, 5);
      expect(c.z).toBeGreaterThan(20);
      expect(c.y).toBe(me.y);
    }
    // Flying straight on scoops them all up.
    let got = 0;
    for (let i = 0; i < 60 * 5; i++) {
      stepFlight(me, 1 / 60, still);
      got += collectPickups(field, [me]).coins[0];
    }
    expect(got).toBe(COIN_SHOWER);
  });

  it('a coins power-up in a race lays out coins and tells a friend about them', () => {
    const core = createRaceCore('net', 0, 20, seededRng(2), { countdown: 0 });
    takeWorldSnapshot(core);
    const field = core.field as PickupField;
    const me = core.karts[0];
    field.stars = [{ id: 999, x: me.x, y: me.y, z: me.z + 1, kind: 'coins' }];
    const before = field.coins.length;
    let spawned = 0;
    for (let i = 0; i < 10; i++) spawned += stepRace(core, 0.05, still, null).outbound?.spawned.length ?? 0;
    expect(field.coins.length).toBeGreaterThanOrEqual(before + COIN_SHOWER - 2);
    expect(spawned).toBeGreaterThanOrEqual(COIN_SHOWER);
  });

  it('a friend sees their own wings start when the host says so', () => {
    const guest = createRaceCore('net', 1, 20, seededRng(4), { countdown: 0 });
    const base = { coins: [], stars: [], tiers: [0, 0] as [number, number], scores: [0, 0] as [number, number], status: 'racing' as const, winner: null, elapsed: 1 };
    let world = applyWorldSnapshot(null, { ...base, wings: [0, 0] });
    stepRace(guest, 0.05, still, { pos: null, world });
    expect(guest.karts[1].wingTime).toBe(0);
    world = applyWorldDelta(world, { ...base, spawned: [], starSpawned: [], removed: [], wings: [0, WINGS_TIME] });
    stepRace(guest, 0.05, still, { pos: null, world });
    expect(guest.karts[1].wingTime).toBeGreaterThan(WINGS_TIME - 0.2);
  });
});

describe('the road in a race', () => {
  it('puts coins along the road ahead of the person racing', () => {
    const field = createPickupField([createFlyer()], seededRng(5));
    const onRoad = field.coins.filter((c) => {
      const i = nearestTrailIndex(c.x, c.z, 0);
      const p = trailPoint(i);
      return Math.hypot(p.x - c.x, p.z - c.z) < 12;
    });
    expect(onRoad.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps track of where each racer is on the road', () => {
    const core = createRaceCore('solo', 0, 20, seededRng(6), { rivals: 0, countdown: 0 });
    for (let i = 0; i < 60 * 5; i++) stepRace(core, 1 / 60, still, null);
    expect(core.karts[0].trail).toBeGreaterThan(2);
  });
});

describe('the wire', () => {
  it('accepts power-up kinds and wings, and refuses a kind it does not know', () => {
    const world = { t: 'world', coins: [], scores: [0, 0], status: 'racing', winner: null, elapsed: 0 };
    expect(isRacerMsg({ ...world, stars: [{ id: 1, x: 0, y: 30, z: 0, kind: 'wings' }], wings: [0, 4] })).toBe(true);
    expect(isRacerMsg({ ...world, stars: [{ id: 1, x: 0, y: 30, z: 0, kind: 'rocket' }] })).toBe(false);
    expect(isRacerMsg({ ...world, wings: [0, 9999] })).toBe(false);
    // A host from before power-ups: no kinds, no wings — still fine.
    expect(isRacerMsg({ ...world, stars: [{ id: 1, x: 0, y: 30, z: 0 }] })).toBe(true);
  });
});
