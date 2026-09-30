/**
 * Holes eating: what fits, how a swallowed thing scores and grows a hole,
 * holes swallowing smaller holes, and a hole hurt by the city.
 */
import { FIT, KINDS, worthOf, type Prop, type PropKind } from './catalog';
import { COMBO_WINDOW, EAT_HOLE, START_R, comboOf, levelOf, radiusFor } from './growth';
import { markEaten } from './rebuild';
import { propsNear } from './space';
import type { World, WorldEvent } from './world';

export interface Hole {
  id: number;
  name: string;
  /** Index into the skins list (components/skins.ts). */
  skin: number;
  isPlayer: boolean;
  x: number;
  z: number;
  /** Velocity, for smooth turns and the scene's eyes. */
  vx: number;
  vz: number;
  r: number;
  /** What it has eaten, which sets its radius. */
  mass: number;
  score: number;
  /** Holes it has swallowed. */
  kills: number;
  alive: boolean;
  /** Seconds until it comes back, while swallowed. */
  respawnIn: number;
  /** Seconds of safety left after coming back. */
  safe: number;
  /** Who swallowed it last. */
  eatenBy: string | null;
  /** Seconds left on each power-up, and of reeling after being hurt. */
  speedTime: number;
  doubleTime: number;
  stun: number;
  /** Seconds left on fire after a fuel truck crashed into it. */
  burn: number;
  /** Wonders swallowed this round. */
  wonders: number;
  /** Which wonders it has swallowed, so a set of pieces counts once. */
  wonderKinds: PropKind[];
  /** Things swallowed this round, and the biggest of them (by points). */
  gulped: number;
  biggest: { kind: PropKind; points: number } | null;
  /** Things eaten in a row, each within COMBO_WINDOW of the last. */
  streak: number;
  comboTime: number;
}

export type HurtCause = 'chem' | 'tanker' | 'bomb';

/** Seconds a swallowed hole waits before it comes back. */
export const RESPAWN = 3;
/** How much of its size a swallowed hole keeps: the child keeps more. */
const KEEP_PLAYER = 0.85;
const KEEP_RIVAL = 0.7;
/**
 * How much of its size a hole keeps when the city hurts it, and how long it
 * reels. The child's knock depends on the level: a hit on Hard is a real
 * setback, a hit on Easy a small one.
 */
const HURT_PLAYER: Record<'easy' | 'medium' | 'hard', number> = { easy: 0.85, medium: 0.75, hard: 0.6 };
const HURT_RIVAL = 0.8;
const STUN = 1.2;
/** How long a hole burns after a fuel truck crashes into it (it looks dramatic; the hurt is the same). */
const BURN = 3;
/** How much of an item's worth healthy food adds on top, as a health bonus. */
const HEALTH_BONUS = 0.5;
/** How much faster the child grows on Easy. */
const EASY_GROWTH = 1.35;

export function newHole(id: number, name: string, skin: number, isPlayer: boolean, x: number, z: number): Hole {
  return {
    id,
    name,
    skin,
    isPlayer,
    x,
    z,
    vx: 0,
    vz: 0,
    r: START_R,
    mass: 0,
    score: 0,
    kills: 0,
    alive: true,
    respawnIn: 0,
    safe: 0,
    eatenBy: null,
    speedTime: 0,
    doubleTime: 0,
    stun: 0,
    burn: 0,
    gulped: 0,
    biggest: null,
    streak: 0,
    comboTime: 0,
    wonders: 0,
    wonderKinds: [],
  };
}

/** A thing falls in when it fits and its middle is well inside the hole. */
export const canEat = (h: Hole, p: Prop): boolean => p.size <= h.r * FIT;

/** Swallow everything under the hole that fits. */
export function eatProps(w: World, h: Hole, events: WorldEvent[]): void {
  const before = levelOf(h.r);
  for (const p of propsNear(w, h.x, h.z, h.r + 1)) {
    if (!canEat(h, p)) continue;
    // Wonders are the child's to find: computer holes pass over them.
    if (KINDS[p.kind].wonder && !h.isPlayer) continue;
    if (Math.hypot(p.x - h.x, p.z - h.z) > h.r - p.size * 0.35) continue;
    w.props.delete(p.id);
    markEaten(w, p);
    gobble(w, h, p, events);
  }
  const after = levelOf(h.r);
  if (after > before) events.push({ type: 'level', hole: h.id, level: after });
}

