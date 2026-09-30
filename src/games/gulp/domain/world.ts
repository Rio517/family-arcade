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
 */
import { FIT, KINDS, LEVELS, footSize, makeProp, worthOf, type Prop, type PropKind } from './catalog';
import { BLOCK, SIDEWALK, createCity, type Block, type City, type MapId } from './city';
import { createBrain, steerRival, type Brain, type Difficulty } from './rivals';

type Rng = () => number;

/**
 * The city puts small things back (up to buses) where they stood, a few at a
 * time and never under anyone's nose, so a long round never runs dry.
 */
const REGROW_TIER = 4;
const REGROW_EVERY = 0.4;
const REGROW_BATCH = 3;

/**
 * With regrowth on, an eaten building's lot is built on again: first a
 * construction site (cheap to eat) goes up, and if it survives, the new
 * building. The city grows up as the round goes on: early on everything is
 * rebuilt as houses, then shops, then apartment blocks, towers and at last
 * skyscrapers, one rung above what stood there before and never above what
 * the city's age allows. Big sites become stadiums, malls and power plants,
 * and each opening makes the news.
 */
const LADDER: PropKind[] = ['house', 'shop', 'apartment', 'tower', 'skyscraper'];
/** Buildings that go up through a tall building site first. */
const TALL: PropKind[] = ['tower', 'skyscraper'];
const BIG: PropKind[] = ['factory', 'warehouse', 'chemplant', 'mall', 'stadium', 'powerplant'];
/** Seconds from a building being eaten to its construction site appearing. */
const SITE_AFTER = 6;
/** Seconds a construction site stands before the building is finished. */
const SITE_TIME = 16;
/** Every this many seconds of a round, one more rung of the ladder opens. */
const AGE_STEP = 40;
/** Seconds a new building takes to rise in the scene. */
export const BUILD_TIME = 3;
/** Seconds between two news stories, at least. */
const NEWS_GAP = 12;

const HEADLINE: Partial<Record<PropKind, string>> = {
  stadium: 'A brand-new stadium just opened!',
  mall: 'A giant shopping mall opens its doors!',
  powerplant: 'A new power plant lights up the city!',
  factory: 'A new factory starts work today!',
  warehouse: 'A huge new warehouse is finished!',
  skyscraper: 'The city has a new skyscraper!',
};

/** How much of an item's worth healthy food adds on top, as a health bonus. */
const HEALTH_BONUS = 0.5;

interface Lot {
  x: number;
  z: number;
  rot: number;
  /** The widest footprint that fits: the old building's, plus a little yard. */
  room: number;
  /** Which rung of the ladder the old building stood on (-1 for a big building). */
  rung: number;
  due: number;
  /** The construction site standing on it, once there is one. */
  site: number | null;
}

/** Someone walking round a block's pavement. */
/** A walk round a square: the pavement round a block, or a path inside a park. */
interface Loop {
  x0: number;
  z0: number;
  side: number;
}

export interface Person {
  id: number;
  /** A person, or a dog out for a walk. */
  kind: 'person' | 'dog';
  variant: number;
  loop: Loop;
  /** How far round the loop, and which way round. */
  t: number;
  dir: 1 | -1;
  speed: number;
  x: number;
  z: number;
  heading: number;
  alive: boolean;
  respawnIn: number;
  /**
   * `walk`: round the loop. `flee`: sprinting along the street away from a
   * hole. `back`: walking back to the loop once it is safe.
   */
  state: 'walk' | 'flee' | 'back';
  /** Seconds left of running away. */
  panic: number;
  /** While fleeing: which way (a unit vector along the street). */
  runX: number;
  runZ: number;
}

/** People are 'person' things with ids above every building's. */
const PERSON_ID = 1_000_000;
const PEOPLE_PER_BLOCK = 2.5;
const WALK = 1.4;
/** How far off a hole is noticed, beyond its rim, and how fast people run. */
const NOTICE = 10;
const RUN = 7;

/** Police who come to look when the child's hole has eaten a lot. */
export interface Responder {
  id: number;
  kind: 'car' | 'officer';
  x: number;
  z: number;
  heading: number;
  /** A car drives to (tx, tz) and parks; an officer stands near the hole. */
  tx: number;
  tz: number;
  state: 'drive' | 'stand' | 'leave';
  /** Seconds in this state. */
  t: number;
}
/** Things the child eats before someone calls the police, and seconds between calls. */
const POLICE_AFTER = 35;
const POLICE_COOL = 50;
const POLICE_STAY = 25;

/** A hole's radius at the start, and how it grows with what it has eaten. */
export const START_R = 1.6;
// Growth tapers off as a hole gets big (a power below a half), so the
// first levels come fast and the giant ones take a whole round.
const GROW = 0.25;
const GROW_POWER = 0.4;
/** Seconds a swallowed hole waits before it comes back. */
export const RESPAWN = 3;
/** Seconds a hole that just came back can't be swallowed. */
const SAFE = 3;
/** A hole must be this much bigger than another to swallow it. */
const EAT_HOLE = 1.2;
/** Seconds of 3-2-1 before a round. */
const COUNTDOWN = 3;
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

export type PowerKind = 'speed' | 'double';
/** How long each power-up lasts, in seconds. */
export const POWER_TIME: Record<PowerKind, number> = { speed: 8, double: 10 };
const POWER_SPEED = 1.6;
const POWER_LIFE = 20;
const POWER_MAX = 2;

/**
 * Combos: eat again within this many seconds and the streak goes on; every
 * COMBO_STEP things in a streak adds one to the multiplier, up to COMBO_MAX.
 */
const COMBO_WINDOW = 1.4;
const COMBO_STEP = 8;
const COMBO_MAX = 5;
export const comboOf = (streak: number): number => Math.min(COMBO_MAX, 1 + Math.floor(streak / COMBO_STEP));

export interface PowerUp {
  id: number;
  kind: PowerKind;
  x: number;
  z: number;
  /** Seconds before it fades away. */
  life: number;
}

