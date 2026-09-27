/**
 * Rainbow Racer — the pure per-frame race simulation.
 *
 * `stepRace` advances one frame of the race for whichever seat this device
 * holds, with no DOM, network, or three.js in sight:
 *
 *   • **solo** — you race three computer rivals. You own the whole sky: the
 *     coins and stars, every racer's score and power, the finish line.
 *   • **net host** (racer 0) — you own the pickups, the scores and the power
 *     tiers for BOTH racers (the guest's position arrives via `remote.pos`).
 *     Changes are accumulated and handed back as compact `WorldDelta`s to
 *     broadcast — never the full field — so a dropped packet can't
 *     head-of-line-block the position stream behind a big retransmit.
 *   • **net guest** (racer 1) — you fly your own racer but mirror the host's
 *     authoritative world (`remote.world`), which the connection layer keeps
 *     up to date by applying snapshots and deltas via `applyWorldSnapshot` /
 *     `applyWorldDelta` below.
 *
 * Every race opens with a short countdown while everyone hovers at the start.
 * Rainbow rings are part of the sky (domain/sky.ts), identical on both
 * devices, so each device applies its own racer's ring bursts with no sync.
 */

import {
  bumpRacers,
  collectStar,
  createFlyer,
  flyThroughRing,
  stepFlight,
  type FlightInput,
  type Flyer,
} from './flight';
import {
  collectPickups,
  createPickupField,
  heightHelp,
  refillPickups,
  type Coin,
  type PickupField,
  type Rng,
  type Star,
} from './pickups';
import { createRivalBrain, steerRival, type RivalBrain } from './rivals';
import { ringAt } from './sky';

export type RaceMode = 'solo' | 'net';
export type RaceStatus = 'racing' | 'over';

/** Computer rivals in a one-player race. */
export const RIVAL_COUNT = 3;
/** Seconds of "3, 2, 1" before anyone moves. */
export const COUNTDOWN = 3;
/** Flush accumulated world changes at most this often (≈12/s) while racing. */
const WORLD_SEND_INTERVAL = 0.08;
/** Even with nothing to report, re-sync the guest's clock this often. */
export const WORLD_KEEPALIVE_INTERVAL = 1;

/** Where the opponent last said their racer was. */
export interface RemoteKartPos {
  x: number;
  /** Height. Absent from an older device: that racer flies at cruise height. */
  y?: number;
  z: number;
  heading: number;
  speed: number;
}

/** The full authoritative world — sent on race start and channel (re)open. */
export interface WorldSnapshot {
  coins: Coin[];
  stars: Star[];
  /** [host, guest] power tiers. */
  tiers: [number, number];
  /** [hostScore, guestScore]. */
  scores: [number, number];
  status: RaceStatus;
  /** Winning racer index (0 host, 1 guest), or null while racing / on a tie. */
  winner: number | null;
  elapsed: number;
}

/** What changed since the last world message — the host's steady-state send. */
export interface WorldDelta {
  spawned: Coin[];
  starSpawned: Star[];
  /** Ids of coins and stars that left the field (they share one id space). */
  removed: number[];
  tiers: [number, number];
  scores: [number, number];
  status: RaceStatus;
  winner: number | null;
  elapsed: number;
}

/** The guest's mirror of the host's world, built up from snapshots + deltas. */
export interface MirrorWorld {
  coins: Map<number, Coin>;
  stars: Map<number, Star>;
  tiers: [number, number];
  scores: [number, number];
  status: RaceStatus;
  winner: number | null;
  elapsed: number;
  /** Bumps once per applied message, so `stepRace` can tell fresh data apart. */
  seq: number;
}

/** Everything the network delivered that this frame's simulation may need. */
export interface RemoteInput {
  pos: RemoteKartPos | null;
  world: MirrorWorld | null;
}

export interface StepResult {
  /** The coins and stars to draw this frame. */
  coins: Coin[];
  stars: Star[];
  /** Host only: a world delta to broadcast now (null = nothing to send). */
  outbound: WorldDelta | null;
}

