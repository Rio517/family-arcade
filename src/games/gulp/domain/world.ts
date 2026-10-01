/**
 * The rules of a Gulp Universe round: holes move, swallow whatever fits, grow
 * without limit, and swallow smaller holes. Two things can be switched on:
 * power-ups that turn up from time to time, and a city that fights back
 * (a chemical plant that shrinks whoever eats it, tanker trucks driven into
 * a hole, planes dropping bombs on marked spots).
 *
 * Pure: state in, state changed, events out. The scene plays the events (a
 * car tipping into a hole, an explosion); the clock and the input come in as
 * arguments, randomness as `rng` (ADR 0005).
 *
 * This module holds the round itself: the world's shape, a fresh round, the
 * order of a step, movement and coming back after being swallowed. Each part
 * of the rules lives in its own module, and the ones the game reads are
 * re-exported here.
 */
import { fightBack, type Attack } from './attacks';
import type { Prop, PropKind } from './catalog';
import { PARK_PLAZA, createCity, type City, type MapId } from './city';
import { berthOf } from './city/ports';
import { EAT_HOLE, speedOf } from './growth';
import { LIVES, eatHoles, eatProps, newHole, type Hole, type HurtCause } from './holes';
import { createPeople, walkPeople, type Person } from './people';
import { POLICE_COOL, police, type Responder } from './police';
import { POWER_SPEED, spawnPowerups, takePowerups, type PowerKind, type PowerUp } from './powerups';
import { NEWS_GAP, REGROW_EVERY, rebuild, regrow, type Lot } from './rebuild';
import { createBrain, steerRival, type Brain, type Difficulty } from './rivals';
import { indexProps, inRect } from './space';

export type { Attack } from './attacks';
export { EAT_HOLE, comboOf, levelOf, levelProgress, nextLabel } from './growth';
export { canEat, type Hole } from './holes';
export type { Person } from './people';
export { POWER_TIME, type PowerKind, type PowerUp } from './powerups';
export { BUILD_TIME } from './rebuild';
export { propsNear } from './space';

type Rng = () => number;

/** Seconds a hole that just came back can't be swallowed. */
const SAFE = 3;
/** Seconds of 3-2-1 before a round. */
const COUNTDOWN = 3;

export type WorldEvent =
  /** A hole swallowed a thing; `gained` is what it scored, with combo, double points and health bonus. */
  | { type: 'eat'; prop: Prop; hole: number; gained: number }
  | { type: 'regrow'; prop: Prop }
  /** A giant took something tiny without a fuss (see GIANT_LEVEL): gone, no points. */
  | { type: 'crumb'; prop: Prop }
  | { type: 'rebuild'; prop: Prop; replaces: Prop | null }
  /** Something new stands in the city as it is, with no building-up (a police car that has parked). */
  | { type: 'park'; prop: Prop }
  | { type: 'news'; text: string; x: number; z: number }
  | { type: 'food'; hole: number; food: 'treat' | 'healthy'; bonus: number }
  | { type: 'combo'; hole: number; mult: number }
  | { type: 'wonder'; hole: number; name: string; points: number }
  | { type: 'police'; x: number; z: number }
  | { type: 'gulp'; eater: number; eaten: number }
  | { type: 'level'; hole: number; level: number }
  | { type: 'respawn'; hole: number }
  /** A hole swallowed with no lives left: out of the round. */
  | { type: 'out'; hole: number }
  | { type: 'power'; hole: number; kind: PowerKind }
  | { type: 'hurt'; hole: number; cause: HurtCause }
  | { type: 'boom'; x: number; z: number; size: number }
  | { type: 'incoming'; target: number; kind: Attack['kind'] };

export interface Input {
  /** Where the child wants to go, as a direction with strength 0..1. */
  x: number;
  z: number;
}

