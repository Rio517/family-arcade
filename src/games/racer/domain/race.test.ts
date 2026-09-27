import { describe, expect, it } from 'vitest';
import {
  COUNTDOWN,
  RIVAL_COUNT,
  applyWorldDelta,
  applyWorldSnapshot,
  createRaceCore,
  stepRace,
  takeWorldSnapshot,
  WORLD_KEEPALIVE_INTERVAL,
  type RaceCore,
  type WorldDelta,
} from './race';
import { COIN_TARGET, FIELD_RADIUS, STAR_TARGET, type Coin, type PickupField } from './pickups';
import { seededRng } from '@shared/rng';
import { createRivalBrain, steerRival } from './rivals';
import type { FlightInput } from './flight';

const still: FlightInput = { steer: 0, lift: 0 };
const coin = (id: number, x = 0, y = 30, z = 0): Coin => ({ id, x, y, z, hue: 100 });

/** A race with no countdown, so a test's first step is already flying. */
const race = (mode: 'solo' | 'net', myIndex = 0, target = 20, opts: { rivals?: number } = {}) =>
  createRaceCore(mode, myIndex, target, seededRng(7), { countdown: 0, ...opts });

/** Put exactly these coins (and no stars) in the owner's field. */
function plant(core: RaceCore, coins: Coin[]): void {
  const field = core.field as PickupField;
  field.coins = coins;
  field.stars = [];
  field.nextId = 1000;
}

const tick = (core: RaceCore, dt = 0.016, input = still) => stepRace(core, dt, input, null);

describe('stepRace — solo', () => {
  it('races three computer rivals by default, each on its own brain', () => {
    const core = createRaceCore('solo', 0, 20, seededRng(1));
    expect(core.karts).toHaveLength(1 + RIVAL_COUNT);
    expect(core.brains[0]).toBeNull();
    expect(core.brains.slice(1).every(Boolean)).toBe(true);
    expect(core.field?.coins).toHaveLength(COIN_TARGET);
    expect(core.field?.stars).toHaveLength(STAR_TARGET);
  });

  it('holds everyone still for the countdown, then lets them fly', () => {
    const core = createRaceCore('solo', 0, 20, seededRng(1));
    const start = core.karts.map((k) => ({ x: k.x, z: k.z }));
    for (let i = 0; i < (COUNTDOWN - 0.1) * 60; i++) tick(core);
    expect(core.karts.map((k) => ({ x: k.x, z: k.z }))).toEqual(start);
    expect(core.elapsed).toBe(0);
    for (let i = 0; i < 60; i++) tick(core);
    expect(core.karts[0].z).toBeGreaterThan(start[0].z);
    expect(core.elapsed).toBeGreaterThan(0);
  });

  it('scores a coin under the racer, refills the sky, and finishes at the target', () => {
    const core = race('solo', 0, 2, { rivals: 0 });
    plant(core, [coin(1, 0, 30, 1), coin(2, 0, 30, 2)]);
    const first = tick(core);
    expect(core.scores[0]).toBe(2);
    expect(core.status).toBe('over');
    expect(core.winner).toBe(0);
    expect(first.outbound).toBeNull();
  });

  it('a star makes the racer who takes it bigger', () => {
    const core = race('solo', 0, 20, { rivals: 0 });
    plant(core, []);
    core.field!.stars = [{ id: 9, x: 0, y: 30, z: 1 }];
    tick(core);
    expect(core.karts[0].tier).toBe(1);
  });

  it('a person crossing the line on the same frame as a rival gets the win', () => {
    const core = race('solo', 0, 1, { rivals: 1 });
    const rival = core.karts[1];
    plant(core, [coin(1, 0, 30, 1), coin(2, rival.x, rival.y, rival.z + 1)]);
    tick(core);
    expect(core.status).toBe('over');
    expect(core.winner).toBe(0);
  });

  it('stops simulating once the race is over', () => {
    const core = race('solo', 0, 1, { rivals: 0 });
    plant(core, [coin(1, 0, 30, 1)]);
    tick(core);
    const where = { ...core.karts[0] };
    const elapsed = core.elapsed;
    tick(core);
    expect(core.karts[0].z).toBe(where.z);
    expect(core.elapsed).toBe(elapsed);
  });

  it('keeps the sky full wherever you fly', () => {
    const core = race('solo', 0, 999, { rivals: 0 });
    for (let i = 0; i < 60 * 40; i++) tick(core, 1 / 60, { steer: 0.3, lift: 0 });
    const me = core.karts[0];
    const near = core.field!.coins.filter((c) => Math.hypot(c.x - me.x, c.z - me.z) <= FIELD_RADIUS);
    expect(near.length).toBe(core.field!.coins.length);
    expect(core.field!.coins.length).toBe(COIN_TARGET);
  });
});

