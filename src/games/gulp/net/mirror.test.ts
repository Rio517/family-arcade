import { util } from 'peerjs';
import { describe, expect, it } from 'vitest';
import { seededRng } from '@shared/rng';
import { WONDER_COUNT, MAPS, type MapId } from '../domain/city';
import { levelOf, speedOf } from '../domain/growth';
import { PERSON_ID } from '../domain/people';
import { createBrain, steerRival, type Brain, type Difficulty } from '../domain/rivals';
import { grow, rivals, still } from '../domain/testing';
import { dealWonders } from '../domain/wonders';
import { stepWorld, type HoleReport, type World, type WorldEvent } from '../domain/world';
import { CHECK_EVERY, EPOCH, reportFrom, snapshotOf, tickOf } from './codec';
import { applySnapshot, applyTick, createMirror, reportOf, stepMirror, type Mirror } from './mirror';
import { isGulpMsg, type GulpMsg, type StartMsg, type TickMsg } from './protocol';
import { buildRound } from './round';

const DT = 1 / 60;
/** The host steps at 60 a second and ticks every third step: 20 a second. */
const TICK_STEPS = 3;
/** Positions travel as hundredths: half a hundredth off on each axis at most. */
const NEAR = Math.SQRT2 * 0.005 + 1e-9;

/** A shared round on one table: the host's real world, a guest's mirror, and the wire between them. */
interface Table {
  host: World;
  mirror: Mirror;
  brain: Brain;
  reports: Map<number, HoleReport>;
  pending: WorldEvent[];
  /** The tick the host sends next, and the guest's report count. */
  seq: number;
  posSeq: number;
  step: number;
  /** The things the guest's scene shows, kept only from the events it is handed. */
  scene: Set<number>;
  /** Each tick's size in BinaryPack bytes, and the most events in one. */
  sizes: number[];
  mostEvents: number;
  /** What the guest's scene was handed, by type. */
  seen: Record<string, number>;
  problems: string[];
}

function startOf(map: MapId, difficulty: Difficulty, seed: number): StartMsg {
  return {
    t: 'start',
    seed,
    settings: { map, difficulty, duration: MAPS[map].minutes * 60, powerups: true, fightBack: true },
    wonders: dealWonders([], WONDER_COUNT[map], seededRng(seed + 1)).dealt,
    seats: [
      { name: 'Klara', skin: 0, human: true },
      { name: 'Rio', skin: 1, human: true },
      ...rivals(MAPS[map].rivals - 1).map((r) => ({ ...r, human: false })),
    ],
    you: 1,
  };
}

function sit(map: MapId, difficulty: Difficulty, seed = 2026): Table {
  const start = startOf(map, difficulty, seed);
  const host = buildRound(start);
  const mirror = createMirror(send(start).msg);
  return {
    host,
    mirror,
    // The host's child plays like a middling rival, as `play` in domain/testing.ts.
    brain: { ...createBrain(seededRng(seed + 50), 'easy'), skill: 0.6 },
    reports: new Map(),
    pending: [],
    seq: 0,
    posSeq: 0,
    step: 0,
    scene: new Set(mirror.world.props.keys()),
    sizes: [],
    mostEvents: 0,
    seen: {},
    problems: [],
  };
}

/** Over the wire as PeerJS sends it (BinaryPack): its size, and what the other device reads, which must pass the choke point. */
function send<T extends GulpMsg>(msg: T): { bytes: number; msg: T } {
  // PeerJS sends any data; BinaryPack's own type asks for index signatures the messages do not declare.
  const packed = util.pack(msg as unknown as Parameters<typeof util.pack>[0]) as ArrayBuffer;
  const read: unknown = util.unpack(packed);
  if (!isGulpMsg(read)) throw new Error(`a ${msg.t} message fails isGulpMsg`);
  return { bytes: packed.byteLength, msg: read as T };
}

/** Every number in a message is whole, so BinaryPack never packs a nine-byte double. */
function fractions(v: unknown): number {
  if (typeof v === 'number') return Number.isInteger(v) ? 0 : 1;
  if (Array.isArray(v)) return v.reduce((n: number, x) => n + fractions(x), 0);
  if (v && typeof v === 'object') return Object.values(v).reduce((n: number, x) => n + fractions(x), 0);
  return 0;
}

