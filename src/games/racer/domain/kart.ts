/**
 * Rainbow Racer — the pure driving + coin model for the 3D kart game.
 *
 * All math and no pixels (no three.js, no DOM), so the feel and the rules can be
 * unit-tested. It is split into two reusable pieces:
 *
 *   • a single **kart** you can step with `stepMotion` (used by every player, in
 *     both single- and two-player modes — each device drives its own kart), and
 *   • a shared **coin field** the owner steps with `collectCoins`/`refillCoins`
 *     (single-player: you own it; two-player: the host owns it and syncs it).
 *
 * Randomness is injected so tests are deterministic.
 */

/** The round play area is a disc of this radius (world units). */
export const ARENA_RADIUS = 100;

/** Keep coins this far inside the fence so none spawn in the wall. */
const COIN_MARGIN = 12;

/** Driving feel — gentle and always-rolling so a young child can steer. */
const CRUISE_SPEED = 34; // units/s when you just hold forward
const BOOST_SPEED = 54; // units/s with the boost held
const BRAKE_SPEED = 12; // units/s while braking
const ACCEL = 42; // how fast speed eases toward its target (units/s²)
const TURN_RATE = 2.1; // radians/s of turning at full lock

/** Scoop a coin up within this distance. Generous on purpose. */
export const COIN_COLLECT_RADIUS = 10;

/** How many coins sparkle in the arena at once. */
export const COIN_TARGET = 16;

export type Rng = () => number;

export interface Coin {
  id: number;
  x: number;
  z: number;
  /** 0–360 hue so every coin is a different rainbow color. */
  hue: number;
}

export interface Kart {
  /** Position on the ground plane. */
  x: number;
  z: number;
  /** Facing angle in radians. Forward is (sin h, cos h). */
  heading: number;
  /** Current forward speed (units/s). */
  speed: number;
}

/** Per-frame driver input. */
export interface KartInput {
  /** -1 = full left, +1 = full right. */
  steer: number;
  /** true while the boost (forward) is held. */
  boost: boolean;
  /** true while braking. */
  brake: boolean;
}

export function createKart(x = 0, z = 0, heading = 0): Kart {
  return { x, z, heading, speed: CRUISE_SPEED };
}

/** Where each kart starts, spread apart so nobody begins on top of a rival. */
export function startPositions(count: number): Array<{ x: number; z: number; heading: number }> {
  if (count <= 1) return [{ x: 0, z: 0, heading: 0 }];
  return [
    { x: -24, z: 0, heading: 0 },
    { x: 24, z: 0, heading: 0 },
  ];
}

function approach(value: number, goal: number, maxStep: number): number {
  if (value < goal) return Math.min(goal, value + maxStep);
  if (value > goal) return Math.max(goal, value - maxStep);
  return value;
}

/** Unit forward vector — handy for the camera and the 3D model. */
export function forward(kart: Kart): { x: number; z: number } {
  return { x: Math.sin(kart.heading), z: Math.cos(kart.heading) };
}

/**
 * Advance ONE kart by `dt` seconds from its driver input. Mutates and returns
 * the same kart. Coins are handled separately (see the coin field below), so a
 * kart's motion never depends on who owns the coins.
 */
export function stepMotion(kart: Kart, dt: number, input: KartInput): Kart {
  const t = Math.max(0, Math.min(dt, 0.05));

  const goal = input.brake ? BRAKE_SPEED : input.boost ? BOOST_SPEED : CRUISE_SPEED;
  kart.speed = approach(kart.speed, goal, ACCEL * t);

  // Steering bites more the faster you roll (you can't spin in place).
  const grip = Math.min(1, kart.speed / CRUISE_SPEED);
  const steer = Math.max(-1, Math.min(1, input.steer));
  kart.heading += steer * TURN_RATE * grip * t;

  const fx = Math.sin(kart.heading);
  const fz = Math.cos(kart.heading);
  kart.x += fx * kart.speed * t;
  kart.z += fz * kart.speed * t;

  // Bounce off the round fence and turn back inward, so you can never get pinned
  // against the wall holding forward.
  const r = Math.hypot(kart.x, kart.z);
  if (r > ARENA_RADIUS) {
    const nx = kart.x / r;
    const nz = kart.z / r;
    kart.x = nx * ARENA_RADIUS;
    kart.z = nz * ARENA_RADIUS;
    const dot = fx * nx + fz * nz;
    if (dot > 0) {
      const rx = fx - 2 * dot * nx;
      const rz = fz - 2 * dot * nz;
      kart.heading = Math.atan2(rx, rz);
    }
    kart.speed *= 0.6;
  }
  return kart;
}

// ── the shared coin field ──────────────────────────────────────────────────

export interface CoinField {
  coins: Coin[];
  nextId: number;
}

function randomCoin(id: number, rng: Rng): Coin {
  // Uniform point in a disc (sqrt keeps it from clumping in the middle).
  const r = Math.sqrt(rng()) * (ARENA_RADIUS - COIN_MARGIN);
  const a = rng() * Math.PI * 2;
  return { id, x: Math.cos(a) * r, z: Math.sin(a) * r, hue: Math.floor(rng() * 360) };
}

/** Refill the arena up to COIN_TARGET, avoiding spawns right on a kart. */
export function refillCoins(field: CoinField, avoid: Array<{ x: number; z: number }>, rng: Rng = Math.random): void {
  while (field.coins.length < COIN_TARGET) {
    let coin = randomCoin(field.nextId, rng);
    if (avoid.some((p) => Math.hypot(coin.x - p.x, coin.z - p.z) < COIN_COLLECT_RADIUS * 2)) {
      coin = randomCoin(field.nextId, rng);
    }
    field.coins.push(coin);
    field.nextId++;
  }
}

export function createCoinField(rng: Rng = Math.random): CoinField {
  const field: CoinField = { coins: [], nextId: 1 };
  refillCoins(field, [], rng);
  return field;
}

/**
 * Award any coin a kart is touching. `points` are the kart positions in order;
 * returns how many coins each one scooped this step (parallel to `points`). If
 * two karts overlap a coin, the earlier point wins it — a stable tie-break.
 */
export function collectCoins(field: CoinField, points: Array<{ x: number; z: number }>): number[] {
  const hits = points.map(() => 0);
  field.coins = field.coins.filter((c) => {
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (Math.hypot(c.x - p.x, c.z - p.z) <= COIN_COLLECT_RADIUS) {
        hits[i] += 1;
        return false;
      }
    }
    return true;
  });
  return hits;
}
