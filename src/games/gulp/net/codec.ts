/**
 * The host's side of the wire: a tick of the round 20 times a second, a
 * snapshot of all of it for a guest who comes back or has drifted, and the
 * guest's reports read back into the world's units. The pieces both sides
 * share (a thing, a power-up, the police, an attack) are read back here too,
 * next to how they are written. Units and shapes are in wire.ts.
 */
import type { Bomb } from '../domain/attacks';
import { KINDS, makeProp, type Prop, type PropKind } from '../domain/catalog';
import type { City } from '../domain/city';
import { PERSON_ID, pavement, type Loop } from '../domain/people';
import type { Responder } from '../domain/police';
import type { Attack, Hole, HoleReport, PowerUp, World, WorldEvent } from '../domain/world';
import type { PosMsg, SnapshotMsg, TickMsg } from './protocol';
import { ATTACKS, CAUSES, COP_STATES, COPS, ENDED, EV, FOODS, LOOP_STEPS, POWERS, STATUS, fromHundredths, fromTenths, hundredths, tenths } from './wire';
import type { AttackWire, BombWire, ClockWire, CopWire, EventWire, HoleWire, PowerWire, PropWire, SumWire, TallyWire } from './wire';

/** Every this many ticks (once a second) a tick carries the check of what stands. */
export const CHECK_EVERY = 20;

/**
 * A guest's report `seq` says which of its hole's lives it was made in: each
 * time the hole comes back, its reports start again at the next multiple of
 * this (over nine days of reports at 20 a second).
 */
export const EPOCH = 2 ** 24;

export function tickOf(w: World, events: readonly WorldEvent[], seq: number): TickMsg {
  const tick: TickMsg = {
    t: 'tick',
    seq,
    clock: clockOf(w),
    holes: w.holes.map(holeOf),
    power: w.powerups.map(powerOf),
    cops: w.responders.map(copOf),
    attacks: w.attacks.map(attackOf),
    events: events.map((e) => eventOf(w, e)).filter((e): e is EventWire => e !== null),
  };
  if (seq % CHECK_EVERY === 0) tick.sum = sumOf(w);
  return tick;
}

/**
 * The whole round as it stands. `seq` is the next tick the host will send:
 * the guest takes that tick in after this, and anything in it that the
 * snapshot already holds is not counted twice.
 */
export function snapshotOf(w: World, seq: number): SnapshotMsg {
  const base = w.city.props.length;
  const added = new Map<number, Prop>();
  for (const p of [...w.props.values(), ...w.eaten]) if (p.id > base) added.set(p.id, p);
  const stand: number[] = new Array<number>(Math.ceil((w.nextPropId - 1) / 7)).fill(0);
  for (const id of w.props.keys()) stand[Math.floor((id - 1) / 7)] |= 1 << ((id - 1) % 7);
  return {
    t: 'snap',
    seq,
    clock: clockOf(w),
    holes: w.holes.map(holeOf),
    tally: w.holes.map(tallyOf),
    power: w.powerups.map(powerOf),
    cops: w.responders.map(copOf),
    attacks: w.attacks.map(attackOf),
    stand,
    added: [...added.values()].map(propOf),
    people: w.people.flatMap((p) => (p.alive ? [placeOf(p.t), blockOf(w.city, p.loop)] : [-1, -1])),
  };
}

/** What the guest's city should add up to: things standing, the sum of their ids, and people about. */
export function sumOf(w: World): SumWire {
  let ids = 0;
  for (const id of w.props.keys()) ids += id;
  return [w.props.size, ids, w.people.filter((p) => p.alive).length];
}

/** A guest's report in the world's units, with the life it was made in (see EPOCH). */
export const reportFrom = (pos: PosMsg): HoleReport => ({
  x: fromHundredths(pos.x),
  z: fromHundredths(pos.z),
  vx: fromHundredths(pos.vx),
  vz: fromHundredths(pos.vz),
  life: Math.floor(pos.seq / EPOCH),
});

// ── Writing ──────────────────────────────────────────────────────────────

const clockOf = (w: World): ClockWire => [
  Math.floor(w.elapsed * 10 + 1e-6),
  tenths(w.countdown),
  STATUS.indexOf(w.status),
  ENDED.indexOf(w.endedBy),
  w.allOut ? 1 : 0,
];

const holeOf = (h: Hole): HoleWire => [
  hundredths(h.x),
  hundredths(h.z),
  hundredths(h.vx),
  hundredths(h.vz),
  hundredths(h.r),
  h.score,
  Number.isFinite(h.lives) ? h.lives : -1,
  h.alive ? 1 : 0,
  tenths(h.respawnIn),
  tenths(h.safe),
  tenths(h.speedTime),
  tenths(h.doubleTime),
  tenths(h.stun),
  tenths(h.burn),
  h.streak,
  h.respawns,
  h.away === null ? -1 : tenths(h.away),
];