describe('a one-player race is fair and fun', () => {
  /**
   * Stand-ins for a child. The sharp one chases coins like a middling rival
   * without the rivals' kindness slow-down. The clumsy one reacts late, is
   * half-hearted on up and down, and sometimes lets go of the screen.
   */
  function playRace(seed: number, clumsy: boolean) {
    const core = createRaceCore('solo', 0, 20, seededRng(seed), { countdown: 0 });
    const brain = { ...createRivalBrain(seed + 100), skill: clumsy ? 0.2 : 0.5 };
    const hands = seededRng(seed + 999);
    let hold = { steer: 0, lift: 0 };
    let holdFor = 0;
    for (let i = 0; i < 60 * 240 && core.status === 'racing'; i++) {
      let input = steerRival(brain, core.karts[0], core.field, 1 / 60, 0, 99);
      if (clumsy) {
        holdFor -= 1 / 60;
        if (holdFor <= 0) {
          hold = hands() < 0.25 ? { steer: 0, lift: 0 } : { steer: input.steer * 0.8, lift: input.lift * 0.4 };
          holdFor = 0.3 + hands() * 0.6;
        }
        input = hold;
      }
      core.karts[0].pace = 1;
      stepRace(core, 1 / 60, input, null);
    }
    const best = Math.max(...core.scores.slice(1));
    return { over: core.status === 'over', won: core.winner === 0, seconds: core.elapsed, margin: core.scores[0] - best };
  }

  it('a sharp player wins, in a race that still takes a while', () => {
    const results = Array.from({ length: 8 }, (_, i) => playRace(i + 1, false));
    for (const r of results) {
      expect(r.won).toBe(true);
      expect(r.seconds).toBeGreaterThan(25);
    }
  });

  it('a clumsy player wins more often than not, and every loss is a photo finish', () => {
    const results = Array.from({ length: 8 }, (_, i) => playRace(i + 1, true)).filter((r) => r.over);
    expect(results.length).toBeGreaterThanOrEqual(6);
    expect(results.filter((r) => r.won).length / results.length).toBeGreaterThan(0.5);
    for (const r of results) if (!r.won) expect(r.margin).toBeGreaterThanOrEqual(-1);
  });
});

describe('stepRace — host authority', () => {
  it('awards the guest its pickups from the reported position and emits deltas', () => {
    const core = race('net', 0, 3);
    plant(core, [coin(1, 50, 30, 50), coin(2, 50, 30, 51), coin(3, 50, 30, 52)]);
    const remote = { pos: { x: 50, y: 30, z: 51, heading: 0, speed: 0 }, world: null };
    const deltas: WorldDelta[] = [];
    for (let i = 0; i < 200 && core.status === 'racing'; i++) {
      const { outbound } = stepRace(core, 0.05, still, remote);
      if (outbound) deltas.push(outbound);
    }
    expect(core.status).toBe('over');
    expect(core.scores[1]).toBe(3);
    expect(core.scores[0]).toBe(0);
    expect(core.winner).toBe(1);
    expect(deltas.some((d) => d.removed.length > 0)).toBe(true);
    for (const d of deltas) {
      expect(d.spawned.length).toBeLessThanOrEqual(64);
      expect(d.removed.length).toBeLessThanOrEqual(64);
    }
    expect(deltas.at(-1)!.status).toBe('over');
  });

  it('runs the guest’s star power and tells the guest', () => {
    const core = race('net', 0, 20);
    plant(core, []);
    core.field!.stars = [{ id: 5, x: 50, y: 30, z: 50 }];
    const remote = { pos: { x: 50, y: 30, z: 50, heading: 0, speed: 0 }, world: null };
    let tiers: [number, number] | null = null;
    for (let i = 0; i < 10; i++) {
      const { outbound } = stepRace(core, 0.05, still, remote);
      if (outbound) tiers = outbound.tiers;
    }
    expect(core.karts[1].tier).toBe(1);
    expect(tiers).toEqual([0, 1]);
  });

  it('emits nothing while nothing changes, then a low-rate keepalive', () => {
    const core = race('net', 0, 20);
    takeWorldSnapshot(core);
    // Park the racers somewhere empty, far from every pickup, for a moment.
    plant(core, []);
    core.field!.stars = [];
    const sends: WorldDelta[] = [];
    // Frames short enough that no refill lands near… but refill does top up.
    for (let i = 0; i < 10; i++) {
      const { outbound } = stepRace(core, 0.016, still, null);
      if (outbound) sends.push(outbound);
    }
    // The refill is news: it goes out once, promptly.
    expect(sends.length).toBe(1);
    expect(sends[0].spawned.length).toBe(COIN_TARGET);
    expect(sends[0].starSpawned.length).toBe(STAR_TARGET);
    // Then quiet, apart from the keepalive.
    let quiet = 0;
    for (let t = 0; t < WORLD_KEEPALIVE_INTERVAL * 0.9; t += 0.05) {
      if (stepRace(core, 0.05, still, null).outbound && core.dirty === false) quiet++;
    }
    expect(quiet).toBeLessThanOrEqual(1);
  });

  it('a dead heat on the same frame ends with winner null (the tie rule)', () => {
    const core = race('net', 0, 1);
    const host = core.karts[0];
    plant(core, [coin(1, host.x, host.y, host.z + 1), coin(2, 60, 30, 60)]);
    stepRace(core, 0.016, still, { pos: { x: 60, y: 30, z: 60, heading: 0, speed: 0 }, world: null });
    // The guest's position eases in; step until both have their coin.
    for (let i = 0; i < 200 && core.status === 'racing'; i++) {
      stepRace(core, 0.016, still, { pos: { x: 60, y: 30, z: 60, heading: 0, speed: 0 }, world: null });
    }
    expect(core.status).toBe('over');
    if (core.scores[0] === core.scores[1]) expect(core.winner).toBeNull();
  });

  it('never tells the guest about a coin that spawned and was collected between sends', () => {
    const core = race('net', 0, 20);
    takeWorldSnapshot(core);
    const field = core.field!;
    const ghost = coin(field.nextId, 0, 30, 0);
    field.nextId += 1;
    field.coins.push(ghost);
    core.pendingSpawned.push(ghost);
    // The host racer is on top of it.
    ghost.x = core.karts[0].x;
    ghost.z = core.karts[0].z + 1;
    let out: WorldDelta | null = null;
    for (let i = 0; i < 20 && !out; i++) out = stepRace(core, 0.05, still, null).outbound;
    expect(out).not.toBeNull();
    expect(out!.spawned.some((c) => c.id === ghost.id)).toBe(false);
    expect(out!.removed).not.toContain(ghost.id);
  });

  it('accepts a guest from before the sky, whose positions have no height', () => {
    const core = race('net', 0, 20);
    stepRace(core, 0.05, still, { pos: { x: 12, z: 5, heading: 0, speed: 30 }, world: null });
    expect(Number.isFinite(core.karts[1].y)).toBe(true);
  });
});