/** The guest steers a slow circle, once round about every 21 seconds. */
const circle = (i: number) => ({ x: Math.cos(i / 200 + 1), z: Math.sin(i / 200 + 1) });

/** What the guest's scene does with what it is handed: things go, rise and come back. */
function show(t: Table, events: WorldEvent[]): void {
  for (const e of events) {
    t.seen[e.type] = (t.seen[e.type] ?? 0) + 1;
    if (e.type === 'eat' || e.type === 'crumb') t.scene.delete(e.prop.id);
    else if (e.type === 'regrow' || e.type === 'park') t.scene.add(e.prop.id);
    else if (e.type === 'rebuild') {
      if (e.replaces) t.scene.delete(e.replaces.id);
      t.scene.add(e.prop.id);
    }
  }
}

/**
 * One frame on both devices: the guest steers its hole and takes in what has
 * come; the host steps the real round and, every third step, ticks. A
 * dropped tick is sent but never reaches the guest.
 */
function frame(t: Table, drop = false): TickMsg | null {
  show(t, stepMirror(t.mirror, DT, circle(t.step)));
  const me = t.host.holes[0];
  t.pending.push(...stepWorld(t.host, DT, me.alive ? steerRival(t.brain, me, t.host, DT, null) : still, t.reports));
  t.step += 1;
  if (t.step % TICK_STEPS) return null;
  const tick = tickOf(t.host, t.pending, t.seq++);
  t.pending = [];
  if (fractions(tick)) t.problems.push(`tick ${tick.seq} has fractions on the wire`);
  t.mostEvents = Math.max(t.mostEvents, tick.events.length);
  const { bytes, msg } = send(tick);
  t.sizes.push(bytes);
  if (!drop) show(t, applyTick(t.mirror, msg));
  t.reports.set(t.mirror.you, reportFrom(send(reportOf(t.mirror, t.posSeq++)).msg));
  return drop ? null : msg;
}