const tallyOf = (h: Hole): TallyWire => [h.kills, h.gulped, [...h.wonderKinds], h.biggest ? [h.biggest.kind, h.biggest.points] : null, h.eatenBy];

const powerOf = (p: PowerUp): PowerWire => [p.id, POWERS.indexOf(p.kind), hundredths(p.x), hundredths(p.z), tenths(p.life)];

const copOf = (r: Responder): CopWire => [
  r.id,
  COPS.indexOf(r.kind),
  r.child,
  hundredths(r.x),
  hundredths(r.z),
  hundredths(r.heading),
  hundredths(r.tx),
  hundredths(r.tz),
  COP_STATES.indexOf(r.state),
  tenths(r.t),
];

function bombOf(b: Bomb): BombWire {
  const bomb: BombWire = [b.id, hundredths(b.x), hundredths(b.z), hundredths(b.radius), hundredths(b.fuse)];
  if (!b.from || b.flight === undefined) return bomb;
  return [...bomb, hundredths(b.from.x), hundredths(b.from.z), hundredths(b.from.y), hundredths(b.flight)];
}

function attackOf(a: Attack): AttackWire {
  if (a.kind === 'tanker') return [0, a.id, a.target, hundredths(a.x), hundredths(a.z), hundredths(a.heading), hundredths(a.speed), tenths(a.life)];
  if (a.kind === 'bomber') return [1, a.id, a.target, hundredths(a.x), hundredths(a.z), hundredths(Math.atan2(a.dx, a.dz)), hundredths(a.speed), tenths(a.life), a.bombs.map(bombOf)];
  return [
    a.kind === 'tank' ? 2 : 3,
    a.id,
    a.target,
    a.wave,
    a.hits,
    a.home ? 1 : 0,
    hundredths(a.x),
    hundredths(a.z),
    hundredths(a.heading),
    hundredths(a.speed),
    tenths(a.life),
    hundredths(a.reload),
    a.shots,
    a.shells.map(bombOf),
  ];
}

const propOf = (p: Prop): PropWire => [p.id, p.kind, p.variant, hundredths(p.x), hundredths(p.z), hundredths(p.rot), hundredths(p.hScale)];

/** How far round a loop, 0 to 1, in ten-thousandths (people walk on past 1 and below 0). */
const placeOf = (t: number): number => Math.round((((t % 1) + 1) % 1) * LOOP_STEPS) % LOOP_STEPS;

/** Each block's pavement, by where it starts, found once a city. */
const pavements = new WeakMap<City, Map<string, number>>();

/** Which block's pavement this loop is, or -1 for any other loop (a path in a park). */
function blockOf(city: City, loop: Loop): number {
  let index = pavements.get(city);
  if (!index) {
    index = new Map(city.blockList.map((b, i) => [loopKey(pavement(b)), i]));
    pavements.set(city, index);
  }
  return index.get(loopKey(loop)) ?? -1;
}

const loopKey = (l: Loop) => `${l.x0}:${l.z0}:${l.side}`;

/** The wonder each wonder's name belongs to. */
const WONDER_BY_NAME = new Map((Object.keys(KINDS) as PropKind[]).flatMap((k) => (KINDS[k].wonder ? [[KINDS[k].name, k] as const] : [])));

function eventOf(w: World, e: WorldEvent): EventWire | null {
  switch (e.type) {
    case 'eat':
      return e.prop.id < 0
        ? [EV.eat, e.prop.id, e.hole, e.gained, e.prop.kind, hundredths(e.prop.x), hundredths(e.prop.z), hundredths(e.prop.rot)]
        : [EV.eat, e.prop.id, e.hole, e.gained];
    case 'regrow':
      return [EV.regrow, e.prop.id];
    case 'crumb':
      return [EV.crumb, e.prop.id];
    case 'rebuild':
      return [EV.rebuild, propOf(e.prop), e.replaces?.id ?? 0];
    case 'park':
      return [EV.park, propOf(e.prop)];
    case 'news':
      return [EV.news, e.text, hundredths(e.x), hundredths(e.z)];
    case 'food':
      return [EV.food, e.hole, FOODS.indexOf(e.food), e.bonus];
    case 'combo':
      return [EV.combo, e.hole, e.mult];
    case 'wonder': {
      const kind = WONDER_BY_NAME.get(e.name);
      return kind ? [EV.wonder, e.hole, kind, e.points] : null;
    }
    case 'police':
      return [EV.police, hundredths(e.x), hundredths(e.z)];
    case 'gulp':
      return [EV.gulp, e.eater, e.eaten, e.points];
    case 'level':
      return [EV.level, e.hole, e.level];
    case 'respawn':
      return [EV.respawn, e.hole];
    case 'out':
      return [EV.out, e.hole];
    case 'power':
      return [EV.power, e.hole, POWERS.indexOf(e.kind)];
    case 'hurt':
      return [EV.hurt, e.hole, CAUSES.indexOf(e.cause)];
    case 'boom':
      return [EV.boom, hundredths(e.x), hundredths(e.z), hundredths(e.size)];
    case 'incoming':
      return [EV.incoming, e.target, ATTACKS.indexOf(e.kind)];
    case 'back':
      return [EV.back, e.person.id - PERSON_ID, blockOf(w.city, e.person.loop), placeOf(e.person.t)];
  }
}

