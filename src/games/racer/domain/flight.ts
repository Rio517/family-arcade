/**
 * Rainbow Racer — how a racer flies. Pure maths, no three.js or DOM, so the
 * feel can be unit-tested.
 *
 * The sky is open: there is no fence and no edge. A racer always flies
 * forward at a gentle cruise, turns with `steer`, and climbs or dives with
 * `lift` between a floor and a ceiling. Speed comes from the sky itself —
 * a rainbow ring gives a short burst — and from stars, which lift a racer
 * a power tier: bigger and faster, for a while (see `collectStar`).
 *
 * Forward is (sin heading, cos heading) on the ground plane; y is height.
 */

/** Lowest and highest a racer can fly. The cloud sea sits below the floor. */
export const SKY_FLOOR = 14;
export const SKY_CEILING = 90;
/** Where everyone starts. */
export const CRUISE_ALTITUDE = 30;

/** Gentle and always moving, so a young child only has to steer. */
export const CRUISE_SPEED = 26;
/** A burst from a rainbow ring or a fresh star: a lift, not a launch. */
const BURST_SPEED = 40;
const ACCEL = 30; // how fast speed eases toward its goal (units/s²)
const TURN_RATE = 1.9; // radians/s at full lock
const CLIMB_RATE = 17; // units/s at full lift
/** How quickly the visible bank and climb follow the stick (1/s). */
const LEAN_RATE = 5;

/** Power tiers from stars: 0 plain … 3 biggest. */
export const MAX_TIER = 3;
/** Each tier is this much faster… */
const TIER_SPEED = 0.07;
/** …and this much bigger (the renderer grows the model to match). */
const TIER_SCALE = 0.22;
/** A fresh tier lasts this long before it fades back one step… */
const TIER_HOLD = 14;
/** …and each lower tier this long after that. */
const TIER_FADE = 8;
/** Seconds of burst a star gives on top of its tier. */
const STAR_BURST = 1.2;
/** How long a wings power-up lasts, and how much faster it makes you. */
export const WINGS_TIME = 10;
const WINGS_SPEED = 0.15;
/** Seconds of burst a rainbow ring gives. */
const RING_BURST = 1.6;

export interface Flyer {
  x: number;
  y: number;
  z: number;
  /** Facing, radians. */
  heading: number;
  /** Current forward speed (units/s). */
  speed: number;
  /** -1…1, the visible lean into a turn (eases toward `steer`). */
  bank: number;
  /** -1…1, the visible nose pitch (eases toward `lift`). */
  climb: number;
  /** Power tier from stars, 0…MAX_TIER. */
  tier: number;
  /** Seconds left before the tier fades one step. */
  tierTime: number;
  /** Seconds of burst left. */
  burst: number;
  /** Speed multiplier the race may set (rival pacing); 1 for people. */
  pace: number;
  /** The last rainbow ring this racer flew through, so one ring is one burst. */
  lastRing: string | null;
  /** Seconds left of a wings power-up: bigger wings, and faster. */
  wingTime: number;
  /** The rainbow-road point nearest this racer, kept as a search hint. */
  trail: number;
}

/** Per-frame stick input. */
export interface FlightInput {
  /** -1 = full left, +1 = full right. */
  steer: number;
  /** -1 = dive, +1 = climb. */
  lift: number;
}