/** The live race. Mutated in place each frame so the rAF loop allocates ~nothing. */
export interface RaceCore {
  mode: RaceMode;
  /** My seat: 0 = solo player / host, 1 = guest. */
  myIndex: number;
  /** Every racer: solo = me + rivals; net = [host, guest]. */
  karts: Flyer[];
  /** A computer brain per racer, or null for a person. */
  brains: Array<RivalBrain | null>;
  /** The pickup owner (solo player / host) has it; the guest mirrors instead. */
  field: PickupField | null;
  scores: number[];
  status: RaceStatus;
  winner: number | null;
  elapsed: number;
  target: number;
  /** Seconds of countdown left; nobody moves until it reaches 0. */
  countdown: number;
  /** Injected randomness so refills are deterministic under test. */
  rng: Rng;
  // ── host → guest delta bookkeeping ──
  pendingSpawned: Coin[];
  pendingStars: Star[];
  /** Ids of pickups that left the field since the last world message. */
  pendingRemoved: number[];
  /** True when something the guest cares about changed since the last send. */
  dirty: boolean;
  /** Seconds since the last world message went out. */
  sinceWorldSend: number;
  /** The "race over" world has been handed off for sending. */
  finalSent: boolean;
  /** Host: tiers last sent, so a change marks the world dirty. Guest: tiers
   * last mirrored, so a rise (a star I took) starts my burst once. */
  sentTiers: [number, number];
  // ── guest mirror bookkeeping ──
  /** Last MirrorWorld.seq folded in, so the clock only snaps on fresh data. */
  lastWorldSeq: number;
}

/** Start line: one racer at the origin, rivals just behind and to the sides. */
const SOLO_GRID = [
  { x: 0, z: 0 },
  { x: -16, z: -8 },
  { x: 16, z: -8 },
  { x: 0, z: -18 },
];
/** Two people, side by side. */
const NET_GRID = [
  { x: -12, z: 0 },
  { x: 12, z: 0 },
];

export function createRaceCore(
  mode: RaceMode,
  myIndex: number,
  target: number,
  rng: Rng,
  opts: { rivals?: number; countdown?: number } = {},
): RaceCore {
  const owner = mode === 'solo' || myIndex === 0;
  const rivals = mode === 'solo' ? Math.max(0, Math.min(RIVAL_COUNT, opts.rivals ?? RIVAL_COUNT)) : 0;
  const grid = mode === 'solo' ? SOLO_GRID.slice(0, 1 + rivals) : NET_GRID;
  const karts = grid.map((s) => createFlyer(s.x, s.z, 0));
  const brains = karts.map((_, i) => (mode === 'solo' && i > 0 ? createRivalBrain(i) : null));
  const people = karts.filter((_, i) => !brains[i]);
  return {
    mode,
    myIndex,
    karts,
    brains,
    field: owner ? createPickupField(people, rng) : null,
    scores: karts.map(() => 0),
    status: 'racing',
    winner: null,
    elapsed: 0,
    target,
    countdown: Math.max(0, opts.countdown ?? COUNTDOWN),
    rng,
    pendingSpawned: [],
    pendingStars: [],
    pendingRemoved: [],
    dirty: false,
    sinceWorldSend: 0,
    finalSent: false,
    sentTiers: [0, 0],
    lastWorldSeq: 0,
  };
}

/** A ring this racer is flying through gives it a burst. */
function checkRing(f: Flyer): void {
  const ring = ringAt(f.x, f.y, f.z);
  if (ring) flyThroughRing(f, ring.id);
}

/**
 * Advance the race by `dt` seconds. Mutates `core` and returns what to draw
 * plus (for the host) what to put on the wire.
 */
export function stepRace(core: RaceCore, dt: number, input: FlightInput, remote: RemoteInput | null): StepResult {
  const t = Math.max(0, Math.min(dt, 0.05));
  const me = core.karts[core.myIndex];
  const flying = core.status === 'racing' && core.countdown <= 0;
  if (core.countdown > 0) core.countdown = Math.max(0, core.countdown - t);

  if (flying) {
    // Height help, only while the child isn't pressing up or down.
    let lift = input.lift;
    if (!lift) {
      const field = core.field ?? null;
      const world = remote?.world ?? null;
      const ahead = field
        ? [...field.coins, ...field.stars]
        : world
          ? [...world.coins.values(), ...world.stars.values()]
          : [];
      lift = heightHelp(me, ahead);
    }
    stepFlight(me, t, { steer: input.steer, lift });
    checkRing(me);
    if (core.mode === 'solo') {
      const personScore = core.scores[core.myIndex];
      for (let i = 0; i < core.karts.length; i++) {
        const brain = core.brains[i];
        if (!brain) continue;
        const rival = core.karts[i];
        stepFlight(rival, t, steerRival(brain, rival, core.field, t, core.scores[i], personScore, me, core.target));
        checkRing(rival);
      }
      bumpRacers(core.karts);
    }
  }

  if (core.mode === 'net') {
    // Ease the opponent toward their last reported spot (smoothed so a 20 Hz
    // feed still looks like continuous flight).
    const other = core.karts[1 - core.myIndex];
    const rp = remote?.pos ?? null;
    if (rp) {
      const k = 1 - Math.pow(0.001, t);
      other.x += (rp.x - other.x) * k;
      other.y += ((rp.y ?? other.y) - other.y) * k;
      other.z += (rp.z - other.z) * k;
      const turn = angleDiff(other.heading, rp.heading);
      other.heading += turn * k;
      // Lean the way they're turning, for the picture.
      other.bank += (Math.max(-1, Math.min(1, turn * 3)) - other.bank) * k;
      other.speed = rp.speed;
    }
    if (!core.field) return guestStep(core, t, remote?.world ?? null);
  }
  return ownerStep(core, t, flying);
}

