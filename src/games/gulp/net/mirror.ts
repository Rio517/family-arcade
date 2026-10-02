/**
 * A guest's copy of a shared round: the mirror. It is built from the round's
 * start exactly as the host builds the real round, and from then on changes
 * only by the host's word. Each tick says where the holes are and what
 * happened; the mirror turns that back into the same `WorldEvent`s, with
 * real things in them, so the unchanged scene and feedback play them.
 *
 * It never runs a rule of its own: no eating, scoring, rebuilding, police,
 * attacks or power-ups. Between ticks three things move on the guest's
 * screen: this device's own hole, steered here with the host's movement
 * rule; people walking their loops; and every other hole, police car,
 * officer and attack, easing toward where the host last said it was (as the
 * racer's other kart does), with bombs and shells burning down their fuses.
 */
import { KINDS, makeProp, type Prop } from '../domain/catalog';
import { speedOf } from '../domain/growth';
import { PERSON_ID, returnPerson, walkPeople, type Loop } from '../domain/people';
import { indexProps, placeProp, wrapAngle } from '../domain/space';
import { move, type Hole, type Input, type World, type WorldEvent } from '../domain/world';
import { EPOCH, attackFrom, copFrom, loopFrom, placeFrom, powerFrom, propFrom, setClock, setTally, sumOf } from './codec';
import type { PosMsg, SnapshotMsg, StartMsg, TickMsg } from './protocol';
import { buildRound } from './round';
import { ATTACKS, CAUSES, EV, FOODS, POWERS, fromHundredths, fromTenths, hundredths } from './wire';
import type { EventWire, HoleWire, PropWire, SumWire } from './wire';

interface Spot {
  x: number;
  z: number;
  heading: number;
}

/** Where the host last put something, and where this screen draws it (null: not drawn yet, so it starts there). */
interface Glide {
  aim: Spot;
  shown: Spot | null;
}

export interface Mirror {
  world: World;
  /** This device's hole. */
  you: number;
  /** The copy has missed a tick or does not add up: ask the host for a snapshot. */
  needSnapshot: boolean;
  /** The last tick taken in (the host counts from 0). */
  seq: number;
  /** How many times this device's hole has come back, as the host last said: its reports carry it (see EPOCH). */
  life: number;
  /** Every thing seen this round, standing or not, by id: a thing put back is the same object again. */
  known: Map<number, Prop>;
  /** The loop each person walked at the start. */
  starts: Loop[];
  /** Just after a snapshot: the next tick may repeat some of what the snapshot holds. */
  fresh: boolean;
  /** Each hole other than this device's, and each police car, officer and attack by id, easing on screen. */
  holes: Glide[];
  things: Map<number, Glide>;
  /** What the scene must play that no tick said: after a snapshot, things going and coming back. */
  pending: WorldEvent[];
}

const STILL: Input = { x: 0, z: 0 };
/** On a snapshot, this device's hole stays where it is unless it is further than this many seconds of travel from the host's word. */
const DRIFT = 1;

export function createMirror(start: StartMsg): Mirror {
  const world = buildRound(start);
  return {
    world,
    you: start.you,
    needSnapshot: false,
    seq: -1,
    life: 0,
    known: new Map(world.props),
    starts: world.people.map((p) => p.loop),
    fresh: false,
    holes: world.holes.map((h) => ({ aim: { x: h.x, z: h.z, heading: 0 }, shown: null })),
    things: new Map(),
    pending: [],
  };
}

/**
 * Take in a tick. A tick already seen is ignored. A gap in `seq`, or a city
 * that does not add up to the host's sum, sets `needSnapshot`; the tick is
 * still taken in, so the screen carries on until the snapshot comes.
 */
export function applyTick(m: Mirror, tick: TickMsg): WorldEvent[] {
  const w = m.world;
  if (tick.seq <= m.seq || tick.holes.length !== w.holes.length) return [];
  if (tick.seq !== m.seq + 1) m.needSnapshot = true;
  m.seq = tick.seq;
  const fresh = m.fresh;
  m.fresh = false;
  const out: WorldEvent[] = [];
  for (const e of tick.events) {
    const event = eventFrom(m, e, fresh);
    if (event) out.push(event);
  }
  takeState(m, tick, false);
  if (tick.sum && !sameSum(sumOf(w), tick.sum)) m.needSnapshot = true;
  return out;
}