export interface Bomb {
  id: number;
  x: number;
  z: number;
  radius: number;
  /** Seconds until it lands; the scene shows a target ring until then. */
  fuse: number;
  /** A shell or rocket: where it was fired from, and its whole flight time (for the arc). */
  from?: { x: number; z: number; y: number };
  flight?: number;
}

/** A tank or a helicopter from the military base: it closes in, then fires. */
interface Unit {
  id: number;
  target: number;
  x: number;
  z: number;
  heading: number;
  speed: number;
  life: number;
  /** Seconds until it fires again. */
  reload: number;
  shells: Bomb[];
}

export type Attack =
  | { id: number; kind: 'tanker'; x: number; z: number; heading: number; speed: number; target: number; life: number }
  | {
      id: number;
      kind: 'bomber';
      target: number;
      /** The plane: where it is, which way it flies, how fast. */
      x: number;
      z: number;
      dx: number;
      dz: number;
      speed: number;
      life: number;
      bombs: Bomb[];
    }
  | (Unit & { kind: 'tank' })
  | (Unit & { kind: 'heli' });

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
  /** Things eaten in a row, each within COMBO_WINDOW of the last. */
  streak: number;
  comboTime: number;
}

export type HurtCause = 'chem' | 'tanker' | 'bomb';

export type WorldEvent =
  | { type: 'eat'; prop: Prop; hole: number }
  | { type: 'regrow'; prop: Prop }
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
  options: Options;
  /** Things still standing, by id. */
  props: Map<number, Prop>;
  holes: Hole[];
  brains: Array<Brain | null>;
  powerups: PowerUp[];
  attacks: Attack[];
  countdown: number;
  elapsed: number;
  status: 'countdown' | 'playing' | 'over';
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
  responders: Responder[];
  police: { eaten: number; cool: number };
}

const CELL = 12;
const cellKey = (cx: number, cz: number) => `${cx}:${cz}`;

export interface Racer {
  name: string;
  skin: number;
}

const DEFAULTS: Options = { map: 'city', duration: 120, powerups: true, fightBack: false, regrow: true };

/**
 * A fresh round. `player` is null for the menu's attract mode: the city with
 * only computer holes roaming it.
 */
export function createWorld(rng: Rng, player: Racer | null, rivals: Racer[], opts: Partial<Options> = {}): World {
  const options = { ...DEFAULTS, ...opts };
  const city = createCity(rng, options.map, options.wonders);
  const props = new Map(city.props.map((p) => [p.id, p]));
  const grid = new Map<string, number[]>();
  for (const p of city.props) {
    const key = cellKey(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    const list = grid.get(key);
    if (list) list.push(p.id);
    else grid.set(key, [p.id]);
  }
  const everyone = [
    ...(player ? [{ ...player, isPlayer: true }] : []),
    ...rivals.map((r) => ({ ...r, isPlayer: false })),
  ];
  // Start everyone on a crossing: the child in the middle, rivals spread out.
  const crossings = city.roads
    .flatMap((x) => city.roads.map((z) => ({ x, z })))
    .filter((c) => !builtOver(city, c.x, c.z))
    .sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  const holes: Hole[] = [];
  const brains: Array<Brain | null> = [];
  everyone.forEach((who, i) => {
    const spot = crossings[i === 0 ? 0 : 1 + ((i * 5) % (crossings.length - 1))];
    holes.push(newHole(i, who.name, who.skin, who.isPlayer, spot.x, spot.z));
    brains.push(who.isPlayer ? null : createBrain(rng, options.difficulty));
  });
  const countdown = options.countdown ?? (player ? COUNTDOWN : 0);
  return {
    city,
    options,
    props,
    holes,
    brains,
    powerups: [],
    attacks: [],
    countdown,
    elapsed: 0,
    status: countdown > 0 ? 'countdown' : 'playing',
    rng,
    grid,
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
  };
}

function newHole(id: number, name: string, skin: number, isPlayer: boolean, x: number, z: number): Hole {
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
    streak: 0,
    comboTime: 0,
    wonders: 0,
  };
}

/** Radius from what a hole has eaten: area grows with the food, no ceiling. */
export const radiusFor = (mass: number): number => START_R + GROW * Math.pow(Math.max(0, mass), GROW_POWER);
/** The mass a hole needs to be this big (the inverse of `radiusFor`). */
export const massFor = (r: number): number => Math.pow(Math.max(0, r - START_R) / GROW, 1 / GROW_POWER);

/** Past the last tier, a new level for every step this much bigger. */
const BEYOND = 1.35;

/** Level 1 at the start; one more for each tier a hole can now swallow, and on past the top. */
export function levelOf(r: number): number {
  const cap = r * FIT;
  const fits = LEVELS.filter((t) => t.size <= cap).length;
  const base = Math.max(1, fits - 1);
  if (fits < LEVELS.length) return base;
  return base + Math.floor(Math.log(cap / LEVELS[LEVELS.length - 1].size) / Math.log(BEYOND));
}

/** What the next level opens up, or null once everything fits. */
export function nextLabel(r: number): string | null {
  const fits = LEVELS.filter((t) => t.size <= r * FIT).length;
  return LEVELS[fits]?.label ?? null;
}

/** 0..1 of the way from this level to the next, for the level meter. */
export function levelProgress(r: number): number {
  const cap = r * FIT;
  const fits = LEVELS.filter((t) => t.size <= cap).length;
  const next = LEVELS[fits];
  if (!next) {
    const steps = Math.log(cap / LEVELS[LEVELS.length - 1].size) / Math.log(BEYOND);
    return steps - Math.floor(steps);
  }
  const prev = LEVELS[fits - 1]?.size ?? 0;
  const from = Math.max(START_R * FIT, prev);
  return Math.max(0, Math.min(1, (cap - from) / (next.size - from)));
}

/**
 * Top speed. It rises gently with size: a giant covers more ground than a
 * small hole, but with the camera pulled back it looks slower on screen.
 */