export interface Options {
  map: MapId;
  /** Round length in seconds; 0 plays until someone ends it. */
  duration: number;
  powerups: boolean;
  fightBack: boolean;
  /** Small things grow back and eaten buildings are rebuilt, bigger as the round goes on. */
  regrow: boolean;
  /** The wonders this round was dealt; left out, the city shows its whole set (the menu's backdrop). */
  wonders?: readonly PropKind[];
  countdown?: number;
  /** How hard the computer holes play; left out, they play Easy. */
  difficulty?: Difficulty;
}

export interface World {
  city: City;
  /** The options with their defaults filled in, so the difficulty is always set. */
  options: Options & { difficulty: Difficulty };
  /** Things still standing, by id. */
  props: Map<number, Prop>;
  holes: Hole[];
  brains: Array<Brain | null>;
  powerups: PowerUp[];
  attacks: Attack[];
  countdown: number;
  elapsed: number;
  status: 'countdown' | 'playing' | 'over';
  /**
   * Why the round is over: its time ran out, it was ended early, the child
   * ran out of lives, or every computer hole did (the child is the last hole).
   */
  endedBy: 'time' | 'ended' | 'out' | 'last' | null;
  /** Every computer hole is out of lives (an endless round carries on). */
  allOut: boolean;
  rng: Rng;
  /** Things by grid cell, so a hole only checks what is near it. */
  grid: Map<string, number[]>;
  nextPower: number;
  nextAttack: number;
  nextId: number;
  /** Small things eaten so far, which the city slowly puts back. */
  eaten: Prop[];
  regrowIn: number;
  /** Building lots waiting to be built on again. */
  lots: Lot[];
  /** Ids for things built during the round, above every map id. */
  nextPropId: number;
  people: Person[];
  lastNews: number;
  /** When the next thing may go up (see rebuild's RAISE_GAP). */
  nextRaise: number;
  responders: Responder[];
  police: { eaten: number; cool: number };
}

export interface Racer {
  name: string;
  skin: number;
}

const DEFAULTS: World['options'] = { map: 'city', duration: 120, powerups: true, fightBack: false, regrow: true, difficulty: 'easy' };

/**
 * A fresh round. `player` is null for the menu's attract mode: the city with
 * only computer holes roaming it.
 */
export function createWorld(rng: Rng, player: Racer | null, rivals: Racer[], opts: Partial<Options> = {}): World {
  const options: World['options'] = { ...DEFAULTS, ...opts, difficulty: opts.difficulty ?? DEFAULTS.difficulty };
  const city = createCity(rng, options.map, options.wonders);
  const everyone = [
    ...(player ? [{ ...player, isPlayer: true }] : []),
    ...rivals.map((r) => ({ ...r, isPlayer: false })),
  ];
  // Rivals start on crossings spread out from the middle; the child starts
  // where `childStart` says.
  const crossings = city.roads
    .flatMap((x) => city.roads.map((z) => ({ x, z })))
    .filter((c) => !builtOver(city, c.x, c.z))
    .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  const rivalSpot = (i: number) => 1 + ((i * 5) % (crossings.length - 1));
  const holes: Hole[] = [];
  const brains: Array<Brain | null> = [];
  everyone.forEach((who, i) => {
    const spot = who.isPlayer
      ? childStart(city, options.difficulty, rng, crossings, new Set(everyone.map((_, j) => rivalSpot(j)).slice(1)))
      : crossings[i === 0 ? 0 : rivalSpot(i)];
    const hole = newHole(i, who.name, who.skin, who.isPlayer, spot.x, spot.z);
    hole.lives = LIVES[options.difficulty];
    holes.push(hole);
    brains.push(who.isPlayer ? null : createBrain(rng, options.difficulty));
  });
  const countdown = options.countdown ?? (player ? COUNTDOWN : 0);
  const world: World = {
    city,
    options,
    props: new Map(city.props.map((p) => [p.id, p])),
    holes,
    brains,
    powerups: [],
    attacks: [],
    countdown,
    elapsed: 0,
    status: countdown > 0 ? 'countdown' : 'playing',
    endedBy: null,
    allOut: false,
    rng,
    grid: new Map(),
    nextPower: 8,
    nextAttack: 22,
    nextId: 1,
    eaten: [],
    regrowIn: REGROW_EVERY,
    lots: [],
    nextPropId: city.props.length + 1,
    people: createPeople(city, rng),
    responders: [],
    police: { eaten: 0, cool: POLICE_COOL / 2 },
    lastNews: -NEWS_GAP,
    nextRaise: 0,
  };
  indexProps(world);
  return world;
}