/** Everything the guest's copy must agree with the host on, after a tick. Problems are kept, not thrown, so one run lists them all. */
function compare(t: Table): void {
  const { host, mirror } = t;
  const w = mirror.world;
  const say = (what: string) => {
    if (t.problems.length < 40) t.problems.push(`tick ${t.seq - 1} (${host.elapsed.toFixed(1)} s): ${what}`);
  };
  const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol + 1e-9;

  if (w.props.size !== host.props.size) say(`${w.props.size} things stand on the guest, ${host.props.size} on the host`);
  const missing = [...host.props.keys()].find((id) => !w.props.has(id));
  if (missing !== undefined) say(`thing ${missing} is missing on the guest`);
  if (t.scene.size !== w.props.size || [...w.props.keys()].some((id) => !t.scene.has(id))) say(`the scene shows ${t.scene.size} things, the mirror has ${w.props.size}`);

  if (w.status !== host.status || w.endedBy !== host.endedBy || w.allOut !== host.allOut) say(`status ${w.status}, not ${host.status}`);
  if (!near(w.elapsed, host.elapsed, 0.1)) say(`clock ${w.elapsed}, not ${host.elapsed}`);

  host.holes.forEach((h, i) => {
    const g = w.holes[i];
    // This device's hole is steered here: the host has it from a report up to a tick old.
    const reach = i === mirror.you ? speedOf(h.r) * 1.6 * TICK_STEPS * DT * 1.5 : NEAR;
    const off = Math.hypot(g.x - h.x, g.z - h.z);
    if (h.alive && off > reach) say(`hole ${i} is ${off.toFixed(3)} from the host's`);
    if (!near(g.r, h.r, 0.005)) say(`hole ${i} r ${g.r}, not ${h.r}`);
    for (const k of ['score', 'lives', 'alive', 'respawns', 'streak', 'kills', 'gulped', 'wonders', 'eatenBy'] as const) {
      if (g[k] !== h[k]) say(`hole ${i} ${k} ${String(g[k])}, not ${String(h[k])}`);
    }
    if (JSON.stringify(g.biggest) !== JSON.stringify(h.biggest)) say(`hole ${i} biggest ${JSON.stringify(g.biggest)}`);
    for (const k of ['respawnIn', 'safe', 'speedTime', 'doubleTime', 'stun', 'burn'] as const) {
      const late = g[k] - h[k];
      if (!(g[k] === h[k] || (late >= -1e-9 && late <= 0.1 + 1e-9))) say(`hole ${i} ${k} ${g[k]}, not ${h[k]}`);
    }
  });

  const deadOrAlive = (wd: World) => wd.people.map((p) => (p.alive ? 1 : 0)).join('');
  if (deadOrAlive(w) !== deadOrAlive(host)) say('people about differ');

  const ids = (list: Array<{ id: number }>) => list.map((x) => x.id).join(',');
  if (ids(w.powerups) !== ids(host.powerups)) say(`power-ups ${ids(w.powerups)}, not ${ids(host.powerups)}`);
  host.powerups.forEach((p, i) => {
    const q = w.powerups[i];
    if (q && (q.kind !== p.kind || Math.hypot(q.x - p.x, q.z - p.z) > NEAR)) say(`power-up ${p.id} differs`);
  });
  if (ids(w.responders) !== ids(host.responders)) say(`police ${ids(w.responders)}, not ${ids(host.responders)}`);
  host.responders.forEach((r, i) => {
    const q = w.responders[i];
    if (q && (q.kind !== r.kind || q.state !== r.state || q.child !== r.child || Math.hypot(q.x - r.x, q.z - r.z) > NEAR || !near(q.heading, r.heading, 0.005))) {
      say(`police ${r.id} differs`);
    }
  });
  if (ids(w.attacks) !== ids(host.attacks)) say(`attacks ${ids(w.attacks)}, not ${ids(host.attacks)}`);
  host.attacks.forEach((a, i) => {
    const q = w.attacks[i];
    if (!q || q.kind !== a.kind || q.target !== a.target || Math.hypot(q.x - a.x, q.z - a.z) > NEAR) return say(`attack ${a.id} differs`);
    const bombs = (x: typeof a) => (x.kind === 'bomber' ? x.bombs : x.kind === 'tanker' ? [] : x.shells);
    const mine = bombs(q);
    bombs(a).forEach((b, k) => {
      if (mine[k]?.id !== b.id || !near(mine[k].fuse, b.fuse, 0.005)) say(`attack ${a.id} bomb ${b.id} differs`);
    });
  });
}

/** Play the table on, comparing after every tick the guest takes in, until `until` or the round's end. */
function playTo(t: Table, until: (t: Table) => boolean, each?: (t: Table) => void): void {
  while (!until(t) && t.host.status !== 'over') {
    each?.(t);
    if (frame(t)) compare(t);
  }
}

