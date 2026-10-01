import { describe, expect, it } from 'vitest';
import { seededRng } from '@shared/rng';
import { KINDS, footSize, makeProp } from './catalog';
import { MAPS } from './city';
import { massFor } from './growth';
import { createBrain, steerRival } from './rivals';
import { grow, only, play, rivals, round, still } from './testing';
import { createWorld, endRound, levelOf, stepWorld, type WorldEvent } from './world';

describe('the round', () => {
  it('counts down, plays, and ends on time', () => {
    const w = createWorld(seededRng(2), { name: 'You', skin: 0 }, [], { duration: 2 });
    expect(w.status).toBe('countdown');
    for (let i = 0; i < 3.1 * 60; i++) stepWorld(w, 1 / 60, still);
    expect(w.status).toBe('playing');
    for (let i = 0; i < 2.1 * 60; i++) stepWorld(w, 1 / 60, still);
    expect(w.status).toBe('over');
  });

  it('an endless round runs until someone ends it', () => {
    const w = round(3, 0, { duration: 0 });
    for (let i = 0; i < 60 * 60; i++) stepWorld(w, 1 / 30, still);
    expect(w.status).toBe('playing');
    endRound(w);
    expect(w.status).toBe('over');
  });

  it('attract mode is just rivals roaming', () => {
    const w = createWorld(seededRng(5), null, rivals(5));
    expect(w.status).toBe('playing');
    expect(w.holes.every((h) => !h.isPlayer)).toBe(true);
    for (let i = 0; i < 60 * 10; i++) stepWorld(w, 1 / 60, null);
    expect(w.holes.some((h) => h.score > 0)).toBe(true);
  });

  it('the points each eat reports add up to the score, with combos and double points', () => {
    const w = round(2, 0, { powerups: true, fightBack: true, duration: 0 });
    const brain = { ...createBrain(seededRng(52), 'easy'), skill: 0.7 };
    const me = w.holes[0];
    let sum = 0;
    let boosted = 0;
    for (let i = 0; i < 30 * 90; i++) {
      // Double points for a while, so the popups have more than the plain points to show.
      if (i === 30 * 20) me.doubleTime = 10;
      for (const e of stepWorld(w, 1 / 30, steerRival(brain, me, w, 1 / 30, null))) {
        if (e.type !== 'eat' || e.hole !== 0) continue;
        sum += e.gained;
        if (e.gained > e.prop.points) boosted += 1;
      }
    }
    expect(me.score).toBeGreaterThan(0);
    expect(boosted).toBeGreaterThan(0);
    expect(sum).toBe(me.score);
  });
});

describe('where the child starts', () => {
  const maps = ['town', 'city', 'mega', 'region'] as const;

  it('starts in a park on easy and medium, with things to eat all round', () => {
    for (const map of maps) {
      for (const difficulty of ['easy', 'medium'] as const) {
        for (const seed of [1, 2, 3]) {
          const w = round(seed, 5, { map, difficulty });
          const me = w.holes[0];
          const park = w.city.blockList.find((b) => b.kind === 'park' && me.x > b.x && me.x < b.x + b.size && me.z > b.z && me.z < b.z + b.size);
          expect(park, `${map} ${difficulty} seed ${seed}`).toBeDefined();
          // Trees, bushes, benches and people within a few steps.
          const near = w.city.props.filter((p) => Math.hypot(p.x - me.x, p.z - me.z) < 12 && ['tree', 'pine', 'bush', 'bench', 'sitter', 'planter'].includes(p.kind));
          expect(near.length, `${map} ${difficulty} seed ${seed}`).toBeGreaterThanOrEqual(8);
          // Nothing it cannot eat stands on the spot.
          expect(w.city.props.some((p) => Math.hypot(p.x - me.x, p.z - me.z) < me.r && p.size > me.r)).toBe(false);
        }
      }
    }
  });

  it('starts anywhere on hard, on a crossing no rival starts on', () => {
    const starts = new Set<string>();
    for (const map of maps) {
      for (const seed of [1, 2, 3, 4]) {
        const w = round(seed, 5, { map, difficulty: 'hard' });
        const [me, ...others] = w.holes;
        expect(w.city.roads).toContain(me.x);
        expect(w.city.roads).toContain(me.z);
        for (const o of others) expect(o.x === me.x && o.z === me.z).toBe(false);
        starts.add(`${map}:${me.x}:${me.z}`);
      }
    }
    // Not the same crossing every time.
    expect(starts.size).toBeGreaterThan(8);
  });
});