/**
 * Where the child's hole starts. On easy and medium: in the park nearest the
 * middle of the map, on the path just south of its plaza, between two little
 * woods, with benches, people, bushes and then trees all round to eat at
 * once: a quick start. On hard: any crossing, by chance, but not one a rival
 * starts on (`taken`, as indexes into `crossings`). With no park, the
 * crossing nearest the middle.
 */
function childStart(city: City, difficulty: Difficulty, rng: Rng, crossings: Array<{ x: number; z: number }>, taken: Set<number>): { x: number; z: number } {
  if (difficulty === 'hard') {
    const free = crossings.map((_, i) => i).filter((i) => !taken.has(i));
    return crossings[free[Math.floor(rng() * free.length)] ?? 0];
  }
  const middle = (b: { x: number; z: number; size: number }) => ({ x: b.x + b.size / 2, z: b.z + b.size / 2 });
  const parks = city.blockList.filter((b) => b.kind === 'park').map(middle);
  if (!parks.length) return crossings[0];
  const park = parks.reduce((best, p) => (Math.hypot(p.x, p.z) < Math.hypot(best.x, best.z) ? p : best));
  return { x: park.x, z: park.z + PARK_PLAZA + 2 };
}

/** One step of the round. Returns what happened, for the scene and the HUD. */
export function stepWorld(w: World, dt: number, input: Input | null): WorldEvent[] {
  const events: WorldEvent[] = [];
  if (w.status === 'over') return events;
  if (w.status === 'countdown') {
    w.countdown = Math.max(0, w.countdown - dt);
    if (w.countdown === 0) w.status = 'playing';
    return events;
  }
  w.elapsed += dt;
  if (w.options.duration > 0 && w.elapsed >= w.options.duration) {
    w.status = 'over';
    w.endedBy = 'time';
    return events;
  }

  const player = w.holes.find((h) => h.isPlayer) ?? null;
  for (let i = 0; i < w.holes.length; i++) {
    const h = w.holes[i];
    if (!h.alive) {
      h.respawnIn -= dt;
      if (h.respawnIn <= 0) {
        respawn(w, h);
        events.push({ type: 'respawn', hole: h.id });
      }
      continue;
    }
    h.safe = Math.max(0, h.safe - dt);
    h.speedTime = Math.max(0, h.speedTime - dt);
    h.doubleTime = Math.max(0, h.doubleTime - dt);
    h.stun = Math.max(0, h.stun - dt);
    h.burn = Math.max(0, h.burn - dt);
    h.comboTime = Math.max(0, h.comboTime - dt);
    if (h.comboTime === 0) h.streak = 0;
    const brain = w.brains[i];
    const want = brain ? steerRival(brain, h, w, dt, player) : input ?? { x: 0, z: 0 };
    move(w, h, want, dt, brain ? brain.pace : 1);
    eatProps(w, h, events);
    if (w.options.powerups) takePowerups(w, h, events);
  }
  eatHoles(w, events);
  // Out of lives: the child's round is over; with every computer hole out, the child has won it.
  if (player && player.lives <= 0) {
    w.status = 'over';
    w.endedBy = 'out';
    return events;
  }
  const rivals = w.holes.filter((h) => !h.isPlayer);
  if (player && rivals.length && !w.allOut && rivals.every((h) => h.lives <= 0)) {
    w.allOut = true;
    // A timed round is won there and then; an endless one goes on, the city
    // all the child's, until the child ends it.
    if (w.options.duration > 0) {
      w.status = 'over';
      w.endedBy = 'last';
      return events;
    }
    events.push({ type: 'news', text: 'Every rival is out: the city is all yours!', x: player.x, z: player.z });
  }
  walkPeople(w, dt, events);
  if (player) police(w, dt, player, events);
  if (w.options.regrow) {
    regrow(w, dt, events);
    rebuild(w, events);
  }
  if (w.options.powerups) spawnPowerups(w, dt, player);
  if (w.options.fightBack) fightBack(w, dt, events);
  return events;
}

