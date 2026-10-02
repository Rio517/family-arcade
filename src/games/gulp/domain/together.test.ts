import { describe, expect, it } from 'vitest';
import { makeProp } from './catalog';
import { MAPS, type MapId } from './city';
import { speedOf } from './growth';
import { AWAY_WAIT, LIVES } from './holes';
import { POWER_SPEED } from './powerups';
import { steerRival, type Difficulty } from './rivals';
import { grow, only, round, still, together } from './testing';
import { comeBack, dropOut, standings, stepWorld, type HoleReport, type World, type WorldEvent } from './world';

const MAP_IDS: MapId[] = ['town', 'city', 'mega', 'region'];
const LEVELS: Difficulty[] = ['easy', 'medium', 'hard'];

/** One step with hole 0 held still and these reports for the other children. */
const step = (w: World, reports?: ReadonlyMap<number, HoleReport>) => stepWorld(w, 1 / 60, still, reports);
const report = (id: number, at: HoleReport) => new Map([[id, at]]);

/** Children (and computer holes) in an empty city with nobody walking, the computer holes held still. */
function quiet(difficulty: Difficulty, kids = 2, n = 0, seed = 1) {
  const w = together(seed, kids, n, { difficulty });
  only(w, []);
  w.people = [];
  w.brains = w.brains.map(() => null);
  return w;
}