/** Solo player and net host: run the pickups, the scores, the tiers and the finish line. */
function ownerStep(core: RaceCore, t: number, flying: boolean): StepResult {
  const field = core.field;
  if (!field) return { coins: [], stars: [], outbound: null };
  const net = core.mode === 'net';

  if (flying) {
    // The photo-finish rule: a rival one coin from winning, and ahead of the
    // person, flies through coins without taking them. A loss is always a
    // close one, never a rout.
    const person = core.scores[core.myIndex];
    const holdBack = core.karts.map(
      (_, i) => !!core.brains[i] && core.scores[i] >= core.target - 1 && core.scores[i] > person,
    );
    const taken = collectPickups(field, core.karts, holdBack);
    for (let i = 0; i < core.karts.length; i++) {
      core.scores[i] += taken.coins[i];
      for (let s = 0; s < taken.stars[i]; s++) collectStar(core.karts[i]);
    }
    if (net && taken.taken.length) {
      for (const id of taken.taken) noteRemoved(core, id);
      core.dirty = true;
    }
    // The guest's own flight runs its tier down on the guest; the host is the
    // authority, so it runs the guest's clock here too (the host's copy of the
    // guest racer is only ever moved by `pos`).
    if (net) tickTier(core.karts[1 - core.myIndex], t);

    const people = core.karts.filter((_, i) => !core.brains[i]);
    const prevNext = field.nextId;
    const gone = refillPickups(field, people, core.karts, core.rng);
    if (net) {
      for (const id of gone) noteRemoved(core, id);
      if (field.nextId !== prevNext) {
        for (const c of field.coins) if (c.id >= prevNext) core.pendingSpawned.push(c);
        for (const s of field.stars) if (s.id >= prevNext) core.pendingStars.push(s);
      }
      if (gone.length || field.nextId !== prevNext) core.dirty = true;
      const tiers: [number, number] = [core.karts[0].tier, core.karts[1].tier];
      if (tiers[0] !== core.sentTiers[0] || tiers[1] !== core.sentTiers[1]) core.dirty = true;
    }

    core.elapsed += t;
    const finishers = core.scores.map((s, i) => (s >= core.target ? i : -1)).filter((i) => i >= 0);
    if (finishers.length) {
      core.status = 'over';
      if (!net) {
        // A person crossing on the same frame as a rival gets the win.
        core.winner = finishers.includes(core.myIndex) ? core.myIndex : finishers[0];
      } else {
        // Dead heat (both cross on the same frame) → null: both win the tie.
        core.winner =
          core.scores[0] === core.scores[1] ? null : core.scores[0] > core.scores[1] ? 0 : 1;
      }
      core.dirty = true;
    }
  }

  let outbound: WorldDelta | null = null;
  if (net) {
    core.sinceWorldSend += t;
    const finishedNow = core.status === 'over' && !core.finalSent;
    if (
      finishedNow ||
      (core.dirty && core.sinceWorldSend > WORLD_SEND_INTERVAL) ||
      core.sinceWorldSend > WORLD_KEEPALIVE_INTERVAL
    ) {
      outbound = flushDelta(core);
    }
  }
  return { coins: field.coins, stars: field.stars, outbound };
}

/** The tier clock, for a racer the host owns but does not fly. */
function tickTier(f: Flyer, t: number): void {
  if (f.tier <= 0) return;
  f.tierTime -= t;
  if (f.tierTime <= 0) {
    f.tier -= 1;
    f.tierTime = f.tier > 0 ? 8 : 0;
  }
}