/** End a round early (the endless round's "End round"). */
export function endRound(w: World): void {
  w.status = 'over';
  w.endedBy = w.allOut ? 'last' : 'ended';
}

function move(w: World, h: Hole, want: Input, dt: number, pace: number): void {
  const len = Math.hypot(want.x, want.z);
  const k = len > 1 ? 1 / len : 1;
  const boost = (h.speedTime > 0 ? POWER_SPEED : 1) * (h.stun > 0 ? 0.35 : 1);
  const top = speedOf(h.r) * pace * boost;
  const tx = want.x * k * top;
  const tz = want.z * k * top;
  // Ease toward the wanted velocity: quick to start, quick to stop.
  const ease = 1 - Math.exp(-dt * 8);
  h.vx += (tx - h.vx) * ease;
  h.vz += (tz - h.vz) * ease;
  const nx = h.x + h.vx * dt;
  const nz = h.z + h.vz * dt;
  // Slide along the shore: try the whole step, then each axis on its own.
  if (onLand(w, h, nx, nz)) {
    h.x = nx;
    h.z = nz;
  } else if (onLand(w, h, nx, h.z)) {
    h.x = nx;
    h.vz = 0;
  } else if (onLand(w, h, h.x, nz)) {
    h.z = nz;
    h.vx = 0;
  } else {
    const edge = Math.max(0, w.city.land - h.r * 0.5);
    h.x = Math.max(-edge, Math.min(edge, h.x));
    h.z = Math.max(-edge, Math.min(edge, h.z));
  }
}

/** The main island (a hole may hang half over its shore), the bridge, or the islet. */
function onLand(w: World, h: Hole, x: number, z: number): boolean {
  const edge = Math.max(0, w.city.land - h.r * 0.5);
  if (Math.abs(x) <= edge && Math.abs(z) <= edge) return true;
  // Out over the water off the quay, where the ships moor.
  if (w.city.port && inRect(berthOf(w.city.port), x, z)) return true;
  return w.city.extraLand.some((l) => inRect(l, x, z));
}

/** A crossing under a stadium, an airfield or another built-over street is no crossing. */
function builtOver(city: City, x: number, z: number): boolean {
  return city.lots.some((l) => inRect(l, x, z));
}

/** Back on a crossing as far as can be from any bigger hole. */
function respawn(w: World, h: Hole): void {
  const threats = w.holes.filter((o) => o !== h && o.alive && o.r >= h.r * EAT_HOLE);
  let best = { x: 0, z: 0, d: -1 };
  for (let i = 0; i < 8; i++) {
    const x = w.city.roads[Math.floor(w.rng() * w.city.roads.length)];
    const z = w.city.roads[Math.floor(w.rng() * w.city.roads.length)];
    if (builtOver(w.city, x, z)) continue;
    const d = threats.length ? Math.min(...threats.map((t) => Math.hypot(t.x - x, t.z - z))) : 999;
    if (d > best.d) best = { x, z, d };
  }
  h.x = best.x;
  h.z = best.z;
  h.alive = true;
  h.safe = SAFE;
  h.respawnIn = 0;
}

/** Everyone, best first: the leaderboard and the results. */
export function standings(w: World): Hole[] {
  return [...w.holes].sort((a, b) => b.score - a.score || a.id - b.id);
}
