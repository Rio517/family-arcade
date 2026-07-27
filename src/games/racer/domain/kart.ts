/**
 * Rainbow Racer — the pure driving model for the 3D single-player coin game.
 *
 * A Mario-Kart-style romp: you drive a character around a big grassy arena from
 * a camera parked behind you, scooping up rainbow coins. First to 20 wins.
 *
 * This module is all math and no pixels — no three.js, no DOM — so the driving
 * feel and coin logic can be unit-tested. Randomness is injected so tests are
 * deterministic. The 3D view (`three/scene.ts`) is a pure *reader* of this state.
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
const COIN_COLLECT_RADIUS = 10;

/** How many coins sparkle in the arena at once. */
const COIN_TARGET = 16;

export interface Coin {
  id: number;
  x: number;
  z: number;
  /** 0–360 hue so every coin is a different rainbow color. */
  hue: number;
}

export type Status = 'racing' | 'over';

export interface KartState {
  /** Position on the ground plane. */
  x: number;
  z: number;
  /** Facing angle in radians. Forward is (sin h, cos h). */
  heading: number;
  /** Current forward speed (units/s). */
  speed: number;
  coins: number;
  target: number;
  status: Status;
  /** Seconds elapsed — shown as a friendly timer. */
  elapsed: number;
  items: Coin[];
  nextCoinId: number;
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

export type Rng = () => number;

function randomCoin(id: number, rng: Rng): Coin {
  // Uniform point in a disc (sqrt keeps it from clumping in the middle).
  const r = Math.sqrt(rng()) * (ARENA_RADIUS - COIN_MARGIN);
  const a = rng() * Math.PI * 2;
  return { id, x: Math.cos(a) * r, z: Math.sin(a) * r, hue: Math.floor(rng() * 360) };
}

function refill(state: KartState, rng: Rng): void {
  while (state.items.length < COIN_TARGET) {
    // Nudge coins away from a spawn right under the kart.
    let coin = randomCoin(state.nextCoinId, rng);
    if (Math.hypot(coin.x - state.x, coin.z - state.z) < COIN_COLLECT_RADIUS * 2) {
      coin = randomCoin(state.nextCoinId, rng);
    }
    state.items.push(coin);
    state.nextCoinId++;
  }
}

export interface NewRaceOptions {
  target?: number;
  rng?: Rng;
}

export function createRace({ target = 20, rng = Math.random }: NewRaceOptions = {}): KartState {
  const state: KartState = {
    x: 0,
    z: 0,
    heading: 0,
    speed: CRUISE_SPEED,
    coins: 0,
    target,
    status: 'racing',
    elapsed: 0,
    items: [],
    nextCoinId: 1,
  };
  refill(state, rng);
  return state;
}

function approach(value: number, goal: number, maxStep: number): number {
  if (value < goal) return Math.min(goal, value + maxStep);
  if (value > goal) return Math.max(goal, value - maxStep);
  return value;
}

/**
 * Advance the race by `dt` seconds. Mutates and returns the same state so a
 * frame allocates nothing. No-ops once the race is over.
 */
export function stepRace(
  state: KartState,
  dt: number,
  input: KartInput,
  rng: Rng = Math.random,
): KartState {
  if (state.status === 'over') return state;
  const t = Math.max(0, Math.min(dt, 0.05));

  // Speed eases toward the target the throttle asks for.
  const goal = input.brake ? BRAKE_SPEED : input.boost ? BOOST_SPEED : CRUISE_SPEED;
  state.speed = approach(state.speed, goal, ACCEL * t);

  // Steering bites more the faster you roll (you can't spin in place).
  const grip = Math.min(1, state.speed / CRUISE_SPEED);
  const steer = Math.max(-1, Math.min(1, input.steer));
  state.heading += steer * TURN_RATE * grip * t;

  // Roll forward along the facing direction.
  const fx = Math.sin(state.heading);
  const fz = Math.cos(state.heading);
  state.x += fx * state.speed * t;
  state.z += fz * state.speed * t;

  // Bump softly off the round fence.
  const r = Math.hypot(state.x, state.z);
  if (r > ARENA_RADIUS) {
    state.x = (state.x / r) * ARENA_RADIUS;
    state.z = (state.z / r) * ARENA_RADIUS;
    state.speed *= 0.5;
  }

  collect(state);
  refill(state, rng);

  state.elapsed += t;
  if (state.coins >= state.target) state.status = 'over';
  return state;
}

function collect(state: KartState): void {
  state.items = state.items.filter((c) => {
    const hit = Math.hypot(c.x - state.x, c.z - state.z) <= COIN_COLLECT_RADIUS;
    if (hit) state.coins += 1;
    return !hit;
  });
}

/** Unit forward vector — handy for the camera and the 3D model. */
export function forward(state: KartState): { x: number; z: number } {
  return { x: Math.sin(state.heading), z: Math.cos(state.heading) };
}
