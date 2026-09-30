/**
 * The computer holes (ADR 0009: a seeded policy, no network, no model).
 *
 * Each one flees anything that could swallow it, hunts smaller holes, and
 * otherwise heads for the best food nearby. The kindness rule keeps a round
 * fun for a young child: a rival slows down when it is ahead of the child
 * and hurries when behind, and only goes after the child's hole when the
 * child is clearly winning.
 */
import { KINDS, type Prop } from './catalog';
import type { Hole, Input, World } from './world';
import { canEat, propsNear } from './world';

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

export function createBrain(rng: Rng): Brain {
  return { skill: 0.55 + rng() * 0.35, pace: 1, target: null, rethink: 0, wobble: rng() * 10 };
}

/** The child's lead that makes rivals start hunting the child's hole. */
const HUNT_PLAYER_LEAD = 40;

export function steerRival(b: Brain, me: Hole, w: World, dt: number, player: Hole | null): Input {
  b.wobble += dt;
  b.rethink -= dt;

  // Kindness: a rival is a touch slower than the child to begin with, eases
  // off further when ahead of the child, and only hurries when well behind.
  if (player) {
    const lead = me.score - player.score;
    b.pace = lead > 150 ? 0.55 : lead > 40 ? 0.62 : lead > 0 ? 0.72 : lead > -120 ? 0.85 : 1;
  } else {
    b.pace = 0.9;
  }

  // Run from anything that could swallow me.
  if (me.safe <= 0) {
    let fx = 0;
    let fz = 0;
    for (const o of w.holes) {
      if (o === me || !o.alive || o.r < me.r * 1.2) continue;
      const d = Math.hypot(me.x - o.x, me.z - o.z);
      const danger = o.r + 8 + me.r;
      if (d < danger && d > 0.01) {
        fx += ((me.x - o.x) / d) * (danger - d);
        fz += ((me.z - o.z) / d) * (danger - d);
      }
    }
    // Target rings where bombs will land, and tankers heading this way.
    for (const a of w.attacks) {
      if (a.kind === 'bomber') {
        for (const bomb of a.bombs) {
          const d = Math.hypot(me.x - bomb.x, me.z - bomb.z);
          const danger = bomb.radius + me.r + 3;
          if (d < danger && bomb.fuse < 3) {
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
      if (!h || !h.alive || h.safe > 0 || h.r * 1.2 > me.r) b.target = null;
      else {
        t.x = h.x;
        t.z = h.z;
      }
    } else if (Math.hypot(t.x - me.x, t.z - me.z) < 4) {
      b.target = null;
    }
  }
  if (!b.target || b.rethink <= 0) {
    b.target = choose(b, me, w, player);
    b.rethink = 0.8 + w.rng() * 0.8;
  }
  const t = b.target;
  if (!t) return { x: 0, z: 0 };
  const dx = t.x - me.x;
  const dz = t.z - me.z;
  const d = Math.hypot(dx, dz) || 1;
  // A clumsier rival wobbles more on the way.
  const wob = (1 - b.skill) * 0.9 * Math.sin(b.wobble * 2.3);
  const c = Math.cos(wob);
  const s = Math.sin(wob);
  const ux = dx / d;
  const uz = dz / d;
  return { x: ux * c - uz * s, z: ux * s + uz * c };
}

function choose(b: Brain, me: Hole, w: World, player: Hole | null): Brain['target'] {
  // A smaller hole close by is the best meal.
  let prey: Hole | null = null;
  let preyD = 26 + me.r * 2;
  for (const o of w.holes) {
    if (o === me || !o.alive || o.safe > 0 || o.r * 1.2 > me.r) continue;
    if (o.isPlayer && (!player || player.score - me.score < HUNT_PLAYER_LEAD)) continue;
    const d = Math.hypot(o.x - me.x, o.z - me.z);
    if (d < preyD) {
      prey = o;
      preyD = d;
    }
  }
  if (prey && w.rng() < 0.4 + b.skill * 0.4) return { kind: 'hole', id: prey.id, x: prey.x, z: prey.z };

  // A power-up close by is worth a detour.
  for (const p of w.powerups) {
    if (Math.hypot(p.x - me.x, p.z - me.z) < 20 + me.r * 2 && w.rng() < 0.5) return { kind: 'power', id: p.id, x: p.x, z: p.z };
  }

  // Otherwise the best food nearby: worth the most for the shortest trip.
  const look = 24 + me.r * 3;
  let best: Prop | null = null;
  let bestScore = 0;
  for (const p of propsNear(w, me.x, me.z, look)) {
    if (!canEat(me, p)) continue;
    // A rival knows better than to eat the chemical plant.
    if (w.options.fightBack && KINDS[p.kind].hazard) continue;
    const d = Math.hypot(p.x - me.x, p.z - me.z);
    if (d > look) continue;
    // Food right by the child is the child's: a rival values it at half.
    const theirs = player && player.alive && Math.hypot(p.x - player.x, p.z - player.z) < 12 + player.r ? 0.5 : 1;
    const score = (p.points / (d + 6)) * theirs * (0.6 + w.rng() * 0.8 * (1.2 - b.skill));
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

/** A direction that turns back toward the middle near the island's edge. */
function inward(w: World, me: Hole, x: number, z: number): Input {
  const edge = w.city.half - me.r - 6;
  let ix = x;
  let iz = z;
  if (Math.abs(me.x) > edge && Math.sign(ix) === Math.sign(me.x)) ix = -Math.sign(me.x) * Math.abs(iz || 1);
  if (Math.abs(me.z) > edge && Math.sign(iz) === Math.sign(me.z)) iz = -Math.sign(me.z) * Math.abs(ix || 1);
  const len = Math.hypot(ix, iz) || 1;
  return { x: ix / len, z: iz / len };
}