// ── Reading back ─────────────────────────────────────────────────────────

/** The block's pavement a person walks, or the loop they started on. */
export const loopFrom = (city: City, block: number, start: Loop): Loop | null => {
  if (block < 0) return start;
  const b = city.blockList[block];
  return b ? pavement(b) : null;
};

export const placeFrom = (t: number): number => t / LOOP_STEPS;

export const propFrom = (p: PropWire): Prop => makeProp(p[0], p[1], fromHundredths(p[3]), fromHundredths(p[4]), fromHundredths(p[5]), p[2], fromHundredths(p[6]));

export const powerFrom = (p: PowerWire): PowerUp => ({ id: p[0], kind: POWERS[p[1]], x: fromHundredths(p[2]), z: fromHundredths(p[3]), life: fromTenths(p[4]) });

export const copFrom = (c: CopWire): Responder => ({
  id: c[0],
  kind: COPS[c[1]],
  child: c[2],
  x: fromHundredths(c[3]),
  z: fromHundredths(c[4]),
  heading: fromHundredths(c[5]),
  tx: fromHundredths(c[6]),
  tz: fromHundredths(c[7]),
  state: COP_STATES[c[8]],
  t: fromTenths(c[9]),
  done: false,
});

function bombFrom(b: BombWire): Bomb {
  const bomb: Bomb = { id: b[0], x: fromHundredths(b[1]), z: fromHundredths(b[2]), radius: fromHundredths(b[3]), fuse: fromHundredths(b[4]) };
  if (b.length !== 9) return bomb;
  return { ...bomb, from: { x: fromHundredths(b[5]), z: fromHundredths(b[6]), y: fromHundredths(b[7]) }, flight: fromHundredths(b[8]) };
}

export function attackFrom(a: AttackWire): Attack {
  if (a[0] === 0) return { kind: 'tanker', id: a[1], target: a[2], x: fromHundredths(a[3]), z: fromHundredths(a[4]), heading: fromHundredths(a[5]), speed: fromHundredths(a[6]), life: fromTenths(a[7]) };
  if (a[0] === 1) {
    const heading = fromHundredths(a[5]);
    return {
      kind: 'bomber',
      id: a[1],
      target: a[2],
      x: fromHundredths(a[3]),
      z: fromHundredths(a[4]),
      dx: Math.sin(heading),
      dz: Math.cos(heading),
      speed: fromHundredths(a[6]),
      life: fromTenths(a[7]),
      bombs: a[8].map(bombFrom),
    };
  }
  const unit = {
    id: a[1],
    target: a[2],
    wave: a[3],
    hits: a[4],
    home: a[5] === 1,
    x: fromHundredths(a[6]),
    z: fromHundredths(a[7]),
    heading: fromHundredths(a[8]),
    speed: fromHundredths(a[9]),
    life: fromTenths(a[10]),
    reload: fromHundredths(a[11]),
    shots: a[12],
    shells: a[13].map(bombFrom),
  };
  return a[0] === 2 ? { ...unit, kind: 'tank' } : { ...unit, kind: 'heli' };
}

/** A hole's results tally, back onto the hole. */
export function setTally(h: Hole, t: TallyWire): void {
  [h.kills, h.gulped] = [t[0], t[1]];
  h.wonderKinds = [...t[2]];
  h.wonders = t[2].length;
  h.biggest = t[3] ? { kind: t[3][0], points: t[3][1] } : null;
  h.eatenBy = t[4];
}

/** The round's clock and how it stands, back onto the world. */
export function setClock(w: World, c: ClockWire): void {
  w.elapsed = c[0] / 10;
  w.countdown = fromTenths(c[1]);
  w.status = STATUS[c[2]];
  w.endedBy = ENDED[c[3]];
  w.allOut = c[4] === 1;
}