describe('a guest’s copy of a shared round', () => {
  it('fed every tick over BinaryPack, matches the host’s round at every tick, a level-20 giant and all', { timeout: 120_000 }, () => {
    const t = sit('region', 'medium');
    let giant = 0;
    const respawned = () => t.mirror.world.holes[t.mirror.you].respawns;
    playTo(
      t,
      (x) => x.host.elapsed >= x.host.options.duration,
      (x) => {
        // Part-way through, the host's child becomes a level-20 giant and starts swallowing blocks.
        if (!giant && x.host.elapsed >= 60) giant = levelOf(grow(x.host, 0, 90_000).r);
      },
    );
    expect(giant).toBeGreaterThanOrEqual(20);
    expect(t.problems).toEqual([]);
    // The round ran its course, and every kind of news crossed the wire.
    expect(t.host.elapsed).toBeGreaterThan(170);
    for (const type of ['eat', 'crumb', 'regrow', 'rebuild', 'park', 'back', 'gulp', 'respawn', 'boom', 'incoming', 'power', 'police', 'level']) {
      expect(t.seen[type] ?? 0, type).toBeGreaterThan(0);
    }
    expect(respawned()).toBeGreaterThan(0);
    expect(t.mirror.needSnapshot).toBe(false);
    // In BinaryPack bytes, as measured when this was written: typical 394, 99th percentile 506,
    // largest 3,336 (the giant's first bites, 485 events), and a snapshot at the end 14,289.
    // The largest tick fits one BinaryPack chunk (16,300 bytes).
    const sorted = [...t.sizes].sort((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length / 2)]).toBeLessThan(600);
    expect(sorted[sorted.length - 1]).toBeLessThan(16 * 1024);
    expect(t.mostEvents).toBeLessThan(2000);
    expect(send(snapshotOf(t.host, t.seq)).bytes).toBeLessThan(32 * 1024);
  });

  it('missing a stretch of ticks asks for a snapshot, and with it matches the host again', { timeout: 60_000 }, () => {
    const t = sit('mega', 'medium', 7);
    playTo(t, (x) => x.host.elapsed >= 30);
    grow(t.host, 0, 20_000);
    // Ten seconds of ticks are lost on the way, the giant eating all the while.
    for (let i = 0; i < 10 * 60; i++) frame(t, true);
    expect(t.mirror.needSnapshot).toBe(false);
    frame(t);
    frame(t);
    frame(t);
    expect(t.mirror.needSnapshot).toBe(true);
    // The host answers between two ticks, with bites in hand: the next tick repeats them, and they must not count twice.
    while (!(t.step % TICK_STEPS && t.pending.some((e) => e.type === 'eat'))) frame(t);
    const snap = send(snapshotOf(t.host, t.seq));
    expect(snap.bytes).toBeLessThan(64 * 1024);
    applySnapshot(t.mirror, snap.msg);
    expect(t.mirror.needSnapshot).toBe(false);
    t.problems = [];
    playTo(t, (x) => x.host.elapsed >= 70);
    expect(t.problems).toEqual([]);
    expect(t.mirror.needSnapshot).toBe(false);
  });

  it('a city that no longer adds up asks for a snapshot at the next check', () => {
    const t = sit('town', 'easy', 3);
    playTo(t, (x) => x.host.elapsed >= 5);
    expect(t.mirror.needSnapshot).toBe(false);
    // A thing goes missing on the guest only, as a bug in the mirror would lose it.
    const [id] = t.mirror.world.props.keys();
    t.mirror.world.props.delete(id);
    // Ticks without the check carry on as they were.
    while (t.seq % CHECK_EVERY !== 0) {
      frame(t);
      expect(t.mirror.needSnapshot).toBe(false);
    }
    while (t.seq % CHECK_EVERY === 0) frame(t);
    expect(t.mirror.needSnapshot).toBe(true);
  });

  it('a tick already seen is ignored, and one that skips ahead asks for a snapshot', () => {
    const t = sit('town', 'easy', 4);
    let last: TickMsg | null = null;
    while (!last || t.host.elapsed < 4) last = frame(t) ?? last;
    expect(applyTick(t.mirror, last)).toEqual([]);
    expect(t.mirror.needSnapshot).toBe(false);
    applyTick(t.mirror, { ...last, seq: last.seq + 2, events: [] });
    expect(t.mirror.needSnapshot).toBe(true);
  });

  it('other holes ease toward where the host says they are, and jump to where one comes back', () => {
    const t = sit('town', 'easy', 8);
    playTo(t, (x) => x.host.status === 'playing' && x.host.elapsed > 2);
    const w = t.mirror.world;
    const shown = w.holes[2].x;
    // The host has the hole ten units east of where this screen draws it.
    const tick = tickOf(t.host, [], t.seq++);
    tick.holes[2][0] = Math.round(shown * 100) + 1000;
    applyTick(t.mirror, tick);
    const aim = w.holes[2].x;
    expect(Math.abs(aim - shown - 10)).toBeLessThan(0.006);
    stepMirror(t.mirror, DT, null);
    expect(w.holes[2].x).toBeCloseTo(shown + (aim - shown) * (1 - Math.pow(0.001, DT)), 9);
    for (let i = 0; i < 60; i++) stepMirror(t.mirror, DT, null);
    expect(Math.abs(w.holes[2].x - aim)).toBeLessThan(0.02);
    // Swallowed and back on the far side of town: it is there at once, not sliding across.
    const back = tickOf(t.host, [], t.seq++);
    back.holes[2][0] = Math.round(aim * 100) + 9000;
    back.holes[2][15] += 1;
    applyTick(t.mirror, back);
    stepMirror(t.mirror, DT, null);
    expect(w.holes[2].x).toBeCloseTo(aim + 90, 9);
  });

  it('people walk on the guest, but only the host says who is swallowed and who comes back', () => {
    const t = sit('town', 'easy', 5);
    const w = t.mirror.world;
    w.status = 'playing';
    const person = w.people[0];
    const at = { x: person.x, z: person.z };
    // The guest's own hole right on top of them: they run, but nobody falls in here.
    const me = w.holes[t.mirror.you];
    me.x = person.x;
    me.z = person.z;
    me.r = 6;
    for (let i = 0; i < 30; i++) stepMirror(t.mirror, DT, null);
    expect(person.alive).toBe(true);
    expect(Math.hypot(person.x - at.x, person.z - at.z)).toBeGreaterThan(0.5);
    // Swallowed on the host's word, they stay swallowed here until it says they are back.
    applyTick(t.mirror, { ...tickOf(t.host, [], 0), events: [[0, PERSON_ID, 0, 1]] });
    expect(person.alive).toBe(false);
    for (let i = 0; i < 60 * 30; i++) stepMirror(t.mirror, DT, null);
    expect(person.alive).toBe(false);
    applyTick(t.mirror, { ...tickOf(t.host, [], 1), events: [[18, 0, -1, 2500]] });
    expect(person.alive).toBe(true);
  });
});