/** Take in all of the round as it stands on the host. The scene is brought in line on the next `stepMirror`. */
export function applySnapshot(m: Mirror, snap: SnapshotMsg): void {
  const w = m.world;
  if (snap.holes.length !== w.holes.length) return;
  for (const p of snap.added) if (!m.known.has(p[0])) m.known.set(p[0], propFrom(p));
  const standing = new Map<number, Prop>();
  snap.stand.forEach((bits, k) => {
    for (let b = 0; b < 7; b++) {
      const p = bits & (1 << b) ? m.known.get(k * 7 + b + 1) : undefined;
      if (p) standing.set(p.id, p);
    }
  });
  const before = w.props;
  // The grid holds every thing seen, standing or not, as the host's does, so a thing put back is found again.
  w.props = new Map(m.known);
  indexProps(w);
  w.props = standing;
  // What went goes without a fuss; what is back shows (a thing built in the round as one that parked).
  const base = w.city.props.length;
  for (const [id, p] of before) if (!standing.has(id)) m.pending.push({ type: 'crumb', prop: p });
  for (const [id, p] of standing) if (!before.has(id)) m.pending.push(id > base ? { type: 'park', prop: p } : { type: 'regrow', prop: p });
  if (snap.people.length === w.people.length * 2) {
    w.people.forEach((p, i) => {
      const t = snap.people[i * 2];
      const loop = loopFrom(w.city, snap.people[i * 2 + 1], m.starts[i]);
      if (t < 0) p.alive = false;
      else if (loop) returnPerson(p, loop, placeFrom(t));
    });
  }
  snap.tally.forEach((t, i) => setTally(w.holes[i], t));
  takeState(m, snap, true);
  m.seq = snap.seq - 1;
  m.fresh = true;
  m.needSnapshot = false;
}

/**
 * One frame on the guest's screen: this device's hole moves as `input`
 * steers it, people walk, and everything else eases toward the host's word.
 * Returns what the scene must play that no tick said (see `pending`).
 */
export function stepMirror(m: Mirror, dt: number, input: Input | null): WorldEvent[] {
  const w = m.world;
  if (w.status === 'playing') {
    const me = w.holes[m.you];
    if (me.alive) move(w, me, input ?? STILL, dt, 1);
    walkPeople(w, dt, [], false);
  }
  const k = 1 - Math.pow(0.001, dt);
  m.holes.forEach((g, i) => {
    if (i === m.you) return;
    const s = glide(g, k);
    w.holes[i].x = s.x;
    w.holes[i].z = s.z;
  });
  for (const r of w.responders) {
    const g = m.things.get(r.id);
    if (!g) continue;
    const s = glide(g, k);
    [r.x, r.z, r.heading] = [s.x, s.z, s.heading];
  }
  for (const a of w.attacks) {
    const g = m.things.get(a.id);
    if (g) {
      const s = glide(g, k);
      [a.x, a.z] = [s.x, s.z];
      if (a.kind !== 'bomber') a.heading = s.heading;
    }
    const falling = a.kind === 'bomber' ? a.bombs : a.kind === 'tanker' ? [] : a.shells;
    for (const b of falling) b.fuse = Math.max(0, b.fuse - dt);
  }
  return m.pending.splice(0);
}

/** This device's hole in wire units, its `seq` in the epoch of the hole's current life (see EPOCH). */
export function reportOf(m: Mirror, seq: number): PosMsg {
  const h = m.world.holes[m.you];
  return { t: 'pos', seq: m.life * EPOCH + (seq % EPOCH), x: hundredths(h.x), z: hundredths(h.z), vx: hundredths(h.vx), vz: hundredths(h.vz) };
}

// ── Taking the host's word ───────────────────────────────────────────────