describe('stepRace — guest mirroring', () => {
  it('mirrors the host world, starts its own star burst, and never sends', () => {
    const core = race('net', 1, 20);
    expect(core.field).toBeNull();
    let world = applyWorldSnapshot(null, {
      coins: [coin(1)],
      stars: [{ id: 2, x: 5, y: 30, z: 5 }],
      tiers: [0, 0],
      scores: [3, 4],
      status: 'racing',
      winner: null,
      elapsed: 10,
    });
    const first = stepRace(core, 0.05, still, { pos: null, world });
    expect(first.coins).toHaveLength(1);
    expect(first.stars).toHaveLength(1);
    expect(first.outbound).toBeNull();
    expect(core.scores).toEqual([3, 4]);
    expect(core.elapsed).toBe(10);
    // Between messages the clock keeps ticking.
    stepRace(core, 0.05, still, { pos: null, world });
    expect(core.elapsed).toBeCloseTo(10.05, 5);

    world = applyWorldDelta(world, {
      spawned: [],
      starSpawned: [],
      removed: [2],
      tiers: [0, 1],
      scores: [3, 4],
      status: 'racing',
      winner: null,
      elapsed: 10.2,
    });
    stepRace(core, 0.05, still, { pos: null, world });
    expect(core.karts[1].tier).toBe(1);
    expect(core.karts[1].burst).toBeGreaterThan(0);
    // My tier is the host's call: flying on does not fade it here.
    for (let i = 0; i < 60 * 20; i++) stepRace(core, 1 / 60, still, { pos: null, world });
    expect(core.karts[1].tier).toBe(1);
  });

  it('applyWorldDelta tolerates arriving before any snapshot', () => {
    const w = applyWorldDelta(null, {
      spawned: [coin(1)],
      starSpawned: [],
      removed: [],
      tiers: [0, 0],
      scores: [0, 0],
      status: 'racing',
      winner: null,
      elapsed: 1,
    });
    expect(w.coins.size).toBe(1);
    expect(w.seq).toBe(1);
  });
});

describe('takeWorldSnapshot', () => {
  it('returns the full field and resets the delta stream', () => {
    const core = race('net', 0, 20);
    core.pendingRemoved.push(99);
    const snap = takeWorldSnapshot(core)!;
    expect(snap.coins).toHaveLength(COIN_TARGET);
    expect(snap.stars).toHaveLength(STAR_TARGET);
    expect(snap.tiers).toEqual([0, 0]);
    expect(core.pendingRemoved).toHaveLength(0);
  });

  it('is null for the guest', () => {
    expect(takeWorldSnapshot(race('net', 1))).toBeNull();
  });
});