describe('a round against the computer is fair and fun', () => {
  it('a steady player climbs the levels in a two-minute city round, nearly always places, and wins some', () => {
    const results = [1, 2, 3, 4, 5, 6].map((s) => play(s, 0.7));
    for (const r of results) {
      expect(r.level).toBeGreaterThanOrEqual(4);
      // Never last, whatever part of the city the round sends it to.
      expect(r.rank).toBeLessThan(MAPS.city.rivals + 1);
    }
    // Nearly always placed: one round in a thin part of the city at most.
    expect(results.filter((r) => r.rank <= 4).length).toBeGreaterThanOrEqual(5);
    expect(results.filter((r) => r.rank <= 3).length).toBeGreaterThanOrEqual(4);
    expect(results.filter((r) => r.rank === 1).length).toBeGreaterThanOrEqual(2);
  });

  it('a wobbly player still grows and nearly always finishes in the top four', () => {
    const results = [1, 2, 3, 4, 5, 6].map((s) => play(s, 0.25));
    for (const r of results) expect(r.level).toBeGreaterThanOrEqual(4);
    // One thin round at most: a wobbly start in a sparse district can leave
    // the child behind a pack of rivals that are all crawling to let it catch up.
    expect(results.filter((r) => r.rank <= 4).length).toBeGreaterThanOrEqual(5);
  });

  it('with power-ups and the city fighting back, the round still plays out', () => {
    for (const s of [1, 2, 3]) expect(play(s, 0.7, 'city', { powerups: true, fightBack: true }).level).toBeGreaterThanOrEqual(4);
  });

  it('the city puts small things back, so a round never runs dry', () => {
    const { w } = play(3, 0.7);
    expect(w.props.size / w.city.props.length).toBeGreaterThan(0.08);
    const w2 = round(1, 0);
    const me = w2.holes[0];
    only(w2, [makeProp(1, 'cone', me.x, me.z, 0)]);
    stepWorld(w2, 1 / 60, still);
    expect(w2.props.size).toBe(0);
    // Nothing comes back under the hole's nose…
    for (let i = 0; i < 60 * 3; i++) stepWorld(w2, 1 / 60, still);
    expect(w2.props.size).toBe(0);
    // …but once it has gone, the cone is put back.
    const events: WorldEvent[] = [];
    for (let i = 0; i < 60 * 8; i++) events.push(...stepWorld(w2, 1 / 60, { x: 1, z: 0 }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'regrow' }));
    expect(w2.props.size).toBe(1);
  });

  it('only the child can swallow a wonder, which scores its bonus without ballooning the hole', () => {
    const w = round(1, 1);
    const [me, rival] = w.holes;
    w.brains[1] = null;
    grow(w, 0, 6000);
    grow(w, 1, 6000);
    rival.x = me.x + 60;
    only(w, [makeProp(1, 'leaning', me.x, me.z, 0), makeProp(2, 'leaning', rival.x, rival.z, 0)]);
    const massBefore = me.mass;
    const events = stepWorld(w, 1 / 60, still);
    expect(events).toContainEqual(expect.objectContaining({ type: 'wonder', hole: 0, name: 'the Leaning Tower of Pisa' }));
    expect(me.score).toBeGreaterThanOrEqual(KINDS.leaning.wonder!.bonus);
    expect(me.wonders).toBe(1);
    expect(me.mass - massBefore).toBeLessThan(1000);
    expect(w.props.has(2)).toBe(true);
  });

  it('a hole can drive over the bridge to the islet', () => {
    const w = round(1, 0);
    only(w, []);
    const me = w.holes[0];
    const bridge = w.city.extraLand.find((l) => l.kind === 'bridge')!;
    me.x = (bridge.x0 + bridge.x1) / 2;
    me.z = -w.city.half + 5;
    for (let i = 0; i < 60 * 14; i++) stepWorld(w, 1 / 60, { x: 0, z: -1 });
    const islet = w.city.extraLand.find((l) => l.kind === 'islet')!;
    expect(me.z).toBeLessThan(islet.z1);
    expect(me.z).toBeGreaterThanOrEqual(islet.z0);
  });

  it('the Region has a military base; with the city fighting back, its army comes for a big hole', () => {
    const w = round(3, 0, { map: 'region', fightBack: true });
    expect(w.city.base).not.toBeNull();
    const kinds = new Set(w.city.props.map((p) => p.kind));
    for (const k of ['hangar', 'barracks', 'tank', 'helicopter', 'radar', 'watchtower'] as const) expect(kinds.has(k)).toBe(true);
    only(w, []);
    const me = grow(w, 0, 900);
    const base = w.city.base!;
    me.x = base.x + 60;
    me.z = base.z;
    const seen = new Set<string>();
    for (let tries = 0; tries < 20; tries++) {
      w.attacks = [];
      w.nextAttack = 0;
      for (const e of stepWorld(w, 1 / 60, still)) if (e.type === 'incoming') seen.add(e.kind);
    }
    expect(seen.has('tank') || seen.has('heli')).toBe(true);
  });

  it('a tank fires at a hole that stays put, and a big enough hole swallows it', () => {
    const w = round(4, 0, { map: 'region', fightBack: true });
    only(w, []);
    const me = grow(w, 0, 900);
    w.nextAttack = 999;
    w.attacks = [{ id: 1, wave: 1, hits: 0, home: false, kind: 'tank', target: 0, shots: 3, x: me.x + 40, z: me.z, heading: -Math.PI / 2, speed: 6, life: 40, reload: 0.5, shells: [] }];
    const events: WorldEvent[] = [];
    for (let i = 0; i < 60 * 4; i++) events.push(...stepWorld(w, 1 / 60, still));
    expect(events).toContainEqual({ type: 'hurt', hole: 0, cause: 'bomb' });
    // Now drive into it.
    const tank = w.attacks[0];
    me.stun = 0;
    const got: WorldEvent[] = [];
    for (let i = 0; i < 60 * 8 && w.attacks.length; i++) got.push(...stepWorld(w, 1 / 60, { x: Math.sign(tank.x - me.x), z: 0 }));
    expect(got).toContainEqual(expect.objectContaining({ type: 'eat', prop: expect.objectContaining({ kind: 'tank' }) }));
  });

  it('the rockets from a helicopter miss a hole that keeps moving', () => {
    const w = round(5, 0, { map: 'region', fightBack: true });
    only(w, []);
    const me = grow(w, 0, 900);
    w.nextAttack = 999;
    w.attacks = [{ id: 1, wave: 1, hits: 0, home: false, kind: 'heli', target: 0, shots: 3, x: me.x + 30, z: me.z, heading: 0, speed: 28, life: 12, reload: 0.3, shells: [] }];
    const events: WorldEvent[] = [];
    // Weave back and forth across the road.
    for (let i = 0; i < 60 * 10; i++) events.push(...stepWorld(w, 1 / 60, { x: 0, z: Math.sin(i / 50) > 0 ? 1 : -1 }));
    expect(events.filter((e) => e.type === 'boom').length).toBeGreaterThan(1);
    expect(events.filter((e) => e.type === 'hurt').length).toBeLessThanOrEqual(1);
  });

  it('swallows what it covers: a lamp post at the start, a van at level three', () => {
    const w = round(1, 0);
    const me = w.holes[0];
    only(w, [makeProp(1, 'lamp', me.x, me.z, 0)]);
    expect(stepWorld(w, 1 / 60, still)).toContainEqual(expect.objectContaining({ type: 'eat' }));
    // A hole just big enough to cover a van swallows it.
    const w2 = round(1, 0);
    const h = w2.holes[0];
    h.r = footSize('van') / 0.92 + 0.05;
    h.mass = massFor(h.r);
    expect(levelOf(h.r)).toBeLessThanOrEqual(3);
    only(w2, [makeProp(1, 'van', h.x, h.z, 0)]);
    expect(stepWorld(w2, 1 / 60, still)).toContainEqual(expect.objectContaining({ type: 'eat' }));
  });

  it('lives: three on Hard, five on Medium, none to lose on Easy; the last one puts a hole out for good', () => {
    const lives = (difficulty: 'easy' | 'medium' | 'hard') => round(1, 2, { difficulty }).holes.map((h) => h.lives);
    expect(lives('hard')).toEqual([3, 3, 3]);
    expect(lives('medium')).toEqual([5, 5, 5]);
    expect(lives('easy')).toEqual([Infinity, Infinity, Infinity]);

    const w = round(1, 2, { difficulty: 'hard' });
    only(w, []);
    w.brains = w.brains.map(() => null);
    const [, big, small] = w.holes;
    grow(w, 1, 3000);
    small.lives = 1;
    small.x = big.x;
    small.z = big.z;
    const events = stepWorld(w, 1 / 60, still);
    expect(events).toContainEqual({ type: 'out', hole: small.id });
    expect(small.alive).toBe(false);
    for (let i = 0; i < 60 * 10; i++) stepWorld(w, 1 / 60, still);
    expect(small.alive).toBe(false);
    expect(w.status).toBe('playing');
  });

  it('the child out of lives ends the round; every computer hole out, and the child has won it', () => {
    const w = round(1, 1, { difficulty: 'hard' });
    only(w, []);
    w.brains = w.brains.map(() => null);
    const [me, rival] = w.holes;
    grow(w, 1, 3000);
    me.lives = 1;
    me.x = rival.x;
    me.z = rival.z;
    stepWorld(w, 1 / 60, still);
    expect(w.status).toBe('over');
    expect(w.endedBy).toBe('out');

    const v = round(2, 1, { difficulty: 'medium' });
    only(v, []);
    v.brains = v.brains.map(() => null);
    const [child, other] = v.holes;
    grow(v, 0, 3000);
    other.lives = 1;
    other.x = child.x;
    other.z = child.z;
    stepWorld(v, 1 / 60, still);
    expect(v.status).toBe('over');
    expect(v.endedBy).toBe('last');

    // An endless round goes on: the news, and the city is the child's until they end it.
    const e = round(3, 1, { difficulty: 'medium', duration: 0 });
    only(e, []);
    e.brains = e.brains.map(() => null);
    const [kid, last] = e.holes;
    grow(e, 0, 3000);
    last.lives = 1;
    last.x = kid.x;
    last.z = kid.z;
    expect(stepWorld(e, 1 / 60, still)).toContainEqual(expect.objectContaining({ type: 'news', text: 'Every rival is out: the city is all yours!' }));
    for (let i = 0; i < 60 * 5; i++) stepWorld(e, 1 / 60, still);
    expect(e.status).toBe('playing');
    endRound(e);
    expect(e.endedBy).toBe('last');
  });

  it('a hole can go out over the water off the port quay, so the moored ships are in reach', () => {
    const w = round(2, 0, { map: 'mega' });
    const port = w.city.port!;
    const ship = [...w.props.values()].find((p) => p.kind === 'ship')!;
    const me = grow(w, 0, 40000);
    me.x = ship.x;
    me.z = ship.z;
    only(w, [ship]);
    // Standing right on the ship, out on the water: allowed, and it goes down.
    const events = stepWorld(w, 1 / 60, still);
    expect(Math.hypot(me.x - ship.x, me.z - ship.z)).toBeLessThan(1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'eat', prop: expect.objectContaining({ kind: 'ship' }) }));
    expect(port.side).toBeDefined();
  });
});