const sameSum = (a: SumWire, b: SumWire) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

function glide(g: Glide, k: number): Spot {
  if (!g.shown) {
    g.shown = { ...g.aim };
    return g.shown;
  }
  const s = g.shown;
  s.x += (g.aim.x - s.x) * k;
  s.z += (g.aim.z - s.z) * k;
  s.heading += wrapAngle(g.aim.heading - s.heading) * k;
  return s;
}

/** The clock, the holes, the power-ups, the police and the attacks, as a tick or snapshot says. */
function takeState(m: Mirror, s: TickMsg | SnapshotMsg, snap: boolean): void {
  const w = m.world;
  setClock(w, s.clock);
  s.holes.forEach((wire, i) => setHole(m, i, wire, snap));
  w.powerups = s.power.map(powerFrom);
  w.responders = s.cops.map(copFrom);
  w.attacks = s.attacks.map(attackFrom);
  const things = new Map<number, Glide>();
  for (const t of [...w.responders, ...w.attacks]) {
    const aim = { x: t.x, z: t.z, heading: 'heading' in t ? t.heading : 0 };
    things.set(t.id, { aim, shown: snap ? null : (m.things.get(t.id)?.shown ?? null) });
  }
  m.things = things;
}

/**
 * A hole as the host says it is. Another hole eases to its new spot, or
 * jumps there when it has just come back. This device's own hole keeps the
 * spot it was steered to, unless it has just come back (then a new epoch of
 * reports starts) or a snapshot finds it far from where the host has it.
 */
function setHole(m: Mirror, i: number, wire: HoleWire, snap: boolean): void {
  const h = m.world.holes[i];
  const [x, z, vx, vz, r, score, lives, alive, respawnIn, safe, speedTime, doubleTime, stun, burn, streak, respawns] = wire;
  const back = respawns !== h.respawns;
  h.r = fromHundredths(r);
  h.score = score;
  h.lives = lives < 0 ? Infinity : lives;
  h.alive = alive === 1;
  h.respawnIn = fromTenths(respawnIn);
  h.safe = fromTenths(safe);
  h.speedTime = fromTenths(speedTime);
  h.doubleTime = fromTenths(doubleTime);
  h.stun = fromTenths(stun);
  h.burn = fromTenths(burn);
  h.streak = streak;
  h.respawns = respawns;
  const at = { x: fromHundredths(x), z: fromHundredths(z), heading: 0 };
  if (i === m.you) {
    m.life = respawns;
    const far = Math.hypot(h.x - at.x, h.z - at.z) > speedOf(h.r) * DRIFT;
    if (!back && !(snap && (far || !h.alive))) return;
  }
  [h.x, h.z, h.vx, h.vz] = [at.x, at.z, fromHundredths(vx), fromHundredths(vz)];
  const g = m.holes[i];
  g.aim = at;
  if (back || snap) g.shown = null;
}

/** Report that the copy has lost track of something: only a snapshot puts it right. */
function lost(m: Mirror): null {
  m.needSnapshot = true;
  return null;
}

/** A thing or a person the host says is gone: off the city, as a thing for the scene. */
function gone(m: Mirror, id: number, fresh: boolean): Prop | null {
  const w = m.world;
  if (id >= PERSON_ID) {
    const p = w.people[id - PERSON_ID];
    if (!p || p.id !== id) return lost(m);
    if (fresh && !p.alive) return null;
    p.alive = false;
    return makeProp(p.id, p.kind, p.x, p.z, p.heading, p.variant);
  }
  const prop = m.known.get(id);
  if (!prop) return lost(m);
  if (fresh && !w.props.has(id)) return null;
  w.props.delete(id);
  return prop;
}

/** A thing new to the city, built or parked. */
function added(m: Mirror, wire: PropWire, fresh: boolean): Prop | null {
  const w = m.world;
  if (fresh && w.props.has(wire[0])) return null;
  const p = propFrom(wire);
  m.known.set(p.id, p);
  placeProp(w, p);
  return p;
}