describe('several children in one round', () => {
  it('the children take holes 0 onwards, then the computer holes; each has lives and a police count', () => {
    const w = together(1, 2, 3, { difficulty: 'medium' });
    expect(w.holes.map((h) => h.id)).toEqual([0, 1, 2, 3, 4]);
    expect(w.holes.map((h) => h.isPlayer)).toEqual([true, true, false, false, false]);
    expect(w.holes.slice(0, 2).map((h) => h.name)).toEqual(['You', 'Ada']);
    expect(w.brains.map((b) => b === null)).toEqual([true, true, false, false, false]);
    expect(w.holes.every((h) => h.lives === LIVES.medium)).toBe(true);
    expect(w.police).toHaveLength(2);
    w.holes[1].score = 300;
    w.holes[3].score = 200;
    expect(standings(w).map((h) => h.id)).toEqual([1, 3, 0, 2, 4]);
  });

  it('hole 0 follows this device; another child is placed where their device says, and waits with no report', () => {
    const w = quiet('medium');
    const [me, friend] = w.holes;
    const x0 = me.x;
    const at = { x: friend.x, z: friend.z };
    for (let i = 0; i < 60; i++) stepWorld(w, 1 / 60, { x: 1, z: 0 });
    expect(me.x).toBeGreaterThan(x0 + 6);
    expect({ x: friend.x, z: friend.z, vx: friend.vx, vz: friend.vz }).toEqual({ ...at, vx: 0, vz: 0 });
    // A report a little way off: the hole is there, moving as reported, and eats what it covers.
    only(w, [makeProp(1, 'cone', at.x + 0.1, at.z, 0)]);
    const events = step(w, report(1, { x: at.x + 0.1, z: at.z, vx: 6, vz: 0 }));
    expect(friend.x).toBeCloseTo(at.x + 0.1, 9);
    expect(friend.vx).toBe(6);
    expect(events).toContainEqual(expect.objectContaining({ type: 'eat', hole: 1, prop: expect.objectContaining({ kind: 'cone' }) }));
    // The next step without a report, it waits there.
    step(w);
    expect({ x: friend.x, vx: friend.vx }).toEqual({ x: at.x + 0.1, vx: 0 });
  });

  it('a reported hole moves no faster than its top speed allows, and stays on land', () => {
    const w = quiet('medium');
    const friend = w.holes[1];
    /** How far the hole goes in one step toward a report far to the east. */
    const moved = () => {
      const [x0, z0] = [friend.x, friend.z];
      step(w, report(1, { x: friend.x + 100, z: friend.z, vx: 500, vz: 0 }));
      return Math.hypot(friend.x - x0, friend.z - z0);
    };
    const top = speedOf(friend.r) / 60;
    const d = moved();
    expect(d).toBeGreaterThan(top);
    expect(d).toBeLessThan(top * 1.5);
    // The reported speed is held to the top speed too.
    expect(friend.vx).toBeCloseTo(speedOf(friend.r), 9);
    // The speed power-up counts, and so does a knock.
    friend.speedTime = 5;
    expect(moved()).toBeGreaterThan(top * POWER_SPEED);
    expect(moved()).toBeLessThan(top * POWER_SPEED * 1.5);
    friend.speedTime = 0;
    friend.stun = 1;
    expect(moved()).toBeLessThan(top * 0.35 * 1.5);
    friend.stun = 0;
    // A report out past the shore: the hole goes as far as the land does.
    for (let i = 0; i < 60 * 60; i++) step(w, report(1, { x: w.city.land + 80, z: w.city.land + 80, vx: 0, vz: 0 }));
    expect(friend.x).toBeLessThanOrEqual(w.city.land);
    expect(friend.z).toBeLessThanOrEqual(w.city.land);
    expect(friend.x).toBeGreaterThan(w.city.land - 10);
    // A broken report is no report: the hole waits.
    const at = { x: friend.x, z: friend.z };
    step(w, report(1, { x: Number.NaN, z: 0, vx: 0, vz: 0 }));
    expect({ x: friend.x, z: friend.z }).toEqual(at);
  });

  it('the police come for the second child too, and their officers stand round that child', () => {
    const w = quiet('easy');
    const [me, friend] = w.holes;
    // Each child's count is their own.
    only(w, [makeProp(1, 'cone', friend.x, friend.z, 0)]);
    step(w);
    expect(w.police.map((p) => p.eaten)).toEqual([0, 1]);
    for (const p of w.police) p.cool = 0;
    w.police[1].eaten = 35;
    expect(step(w)).toContainEqual({ type: 'police', x: friend.x, z: friend.z });
    expect(w.police[1].eaten).toBe(0);
    expect(w.responders.map((r) => [r.kind, r.child])).toEqual([
      ['car', 1],
      ['car', 1],
    ]);
    const events: WorldEvent[] = [];
    for (let i = 0; i < 60 * 20; i++) events.push(...step(w));
    expect(events.filter((e) => e.type === 'park')).toHaveLength(2);
    expect(w.responders.map((r) => r.kind)).toEqual(['officer', 'officer', 'officer', 'officer']);
    for (const r of w.responders) {
      expect(r.child).toBe(1);
      expect(Math.hypot(r.x - friend.x, r.z - friend.z)).toBeLessThan(friend.r + 8);
      expect(Math.hypot(r.x - me.x, r.z - me.z)).toBeGreaterThan(40);
    }
  });

  it('on Easy nobody swallows a child: neither another child nor a computer hole', () => {
    const w = quiet('easy', 2, 1);
    const [me, friend, rival] = w.holes;
    grow(w, 0, 400);
    grow(w, 2, 400);
    friend.x = me.x;
    friend.z = me.z;
    expect(step(w).filter((e) => e.type === 'gulp')).toEqual([]);
    friend.x = rival.x;
    friend.z = rival.z;
    expect(step(w).filter((e) => e.type === 'gulp')).toEqual([]);
    expect(friend.alive).toBe(true);
  });

  it('on Medium and Hard the children can swallow each other, either way round', () => {
    for (const difficulty of ['medium', 'hard'] as const) {
      const w = quiet(difficulty);
      const [me, friend] = w.holes;
      grow(w, 0, 400);
      friend.x = me.x + 1;
      friend.z = me.z;
      expect(step(w)).toContainEqual(expect.objectContaining({ type: 'gulp', eater: 0, eaten: 1 }));
      expect(friend.alive).toBe(false);
      expect(friend.lives).toBe(LIVES[difficulty] - 1);
      expect(friend.eatenBy).toBe('You');
    }
    // The friend, steered on their own device, swallows hole 0.
    const w = quiet('medium');
    const [me, friend] = w.holes;
    grow(w, 1, 400);
    friend.x = me.x + 1;
    friend.z = me.z;
    const score = friend.score;
    const events = step(w, report(1, { x: me.x + 0.9, z: me.z, vx: 0, vz: 0 }));
    expect(events).toContainEqual({ type: 'gulp', eater: 1, eaten: 0, points: friend.score - score });
    expect(me.alive).toBe(false);
    expect(me.eatenBy).toBe('Ada');
  });

  it('the round ends only when every child is out of lives; every computer hole out, and the children have won it', () => {
    const w = quiet('hard', 2, 1);
    const [me, friend, rival] = w.holes;
    grow(w, 2, 3000);
    me.lives = 1;
    me.x = rival.x;
    me.z = rival.z;
    expect(step(w)).toContainEqual({ type: 'out', hole: 0 });
    for (let i = 0; i < 60 * 5; i++) step(w);
    expect(w.status).toBe('playing');
    expect(me.alive).toBe(false);
    friend.lives = 1;
    friend.x = rival.x;
    friend.z = rival.z;
    expect(step(w)).toContainEqual({ type: 'out', hole: 1 });
    expect(w.status).toBe('over');
    expect(w.endedBy).toBe('out');

    const v = quiet('medium', 2, 1, 2);
    const [kid, , last] = v.holes;
    grow(v, 0, 3000);
    last.lives = 1;
    last.x = kid.x;
    last.z = kid.z;
    step(v);
    expect(v.status).toBe('over');
    expect(v.endedBy).toBe('last');
  });
});