describe('reports after a hole comes back', () => {
  it('a report from before the guest’s hole came back does not drag it back; the guest jumps there and reports anew', () => {
    const t = sit('town', 'medium', 6);
    playTo(t, (x) => x.host.status === 'playing' && x.host.elapsed > 1);
    const { host, mirror } = t;
    const friend = host.holes[1];
    // The host's child grows huge and swallows the guest's hole.
    grow(host, 0, 3000);
    host.holes[0].x = friend.x;
    host.holes[0].z = friend.z;
    host.brains = host.brains.map(() => null);
    t.brain.skill = 0;
    playTo(t, (x) => !x.host.holes[1].alive);
    const swallowedAt = { x: friend.x, z: friend.z };
    // Keep the host from swallowing it again the moment it is back.
    host.holes[0].x = -host.city.half;
    host.holes[0].z = -host.city.half;
    const stale = t.reports.get(1);
    expect(stale?.life).toBe(0);
    // It comes back on the host; the guest has not heard yet, and its old report is all the host has.
    let steps = 0;
    while (friend.respawns === 0 && steps++ < 600) stepWorld(host, DT, still, t.reports);
    expect(friend.respawns).toBe(1);
    const backAt = { x: friend.x, z: friend.z };
    expect(Math.hypot(backAt.x - swallowedAt.x, backAt.z - swallowedAt.z)).toBeGreaterThan(5);
    for (let i = 0; i < 30; i++) stepWorld(host, DT, still, t.reports);
    expect({ x: friend.x, z: friend.z }).toEqual(backAt);
    // The next tick tells the guest: its hole jumps there and its reports start a new epoch.
    applyTick(mirror, tickOf(host, [], t.seq++));
    const mine = mirror.world.holes[1];
    expect(Math.hypot(mine.x - backAt.x, mine.z - backAt.z)).toBeLessThan(NEAR);
    const report = reportOf(mirror, t.posSeq++);
    expect(report.seq).toBeGreaterThanOrEqual(EPOCH);
    expect(reportFrom(report).life).toBe(1);
    // From there on the host follows the guest again.
    mirror.world.status = 'playing';
    for (let i = 0; i < 30; i++) stepMirror(mirror, DT, { x: 1, z: 0 });
    t.reports.set(1, reportFrom(reportOf(mirror, t.posSeq++)));
    for (let i = 0; i < 30; i++) stepWorld(host, DT, still, t.reports);
    expect(Math.hypot(friend.x - mine.x, friend.z - mine.z)).toBeLessThan(0.01);
  });
});