/** What a hole keeps count of for the results, as the host's rules count it (see holes.ts `gobble`). */
function tallyBite(h: Hole, p: Prop): void {
  h.gulped += 1;
  if (!h.biggest || p.points > h.biggest.points) h.biggest = { kind: p.kind, points: p.points };
  if (KINDS[p.kind].wonder && !h.wonderKinds.includes(p.kind)) {
    h.wonderKinds.push(p.kind);
    h.wonders += 1;
  }
}

/**
 * One event from the wire, carried out on the mirror and handed back as the
 * host's rules made it. Just after a snapshot (`fresh`), an event the
 * snapshot already holds is left out.
 */
function eventFrom(m: Mirror, e: EventWire, fresh: boolean): WorldEvent | null {
  const w = m.world;
  switch (e[0]) {
    case EV.eat: {
      let prop: Prop | null;
      if (e.length === 8) {
        // A police car, an officer or a tank: never a thing on the guest.
        prop = fresh && !m.things.has(-e[1]) ? null : makeProp(e[1], e[4], fromHundredths(e[5]), fromHundredths(e[6]), fromHundredths(e[7]));
      } else prop = gone(m, e[1], fresh);
      if (!prop) return null;
      tallyBite(w.holes[e[2]], prop);
      return { type: 'eat', prop, hole: e[2], gained: e[3] };
    }
    case EV.regrow: {
      const prop = m.known.get(e[1]);
      if (!prop) return lost(m);
      if (w.props.has(prop.id)) return null;
      w.props.set(prop.id, prop);
      return { type: 'regrow', prop };
    }
    case EV.crumb: {
      const prop = gone(m, e[1], fresh);
      return prop && { type: 'crumb', prop };
    }
    case EV.rebuild: {
      const prop = added(m, e[1], fresh);
      if (!prop) return null;
      const replaces = (e[2] && m.known.get(e[2])) || null;
      if (replaces) w.props.delete(replaces.id);
      return { type: 'rebuild', prop, replaces };
    }
    case EV.park: {
      const prop = added(m, e[1], fresh);
      return prop && { type: 'park', prop };
    }
    case EV.news:
      return { type: 'news', text: e[1], x: fromHundredths(e[2]), z: fromHundredths(e[3]) };
    case EV.food:
      return { type: 'food', hole: e[1], food: FOODS[e[2]], bonus: e[3] };
    case EV.combo:
      return { type: 'combo', hole: e[1], mult: e[2] };
    case EV.wonder:
      return { type: 'wonder', hole: e[1], name: KINDS[e[2]].name, points: e[3] };
    case EV.police:
      return { type: 'police', x: fromHundredths(e[1]), z: fromHundredths(e[2]) };
    case EV.gulp: {
      const [, eater, eaten, points] = e;
      // Already swallowed in the snapshot: counted there.
      if (fresh && !w.holes[eaten].alive) return null;
      w.holes[eater].kills += 1;
      w.holes[eaten].eatenBy = w.holes[eater].name;
      return { type: 'gulp', eater, eaten, points };
    }
    case EV.level:
      return { type: 'level', hole: e[1], level: e[2] };
    case EV.respawn:
      return { type: 'respawn', hole: e[1] };
    case EV.out:
      return { type: 'out', hole: e[1] };
    case EV.power:
      return { type: 'power', hole: e[1], kind: POWERS[e[2]] };
    case EV.hurt:
      return { type: 'hurt', hole: e[1], cause: CAUSES[e[2]] };
    case EV.boom:
      return { type: 'boom', x: fromHundredths(e[1]), z: fromHundredths(e[2]), size: fromHundredths(e[3]) };
    case EV.incoming:
      return { type: 'incoming', target: e[1], kind: ATTACKS[e[2]] };
    case EV.back: {
      const p = w.people[e[1]];
      const loop = p ? loopFrom(w.city, e[2], m.starts[e[1]]) : null;
      if (!p || !loop) return lost(m);
      if (fresh && p.alive) return null;
      returnPerson(p, loop, placeFrom(e[3]));
      return { type: 'back', person: p };
    }
  }
}
