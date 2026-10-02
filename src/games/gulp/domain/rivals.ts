/**
 * The computer holes (ADR 0009: a seeded policy, no network, no model).
 *
 * Each one flees anything that could swallow it, hunts smaller holes, and
 * otherwise heads for the best food nearby. The kindness rule keeps a round
 * fun for a young child: a rival slows down when it is ahead of the child
 * and hurries when behind, and only goes after a child's hole when that
 * child is clearly winning. With several children, the pace is set by the
 * child furthest behind, and the hunting and food rules hold for each child.
 * The difficulty sets how much of that kindness is left: Easy is all of it,
 * Hard none.
 */
import { KINDS, type Prop } from './catalog';
import { EAT_HOLE } from './growth';
import { canEat, type Hole } from './holes';
import { propsNear } from './space';
import type { Input, World } from './world';

type Rng = () => number;

export interface Brain {
  /** 0..1: how straight it steers and how well it picks food. */
  skill: number;
  /** Speed multiplier from the kindness rule, set every step. */
  pace: number;
  target: { kind: 'prop' | 'hole' | 'power' | 'point'; id: number; x: number; z: number } | null;
  /** Seconds until it looks around again. */
  rethink: number;
  wobble: number;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

interface Temper {
  /** The rivals' skill runs from `skill` to `skill + spread`. */
  skill: number;
  spread: number;
  /** How much of the kindness slow-down a rival keeps: 1 all of it, 0 none. */
  kindness: number;
  /** How far ahead the child must be (as a share of the rival's score) before rivals hunt the child's hole. */
  huntLead: number;
  /** What food right by the child is worth to a rival. */
  theirs: number;
  /** The rivals' top speed, as a share of a hole's own. */
  speed: number;
}

/**
 * Easy is the gentle game a young child plays. Medium rivals try properly,
 * keep most of the slow-down and go after a child who is clearly ahead. Hard
 * rivals are skilful, ease off less, and go after a child who is level with
 * them. In simulated four-minute rounds a steady player wins at every level;
 * one who wanders off now and then wins most Medium rounds and finishes
 * about the middle of the table on Hard.
 * On every level they leave the wonders for the child and skip the
 * chemical works.
 */
const TEMPERS: Record<Difficulty, Temper> = {
  // On Easy a computer hole cannot swallow the child (see eatHoles), so it never chases one either.
  // Easy rivals also amble: a child who wanders off for a while can still catch up.
  easy: { skill: 0.55, spread: 0.35, kindness: 1, huntLead: Infinity, theirs: 0.5, speed: 0.75 },
  medium: { skill: 0.7, spread: 0.2, kindness: 0.6, huntLead: 0.3, theirs: 0.5, speed: 0.85 },
  hard: { skill: 0.8, spread: 0.15, kindness: 0.35, huntLead: 0, theirs: 0.8, speed: 0.92 },
};

const temperOf = (w: World): Temper => TEMPERS[w.options.difficulty];

export function createBrain(rng: Rng, difficulty: Difficulty): Brain {
  const t = TEMPERS[difficulty];
  return { skill: t.skill + rng() * t.spread, pace: 1, target: null, rethink: 0, wobble: rng() * 10 };
}

/**
 * Where a computer hole wants to go this step. `trailing` is the child the
 * kindness rule measures against (the one furthest behind), or null when no
 * child is playing.
 */
export function steerRival(b: Brain, me: Hole, w: World, dt: number, trailing: Hole | null): Input {
  b.wobble += dt;
  b.rethink -= dt;

  // Kindness: a rival is a touch slower than the child to begin with, eases
  // off further when ahead of the child, and only hurries when well behind.
  if (trailing) {
    // The lead as a share of the child's score, so it means the same early and late.
    const lead = (me.score - trailing.score) / Math.max(100, trailing.score);
    // A runaway lead eases right off: a big hole still eats plenty at a crawl.
    const pace = lead > 0.8 ? 0.35 : lead > 0.4 ? 0.5 : lead > 0.12 ? 0.6 : lead > 0 ? 0.7 : lead > -0.3 ? 0.85 : 1;
    // Harder rivals keep only part of that slow-down; Easy keeps the whole of it.
    const { kindness, speed } = temperOf(w);
    b.pace = (kindness === 1 ? pace : 1 - (1 - pace) * kindness) * speed;
  } else {
    b.pace = 0.9;
  }

  // Run from anything that could swallow me.
  if (me.safe <= 0) {
    let fx = 0;
    let fz = 0;
    for (const o of w.holes) {
      if (o === me || !o.alive || o.r < me.r * EAT_HOLE) continue;
      const d = Math.hypot(me.x - o.x, me.z - o.z);
      const danger = o.r + 8 + me.r;
      if (d < danger && d > 0.01) {
        fx += ((me.x - o.x) / d) * (danger - d);
        fz += ((me.z - o.z) / d) * (danger - d);
      }
    }
    // Target rings where bombs will land, and tankers heading this way.
    for (const a of w.attacks) {
      if (a.kind !== 'tanker') {
        for (const bomb of a.kind === 'bomber' ? a.bombs : a.shells) {
          const d = Math.hypot(me.x - bomb.x, me.z - bomb.z);
          const danger = bomb.radius + me.r + 3;
          // A keener rival sees the red circle sooner; a slower one is often caught.
          if (d < danger && bomb.fuse < 0.4 + b.skill) {
            const ux = d > 0.01 ? (me.x - bomb.x) / d : 1;
            const uz = d > 0.01 ? (me.z - bomb.z) / d : 0;
            fx += ux * (danger - d) * 2;
            fz += uz * (danger - d) * 2;
          }
        }
      } else {
        const d = Math.hypot(me.x - a.x, me.z - a.z);
        const danger = me.r + 14;
        if (d < danger && d > 0.01) {
          // Step aside rather than straight away: a tanker turns slowly.
          fx += (-(a.z - me.z) / d) * (danger - d);
          fz += ((a.x - me.x) / d) * (danger - d);
        }
      }
    }
    if (fx !== 0 || fz !== 0) {
      b.target = null;
      return inward(w, me, fx, fz);
    }
  }

  // Keep a live target; look again when it is gone or the time is up.
  if (b.target) {
    const t = b.target;
    if (t.kind === 'prop') {
      if (!w.props.has(t.id)) b.target = null;
    } else if (t.kind === 'power') {
      if (!w.powerups.some((p) => p.id === t.id)) b.target = null;
    } else if (t.kind === 'hole') {
      const h = w.holes[t.id];
      if (!h || !h.alive || h.safe > 0 || h.r * EAT_HOLE > me.r) b.target = null;
      else {
        t.x = h.x;
        t.z = h.z;
      }
    } else if (Math.hypot(t.x - me.x, t.z - me.z) < 4) {
      b.target = null;
    }
  }
  if (!b.target || b.rethink <= 0) {
    b.target = choose(b, me, w);
    b.rethink = 0.8 + w.rng() * 0.8;
  }
  const t = b.target;
  if (!t) return { x: 0, z: 0 };
  const dx = t.x - me.x;
  const dz = t.z - me.z;
  const d = Math.hypot(dx, dz) || 1;
  // A clumsier rival weaves a little on the way: slow and gentle, so it
  // reads as wandering, not wiggling.
  const wob = (1 - b.skill) * 0.35 * Math.sin(b.wobble * 0.9);
  const c = Math.cos(wob);
  const s = Math.sin(wob);
  const ux = dx / d;
  const uz = dz / d;
  return { x: ux * c - uz * s, z: ux * s + uz * c };
}

/** Below this radius the countryside is not worth the trip (see `choose`). */
const COUNTRY_R = 12;

function choose(b: Brain, me: Hole, w: World): Brain['target'] {
  const temper = temperOf(w);
  // A smaller hole close by is the best meal; a child's only when that child is far enough ahead.
  let prey: Hole | null = null;
  let preyD = 26 + me.r * 2;
  for (const o of w.holes) {
    if (o === me || !o.alive || o.safe > 0 || o.r * EAT_HOLE > me.r) continue;
    if (o.isPlayer && (o.score - me.score) / Math.max(100, me.score) < temper.huntLead) continue;
    const d = Math.hypot(o.x - me.x, o.z - me.z);
    if (d < preyD) {
      prey = o;
      preyD = d;
    }
  }
  if (prey && w.rng() < 0.4 + b.skill * 0.4) return { kind: 'hole', id: prey.id, x: prey.x, z: prey.z };

  // A small hole that has wandered out of town heads back in: out there it
  // would only pick at hay bales.
  const out = w.city.half - 8;
  if (me.r < COUNTRY_R && (Math.abs(me.x) > w.city.half + 4 || Math.abs(me.z) > w.city.half + 4)) {
    return { kind: 'point', id: -1, x: Math.max(-out, Math.min(out, me.x)), z: Math.max(-out, Math.min(out, me.z)) };
  }

  // A power-up close by is worth a detour.
  for (const p of w.powerups) {
    if (Math.hypot(p.x - me.x, p.z - me.z) < 20 + me.r * 2 && w.rng() < 0.5) return { kind: 'power', id: p.id, x: p.x, z: p.z };
  }

  // Otherwise the best food nearby: worth the most for the shortest trip.
  const look = 24 + me.r * 3;
  const children = w.holes.filter((c) => c.isPlayer && c !== me && c.alive);
  let best: Prop | null = null;
  let bestScore = 0;
  for (const p of propsNear(w, me.x, me.z, look)) {
    if (!canEat(me, p)) continue;
    // A rival knows better than to eat the chemical plant, and leaves the
    // wonders for the child.
    if (KINDS[p.kind].hazard) continue;
    if (KINDS[p.kind].wonder) continue;
    const d = Math.hypot(p.x - me.x, p.z - me.z);
    if (d > look) continue;
    // Food right by a child is that child's: a rival values it less, unless
    // the difficulty says otherwise.
    const theirs = children.some((c) => Math.hypot(p.x - c.x, p.z - c.z) < 12 + c.r) ? temper.theirs : 1;
    // Out of town the food is thin until a hole can take barns and turbines:
    // a small hole that follows a trail of hay bales out there starves.
    const country = me.r < COUNTRY_R && Math.max(Math.abs(p.x), Math.abs(p.z)) > w.city.half ? 0.35 : 1;
    const score = (p.points / (d + 6)) * theirs * country * (0.6 + w.rng() * 0.8 * (1.2 - b.skill));
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  if (best) return { kind: 'prop', id: best.id, x: best.x, z: best.z };

  // Nothing near: head for a random crossing.
  const roads = w.city.roads;
  return {
    kind: 'point',
    id: -1,
    x: roads[Math.floor(w.rng() * roads.length)],
    z: roads[Math.floor(w.rng() * roads.length)],
  };
}

/**
 * A direction that turns back toward the middle near the edge: of the land
 * for a big hole, of the town for a small one, which would only run out into
 * the empty countryside and starve there.
 */
function inward(w: World, me: Hole, x: number, z: number): Input {
  const edge = (me.r < COUNTRY_R ? w.city.half : w.city.land) - me.r - 6;
  let ix = x;
  let iz = z;
  if (Math.abs(me.x) > edge && Math.sign(ix) === Math.sign(me.x)) ix = -Math.sign(me.x) * Math.abs(iz || 1);
  if (Math.abs(me.z) > edge && Math.sign(iz) === Math.sign(me.z)) iz = -Math.sign(me.z) * Math.abs(ix || 1);
  const len = Math.hypot(ix, iz) || 1;
  return { x: ix / len, z: iz / len };
}
