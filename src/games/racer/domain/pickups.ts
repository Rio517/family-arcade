/**
 * Rainbow Racer — the coins and stars in the sky.
 *
 * Coins are the score: first to the target wins. Stars are power: each one
 * lifts a racer a tier, bigger and faster for a while. The sky has no edge,
 * so pickups are not scattered over an arena. They appear around the people
 * racing — ahead of them more often than behind — and fade out of the field
 * once everyone has flown far past them, so wherever you fly there is
 * something to chase. Computer rivals chase the same pickups, which is what
 * keeps the race together.
 *
 * The field belongs to one owner (the solo player, or the host of a two-device
 * race) and is stepped with injected randomness so tests are deterministic.
 */

import { SKY_CEILING, SKY_FLOOR, sizeOf, type Flyer } from './flight';

export type Rng = () => number;

export interface Coin {
  id: number;
  x: number;
  y: number;
  z: number;
  /** 0–360, so every coin is a different rainbow colour. */
  hue: number;
}

export interface Star {
  id: number;
  x: number;
  y: number;
  z: number;
}

export interface PickupField {
  coins: Coin[];
  stars: Star[];
  nextId: number;
}

/** How many coins and stars hang in the sky at once. */
export const COIN_TARGET = 12;
export const STAR_TARGET = 3;
/** Beyond this from every person racing, a pickup leaves the field. */
export const FIELD_RADIUS = 320;
/** Scoop a pickup within this distance (grows with the racer). Generous on purpose. */
const REACH = 9;

/**
 * Somewhere near an anchor racer, mostly ahead of it and near its height —
 * matching height is the hard part of flying for a young child, so coins
 * sit close to where you already are. `rise` is how far above or below.
 */
function spotNear(
  anchor: Flyer,
  rng: Rng,
  near: number,
  far: number,
  rise = 10,
): { x: number; y: number; z: number } {
  const ahead = rng() < 0.75;
  const angle = anchor.heading + (ahead ? (rng() - 0.5) * 1.8 : rng() * Math.PI * 2);
  const d = near + rng() * (far - near);
  const y = anchor.y + (rng() - 0.5) * 2 * rise;
  return {
    x: anchor.x + Math.sin(angle) * d,
    y: Math.max(SKY_FLOOR + 3, Math.min(SKY_CEILING - 4, y)),
    z: anchor.z + Math.cos(angle) * d,
  };
}

function farFromAll(p: { x: number; z: number }, anchors: Flyer[]): boolean {
  return anchors.every((a) => Math.hypot(p.x - a.x, p.z - a.z) > FIELD_RADIUS);
}

export function createPickupField(anchors: Flyer[], rng: Rng): PickupField {
  const field: PickupField = { coins: [], stars: [], nextId: 1 };
  refillPickups(field, anchors, [], rng);
  return field;
}

/**
 * Drop what everyone has left behind, then top the field back up around the
 * anchors (the people racing). New pickups keep clear of every racer, so
 * nothing appears already collected. Returns the ids that left the field.
 */
