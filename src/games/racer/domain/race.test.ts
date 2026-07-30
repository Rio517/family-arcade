import { describe, expect, it } from 'vitest';
import {
  applyWorldDelta,
  applyWorldSnapshot,
  createRaceCore,
  stepRace,
  takeWorldSnapshot,
  WORLD_KEEPALIVE_INTERVAL,
  type MirrorWorld,
  type RaceCore,
  type WorldDelta,
} from './race';
import { COIN_TARGET, type Coin, type KartInput } from './kart';

/** rng pinned to 0 puts every coin at the arena centre (0, 0). */
const rngZero = () => 0;
const coast: KartInput = { steer: 0, boost: false, brake: false };

const coin = (id: number, x = 0, z = 0): Coin => ({ id, x, z, hue: 100 });

/** Step with a fixed small dt, no opponent input. */
const tick = (core: RaceCore, dt = 0.016) => stepRace(core, dt, coast, null);

describe('stepRace — solo', () => {
  it('scores coins under the kart, refills the field, and finishes at the target', () => {
    const core = createRaceCore('solo', 0, 20, rngZero);
    expect(core.field?.coins).toHaveLength(COIN_TARGET);

    // The kart starts at the centre, right on top of the whole (rng-pinned) field.
    const first = tick(core);
    expect(core.scores[0]).toBe(COIN_TARGET);
    expect(core.status).toBe('racing');
    expect(first.outbound).toBeNull(); // solo never talks to a wire
    expect(first.coins).toHaveLength(COIN_TARGET); // refilled in place

    const second = tick(core);
    expect(core.scores[0]).toBeGreaterThanOrEqual(20);
    expect(core.status).toBe('over');
    expect(core.winner).toBe(0);
    expect(second.outbound).toBeNull();
    expect(core.elapsed).toBeCloseTo(0.032, 5);
  });

  it('stops simulating pickups once the race is over', () => {
    const core = createRaceCore('solo', 0, 20, rngZero);
    tick(core);
    tick(core);
    const score = core.scores[0];
    const elapsed = core.elapsed;
    tick(core);
    expect(core.scores[0]).toBe(score);
    expect(core.elapsed).toBe(elapsed);
  });
});

describe('stepRace — host authority', () => {
  it('awards the guest its pickups from the reported position and emits deltas', () => {
    const core = createRaceCore('net', 0, 20, rngZero);
    // Coins sit at the centre; my (host) kart starts at (-24, 0) and drives
    // away, while the guest reports itself parked at the centre.
    const remote = { pos: { x: 0, z: 0, heading: 0, speed: 0 }, world: null };
    const deltas: WorldDelta[] = [];
    for (let i = 0; i < 200 && core.status === 'racing'; i++) {
      const { outbound } = stepRace(core, 0.05, coast, remote);
      if (outbound) deltas.push(outbound);
    }
    // The HOST ran the guest's scoring: guest won, host never scored.
    expect(core.status).toBe('over');
    expect(core.scores[1]).toBeGreaterThanOrEqual(20);
    expect(core.scores[0]).toBe(0);
    expect(core.winner).toBe(1);

    // Deltas carried the collected + respawned coins, within the wire caps.
    expect(deltas.length).toBeGreaterThan(0);
    expect(deltas.some((d) => d.removed.length > 0)).toBe(true);
    for (const d of deltas) {
      expect(d.spawned.length).toBeLessThanOrEqual(64);
      expect(d.removed.length).toBeLessThanOrEqual(64);
    }
    // The finishing delta went out the moment the race ended.
    const final = deltas[deltas.length - 1];
    expect(final.status).toBe('over');
    expect(final.winner).toBe(1);
    expect(final.scores[1]).toBe(core.scores[1]);
  });

  it('emits nothing while nothing changes, then a low-rate keepalive', () => {
    const core = createRaceCore('net', 0, 20, rngZero);
    takeWorldSnapshot(core); // race-start snapshot resets the delta stream
    // Park both karts far from the (centre) coins so no pickups happen.
    core.karts[0].x = 60;
    core.karts[0].z = 60;
    const remote = { pos: { x: -60, z: -60, heading: 0, speed: 0 }, world: null };

    let sent: WorldDelta | null = null;
    let quietSteps = 0;
    let time = 0;
    while (!sent && time < WORLD_KEEPALIVE_INTERVAL + 0.5) {
      const { outbound } = stepRace(core, 0.05, coast, remote);
      time += 0.05;
      if (outbound) sent = outbound;
      else quietSteps++;
    }
    // Silence right up to the keepalive, then an empty delta with the clock.
    expect(quietSteps).toBeGreaterThan(WORLD_KEEPALIVE_INTERVAL / 0.05 - 2);
    expect(sent).not.toBeNull();
    expect(sent!.spawned).toHaveLength(0);
    expect(sent!.removed).toHaveLength(0);
    expect(sent!.status).toBe('racing');
    expect(sent!.elapsed).toBeCloseTo(core.elapsed, 5);
  });

  it('a dead heat on the same frame ends with winner null (the tie rule)', () => {
    const core = createRaceCore('net', 0, 20, rngZero);
    core.karts[0].x = 60; // both karts away from the coins
    core.scores[0] = 20;
    core.scores[1] = 20;
    const { outbound } = stepRace(core, 0.05, coast, { pos: { x: -60, z: -60, heading: 0, speed: 0 }, world: null });
    expect(core.status).toBe('over');
    expect(core.winner).toBeNull();
    // The finish still goes straight out, even with no coin churn.
    expect(outbound).not.toBeNull();
    expect(outbound!.status).toBe('over');
    expect(outbound!.winner).toBeNull();
  });

  it('never tells the guest about a coin that spawned and was collected between sends', () => {
    const core = createRaceCore('net', 0, 20, rngZero);
    const baseline = takeWorldSnapshot(core)!;
    const baseIds = new Set(baseline.coins.map((c) => c.id));
    core.karts[0].x = 0; // park the host kart on the coin pile

    // Collect the whole field every frame until the finishing delta flushes.
    let final: WorldDelta | null = null;
    for (let i = 0; i < 10 && !final; i++) {
      const { outbound } = stepRace(core, 0.05, coast, { pos: { x: 60, z: 60, heading: 0, speed: 0 }, world: null });
      if (outbound) final = outbound;
    }
    expect(final).not.toBeNull();
    // Every removal is a coin the guest knew from the snapshot; the mid-flush
    // generation (spawned then instantly re-collected) appears in neither list.
    for (const id of final!.removed) expect(baseIds.has(id)).toBe(true);
    const spawnedIds = new Set(final!.spawned.map((c) => c.id));
    for (const id of final!.removed) expect(spawnedIds.has(id)).toBe(false);
    expect(final!.spawned.length).toBeLessThanOrEqual(64);
    expect(final!.removed.length).toBeLessThanOrEqual(64);
  });
});

