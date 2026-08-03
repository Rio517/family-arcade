/**
 * Rainbow Racer — the pure per-frame race simulation.
 *
 * `stepRace` advances one frame of the race for whichever seat this device
 * holds, with no DOM, network, or three.js in sight:
 *
 *   • **solo** — you own the coin field: collect, refill, win at the target.
 *   • **net host** (racer 0) — you own the coins and the score for BOTH karts
 *     (the guest's kart position arrives via `remote.pos`). Coin changes are
 *     accumulated and handed back as compact `WorldDelta`s to broadcast —
 *     never the full field — so a dropped packet can't head-of-line-block the
 *     position stream behind a big retransmit.
 *   • **net guest** (racer 1) — you drive your own kart but mirror the host's
 *     authoritative world (`remote.world`), which the connection layer keeps
 *     up to date by applying snapshots and deltas via `applyWorldSnapshot` /
 *     `applyWorldDelta` below.
 *
 * The host opens every race (and every reconnect — see `takeWorldSnapshot`)
 * with a full `WorldSnapshot`; after that only deltas travel, plus a low-rate
 * keepalive so the guest's clock stays honest during a quiet stretch.
 */

import {
  collectCoins,
  createCoinField,
  createKart,
  refillCoins,
  startPositions,
  stepMotion,
  type Coin,
  type CoinField,
  type Kart,
  type KartInput,
  type Rng,
} from './kart';

export type RaceMode = 'solo' | 'net';
export type RaceStatus = 'racing' | 'over';

/** Flush accumulated coin changes at most this often (≈12/s) while racing. */
const WORLD_SEND_INTERVAL = 0.08;
/** Even with nothing to report, re-sync the guest's clock this often. */
export const WORLD_KEEPALIVE_INTERVAL = 1;

/** Where the opponent last said their kart was. */
export interface RemoteKartPos {
  x: number;
  z: number;
  heading: number;
  speed: number;
}

/** The full authoritative world — sent on race start and channel (re)open. */
export interface WorldSnapshot {
  coins: Coin[];
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
  removed: number[];
  scores: [number, number];
  status: RaceStatus;
  winner: number | null;
  elapsed: number;
}

/** The guest's mirror of the host's world, built up from snapshots + deltas. */
export interface MirrorWorld {
  coins: Map<number, Coin>;
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
  /** The coins to draw this frame. */
  coins: Coin[];
  /** Host only: a world delta to broadcast now (null = nothing to send). */
  outbound: WorldDelta | null;
}

/** The live race. Mutated in place each frame so the rAF loop allocates ~nothing. */
export interface RaceCore {
  mode: RaceMode;
  /** My seat: 0 = solo player / host, 1 = guest. */
  myIndex: number;
  karts: Kart[];
  /** The coin owner (solo player / host) has it; the guest mirrors instead. */
  field: CoinField | null;
  scores: [number, number];
  status: RaceStatus;
  winner: number | null;
  elapsed: number;
  target: number;
  /** Injected randomness so refills are deterministic under test. */
  rng: Rng;
  // ── host → guest delta bookkeeping ──
  /** Coins spawned since the last world message went out. */
  pendingSpawned: Coin[];
  /** Ids of coins collected since the last world message went out. */
  pendingRemoved: number[];
  /** True when something the guest cares about changed since the last send. */
  dirty: boolean;
  /** Seconds since the last world message went out. */
  sinceWorldSend: number;
  /** The "race over" world has been handed off for sending. */
  finalSent: boolean;
  // ── guest mirror bookkeeping ──
  /** Last MirrorWorld.seq folded in, so the clock only snaps on fresh data. */
  lastWorldSeq: number;
}

export function createRaceCore(mode: RaceMode, myIndex: number, target: number, rng: Rng): RaceCore {
  const owner = mode === 'solo' || myIndex === 0;
  const spots = mode === 'solo' ? [{ x: 0, z: 0, heading: 0 }] : startPositions(2);
  return {
    mode,
    myIndex,
    karts: spots.map((s) => createKart(s.x, s.z, s.heading)),
    field: owner ? createCoinField(rng) : null,
    scores: [0, 0],
    status: 'racing',
    winner: null,
    elapsed: 0,
    target,
    rng,
    pendingSpawned: [],
    pendingRemoved: [],
    dirty: false,
    sinceWorldSend: 0,
    finalSent: false,
    lastWorldSeq: 0,
  };
}

/**
 * Advance the race by `dt` seconds. Mutates `core` and returns what to draw
 * plus (for the host) what to put on the wire.
 */