export const speedOf = (r: number): number => 9 * Math.pow(r / START_R, 0.38);

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
  walkPeople(w, dt, events);
  if (player) police(w, dt, player, events);
  if (w.options.regrow) {
    regrow(w, dt, events);
    rebuild(w, events);
  }
  if (w.options.powerups) spawnPowerups(w, dt, player);
  if (w.options.fightBack) fightBack(w, dt, events, player);
  return events;
}

/** End a round early (the endless round's "End round"). */
export function endRound(w: World): void {
  w.status = 'over';
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
  return w.city.extraLand.some((l) => x >= l.x0 && x <= l.x1 && z >= l.z0 && z <= l.z1);
}

/** Things near a point, from the grid. */
export function propsNear(w: World, x: number, z: number, radius: number): Prop[] {
  const out: Prop[] = [];
  const c0x = Math.floor((x - radius) / CELL);
  const c1x = Math.floor((x + radius) / CELL);
  const c0z = Math.floor((z - radius) / CELL);
  const c1z = Math.floor((z + radius) / CELL);
  for (let cx = c0x; cx <= c1x; cx++) {
    for (let cz = c0z; cz <= c1z; cz++) {
      const ids = w.grid.get(cellKey(cx, cz));
      if (!ids) continue;
      for (const id of ids) {
        const p = w.props.get(id);
        if (p) out.push(p);
      }
    }
  }
  return out;
}

/** A thing falls in when it fits and its middle is well inside the hole. */
export const canEat = (h: Hole, p: Prop): boolean => p.size <= h.r * FIT;

function eatProps(w: World, h: Hole, events: WorldEvent[]): void {
  const before = levelOf(h.r);
  for (const p of propsNear(w, h.x, h.z, h.r + 1)) {
    if (!canEat(h, p)) continue;
    // Wonders are the child's to find: computer holes pass over them.
    if (KINDS[p.kind].wonder && !h.isPlayer) continue;
    if (Math.hypot(p.x - h.x, p.z - h.z) > h.r - p.size * 0.35) continue;
    w.props.delete(p.id);
    const info = KINDS[p.kind];
    if (p.kind === 'site' || p.kind === 'bigsite' || p.kind === 'tallsite') {
      // The site was eaten: the lot waits a while and starts again.
      const lot = w.lots.find((l) => l.site === p.id);
      if (lot) {
        lot.site = null;
        lot.due = w.elapsed + SITE_AFTER * 2;
      }
    } else if (info.tier <= REGROW_TIER) w.eaten.push(p);
    // A cottage comes back like a house, a big house like a shop: one step up from there.
    const rung = p.kind === 'cottage' ? 0 : p.kind === 'villa' ? 1 : LADDER.indexOf(p.kind);
    if (rung >= 0 || BIG.includes(p.kind)) {
      const room = Math.max(info.w, info.d) + 4;
      w.lots.push({ x: p.x, z: p.z, rot: p.rot, room, rung, due: w.elapsed + SITE_AFTER + w.rng() * 6, site: null });
    }
    gobble(w, h, p, events);
  }
  const after = levelOf(h.r);
  if (after > before) events.push({ type: 'level', hole: h.id, level: after });
}

/** Score a swallowed thing (or person) for a hole: size, points, combo, food. */
function gobble(w: World, h: Hole, p: Prop, events: WorldEvent[]): void {
  const info = KINDS[p.kind];
  // Healthy food is worth half as much again, and shakes off a knock.
  const bonus = info.food === 'healthy' ? Math.max(1, Math.round(p.points * HEALTH_BONUS)) : 0;
  const was = comboOf(h.streak);
  h.streak += 1;
  h.comboTime = COMBO_WINDOW;
  const mult = comboOf(h.streak);
  if (mult > was) events.push({ type: 'combo', hole: h.id, mult });
  // A wonder scores its big bonus but grows the hole like any big thing of
  // its tier: a statue is a treat, not a jump to the top of the map.
  h.mass += (info.wonder ? worthOf(p.size) * 2 : p.points) + bonus;
  const gained = (p.points + bonus) * mult * (h.doubleTime > 0 ? 2 : 1);
  h.score += gained;
  if (h.isPlayer && info.tier <= 5) w.police.eaten += 1;
  if (info.wonder) {
    h.wonders += 1;
    events.push({ type: 'wonder', hole: h.id, name: info.wonder.name, points: gained });
  }
  h.r = radiusFor(h.mass);
  if (bonus) h.stun = 0;
  events.push({ type: 'eat', prop: p, hole: h.id });
  if (info.food) events.push({ type: 'food', hole: h.id, food: info.food, bonus });
  if (w.options.fightBack && info.hazard) hurt(w, h, 'chem', events);
}