/** Score a swallowed thing (or person) for a hole: size, points, combo, food. */
export function gobble(w: World, h: Hole, p: Prop, events: WorldEvent[]): void {
  const info = KINDS[p.kind];
  h.gulped += 1;
  if (!h.biggest || p.points > h.biggest.points) h.biggest = { kind: p.kind, points: p.points };
  // Healthy food is worth half as much again, and shakes off a knock.
  const bonus = info.food === 'healthy' ? Math.max(1, Math.round(p.points * HEALTH_BONUS)) : 0;
  const was = comboOf(h.streak);
  h.streak += 1;
  h.comboTime = COMBO_WINDOW;
  const mult = comboOf(h.streak);
  if (mult > was) events.push({ type: 'combo', hole: h.id, mult });
  // A wonder scores its big bonus but grows the hole like any big thing of
  // its tier: a statue is a treat, not a jump to the top of the map.
  // On Easy the child grows a third faster: a young player wandering
  // between meals still climbs the levels.
  const kind = h.isPlayer && w.options.difficulty === 'easy' ? EASY_GROWTH : 1;
  h.mass += ((info.wonder ? worthOf(p.size) * 2 : p.points) + bonus) * kind;
  const gained = (p.points + bonus) * mult * (h.doubleTime > 0 ? 2 : 1);
  h.score += gained;
  if (h.isPlayer && info.tier <= 5) w.police.eaten += 1;
  if (info.wonder) {
    // A set (the Easter Island Heads) counts as one wonder, however many pieces are eaten.
    if (!h.wonderKinds.includes(p.kind)) {
      h.wonderKinds.push(p.kind);
      h.wonders += 1;
    }
    events.push({ type: 'wonder', hole: h.id, name: info.wonder.name, points: gained });
  }
  h.r = radiusFor(h.mass);
  if (bonus) h.stun = 0;
  events.push({ type: 'eat', prop: p, hole: h.id, gained });
  if (info.food) events.push({ type: 'food', hole: h.id, food: info.food, bonus });
  if (w.options.fightBack && info.hazard) hurt(w, h, 'chem', events);
}

/** Every hole swallows any hole it is much bigger than and nearly covers. */
export function eatHoles(w: World, events: WorldEvent[]): void {
  for (const a of w.holes) {
    if (!a.alive) continue;
    for (const b of w.holes) {
      if (a === b || !b.alive || b.safe > 0) continue;
      // On Easy the computer holes never swallow the child: a young player
      // who wanders into a big one should not lose their round to it.
      if (b.isPlayer && !a.isPlayer && w.options.difficulty === 'easy') continue;
      if (a.r < b.r * EAT_HOLE) continue;
      if (Math.hypot(a.x - b.x, a.z - b.z) > a.r - b.r * 0.4) continue;
      const before = levelOf(a.r);
      const prize = Math.round(10 + b.mass * 0.25);
      a.mass += prize;
      a.score += prize * (a.doubleTime > 0 ? 2 : 1);
      a.kills += 1;
      a.r = radiusFor(a.mass);
      b.alive = false;
      b.respawnIn = RESPAWN;
      b.eatenBy = a.name;
      b.mass *= b.isPlayer ? KEEP_PLAYER : KEEP_RIVAL;
      b.r = radiusFor(b.mass);
      b.vx = b.vz = 0;
      b.speedTime = b.doubleTime = b.stun = b.burn = 0;
      b.streak = b.comboTime = 0;
      events.push({ type: 'gulp', eater: a.id, eaten: b.id });
      const after = levelOf(a.r);
      if (after > before) events.push({ type: 'level', hole: a.id, level: after });
    }
  }
}

/** The city strikes a hole: it shrinks, reels for a moment, and a fuel truck sets it alight. */
export function hurt(w: World, h: Hole, cause: HurtCause, events: WorldEvent[]): void {
  h.mass *= h.isPlayer ? HURT_PLAYER[w.options.difficulty] : HURT_RIVAL;
  h.r = radiusFor(h.mass);
  h.stun = STUN;
  if (cause === 'tanker') h.burn = BURN;
  events.push({ type: 'hurt', hole: h.id, cause });
  events.push({ type: 'boom', x: h.x, z: h.z, size: Math.max(3, h.r * 0.5) });
}