describe('stepRace — guest mirroring', () => {
  it('mirrors the host world, keeps the clock alive between messages, and never sends', () => {
    const core = createRaceCore('net', 1, 20, rngZero);
    expect(core.field).toBeNull(); // the guest owns no coins

    // Before any word from the host: empty field, local clock ticking.
    const dark = stepRace(core, 0.05, coast, { pos: null, world: null });
    expect(dark.coins).toHaveLength(0);
    expect(core.elapsed).toBeCloseTo(0.05, 5);

    // Full snapshot from the host.
    let mirror = applyWorldSnapshot(null, {
      coins: [coin(1), coin(2)],
      scores: [3, 5],
      status: 'racing',
      winner: null,
      elapsed: 7,
    });
    let out = stepRace(core, 0.05, coast, { pos: null, world: mirror });
    expect(out.outbound).toBeNull();
    expect(out.coins.map((c) => c.id).sort()).toEqual([1, 2]);
    expect(core.scores).toEqual([3, 5]);
    expect(core.elapsed).toBe(7); // snapped to the authoritative clock

    // No new message → the clock keeps ticking locally.
    out = stepRace(core, 0.05, coast, { pos: null, world: mirror });
    expect(core.elapsed).toBeCloseTo(7.05, 5);

    // A delta removes one coin, spawns another, and ends the race.
    mirror = applyWorldDelta(mirror, {
      spawned: [coin(3)],
      removed: [1],
      scores: [20, 5],
      status: 'over',
      winner: 0,
      elapsed: 9,
    });
    out = stepRace(core, 0.05, coast, { pos: null, world: mirror });
    expect(out.coins.map((c) => c.id).sort()).toEqual([2, 3]);
    expect(core.status).toBe('over');
    expect(core.winner).toBe(0);
    expect(core.elapsed).toBe(9);
  });

  it('applyWorldDelta tolerates arriving before any snapshot', () => {
    const mirror = applyWorldDelta(null, {
      spawned: [coin(9)],
      removed: [1],
      scores: [1, 0],
      status: 'racing',
      winner: null,
      elapsed: 2,
    });
    expect([...mirror.coins.keys()]).toEqual([9]);
    expect(mirror.seq).toBe(1);
  });

  it('applyWorldSnapshot replaces the mirror and bumps seq past the old one', () => {
    const first: MirrorWorld = applyWorldSnapshot(null, {
      coins: [coin(1)],
      scores: [0, 0],
      status: 'racing',
      winner: null,
      elapsed: 1,
    });
    const second = applyWorldSnapshot(first, {
      coins: [coin(5)],
      scores: [2, 1],
      status: 'racing',
      winner: null,
      elapsed: 4,
    });
    expect([...second.coins.keys()]).toEqual([5]);
    expect(second.seq).toBe(first.seq + 1);
  });
});

describe('takeWorldSnapshot', () => {
  it('returns the full field and resets the delta stream', () => {
    const core = createRaceCore('net', 0, 20, rngZero);
    core.karts[0].x = 0; // collect a batch so there is pending churn
    stepRace(core, 0.01, coast, { pos: { x: 60, z: 60, heading: 0, speed: 0 }, world: null });
    expect(core.pendingRemoved.length + core.pendingSpawned.length).toBeGreaterThan(0);

    const snap = takeWorldSnapshot(core)!;
    expect(snap.coins).toHaveLength(COIN_TARGET);
    expect(snap.scores).toEqual(core.scores);
    expect(core.pendingSpawned).toHaveLength(0);
    expect(core.pendingRemoved).toHaveLength(0);
    expect(core.dirty).toBe(false);
  });

  it('is null for the guest, and carries a finished race for the host', () => {
    expect(takeWorldSnapshot(createRaceCore('net', 1, 20, rngZero))).toBeNull();

    const core = createRaceCore('net', 0, 20, rngZero);
    core.karts[0].x = 0;
    while (core.status === 'racing') stepRace(core, 0.05, coast, { pos: { x: 60, z: 60, heading: 0, speed: 0 }, world: null });
    const snap = takeWorldSnapshot(core)!;
    expect(snap.status).toBe('over');
    expect(snap.winner).toBe(0);
  });
});