describe('a child whose device drops out', () => {
  it('their hole waits, still and safe: it swallows nobody, nobody swallows it, and it eats nothing', () => {
    const w = quiet('medium');
    const [me, friend] = w.holes;
    dropOut(w, 1);
    const at = { x: friend.x, z: friend.z };
    // A report that turns up late is no use: the hole stays where it was.
    step(w, report(1, { x: at.x + 1, z: at.z, vx: 6, vz: 0 }));
    expect({ x: friend.x, z: friend.z, vx: friend.vx }).toEqual({ ...at, vx: 0 });
    expect(friend.safe).toBeGreaterThan(0);
    grow(w, 0, 400);
    me.x = at.x + 1;
    me.z = at.z;
    expect(step(w).filter((e) => e.type === 'gulp')).toEqual([]);
    grow(w, 0, 0);
    grow(w, 1, 400);
    only(w, [makeProp(1, 'cone', at.x - 2, at.z, 0)]);
    expect(step(w).filter((e) => e.type === 'gulp' || e.type === 'eat')).toEqual([]);
    expect(me.alive).toBe(true);
    expect(w.props.has(1)).toBe(true);
  });

  it('after a while a computer brain plays their hole, and hands it back when the device returns', () => {
    const w = quiet('medium');
    const friend = w.holes[1];
    dropOut(w, 1);
    for (let t = 0; t < AWAY_WAIT - 1; t += 1 / 60) step(w);
    expect(w.brains[1]).toBeNull();
    for (let t = 0; t < 2; t += 1 / 60) step(w);
    expect(w.brains[1]).not.toBeNull();
    // A moment of safety as the wait ends, as after coming back; then it plays like anyone.
    expect(friend.safe).toBe(0);
    expect(comeBack(w, 1)).toBe(true);
    expect(w.brains[1]).toBeNull();
    expect(friend.away).toBeNull();
    const x = friend.x;
    step(w, report(1, { x: x + 0.1, z: friend.z, vx: 6, vz: 0 }));
    expect(friend.x).toBeCloseTo(x + 0.1, 9);
    // Back before the wait was over: nobody played it.
    dropOut(w, 1);
    step(w);
    expect(comeBack(w, 1)).toBe(false);
  });

  it("the rivals' kindness is measured against the children still playing", () => {
    const w = quiet('easy', 2, 1);
    const [me, friend] = w.holes;
    me.score = 500;
    friend.score = 0;
    dropOut(w, 1);
    const brain = { skill: 0.7, pace: 1, target: null, rethink: 0, wobble: 0 };
    const rival = w.holes[2];
    rival.score = 600;
    steerRival(brain, rival, w, 1 / 60, me);
    const near = brain.pace;
    steerRival(brain, rival, w, 1 / 60, friend);
    // Measured against the friend far behind, a rival would crawl; the step uses me.
    expect(brain.pace).toBeLessThan(near);
    w.brains[2] = brain;
    step(w);
    expect(brain.pace).toBeCloseTo(near, 9);
  });
});

describe('the computer holes with several children', () => {
  it("the rivals' pace is set by the child furthest behind who is still in the round", () => {
    const w = together(1, 2, 1, { difficulty: 'medium' });
    only(w, []);
    w.people = [];
    const [me, friend, rival] = w.holes;
    const brain = w.brains[2]!;
    rival.score = 5000;
    me.score = 5000;
    friend.score = 1000;
    step(w);
    // Far ahead of the friend, though level with hole 0: it eases right off.
    expect(brain.pace).toBeCloseTo((1 - (1 - 0.35) * 0.6) * 0.85, 9);
    // The friend out of lives no longer counts: level with hole 0, it hardly slows.
    friend.lives = 0;
    friend.alive = false;
    friend.respawnIn = Infinity;
    step(w);
    expect(brain.pace).toBeCloseTo((1 - (1 - 0.85) * 0.6) * 0.85, 9);
  });

  it('on Medium a rival goes after the child who is clearly ahead of it, not the one behind', () => {
    const w = together(1, 2, 1, { difficulty: 'medium' });
    only(w, []);
    const [me, friend, rival] = w.holes;
    grow(w, 2, 900);
    rival.score = 1000;
    me.score = 500;
    friend.score = 1500;
    me.x = rival.x + 15;
    me.z = rival.z;
    friend.x = rival.x - 20;
    friend.z = rival.z;
    const brain = w.brains[2]!;
    const chased = new Set<number>();
    for (let i = 0; i < 60 * 4; i++) {
      steerRival(brain, rival, w, 1 / 60, me);
      if (brain.target?.kind === 'hole') chased.add(brain.target.id);
    }
    expect([...chased]).toEqual([1]);
  });
});