export function stepRace(core: RaceCore, dt: number, input: KartInput, remote: RemoteInput | null): StepResult {
  const t = Math.max(0, Math.min(dt, 0.05));
  const me = core.karts[core.myIndex];
  if (core.status === 'racing') stepMotion(me, t, input);

  if (core.mode === 'net') {
    // Ease the opponent's kart toward their last reported spot (smoothed so a
    // 20 Hz feed still looks like continuous driving).
    const other = core.karts[1 - core.myIndex];
    const rp = remote?.pos ?? null;
    if (rp) {
      const k = 1 - Math.pow(0.001, t);
      other.x += (rp.x - other.x) * k;
      other.z += (rp.z - other.z) * k;
      other.heading = lerpAngle(other.heading, rp.heading, k);
      other.speed = rp.speed;
    }
    if (!core.field) return guestStep(core, t, remote?.world ?? null);
  }
  return ownerStep(core, t);
}

/** Solo player and net host: run the coins, the score, and the finish line. */
function ownerStep(core: RaceCore, t: number): StepResult {
  const field = core.field;
  if (!field) return { coins: [], outbound: null };
  const net = core.mode === 'net';

  if (core.status === 'racing') {
    const prevIds = field.coins.map((c) => c.id);
    const hits = collectCoins(
      field,
      core.karts.map((k) => ({ x: k.x, z: k.z })),
    );
    if (hits.some((h) => h > 0)) {
      for (let i = 0; i < hits.length; i++) core.scores[i] += hits[i];
      if (net) {
        const after = new Set(field.coins.map((c) => c.id));
        for (const id of prevIds) if (!after.has(id)) noteRemoved(core, id);
        core.dirty = true;
      }
    }
    const prevNext = field.nextId;
    refillCoins(field, core.karts, core.rng);
    if (net && field.nextId !== prevNext) {
      for (const c of field.coins) if (c.id >= prevNext) core.pendingSpawned.push(c);
      core.dirty = true;
    }
    core.elapsed += t;
    if (core.scores[0] >= core.target || core.scores[1] >= core.target) {
      core.status = 'over';
      // Dead heat (both cross the line on the same frame) → null, which the
      // protocol documents as "both win the tie".
      core.winner = !net
        ? 0
        : core.scores[0] === core.scores[1]
          ? null
          : core.scores[0] > core.scores[1]
            ? 0
            : 1;
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
  return { coins: field.coins, outbound };
}

/** Net guest: mirror the host's authoritative world. */
function guestStep(core: RaceCore, t: number, world: MirrorWorld | null): StepResult {
  if (!world) {
    // Nothing from the host yet — keep the local clock alive so the HUD ticks.
    if (core.status === 'racing') core.elapsed += t;
    return { coins: [], outbound: null };
  }
  core.scores[0] = world.scores[0];
  core.scores[1] = world.scores[1];
  core.status = world.status;
  core.winner = world.winner;
  if (world.seq !== core.lastWorldSeq) {
    // Fresh word from the host: snap to the authoritative clock…
    core.lastWorldSeq = world.seq;
    core.elapsed = world.elapsed;
  } else if (core.status === 'racing') {
    // …and between messages keep ticking locally so the timer never freezes.
    core.elapsed += t;
  }
  return { coins: [...world.coins.values()], outbound: null };
}

/** A collected coin the guest never learned about needs no delta entry at all. */
function noteRemoved(core: RaceCore, id: number): void {
  const i = core.pendingSpawned.findIndex((c) => c.id === id);
  if (i >= 0) core.pendingSpawned.splice(i, 1);
  else core.pendingRemoved.push(id);
}

function flushDelta(core: RaceCore): WorldDelta {
  const delta: WorldDelta = {
    spawned: core.pendingSpawned,
    removed: core.pendingRemoved,
    scores: [core.scores[0], core.scores[1]],
    status: core.status,
    winner: core.winner,
    elapsed: core.elapsed,
  };
  core.pendingSpawned = [];
  core.pendingRemoved = [];
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
  core.pendingSpawned = [];
  core.pendingRemoved = [];
  core.dirty = false;
  core.sinceWorldSend = 0;
  if (core.status === 'over') core.finalSent = true;
  return {
    coins: [...core.field.coins],
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
  return {
    coins,
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
  for (const id of delta.removed) coins.delete(id);
  for (const c of delta.spawned) coins.set(c.id, c);
  return {
    coins,
    scores: [delta.scores[0], delta.scores[1]],
    status: delta.status,
    winner: delta.winner,
    elapsed: delta.elapsed,
    seq: (prev?.seq ?? 0) + 1,
  };
}

/** Shortest-path angle lerp so a wrapping heading doesn't spin the long way. */
function lerpAngle(a: number, b: number, k: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
