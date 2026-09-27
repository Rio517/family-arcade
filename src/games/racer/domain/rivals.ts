/**
 * Rainbow Racer — the computer rivals who fly in a one-player race.
 *
 * A rival is a small seeded policy (ADR 0009: deterministic, no LLM). Each
 * step it picks something to chase — the pickup that is closest once you
 * count how far it would have to turn — and steers and climbs toward it,
 * with a little wander so it looks alive. Rivals like stars most when they
 * are small.
 *
 * The kindness rule, Mario Kart's own secret: a rival ahead of the person
 * racing eases off, and one behind pushes on. A rival that strays too far
 * from the person flies back toward them, so the race stays a pack. The race
 * stays close, the child usually wins, and never by a mile.
 */

import { SKY_CEILING, SKY_FLOOR, type Flyer, type FlightInput } from './flight';
import type { PickupField } from './pickups';

export interface RivalBrain {
  /** 0–1 per rival: how sharply it aims. Higher is better. */
  skill: number;
  /** Phase of its wander, radians. */
  wander: number;
  /** What it is chasing (a pickup id), kept until it's gone. */
  chasing: number | null;
  /** Seconds spent on this chase. A pickup inside the turning circle can be
   * orbited forever, so a rival gives up after a while and picks again. */
  chaseTime: number;
  /** The pickup it gave up on, skipped on the next pick. */
  skip: number | null;
}

export function createRivalBrain(seed: number): RivalBrain {
  const u = Math.abs(Math.sin(seed * 12.9898 + 4.1414) * 43758.5453) % 1;
  return { skill: 0.6 + u * 0.35, wander: u * Math.PI * 2, chasing: null, chaseTime: 0, skip: null };
}

/** Further than this from the person racing, a rival flies back toward them. */
const PACK_RADIUS = 100;

function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** How costly a pickup is to reach: distance, plus the turn to face it. */
function cost(me: Flyer, p: { x: number; y: number; z: number }): number {
  const dx = p.x - me.x;
  const dz = p.z - me.z;
  const turn = Math.abs(angleDiff(me.heading, Math.atan2(dx, dz)));
  return Math.hypot(dx, p.y - me.y, dz) + turn * 45;
}

/**
 * Decide this frame's stick for one rival, and set its pace from the score
 * gap. `myScore` is the rival's, `leaderScore` the best person's.
 */
export function steerRival(
  brain: RivalBrain,
  me: Flyer,
  field: PickupField | null,
  dt: number,
  myScore: number,
  personScore: number,
  person: Flyer | null = null,
  finish = Infinity,
): FlightInput {
  // Kindness: ahead of the person → ease off; behind → push on.
  const lead = myScore - personScore;
  me.pace =
    lead >= 4 ? 0.55 : lead >= 2 ? 0.7 : lead >= 0 ? 0.86 : lead >= -3 ? 1.05 : lead >= -7 ? 1.25 : 1.45;

  brain.wander += dt * 0.9;
  if (!field) return { steer: Math.sin(brain.wander) * 0.3, lift: 0 };

  // The last coin: a rival one short of winning, and ahead of the person,
  // circles instead (the race also stops it scoring, see race.ts).
  if (myScore >= finish - 1 && lead > 0) {
    brain.chasing = null;
    return { steer: 0.35 + Math.sin(brain.wander) * 0.2, lift: 0 };
  }
  // Level on the last coin: slow, and leave the person the coins near them.
  const lastCoin = myScore >= finish - 1;
  if (lastCoin) me.pace = 0.65;

  // Strayed from the pack: head back toward the person, then carry on.
  if (person && Math.hypot(person.x - me.x, person.z - me.z) > PACK_RADIUS) {
    brain.chasing = null;
    return aim(brain, me, person);
  }

  // Keep chasing the same thing while it exists, so rivals don't dither.
  const pool = [
    ...field.coins,
    // Stars look closer when you're small.
    ...field.stars.map((s) => ({ ...s, discount: me.tier === 0 ? 0.55 : 0.85 })),
  ];
  brain.chaseTime += dt;
  if (brain.chaseTime > 7) {
    brain.skip = brain.chasing;
    brain.chasing = null;
  }
  let target = pool.find((p) => p.id === brain.chasing) ?? null;
  if (!target) {
    brain.chaseTime = 0;
    let best = Infinity;
    for (const p of pool) {
      if (p.id === brain.skip) continue;
      let c = cost(me, p) * ('discount' in p ? p.discount : 1);
      // Leave the person the pickups they are about to take; go for your own.
      if (person && cost(person, p) < cost(me, p)) {
        if (lastCoin && !('discount' in p)) continue;
        c *= 2;
      }
      if (c < best) {
        best = c;
        target = p;
      }
    }
    brain.chasing = target?.id ?? null;
  }
  if (!target) return { steer: Math.sin(brain.wander) * 0.3, lift: 0 };
  return aim(brain, me, target);
}

function aim(brain: RivalBrain, me: Flyer, target: { x: number; y: number; z: number }): FlightInput {
  const want = Math.atan2(target.x - me.x, target.z - me.z);
  const wobble = Math.sin(brain.wander * 1.7) * (1 - brain.skill) * 0.5;
  // A positive steer is a right turn, which lowers the heading (see flight.ts).
  const steer = Math.max(-1, Math.min(1, -angleDiff(me.heading, want) * (1.2 + brain.skill) + wobble));
  const ty = Math.max(SKY_FLOOR, Math.min(SKY_CEILING, target.y));
  const lift = Math.max(-1, Math.min(1, (ty - me.y) / 12));
  return { steer, lift };
}