/** Net guest: mirror the host's authoritative world. */
function guestStep(core: RaceCore, t: number, world: MirrorWorld | null): StepResult {
  if (!world) {
    // Nothing from the host yet — keep the local clock alive so the HUD ticks.
    if (core.status === 'racing' && core.countdown <= 0) core.elapsed += t;
    return { coins: [], stars: [], outbound: null };
  }
  core.scores[0] = world.scores[0];
  core.scores[1] = world.scores[1];
  core.status = world.status;
  core.winner = world.winner;
  for (let i = 0; i < 2; i++) {
    const k = core.karts[i];
    // A star the host saw me take: my burst starts here, where I fly.
    if (i === core.myIndex && world.tiers[i] > core.sentTiers[i]) collectStar(k);
    core.sentTiers[i] = world.tiers[i];
    // The host runs the tier clock; mine must never fade it locally.
    k.tier = world.tiers[i];
    k.tierTime = Infinity;
  }
  if (world.seq !== core.lastWorldSeq) {
    // Fresh word from the host: snap to the authoritative clock…
    core.lastWorldSeq = world.seq;
    core.elapsed = world.elapsed;
  } else if (core.status === 'racing' && core.countdown <= 0) {
    // …and between messages keep ticking locally so the timer never freezes.
    core.elapsed += t;
  }
  return { coins: [...world.coins.values()], stars: [...world.stars.values()], outbound: null };
}

/** A pickup the guest never learned about needs no delta entry at all. */
function noteRemoved(core: RaceCore, id: number): void {
  const c = core.pendingSpawned.findIndex((p) => p.id === id);
  if (c >= 0) {
    core.pendingSpawned.splice(c, 1);
    return;
  }
  const s = core.pendingStars.findIndex((p) => p.id === id);
  if (s >= 0) {
    core.pendingStars.splice(s, 1);
    return;
  }
  core.pendingRemoved.push(id);
}

function tiersOf(core: RaceCore): [number, number] {
  return [core.karts[0]?.tier ?? 0, core.karts[1]?.tier ?? 0];
}

function flushDelta(core: RaceCore): WorldDelta {
  const tiers = tiersOf(core);
  const delta: WorldDelta = {
    spawned: core.pendingSpawned,
    starSpawned: core.pendingStars,
    removed: core.pendingRemoved,
    tiers,
    scores: [core.scores[0], core.scores[1]],
    status: core.status,
    winner: core.winner,
    elapsed: core.elapsed,
  };
  core.pendingSpawned = [];
  core.pendingStars = [];
  core.pendingRemoved = [];
  core.sentTiers = tiers;
  core.dirty = false;
  core.sinceWorldSend = 0;
  if (core.status === 'over') core.finalSent = true;
  return delta;
}

/**
 * The owner's full world, for the wire — sent at race start and re-sent on
 * every channel (re)open so a guest that missed packets (even the final "race
 * over") always catches up. Resets the delta stream: changes the snapshot
 * already carries must not be re-sent as deltas.
 */
export function takeWorldSnapshot(core: RaceCore): WorldSnapshot | null {
  if (!core.field) return null;
  const tiers = tiersOf(core);
  core.pendingSpawned = [];
  core.pendingStars = [];
  core.pendingRemoved = [];
  core.sentTiers = tiers;
  core.dirty = false;
  core.sinceWorldSend = 0;
  if (core.status === 'over') core.finalSent = true;
  return {
    coins: [...core.field.coins],
    stars: [...core.field.stars],
    tiers,
    scores: [core.scores[0], core.scores[1]],
    status: core.status,
    winner: core.winner,
    elapsed: core.elapsed,
  };
}

/** Guest side: replace the mirror with a full snapshot from the host. */
export function applyWorldSnapshot(prev: MirrorWorld | null, snap: WorldSnapshot): MirrorWorld {
  const coins = new Map<number, Coin>();
  for (const c of snap.coins) coins.set(c.id, c);
  const stars = new Map<number, Star>();
  for (const s of snap.stars) stars.set(s.id, s);
  return {
    coins,
    stars,
    tiers: [snap.tiers[0], snap.tiers[1]],
    scores: [snap.scores[0], snap.scores[1]],
    status: snap.status,
    winner: snap.winner,
    elapsed: snap.elapsed,
    seq: (prev?.seq ?? 0) + 1,
  };
}

/** Guest side: fold one delta into the mirror (remove first, then spawn). */
export function applyWorldDelta(prev: MirrorWorld | null, delta: WorldDelta): MirrorWorld {
  const coins = prev?.coins ?? new Map<number, Coin>();
  const stars = prev?.stars ?? new Map<number, Star>();
  for (const id of delta.removed) {
    coins.delete(id);
    stars.delete(id);
  }
  for (const c of delta.spawned) coins.set(c.id, c);
  for (const s of delta.starSpawned) stars.set(s.id, s);
  return {
    coins,
    stars,
    tiers: [delta.tiers[0], delta.tiers[1]],
    scores: [delta.scores[0], delta.scores[1]],
    status: delta.status,
    winner: delta.winner,
    elapsed: delta.elapsed,
    seq: (prev?.seq ?? 0) + 1,
  };
}

/** Shortest signed turn from a to b. */
function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