function eatHoles(w: World, events: WorldEvent[]): void {
  for (const a of w.holes) {
    if (!a.alive) continue;
    for (const b of w.holes) {
      if (a === b || !b.alive || b.safe > 0) continue;
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

function regrow(w: World, dt: number, events: WorldEvent[]): void {
  w.regrowIn -= dt;
  if (w.regrowIn > 0 || !w.eaten.length) return;
  w.regrowIn = REGROW_EVERY;
  for (let n = 0; n < REGROW_BATCH && w.eaten.length; n++) {
    const i = Math.floor(w.rng() * w.eaten.length);
    const p = w.eaten[i];
    const seen = w.holes.some((h) => h.alive && Math.hypot(h.x - p.x, h.z - p.z) < h.r + 30);
    if (seen) continue;
    w.eaten.splice(i, 1);
    w.props.set(p.id, p);
    events.push({ type: 'regrow', prop: p });
  }
}

/** Add a thing to the city during the round: into the props and the grid. */
function place(w: World, p: Prop): void {
  w.props.set(p.id, p);
  const key = cellKey(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
  const list = w.grid.get(key);
  if (list) list.push(p.id);
  else w.grid.set(key, [p.id]);
}

/**
 * Work on the waiting lots, only while no hole is close by: put up a
 * construction site, and later finish it as a new building.
 */
function rebuild(w: World, events: WorldEvent[]): void {
  for (let i = w.lots.length - 1; i >= 0; i--) {
    const lot = w.lots[i];
    if (lot.due > w.elapsed) continue;
    if (w.holes.some((h) => h.alive && Math.hypot(h.x - lot.x, h.z - lot.z) < h.r + lot.room / 2 + 14)) continue;
    const variant = Math.floor(w.rng() * 8);
    if (lot.site === null) {
      const site = makeProp(w.nextPropId++, lot.rung < 0 && lot.room >= 20 ? 'bigsite' : 'site', lot.x, lot.z, lot.rot, variant);
      place(w, site);
      lot.site = site.id;
      lot.due = w.elapsed + SITE_TIME + w.rng() * 8;
      events.push({ type: 'rebuild', prop: site, replaces: null });
      continue;
    }
    const site = w.props.get(lot.site);
    if (!site) {
      w.lots.splice(i, 1);
      continue;
    }
    const kind = lot.rung < 0 ? bigKind(w, lot) : ladderKind(w, lot);
    // A tall building goes up in stages: the building site, then a frame
    // with a crane on it, then the tower itself.
    if (TALL.includes(kind.kind) && site.kind !== 'tallsite') {
      w.props.delete(site.id);
      const frame = makeProp(w.nextPropId++, 'tallsite', lot.x, lot.z, lot.rot, variant);
      place(w, frame);
      lot.site = frame.id;
      lot.due = w.elapsed + SITE_TIME + w.rng() * 8;
      events.push({ type: 'rebuild', prop: frame, replaces: site });
      continue;
    }
    w.lots.splice(i, 1);
    w.props.delete(site.id);
    const extra = lot.rung < 0 ? 0 : Math.max(0, lot.rung + 1 - LADDER.indexOf(kind.kind));
    const p = makeProp(w.nextPropId++, kind.kind, lot.x, lot.z, lot.rot, variant, kind.hScale ?? Math.min(2, 1 + 0.2 * extra));
    place(w, p);
    events.push({ type: 'rebuild', prop: p, replaces: site });
    const headline = HEADLINE[p.kind] ?? (p.kind === 'tower' && p.hScale >= 1.4 ? 'The city has a new skyscraper!' : undefined);
    if (headline && w.elapsed - w.lastNews >= NEWS_GAP) {
      w.lastNews = w.elapsed;
      events.push({ type: 'news', text: headline, x: p.x, z: p.z });
    }
  }
}

/** One rung above what stood here, no higher than the city's age allows, and it must fit. */
function ladderKind(w: World, lot: Lot): { kind: PropKind; hScale?: number } {
  const age = Math.floor(w.elapsed / AGE_STEP);
  let rung = Math.min(LADDER.length - 1, lot.rung + 1, age);
  while (rung > 0 && (Math.max(KINDS[LADDER[rung]].w, KINDS[LADDER[rung]].d) > lot.room || !clearFor(w, lot, LADDER[rung]))) rung--;
  return { kind: LADDER[rung] };
}

/**
 * Whether a building of this kind fits on the lot without running into the
 * buildings next door: in a terrace, an eaten house comes back as a taller
 * house, not an apartment block through its neighbours' walls.
 */
function clearFor(w: World, lot: Lot, kind: PropKind): boolean {
  const extent = (k: PropKind, rot: number): [number, number] => {
    const info = KINDS[k];
    return Math.abs(Math.sin(rot)) > 0.5 ? [info.d / 2, info.w / 2] : [info.w / 2, info.d / 2];
  };
  const [hw, hd] = extent(kind, lot.rot);
  for (const p of w.props.values()) {
    if (p.id === lot.site || KINDS[p.kind].tier < 5 || KINDS[p.kind].wonder) continue;
    const dx = Math.abs(p.x - lot.x);
    const dz = Math.abs(p.z - lot.z);
    if (dx > 60 || dz > 60) continue;
    const [pw, pd] = extent(p.kind, p.rot);
    // A little overlap is fine: the models are rounded and stand inside their outlines.
    if (dx < hw + pw - 0.5 && dz < hd + pd - 0.5) return false;
  }
  return true;
}

/** A big lot gets something big: the bigger the lot and the older the city, the grander. */
function bigKind(w: World, lot: Lot): { kind: PropKind; hScale?: number } {
  const fits = BIG.filter((k) => Math.max(KINDS[k].w, KINDS[k].d) <= lot.room && k !== 'chemplant' && clearFor(w, lot, k));
  const grand = fits.filter((k) => KINDS[k].tier >= 8);
  const pool = w.elapsed > AGE_STEP * 2 && grand.length ? grand : fits.length ? fits : (['warehouse'] as PropKind[]);
  return { kind: pool[Math.floor(w.rng() * pool.length)] };
}

// -------------------------------------------------------------------------
// People
// -------------------------------------------------------------------------

/**
 * Blocks nobody walks round: out of town, the airfield, or a stadium built
 * out over the street, where the pavement would run straight through it.
 */
const NO_WALK = ['farm', 'forest', 'windfarm', 'mountain', 'military', 'helipad', 'airport', 'arena'];

/** The pavement round a block. */
const pavement = (b: Block): Loop => ({ x0: b.x + SIDEWALK / 2, z0: b.z + SIDEWALK / 2, side: BLOCK - SIDEWALK });
/** A path inside a park, `inset` in from the block's edge. */
const parkPath = (b: Block, inset: number): Loop => ({ x0: b.x + inset, z0: b.z + inset, side: BLOCK - inset * 2 });

function newPerson(id: number, kind: Person['kind'], variant: number, loop: Loop, t: number, dir: 1 | -1, speed: number): Person {
  const p: Person = {
    id,
    kind,
    variant,
    loop,
    t,
    dir,
    speed,
    x: 0,
    z: 0,
    heading: 0,
    alive: true,
    respawnIn: 0,
    state: 'walk',
    panic: 0,
    runX: 0,
    runZ: 0,
  };
  walkTo(p);
  return p;
}

/**
 * People on the pavements of the town blocks, and in the dog parks dogs out
 * with their owners (each dog trotting just ahead of its person).
 */
function createPeople(city: City, rng: Rng): Person[] {
  const blocks = city.blockList.filter((b) => !NO_WALK.includes(b.kind));
  const count = Math.round(blocks.length * PEOPLE_PER_BLOCK);
  const people: Person[] = [];
  let id = PERSON_ID;
  for (let n = 0; n < count; n++) {
    const b = blocks[Math.floor(rng() * blocks.length)];
    people.push(newPerson(id++, 'person', Math.floor(rng() * 8), pavement(b), rng(), rng() < 0.5 ? 1 : -1, WALK * (0.8 + rng() * 0.4)));
  }
  for (const b of city.blockList.filter((x) => x.kind === 'dogpark')) {
    for (let k = 0; k < 3; k++) {
      const t = k / 3 + rng() * 0.1;
      const dir: 1 | -1 = k % 2 ? 1 : -1;
      const inset = 6 + k * 3;
      people.push(newPerson(id++, 'person', Math.floor(rng() * 8), parkPath(b, inset), t, dir, WALK));
      people.push(newPerson(id++, 'dog', Math.floor(rng() * 4), parkPath(b, inset), t + dir * 0.015, dir, WALK));
    }
  }
  return people;
}

/** Put someone at their place round their loop, facing the way they walk. */
function walkTo(p: Person): void {
  const { x0, z0, side } = p.loop;
  const u = (((p.t % 1) + 1) % 1) * 4;
  const k = Math.floor(u);
  const f = (u - k) * side;
  // Anticlockwise from the south-west corner: along x, up z, back x, down z.
  const at = [
    [x0 + f, z0, 1, 0],
    [x0 + side, z0 + f, 0, 1],
    [x0 + side - f, z0 + side, -1, 0],
    [x0, z0 + side - f, 0, -1],
  ][k];
  p.x = at[0];
  p.z = at[1];
  p.heading = Math.atan2(at[2] * p.dir, at[3] * p.dir);
}

/** The point of a loop nearest to (x, z), as a distance round it (0..1). */
function nearestOnLoop(loop: Loop, x: number, z: number): number {
  const { x0, z0, side } = loop;
  const cx = Math.max(x0, Math.min(x0 + side, x));
  const cz = Math.max(z0, Math.min(z0 + side, z));
  // Snap to the nearest edge, then turn that into a distance round.
  const d = [cz - z0, x0 + side - cx, z0 + side - cz, cx - x0];
  const edge = d.indexOf(Math.min(...d));
  const f = [cx - x0, cz - z0, x0 + side - cx, z0 + side - cz][edge] / side;
  return (edge + f) / 4;
}

/**
 * Everyone walks round their loop. A hole close by sends them sprinting away
 * along the street (they can't outrun it for long, but they try); when it
 * has gone they walk back to their loop. One close enough falls in.
 */
function walkPeople(w: World, dt: number, events: WorldEvent[]): void {
  const edge = w.city.half - 1;
  for (const p of w.people) {
    if (!p.alive) {
      p.respawnIn -= dt;
      if (p.respawnIn <= 0) comeBack(w, p);
      continue;
    }
    let eaten: Hole | null = null;
    let threat: Hole | null = null;
    let threatD = Infinity;
    for (const h of w.holes) {
      if (!h.alive) continue;
      const d = Math.hypot(h.x - p.x, h.z - p.z);
      if (d < h.r - 0.3) {
        eaten = h;
        break;
      }
      if (d < h.r + NOTICE && d < threatD) {
        threat = h;
        threatD = d;
      }
    }
    if (eaten) {
      p.alive = false;
      p.respawnIn = 8 + w.rng() * 6;
      gobble(w, eaten, makeProp(p.id, p.kind, p.x, p.z, p.heading, p.variant), events);
      continue;
    }
    if (threat) {
      // Run along the street, away from the hole: the axis it is further off on.
      const ax = p.x - threat.x;
      const az = p.z - threat.z;
      if (p.state !== 'flee') {
        const along = Math.abs(ax) > Math.abs(az);
        p.runX = along ? Math.sign(ax) || 1 : 0;
        p.runZ = along ? 0 : Math.sign(az) || 1;
      }
      p.state = 'flee';
      p.panic = 1.6;
    }
    if (p.state === 'flee') {
      p.panic -= dt;
      p.x = Math.max(-edge, Math.min(edge, p.x + p.runX * RUN * dt));
      p.z = Math.max(-edge, Math.min(edge, p.z + p.runZ * RUN * dt));
      p.heading = Math.atan2(p.runX, p.runZ);
      if (p.panic <= 0) p.state = 'back';
      continue;
    }
    if (p.state === 'back') {
      const t = nearestOnLoop(p.loop, p.x, p.z);
      const tx = { ...p, t };
      walkTo(tx);
      const dx = tx.x - p.x;
      const dz = tx.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3) {
        p.t = t;
        p.state = 'walk';
      } else {
        const step = Math.min(d, p.speed * 1.5 * dt);
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
        p.heading = Math.atan2(dx, dz);
      }
      continue;
    }
    p.t += (p.dir * p.speed * dt) / (4 * p.loop.side);
    walkTo(p);
  }
}

/** Back into town, on a block well away from every hole (a dog goes back to its park). */
function comeBack(w: World, p: Person): void {
  const blocks = w.city.blockList;
  for (let tries = 0; tries < 6; tries++) {
    const b = blocks[Math.floor(w.rng() * blocks.length)];
    if (NO_WALK.includes(b.kind)) continue;
    if (p.kind === 'dog' && b.kind !== 'dogpark') continue;
    const cx = b.x + b.size / 2;
    const cz = b.z + b.size / 2;
    if (w.holes.some((h) => h.alive && Math.hypot(h.x - cx, h.z - cz) < h.r + b.size)) continue;
    if (p.kind === 'person') p.loop = pavement(b);
    p.t = w.rng();
    p.alive = true;
    p.state = 'walk';
    p.panic = 0;
    walkTo(p);
    return;
  }
  p.respawnIn = 2;
}

// -------------------------------------------------------------------------
// The police come to look
// -------------------------------------------------------------------------

/**
 * When the child's hole has eaten a good few things, someone calls the
 * police: two cars race down the nearest street and park near the hole, and
 * the officers get out and stand round it, waving their batons. They do no
 * harm; the cars and the officers are there to be swallowed.
 */
function police(w: World, dt: number, me: Hole, events: WorldEvent[]): void {
  w.police.cool = Math.max(0, w.police.cool - dt);
  const small = levelOf(me.r) <= 6;
  if (me.alive && small && w.police.cool === 0 && w.police.eaten >= POLICE_AFTER && !w.responders.length) {
    w.police.eaten = 0;
    w.police.cool = POLICE_COOL;
    callPolice(w, me, events);
  }
  const reach = (kind: PropKind, x: number, z: number) =>
    w.holes.find((h) => h.alive && footSize(kind) <= h.r * FIT && Math.hypot(h.x - x, h.z - z) < h.r - 0.3);
  for (const r of w.responders) {
    r.t += dt;
    if (r.kind === 'car') {
      const dx = r.tx - r.x;
      const dz = r.tz - r.z;
      const d = Math.hypot(dx, dz);
      const eater = reach('policecar', r.x, r.z);
      if (eater) {
        r.state = 'leave';
        r.t = Infinity;
        gobble(w, eater, makeProp(-r.id, 'policecar', r.x, r.z, r.heading), events);
        continue;
      }
      if (d < 0.5) {
        // Parked: now it's a car in the city like any other, and two officers get out.
        r.state = 'leave';
        r.t = Infinity;
        const parked = makeProp(w.nextPropId++, 'policecar', r.tx, r.tz, r.heading);
        place(w, parked);
        events.push({ type: 'park', prop: parked });
        for (const side of [-1, 1]) {
          w.responders.push({
            id: w.nextId++,
            kind: 'officer',
            x: r.tx + Math.cos(r.heading) * side * 1.8,
            z: r.tz - Math.sin(r.heading) * side * 1.8,
            heading: r.heading,
            tx: 0,
            tz: 0,
            state: 'stand',
            t: 0,
          });
        }
        continue;
      }
      const step = Math.min(d, 18 * dt);
      r.x += (dx / d) * step;
      r.z += (dz / d) * step;
      continue;
    }
    const eater = reach('police', r.x, r.z);
    if (eater) {
      r.state = 'leave';
      r.t = Infinity;
      gobble(w, eater, makeProp(-r.id, 'police', r.x, r.z, r.heading), events);
      continue;
    }
    const dx = me.x - r.x;
    const dz = me.z - r.z;
    const d = Math.hypot(dx, dz) || 1;
    if (r.state === 'stand') {
      // Keep a careful distance from the rim, facing the hole.
      const want = me.r + 5;
      const step = Math.max(-2.2 * dt, Math.min(2.2 * dt, d - want));
      r.x += (dx / d) * step;
      r.z += (dz / d) * step;
      r.heading = Math.atan2(dx, dz);
      if (r.t > POLICE_STAY || !me.alive) {
        r.state = 'leave';
        r.t = 0;
      }
    } else if (r.state === 'leave' && r.t < 6) {
      // Stroll off, and they're gone.
      r.x -= (dx / d) * 2 * dt;
      r.z -= (dz / d) * 2 * dt;
      r.heading = Math.atan2(-dx, -dz);
    }
  }
  w.responders = w.responders.filter((r) => !(r.state === 'leave' && r.t >= 6));
}

/** Two police cars, one down each way of the street nearest the hole. */
function callPolice(w: World, me: Hole, events: WorldEvent[]): void {
  const roads = w.city.roads;
  const nearX = roads.reduce((a, b) => (Math.abs(b - me.x) < Math.abs(a - me.x) ? b : a));
  const nearZ = roads.reduce((a, b) => (Math.abs(b - me.z) < Math.abs(a - me.z) ? b : a));
  // The street running along z (at x = nearX) or along x (at z = nearZ), whichever is closer.
  const alongZ = Math.abs(nearX - me.x) < Math.abs(nearZ - me.z);
  const edge = w.city.half - 6;
  for (const side of [-1, 1]) {
    const stopAlong = (alongZ ? me.z : me.x) + side * (me.r + 9);
    // From well out of sight up the street.
    const startAlong = stopAlong + side * (110 + me.r * 2);
    const lane = side * 2.4;
    const clampE = (v: number) => Math.max(-edge, Math.min(edge, v));
    const sx = alongZ ? nearX + lane : clampE(startAlong);
    const sz = alongZ ? clampE(startAlong) : nearZ + lane;
    const tx = alongZ ? nearX + lane : clampE(stopAlong);
    const tz = alongZ ? clampE(stopAlong) : nearZ + lane;
    w.responders.push({ id: w.nextId++, kind: 'car', x: sx, z: sz, heading: Math.atan2(tx - sx, tz - sz), tx, tz, state: 'drive', t: 0 });
  }
  events.push({ type: 'police', x: me.x, z: me.z });
}

/** A crossing under a stadium, an airfield or another built-over street is no crossing. */
function builtOver(city: World['city'], x: number, z: number): boolean {
  return city.lots.some((l) => x >= l.x0 && x <= l.x1 && z >= l.z0 && z <= l.z1);
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

// -------------------------------------------------------------------------
// Power-ups
// -------------------------------------------------------------------------

/** A spot on the island, `near` to `far` from a point. */
/**
 * A spot on land between `near` and `far` from (x, z). It tries a few
 * directions for one that fits on land as it is, so a spot meant to be off
 * screen is not pulled back into view by the edge of the land.
 */
function spotNear(w: World, x: number, z: number, near: number, far: number): { x: number; z: number } {
  const edge = w.city.land - 4;
  let spot = { x, z };
  for (let tries = 0; tries < 6; tries++) {
    const a = w.rng() * Math.PI * 2;
    const d = near + w.rng() * (far - near);
    spot = { x: x + Math.cos(a) * d, z: z + Math.sin(a) * d };
    if (Math.abs(spot.x) <= edge && Math.abs(spot.z) <= edge) return spot;
  }
  return { x: Math.max(-edge, Math.min(edge, spot.x)), z: Math.max(-edge, Math.min(edge, spot.z)) };
}

function spawnPowerups(w: World, dt: number, player: Hole | null): void {
  for (const p of w.powerups) p.life -= dt;
  w.powerups = w.powerups.filter((p) => p.life > 0);
  w.nextPower -= dt;
  if (w.nextPower > 0) return;
  // Now and then, not all the time: a boost should feel like a treat.
  w.nextPower = 18 + w.rng() * 10;
  if (w.powerups.length >= POWER_MAX) return;
  // Mostly within the child's sight, so the child finds most of them.
  const alive = w.holes.filter((h) => h.alive);
  const near = player && player.alive && w.rng() < 0.75 ? player : alive[Math.floor(w.rng() * alive.length)];
  if (!near) return;
  const spot = spotNear(w, near.x, near.z, 14 + near.r * 2, 30 + near.r * 3);
  w.powerups.push({ id: w.nextId++, kind: w.rng() < 0.5 ? 'speed' : 'double', ...spot, life: POWER_LIFE });
}

function takePowerups(w: World, h: Hole, events: WorldEvent[]): void {
  for (const p of w.powerups) {
    if (p.life <= 0 || Math.hypot(p.x - h.x, p.z - h.z) > h.r + 1.2) continue;
    p.life = 0;
    if (p.kind === 'speed') h.speedTime = POWER_TIME.speed;
    else h.doubleTime = POWER_TIME.double;
    events.push({ type: 'power', hole: h.id, kind: p.kind });
  }
  w.powerups = w.powerups.filter((p) => p.life > 0);
}

// -------------------------------------------------------------------------
// The city fights back
// -------------------------------------------------------------------------

/** A fuel truck's reach: it crashes when its nose touches the rim. */
const TANKER_SIZE = footSize('tanker');
const TANK_SIZE = footSize('tank');
/** The base only sends tanks after holes this close; helicopters go anywhere. */
const TANK_RANGE = 200;
const MIN_ATTACK_LEVEL = 4;

function hurt(w: World, h: Hole, cause: HurtCause, events: WorldEvent[]): void {
  h.mass *= h.isPlayer ? HURT_PLAYER[w.options.difficulty ?? 'easy'] : HURT_RIVAL;
  h.r = radiusFor(h.mass);
  h.stun = STUN;
  if (cause === 'tanker') h.burn = BURN;
  events.push({ type: 'hurt', hole: h.id, cause });
  events.push({ type: 'boom', x: h.x, z: h.z, size: Math.max(3, h.r * 0.5) });
}

function fightBack(w: World, dt: number, events: WorldEvent[], player: Hole | null): void {
  w.nextAttack -= dt;
  if (w.nextAttack <= 0) launch(w, events, player);

  for (const a of w.attacks) {
    a.life -= dt;
    if (a.kind === 'tanker') driveTanker(w, a, dt, events);
    else if (a.kind === 'bomber') flyBomber(w, a, dt, events);
    else moveUnit(w, a, dt, events);
  }
  w.attacks = w.attacks.filter((a) => a.life > 0);
}

/** Pick who the city goes after: big holes only, the child about half the time. */
function launch(w: World, events: WorldEvent[], player: Hole | null): void {
  const big = w.holes.filter((h) => h.alive && h.safe <= 0 && levelOf(h.r) >= MIN_ATTACK_LEVEL);
  if (!big.length) {
    w.nextAttack = 5;
    return;
  }
  // Now and then, not all the time: each attack should feel like an event.
  w.nextAttack = 20 + w.rng() * 12;
  const biggest = big.reduce((a, b) => (b.r > a.r ? b : a));
  const target = player && big.includes(player) && (player === biggest || w.rng() < 0.5) ? player : biggest;
  // A map with a military base sends its army half the time.
  const base = w.city.base;
  if (base && w.rng() < 0.5) {
    const near = Math.hypot(target.x - base.x, target.z - base.z) < TANK_RANGE;
    const kind = near && w.rng() < 0.6 ? 'tank' : 'heli';
    const count = kind === 'tank' ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const heading = Math.atan2(target.x - base.x, target.z - base.z);
      const unit: Unit = {
        id: w.nextId++,
        target: target.id,
        x: base.x + (i - (count - 1) / 2) * 6 * Math.cos(heading),
        z: base.z - (i - (count - 1) / 2) * 6 * Math.sin(heading),
        heading,
        // Tanks trundle; helicopters are quick, but never quicker than a hole can dodge.
        speed: kind === 'tank' ? Math.max(6, speedOf(target.r) * 0.55) : Math.max(28, speedOf(target.r) * 1.3),
        life: kind === 'tank' ? 45 : 35,
        reload: 1.5 + i,
        shells: [],
      };
      w.attacks.push(kind === 'tank' ? { ...unit, kind: 'tank' } : { ...unit, kind: 'heli' });
    }
    events.push({ type: 'incoming', target: target.id, kind });
    return;
  }
  const bomber = levelOf(target.r) >= 6 ? w.rng() < 0.75 : w.rng() < 0.2;
  const id = w.nextId++;
  if (bomber) {
    const a = w.rng() * Math.PI * 2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const reach = 140 + target.r * 4;
    const speed = 62 + target.r;
    const radius = Math.max(5, target.r * 0.8);
    // Bombs along the plane's line, over where the hole is now. Each lands a
    // little after the plane passes, so its target ring shows for a while.
    const bombs: Bomb[] = [-1.3, 0, 1.3].map((k) => {
      const bx = target.x + dx * k * radius * 1.4;
      const bz = target.z + dz * k * radius * 1.4;
      const pass = (reach + k * radius * 1.4) / speed;
      return { id: w.nextId++, x: bx, z: bz, radius, fuse: pass + 1 };
    });
    w.attacks.push({ id, kind: 'bomber', target: target.id, x: target.x - dx * reach, z: target.z - dz * reach, dx, dz, speed, life: (reach * 2) / speed + 2, bombs });
  } else {
    // Out of sight, then it drives in: nothing appears out of nowhere on screen.
    const spot = spotNear(w, target.x, target.z, 90 + target.r * 4, 105 + target.r * 4.5);
    const heading = Math.atan2(target.x - spot.x, target.z - spot.z);
    // A little slower than the hole it chases, and slow to turn: a child who
    // sees it coming can always get out of the way.
    w.attacks.push({ id, kind: 'tanker', ...spot, heading, speed: speedOf(target.r) * 0.8, target: target.id, life: 26 });
  }
  events.push({ type: 'incoming', target: target.id, kind: bomber ? 'bomber' : 'tanker' });
}

function driveTanker(w: World, a: Extract<Attack, { kind: 'tanker' }>, dt: number, events: WorldEvent[]): void {
  const target = w.holes[a.target];
  // It turns toward its hole, but only so fast: a sharp swerve gets away.
  if (target?.alive) {
    const want = Math.atan2(target.x - a.x, target.z - a.z);
    let turn = want - a.heading;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    a.heading += Math.max(-1, Math.min(1, turn)) * 0.8 * dt;
  }
  // Quick while it is far off, so it arrives; slower close up, so it can be dodged.
  const far = target?.alive && Math.hypot(target.x - a.x, target.z - a.z) > 45 + target.r * 2 ? 1.6 : 1;
  a.x += Math.sin(a.heading) * a.speed * far * dt;
  a.z += Math.cos(a.heading) * a.speed * far * dt;
  // It crashes into any hole it reaches, big or small, and goes up in flames.
  for (const h of w.holes) {
    if (!h.alive || h.safe > 0) continue;
    if (Math.hypot(h.x - a.x, h.z - a.z) > h.r + TANKER_SIZE * 0.4) continue;
    a.life = 0;
    hurt(w, h, 'tanker', events);
    return;
  }
  if (Math.abs(a.x) > w.city.land + 20 || Math.abs(a.z) > w.city.land + 20) a.life = 0;
}

/**
 * A tank or helicopter: head for its hole, stop at a distance (a helicopter
 * circles), and fire every few seconds at the spot where the hole is now.
 * Each shell shows its red target circle while it flies, so a moving hole
 * gets away. A hole big enough simply swallows a tank that comes too close.
 */
function moveUnit(w: World, a: Extract<Attack, { kind: 'tank' | 'heli' }>, dt: number, events: WorldEvent[]): void {
  const target = w.holes[a.target];
  const tank = a.kind === 'tank';
  if (target?.alive) {
    const d = Math.hypot(target.x - a.x, target.z - a.z);
    const stand = target.r + (tank ? 22 : 26);
    const want = Math.atan2(target.x - a.x, target.z - a.z);
    // Close in; a helicopter that is close enough circles round.
    const aim = !tank && d < stand + 4 ? want + Math.PI / 2 : want;
    let turn = aim - a.heading;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    a.heading += Math.max(-1, Math.min(1, turn)) * (tank ? 1.2 : 2) * dt;
    if (!tank || d > stand) {
      a.x += Math.sin(a.heading) * a.speed * dt;
      a.z += Math.cos(a.heading) * a.speed * dt;
    }
    a.reload -= dt;
    if (a.reload <= 0 && d < stand + 30) {
      a.reload = tank ? 2.8 : 2.2;
      const flight = tank ? 1.5 : 1.1;
      a.shells.push({
        id: w.nextId++,
        x: target.x,
        z: target.z,
        radius: Math.max(4, target.r * (tank ? 0.35 : 0.3)),
        fuse: flight,
        flight,
        from: { x: a.x, z: a.z, y: tank ? 2.2 : 10 + target.r * 0.8 },
      });
    }
  }
  for (const b of a.shells) {
    b.fuse -= dt;
    if (b.fuse > 0) continue;
    events.push({ type: 'boom', x: b.x, z: b.z, size: b.radius });
    for (const h of w.holes) {
      if (h.alive && h.safe <= 0 && Math.hypot(h.x - b.x, h.z - b.z) < b.radius + h.r * 0.25) hurt(w, h, 'bomb', events);
    }
  }
  a.shells = a.shells.filter((b) => b.fuse > 0);
  // A big hole swallows a tank that rolls into it.
  if (tank) {
    for (const h of w.holes) {
      if (!h.alive || TANK_SIZE > h.r * FIT || Math.hypot(h.x - a.x, h.z - a.z) > h.r - 1.5) continue;
      a.life = 0;
      gobble(w, h, makeProp(-a.id, 'tank', a.x, a.z, a.heading), events);
      return;
    }
  }
  // Out of time: it stops firing and leaves once its last shell lands.
  if (a.life <= 0 && a.shells.length) a.life = 0.01;
}

function flyBomber(w: World, a: Extract<Attack, { kind: 'bomber' }>, dt: number, events: WorldEvent[]): void {
  a.x += a.dx * a.speed * dt;
  a.z += a.dz * a.speed * dt;
  for (const b of a.bombs) {
    if (b.fuse <= 0) continue;
    b.fuse -= dt;
    if (b.fuse > 0) continue;
    events.push({ type: 'boom', x: b.x, z: b.z, size: b.radius });
    for (const h of w.holes) {
      if (h.alive && h.safe <= 0 && Math.hypot(h.x - b.x, h.z - b.z) < b.radius + h.r * 0.25) hurt(w, h, 'bomb', events);
    }
  }
  a.bombs = a.bombs.filter((b) => b.fuse > 0);
}

/** Everyone, best first: the leaderboard and the results. */
export function standings(w: World): Hole[] {
  return [...w.holes].sort((a, b) => b.score - a.score || a.id - b.id);
}