describe('the city with several children', () => {
  it('power-ups turn up near each of the children', () => {
    const w = together(1, 2, 0, { powerups: true });
    only(w, []);
    w.people = [];
    const [me, friend] = w.holes;
    const near = [0, 0];
    for (let i = 0; i < 60; i++) {
      w.powerups = [];
      w.nextPower = 0;
      step(w);
      for (const p of w.powerups) near[Math.hypot(p.x - me.x, p.z - me.z) < Math.hypot(p.x - friend.x, p.z - friend.z) ? 0 : 1] += 1;
    }
    expect(near[0]).toBeGreaterThan(10);
    expect(near[1]).toBeGreaterThan(10);
  });

  it('the city rebuilds near each child in turn', () => {
    const w = together(1, 2, 0, { duration: 0 });
    only(w, []);
    w.people = [];
    const [me, friend] = w.holes;
    w.elapsed = 300;
    // Lots waiting round each child, those by hole 0 eaten first (so they are the oldest too).
    const lots = (h: World['holes'][number], count: number) =>
      Array.from({ length: count }, (_, k) => ({ x: h.x + 30 * Math.cos(k), z: h.z + 30 * Math.sin(k), rot: 0, room: 8, rung: 0, due: 0, site: null }));
    w.lots = [...lots(me, 12), ...lots(friend, 6)];
    const sites: number[] = [];
    for (let i = 0; i < 60 * 2 && sites.length < 10; i++) {
      for (const e of step(w)) {
        if (e.type === 'rebuild') sites.push(Math.hypot(e.prop.x - me.x, e.prop.z - me.z) < Math.hypot(e.prop.x - friend.x, e.prop.z - friend.z) ? 0 : 1);
      }
    }
    expect(sites.length).toBeGreaterThanOrEqual(10);
    expect(sites.filter((s) => s === 1).length).toBeGreaterThan(0);
  });
});

describe('where the children start', () => {
  it('each child starts on a spot of their own, on land and spread out, on every map and level', () => {
    for (const map of MAP_IDS) {
      for (const difficulty of LEVELS) {
        for (const seed of [1, 2, 3]) {
          for (const kids of [2, 3, 4]) {
            const w = together(seed, kids, MAPS[map].rivals + 1 - kids, { map, difficulty });
            const label = `${map} ${difficulty} seed ${seed}, ${kids} children`;
            const children = w.holes.slice(0, kids);
            for (const c of children) {
              expect(Math.abs(c.x) <= w.city.half && Math.abs(c.z) <= w.city.half, label).toBe(true);
              for (const o of w.holes) if (o !== c) expect(Math.hypot(o.x - c.x, o.z - c.z), label).toBeGreaterThan(0);
              for (const o of children) if (o !== c) expect(Math.hypot(o.x - c.x, o.z - c.z), label).toBeGreaterThanOrEqual(39);
            }
          }
        }
      }
    }
  });

  it('on Easy and Medium the first child starts where a child playing alone would, and the others in parks of their own while there are parks', () => {
    for (const map of MAP_IDS) {
      for (const difficulty of ['easy', 'medium'] as const) {
        for (const seed of [1, 2, 3]) {
          const label = `${map} ${difficulty} seed ${seed}`;
          const alone = round(seed, MAPS[map].rivals, { map, difficulty }).holes[0];
          const w = together(seed, 2, MAPS[map].rivals - 1, { map, difficulty });
          expect([w.holes[0].x, w.holes[0].z], label).toEqual([alone.x, alone.z]);
          const parks = w.city.blockList.filter((b) => b.kind === 'park');
          const inPark = (h: World['holes'][number]) => parks.findIndex((b) => h.x > b.x && h.x < b.x + b.size && h.z > b.z && h.z < b.z + b.size);
          const used = w.holes.slice(0, 2).map(inPark);
          expect(used.every((i) => i >= 0), label).toBe(true);
          expect(used[0], label).not.toBe(used[1]);
        }
      }
    }
  });
});