export function createFlyer(x = 0, z = 0, heading = 0, y = CRUISE_ALTITUDE): Flyer {
  return {
    x,
    y,
    z,
    heading,
    speed: CRUISE_SPEED,
    bank: 0,
    climb: 0,
    tier: 0,
    tierTime: 0,
    burst: 0,
    pace: 1,
    lastRing: null,
    wingTime: 0,
    trail: 0,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function approach(value: number, goal: number, maxStep: number): number {
  if (value < goal) return Math.min(goal, value + maxStep);
  if (value > goal) return Math.max(goal, value - maxStep);
  return value;
}

/** How big a racer is drawn and how far it reaches, for its tier. */
export function sizeOf(f: Pick<Flyer, 'tier'>): number {
  return 1 + TIER_SCALE * f.tier;
}

/** The speed a racer settles to right now. */
export function goalSpeed(f: Flyer): number {
  const base = f.burst > 0 ? BURST_SPEED : CRUISE_SPEED;
  const wings = f.wingTime > 0 ? 1 + WINGS_SPEED : 1;
  return base * (1 + TIER_SPEED * f.tier) * wings * f.pace;
}

/** Advance one racer by `dt` seconds. Mutates and returns it. */
export function stepFlight(f: Flyer, dt: number, input: FlightInput): Flyer {
  const t = clamp(dt, 0, 0.05);
  const steer = clamp(Number.isFinite(input.steer) ? input.steer : 0, -1, 1);
  const lift = clamp(Number.isFinite(input.lift) ? input.lift : 0, -1, 1);

  // Bursts, wings and tiers run down.
  f.burst = Math.max(0, f.burst - t);
  f.wingTime = Math.max(0, f.wingTime - t);
  if (f.tier > 0) {
    f.tierTime -= t;
    if (f.tierTime <= 0) {
      f.tier -= 1;
      f.tierTime = f.tier > 0 ? TIER_FADE : 0;
    }
  }

  f.speed = approach(f.speed, goalSpeed(f), ACCEL * t);
  // The camera sits behind the racer looking along +Z, which puts world +X
  // on the left of the screen — so turning right means heading goes down.
  f.heading -= steer * TURN_RATE * t;
  f.bank = approach(f.bank, steer, LEAN_RATE * t);
  f.climb = approach(f.climb, lift, LEAN_RATE * t);

  f.x += Math.sin(f.heading) * f.speed * t;
  f.z += Math.cos(f.heading) * f.speed * t;
  // The floor and ceiling are soft: the stick stops doing anything there,
  // rather than the racer hitting a wall.
  f.y = clamp(f.y + lift * CLIMB_RATE * t, SKY_FLOOR, SKY_CEILING);
  return f;
}

/** A star: one tier up (to the top), a fresh hold, and a little burst. */
export function collectStar(f: Flyer): void {
  f.tier = Math.min(MAX_TIER, f.tier + 1);
  f.tierTime = TIER_HOLD;
  f.burst = Math.max(f.burst, STAR_BURST);
}

/** A wings power-up: bigger wings and more speed for a while, plus a little burst. */
export function collectWings(f: Flyer): void {
  f.wingTime = WINGS_TIME;
  f.burst = Math.max(f.burst, STAR_BURST);
}

/** A rainbow ring: a burst, once per ring. */
export function flyThroughRing(f: Flyer, ringId: string): boolean {
  if (f.lastRing === ringId) return false;
  f.lastRing = ringId;
  f.burst = Math.max(f.burst, RING_BURST);
  return true;
}

/** How close two racers can get before they bump, at tier 0. */
const BUMP_RADIUS = 6;

/**
 * Racers that fly into each other bump apart. The bigger one barely moves and
 * the smaller one is nudged aside and slowed a little — powers live in your
 * body, so a star-fed racer is strong as well as fast. Equal racers share it.
 */
export function bumpRacers(flyers: Flyer[]): void {
  for (let i = 0; i < flyers.length; i++) {
    for (let j = i + 1; j < flyers.length; j++) {
      const a = flyers[i];
      const b = flyers[j];
      const reach = BUMP_RADIUS * (sizeOf(a) + sizeOf(b)) * 0.5;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dy, dz);
      if (d >= reach) continue;
      // Two racers exactly on top of each other still part, side to side.
      const nx = d > 1e-6 ? dx / d : 1;
      const ny = d > 1e-6 ? dy / d : 0;
      const nz = d > 1e-6 ? dz / d : 0;
      const overlap = reach - d;
      // Share of the push each takes, from their tiers.
      const wa = 1 + b.tier - a.tier;
      const wb = 1 + a.tier - b.tier;
      const sa = Math.max(0.1, wa) / (Math.max(0.1, wa) + Math.max(0.1, wb));
      const sb = 1 - sa;
      a.x -= nx * overlap * sa;
      a.y = clamp(a.y - ny * overlap * sa, SKY_FLOOR, SKY_CEILING);
      a.z -= nz * overlap * sa;
      b.x += nx * overlap * sb;
      b.y = clamp(b.y + ny * overlap * sb, SKY_FLOOR, SKY_CEILING);
      b.z += nz * overlap * sb;
      if (a.tier < b.tier) a.speed *= 0.85;
      if (b.tier < a.tier) b.speed *= 0.85;
    }
  }
}