export function refillPickups(field: PickupField, anchors: Flyer[], racers: Flyer[], rng: Rng): number[] {
  const gone: number[] = [];
  if (anchors.length === 0) return gone;
  field.coins = field.coins.filter((c) => {
    if (!farFromAll(c, anchors)) return true;
    gone.push(c.id);
    return false;
  });
  field.stars = field.stars.filter((s) => {
    if (!farFromAll(s, anchors)) return true;
    gone.push(s.id);
    return false;
  });

  const clear = (p: { x: number; y: number; z: number }) =>
    racers.every((r) => Math.hypot(p.x - r.x, p.y - r.y, p.z - r.z) > REACH * 2.5);
  // Mostly around the people racing; sometimes near another racer (a rival
  // in a one-player race), closer in, so everyone has something of their own
  // to chase and nothing lands out past the edge of the field.
  const others = racers.filter((r) => !anchors.includes(r));
  const pick = (near: number, far: number, rise: number) =>
    others.length && rng() < 0.4
      ? spotNear(others[Math.floor(rng() * others.length)], rng, Math.min(near, 40), Math.min(far, 130), rise)
      : spotNear(anchors[Math.floor(rng() * anchors.length)], rng, near, far, rise);
  const place = (near: number, far: number, rise = 10) => {
    let p = pick(near, far, rise);
    for (let tries = 0; tries < 8 && !clear(p); tries++) p = pick(near, far, rise);
    return p;
  };

  while (field.coins.length < COIN_TARGET) {
    // Now and then a short curved row of coins, Mario-Kart style: a line
    // worth steering along.
    const row = field.coins.length <= COIN_TARGET - 4 && rng() < 0.25 ? 4 : 1;
    const p = place(60, 230);
    const bend = (rng() - 0.5) * 0.5;
    const dir = rng() * Math.PI * 2;
    for (let i = 0; i < row; i++) {
      const a = dir + bend * i;
      field.coins.push({
        id: field.nextId++,
        x: p.x + Math.sin(a) * i * 9,
        y: p.y,
        z: p.z + Math.cos(a) * i * 9,
        hue: Math.floor(rng() * 360),
      });
    }
  }
  while (field.stars.length < STAR_TARGET) {
    // Stars are worth a climb or a dive.
    const p = place(70, 220, 22);
    field.stars.push({ id: field.nextId++, ...p });
  }
  return gone;
}

/** Touching a pickup: generous across, more generous still up and down. */
function reaches(r: Flyer, p: { x: number; y: number; z: number }): boolean {
  const reach = REACH * sizeOf(r);
  const dy = (p.y - r.y) / 1.6;
  return Math.hypot(p.x - r.x, dy, p.z - r.z) <= reach;
}

/**
 * Height help for a young flyer: with nothing pressed up or down, a racer
 * eases toward the height of the pickup it is heading for — the nearest one
 * inside a cone ahead. Steering stays entirely the child's; this only saves
 * them matching height by hand. Returns a lift, -1…1, or 0 with nothing ahead.
 */
export function heightHelp(r: Flyer, pickups: Array<{ x: number; y: number; z: number }>): number {
  let best: { y: number } | null = null;
  let bestD = 90;
  for (const p of pickups) {
    const dx = p.x - r.x;
    const dz = p.z - r.z;
    const d = Math.hypot(dx, dz);
    if (d >= bestD || d < 1) continue;
    const off = Math.atan2(dx, dz) - r.heading;
    const wrapped = Math.atan2(Math.sin(off), Math.cos(off));
    if (Math.abs(wrapped) > 0.5) continue;
    best = p;
    bestD = d;
  }
  if (!best) return 0;
  return Math.max(-0.8, Math.min(0.8, (best.y - r.y) / 8));
}

export interface Pickups {
  /** Coins each racer scooped this step (parallel to `racers`). */
  coins: number[];
  /** Stars each racer scooped this step. */
  stars: number[];
  /** Ids that left the field (collected). */
  taken: number[];
}

/**
 * Award whatever each racer is touching. Two racers on one pickup: the earlier
 * racer in the list wins it — a stable tie-break. A racer marked in `noCoins`
 * flies through coins without taking them (stars still count).
 */
export function collectPickups(field: PickupField, racers: Flyer[], noCoins: boolean[] = []): Pickups {
  const out: Pickups = { coins: racers.map(() => 0), stars: racers.map(() => 0), taken: [] };
  field.coins = field.coins.filter((c) => {
    const i = racers.findIndex((r, j) => !noCoins[j] && reaches(r, c));
    if (i < 0) return true;
    out.coins[i] += 1;
    out.taken.push(c.id);
    return false;
  });
  field.stars = field.stars.filter((s) => {
    const i = racers.findIndex((r) => reaches(r, s));
    if (i < 0) return true;
    out.stars[i] += 1;
    out.taken.push(s.id);
    return false;
  });
  return out;
}
