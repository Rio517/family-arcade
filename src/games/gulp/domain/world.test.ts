import { describe, expect, it } from 'vitest';
import { seededRng } from '@shared/rng';
import { footSize, makeProp, type Prop } from './catalog';
import { MAPS, type MapId } from './city';
import { createBrain, steerRival, type Difficulty } from './rivals';
import {
  comboOf,
  POWER_TIME,
  RESPAWN,
  START_R,
  canEat,
  createWorld,
  endRound,
  levelOf,
  levelProgress,
  massFor,
  nextLabel,
  radiusFor,
  speedOf,
  standings,
  stepWorld,
  type Options,
  type World,
  type WorldEvent,
} from './world';

const NAMES = ['Big Gulp', 'Sir Slurps', 'Nom Nom', 'Hungry Hattie', 'Captain Crumbs', 'Munch Bunch', 'Gobbler', 'Chompers', 'Slurpy Sue'];
const rivals = (n: number) => NAMES.slice(0, n).map((name, i) => ({ name, skin: i + 1 }));
const still = { x: 0, z: 0 };

/** A round with no countdown, the child and `n` computer holes, nothing switched on. */
const round = (seed = 1, n = 0, opts: Partial<Options> = {}) =>
  createWorld(seededRng(seed), { name: 'You', skin: 0 }, rivals(n), {
    duration: 120,
    countdown: 0,
    powerups: false,
    fightBack: false,
    ...opts,
  });

/** Clear the city and put exactly these things in it. */
function only(w: World, props: Prop[]): void {
  w.props = new Map(props.map((p) => [p.id, p]));
  w.grid = new Map();
  for (const p of props) {
    const key = `${Math.floor(p.x / 12)}:${Math.floor(p.z / 12)}`;
    w.grid.set(key, [...(w.grid.get(key) ?? []), p.id]);
  }
}

/**
 * Make a hole about as big as `size` says: the radius a plain square-root
 * growth would give that much food (1.6 + 0.3 × √size), which is how these
 * tests were first written; the mass is whatever the game needs for it.
 */
function grow(w: World, i: number, size: number) {
  const h = w.holes[i];
  h.r = 1.6 + 0.3 * Math.sqrt(size);
  h.mass = massFor(h.r);
  return h;
}

describe('growing', () => {
  it('starts at level 1 able to eat cones and benches, not trees', () => {
    expect(levelOf(START_R)).toBe(1);
    expect(nextLabel(START_R)).toBe('Trees');
    expect(levelProgress(START_R)).toBe(0);
  });

  it('opens a tier per level all the way to mountains, and keeps going', () => {
    const seen: string[] = [];
    let last = 1;
    for (let mass = 1; mass < 400000; mass *= 1.01) {
      const lv = levelOf(radiusFor(mass));
      if (lv > last && lv <= 13) {
        last = lv;
        seen.push(nextLabel(radiusFor(mass)) ?? 'Everything');
      }
    }
    // By footprint, a skyscraper is narrower than a stadium, so it comes first.
    expect(seen).toEqual([
      'Cars',
      'Vans',
      'Little houses',
      'Buses',
      'Houses',
      'Big houses',
      'Towers',
      'Factories',
      'Skyscrapers',
      'Stadiums',
      'Mountains',
      'Everything',
    ]);
    expect(nextLabel(radiusFor(400000))).toBeNull();
    // No ceiling: past the mountains, levels keep coming.
    expect(levelOf(radiusFor(4e6))).toBeGreaterThan(levelOf(radiusFor(400000)));
    expect(radiusFor(4e6)).toBeGreaterThan(100);
    expect(massFor(radiusFor(1234))).toBeCloseTo(1234, 6);
  });

  it('a giant is a little faster than a small hole, but nowhere near in step with its size', () => {
    const small = speedOf(START_R);
    const giant = speedOf(60);
    expect(giant).toBeGreaterThan(small * 2);
    expect(giant).toBeLessThan(small * 5);
    // Measured in its own width, the giant is much slower: it feels heavy.
    expect(giant / 60).toBeLessThan(small / START_R / 5);
  });
});

describe('eating', () => {
  it('swallows a small thing under the hole, scores it and grows', () => {
    const w = round();
    const me = w.holes[0];
    only(w, [makeProp(1, 'cone', me.x + 0.5, me.z, 0)]);
    const events = stepWorld(w, 0.016, still);
    expect(events).toContainEqual(expect.objectContaining({ type: 'eat', hole: 0 }));
    expect(w.props.size).toBe(0);
    expect(me.score).toBe(1);
    expect(me.r).toBeGreaterThan(START_R);
  });

  it('leaves a thing too big for the hole', () => {
    const w = round();
    const me = w.holes[0];
    only(w, [makeProp(1, 'car', me.x, me.z, 0)]);
    expect(stepWorld(w, 0.016, still)).toEqual([]);
    expect(w.props.size).toBe(1);
  });

  it('leaves a thing that only touches the rim', () => {
    const w = round();
    const me = w.holes[0];
    only(w, [makeProp(1, 'bench', me.x + me.r, me.z, 0)]);
    expect(stepWorld(w, 0.016, still)).toEqual([]);
  });

  it('says so when a hole reaches a new level', () => {
    const w = round();
    const me = w.holes[0];
    only(w, [makeProp(1, 'bench', me.x, me.z, 0)]);
    expect(stepWorld(w, 0.016, still)).toContainEqual({ type: 'level', hole: 0, level: 2 });
  });

  it('a giant hole swallows a mountain', () => {
    const w = round(1, 0, { map: 'region' });
    const me = grow(w, 0, 130000);
    only(w, [makeProp(1, 'mountain', me.x, me.z, 0)]);
    expect(stepWorld(w, 0.016, still)).toContainEqual(expect.objectContaining({ type: 'eat' }));
  });

  it('moves the hole where the child points, and never off the island', () => {
    const w = round();
    const me = w.holes[0];
    const x0 = me.x;
    for (let i = 0; i < 60; i++) stepWorld(w, 1 / 60, { x: 1, z: 0 });
    expect(me.x).toBeGreaterThan(x0 + 6);
    for (let i = 0; i < 60 * 40; i++) stepWorld(w, 1 / 60, { x: 1, z: 1 });
    expect(me.x).toBeLessThanOrEqual(w.city.land);
    expect(me.z).toBeLessThanOrEqual(w.city.land);
  });
});

describe('holes eating holes', () => {
  function faceOff() {
    const w = round(1, 1);
    only(w, []);
    const [me, rival] = w.holes;
    w.brains[1] = null; // Hold the rival still: this is about the rule.
    rival.x = me.x + 1;
    rival.z = me.z;
    return { w, me, rival };
  }

  it('a much bigger hole swallows a smaller one on top of it, which comes back later', () => {
    const { w, me, rival } = faceOff();
    grow(w, 0, 200);
    const events = stepWorld(w, 0.016, still);
    expect(events).toContainEqual({ type: 'gulp', eater: 0, eaten: 1 });
    expect(rival.alive).toBe(false);
    expect(rival.eatenBy).toBe('You');
    expect(me.kills).toBe(1);
    for (let i = 0; i < (RESPAWN + 0.2) * 60; i++) stepWorld(w, 1 / 60, still);
    expect(rival.alive).toBe(true);
    expect(rival.safe).toBeGreaterThan(0);
  });

  it('holes the same size pass over each other', () => {
    const { w, rival } = faceOff();
    expect(stepWorld(w, 0.016, still)).toEqual([]);
    expect(rival.alive).toBe(true);
  });

  it('the child keeps more of their size when swallowed than a rival does', () => {
    const { w, me } = faceOff();
    grow(w, 1, 400);
    grow(w, 0, 100);
    stepWorld(w, 0.016, still);
    const before = massFor(radiusFor(0) + 0.3 * Math.sqrt(100));
    expect(me.alive).toBe(false);
    expect(me.mass).toBeCloseTo(before * 0.85, 6);
  });
});

describe('power-ups', () => {
  it('turn up from time to time near the child, only when switched on', () => {
    const on = round(2, 0, { powerups: true });
    const off = round(2, 0, { powerups: false });
    only(on, []);
    only(off, []);
    for (let i = 0; i < 60 * 40; i++) {
      stepWorld(on, 1 / 60, still);
      stepWorld(off, 1 / 60, still);
    }
    expect(on.powerups.length).toBeGreaterThan(0);
    const me = on.holes[0];
    for (const p of on.powerups) expect(Math.hypot(p.x - me.x, p.z - me.z)).toBeLessThan(40);
    expect(off.powerups).toEqual([]);
  });

  it('speed makes the hole faster for a while', () => {
    const w = round(1, 0, { powerups: true });
    only(w, []);
    const me = w.holes[0];
    w.powerups = [{ id: 1, kind: 'speed', x: me.x, z: me.z, life: 10 }];
    expect(stepWorld(w, 1 / 60, still)).toContainEqual({ type: 'power', hole: 0, kind: 'speed' });
    const x0 = me.x;
    for (let i = 0; i < 60; i++) stepWorld(w, 1 / 60, { x: 1, z: 0 });
    const boosted = me.x - x0;
    for (let i = 0; i < 60 * POWER_TIME.speed; i++) stepWorld(w, 1 / 60, still);
    const x1 = me.x;
    for (let i = 0; i < 60; i++) stepWorld(w, 1 / 60, { x: -1, z: 0 });
    expect(boosted).toBeGreaterThan((x1 - me.x) * 1.4);
  });

  it('double points doubles the score, not the size', () => {
    const w = round(1, 0, { powerups: true });
    const me = w.holes[0];
    only(w, [makeProp(1, 'bench', me.x + 3, me.z, 0)]);
    me.doubleTime = 5;
    for (let i = 0; i < 30; i++) stepWorld(w, 1 / 60, { x: 1, z: 0 });
    expect(me.score).toBe(4);
    expect(me.mass).toBe(2);
  });
});

describe('the city fights back', () => {
  it('eating the chemical plant shrinks the hole, only when switched on', () => {
    for (const fightBack of [true, false]) {
      const w = round(1, 0, { fightBack });
      const me = grow(w, 0, 8000);
      const before = me.mass;
      w.nextAttack = 999;
      only(w, [makeProp(1, 'chemplant', me.x, me.z, 0)]);
      const events = stepWorld(w, 1 / 60, still);
      if (fightBack) {
        expect(events).toContainEqual({ type: 'hurt', hole: 0, cause: 'chem' });
        expect(me.mass).toBeLessThan(before);
        expect(me.stun).toBeGreaterThan(0);
      } else {
        expect(me.mass).toBeGreaterThan(before);
      }
    }
  });

  it('leaves small holes alone, and goes after a big one', () => {
    const w = round(3, 0, { fightBack: true });
    only(w, []);
    for (let i = 0; i < 60 * 40; i++) stepWorld(w, 1 / 60, still);
    expect(w.attacks).toEqual([]);
    grow(w, 0, 900);
    const events: WorldEvent[] = [];
    for (let i = 0; i < 60 * 10; i++) events.push(...stepWorld(w, 1 / 60, still));
    expect(events).toContainEqual(expect.objectContaining({ type: 'incoming', target: 0 }));
  });

  it('a tanker that reaches a hole blows up in it; a hole that swerves gets away', () => {
    const run = (swerve: boolean) => {
      const w = round(4, 0, { fightBack: true });
      only(w, []);
      const me = grow(w, 0, 900);
      w.nextAttack = 999;
      w.attacks = [{ id: 1, kind: 'tanker', x: me.x, z: me.z - 40, heading: 0, speed: 12, target: 0, life: 14 }];
      const events: WorldEvent[] = [];
      for (let i = 0; i < 60 * 14; i++) {
        const t = w.attacks[0];
        const close = !!t && Math.hypot(t.x - me.x, t.z - me.z) < 25;
        events.push(...stepWorld(w, 1 / 60, swerve && close ? { x: 1, z: 0 } : still));
      }
      return events.filter((e) => e.type === 'hurt');
    };
    expect(run(false)).toEqual([{ type: 'hurt', hole: 0, cause: 'tanker' }]);
    expect(run(true)).toEqual([]);
  });

  it('bombs land on their target rings: stay and get hit, move away and get missed', () => {
    const run = (dodge: boolean) => {
      const w = round(5, 0, { fightBack: true });
      only(w, []);
      const me = grow(w, 0, 3000);
      w.nextAttack = 999;
      const radius = me.r * 0.8;
      w.attacks = [
        { id: 1, kind: 'bomber', target: 0, x: me.x - 100, z: me.z, dx: 1, dz: 0, speed: 50, life: 6, bombs: [{ id: 2, x: me.x, z: me.z, radius, fuse: 3 }] },
      ];
      const events: WorldEvent[] = [];
      for (let i = 0; i < 60 * 5; i++) events.push(...stepWorld(w, 1 / 60, dodge ? { x: 0, z: 1 } : still));
      return events;
    };
    const stay = run(false);
    expect(stay).toContainEqual({ type: 'hurt', hole: 0, cause: 'bomb' });
    expect(stay).toContainEqual(expect.objectContaining({ type: 'boom' }));
    expect(run(true).filter((e) => e.type === 'hurt')).toEqual([]);
  });

  it('a big hole sees planes as well as tankers', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 24; seed++) {
      const w = round(seed, 0, { fightBack: true });
      only(w, []);
      grow(w, 0, 3000);
      w.nextAttack = 0;
      for (const e of stepWorld(w, 1 / 60, still)) if (e.type === 'incoming') kinds.add(e.kind);
    }
    expect([...kinds].sort()).toEqual(['bomber', 'tanker']);
  });
});

describe('the city rebuilds', () => {
  /** Eat one thing at the hole, drive off, and collect what happens over `secs`. */
  function eatAndWait(w: World, props: Prop[], secs: number): WorldEvent[] {
    only(w, props);
    const events: WorldEvent[] = [];
    events.push(...stepWorld(w, 1 / 60, still));
    for (let i = 0; i < 60 * secs; i++) events.push(...stepWorld(w, 1 / 60, i < 60 * 6 ? { x: 1, z: 0 } : still));
    return events;
  }
  const built = (events: WorldEvent[]) => events.flatMap((e) => (e.type === 'rebuild' ? [e.prop.kind] : []));

  it('an eaten lot becomes a construction site first, then a building', () => {
    const w = round(1, 0, { regrow: true, duration: 0 });
    const me = grow(w, 0, 400);
    w.elapsed = 45;
    const events = eatAndWait(w, [makeProp(1, 'house', me.x, me.z, 0)], 45);
    // Forty-five seconds in, the city is old enough for shops: one rung up.
    expect(built(events)).toEqual(['site', 'shop']);
    const done = events.find((e) => e.type === 'rebuild' && e.prop.kind === 'shop');
    expect(done?.type === 'rebuild' && done.replaces?.kind).toBe('site');
  });

  it('a young city rebuilds small: early on a tower comes back as a house', () => {
    const w = round(1, 0, { regrow: true, duration: 0 });
    const me = grow(w, 0, 3000);
    expect(built(eatAndWait(w, [makeProp(1, 'tower', me.x, me.z, 0)], 45))).toEqual(['site', 'house']);
  });

  it('an old city rebuilds taller than the old building, where it cannot go wider', () => {
    const w = round(1, 0, { regrow: true, duration: 0 });
    const me = grow(w, 0, 3000);
    w.elapsed = 400;
    const events = eatAndWait(w, [makeProp(1, 'tower', me.x, me.z, 0)], 45);
    const last = events.filter((e) => e.type === 'rebuild').pop();
    expect(last?.type === 'rebuild' && last.prop.kind).toBe('tower');
    expect(last?.type === 'rebuild' && last.prop.hScale).toBeGreaterThan(1);
  });

  it('a construction site that is eaten starts again later', () => {
    const w = round(1, 0, { regrow: true, duration: 0 });
    const me = grow(w, 0, 400);
    const events = eatAndWait(w, [makeProp(1, 'house', me.x, me.z, 0)], 14);
    const site = events.find((e) => e.type === 'rebuild');
    if (site?.type !== 'rebuild') throw new Error('no construction site');
    expect(site.prop.kind).toBe('site');
    // Drive back over it.
    me.x = site.prop.x;
    me.z = site.prop.z;
    const again = stepWorld(w, 1 / 60, still);
    expect(again).toContainEqual(expect.objectContaining({ type: 'eat', prop: expect.objectContaining({ kind: 'site' }) }));
    expect(w.lots).toHaveLength(1);
    expect(w.lots[0].site).toBeNull();
  });

  it('a big lot becomes something grand, and it makes the news', () => {
    const w = round(1, 0, { regrow: true, duration: 0 });
    const me = grow(w, 0, 40000);
    w.elapsed = 100;
    const events = eatAndWait(w, [makeProp(1, 'stadium', me.x, me.z, 0)], 45);
    const kinds = built(events);
    expect(kinds[0]).toBe('bigsite');
    expect(['stadium', 'mall', 'powerplant']).toContain(kinds[1]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'news' }));
  });

  it('with regrowth off, nothing comes back', () => {
    const w = round(1, 0, { regrow: false });
    const me = grow(w, 0, 400);
    const events = eatAndWait(w, [makeProp(1, 'house', me.x, me.z, 0), makeProp(2, 'cone', me.x + 1, me.z, 0)], 40);
    expect(events.filter((e) => e.type === 'rebuild' || e.type === 'regrow')).toEqual([]);
  });
});

describe('people', () => {
  it('walk round the pavements, and fall in when a hole gets them', () => {
    const w = round(1, 0);
    only(w, []);
    expect(w.people.length).toBeGreaterThan(50);
    const p = w.people[0];
    const x0 = p.x;
    const z0 = p.z;
    stepWorld(w, 0.5, still);
    expect(Math.hypot(p.x - x0, p.z - z0)).toBeGreaterThan(0.3);
    const me = w.holes[0];
    me.x = p.x;
    me.z = p.z;
    const events = stepWorld(w, 1 / 60, still);
    expect(events).toContainEqual(expect.objectContaining({ type: 'eat', prop: expect.objectContaining({ kind: 'person' }) }));
    expect(p.alive).toBe(false);
    expect(me.score).toBeGreaterThan(0);
  });

  it('come back into town a while later', () => {
    const w = round(1, 0);
    only(w, []);
    const p = w.people[0];
    const me = w.holes[0];
    me.x = p.x;
    me.z = p.z;
    stepWorld(w, 1 / 60, still);
    for (let i = 0; i < 60 * 20; i++) stepWorld(w, 1 / 60, { x: 1, z: 0 });
    expect(p.alive).toBe(true);
  });
});

describe('food and combos', () => {
  it('a treat says yum; healthy food gives a health bonus and shakes off a knock', () => {
    const w = round();
    const me = grow(w, 0, 30);
    const start = me.mass;
    me.stun = 1;
    const cart = makeProp(1, 'cart', me.x, me.z, 0);
    const fruit = makeProp(2, 'fruitstand', me.x + 0.5, me.z, 0);
    only(w, [cart, fruit]);
    const events = stepWorld(w, 1 / 60, still);
    expect(events).toContainEqual({ type: 'food', hole: 0, food: 'treat', bonus: 0 });
    const healthy = events.find((e) => e.type === 'food' && e.food === 'healthy');
    expect(healthy).toBeDefined();
    const bonus = healthy?.type === 'food' ? healthy.bonus : 0;
    expect(bonus).toBeGreaterThan(0);
    // The cart, the fruit stand, and the health bonus on top.
    expect(me.mass).toBeCloseTo(start + cart.points + fruit.points + bonus, 6);
    expect(me.stun).toBe(0);
  });

  it('eating fast builds a combo that multiplies the score; a pause ends it', () => {
    expect(comboOf(1)).toBe(1);
    expect(comboOf(8)).toBe(2);
    expect(comboOf(100)).toBe(5);
    const w = round();
    const me = w.holes[0];
    only(w, Array.from({ length: 10 }, (_, i) => makeProp(i + 1, 'cone', me.x + i * 0.6, me.z, 0)));
    const events: WorldEvent[] = [];
    for (let i = 0; i < 90; i++) events.push(...stepWorld(w, 1 / 60, { x: 0.7, z: 0 }));
    expect(me.streak).toBe(10);
    expect(events).toContainEqual({ type: 'combo', hole: 0, mult: 2 });
    // Seven cones at x1, then three at x2.
    expect(me.score).toBe(7 + 3 * 2);
    for (let i = 0; i < 60 * 2; i++) stepWorld(w, 1 / 60, still);
    expect(me.streak).toBe(0);
  });
});

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
});

/**
 * A stand-in for a child playing a two-minute round: steers like a middling
 * rival, with no kindness slow-down. `extra` can set the difficulty.
 */
function play(seed: number, skill: number, map: MapId = 'city', extra: Partial<Options> = {}) {
  const w = round(seed, MAPS[map].rivals, { map, ...extra });
  const brain = { ...createBrain(seededRng(seed + 50)), skill };
  for (let i = 0; i < 30 * 125 && w.status === 'playing'; i++) {
    const me = w.holes[0];
    const want = me.alive ? steerRival(brain, me, w, 1 / 30, null) : still;
    stepWorld(w, 1 / 30, want);
  }
  const me = w.holes[0];
  const order = standings(w);
  // The best computer hole's score, to see how hard the rivals pushed.
  const top = order.find((h) => !h.isPlayer)?.score ?? 0;
  return { rank: order.indexOf(me) + 1, level: levelOf(me.r), top, w };
}

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
    expect(me.score).toBeGreaterThanOrEqual(10000);
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
    w.attacks = [{ id: 1, kind: 'tank', target: 0, x: me.x + 40, z: me.z, heading: -Math.PI / 2, speed: 6, life: 40, reload: 0.5, shells: [] }];
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
    w.attacks = [{ id: 1, kind: 'heli', target: 0, x: me.x + 30, z: me.z, heading: 0, speed: 28, life: 12, reload: 0.3, shells: [] }];
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
    expect(levelOf(h.r)).toBeLessThanOrEqual(4);
    only(w2, [makeProp(1, 'van', h.x, h.z, 0)]);
    expect(stepWorld(w2, 1 / 60, still)).toContainEqual(expect.objectContaining({ type: 'eat' }));
  });
});

describe('difficulty', () => {
  /** A rival next to a smaller child, both with these scores. */
  function standoff(difficulty: Difficulty, rivalScore: number, childScore: number) {
    const w = round(1, 1, { difficulty });
    only(w, []);
    const [me, rival] = w.holes;
    grow(w, 1, 900);
    rival.score = rivalScore;
    me.score = childScore;
    rival.x = me.x + 20;
    rival.z = me.z;
    return { w, me, rival };
  }

  /** Whether the rival sets off after the child within a few looks round. */
  function hunts(difficulty: Difficulty, rivalScore: number, childScore: number): boolean {
    const { w, me, rival } = standoff(difficulty, rivalScore, childScore);
    const brain = w.brains[1]!;
    for (let i = 0; i < 60 * 4; i++) {
      steerRival(brain, rival, w, 1 / 60, me);
      if (brain.target?.kind === 'hole' && brain.target.id === 0) return true;
    }
    return false;
  }

  it('left out, the rivals play Easy', () => {
    const plain = round(7, 5);
    const easy = round(7, 5, { difficulty: 'easy' });
    expect(plain.brains.map((b) => b?.skill)).toEqual(easy.brains.map((b) => b?.skill));
  });

  it('harder rivals are more skilful', () => {
    const skills = (difficulty: Difficulty) => round(7, 5, { difficulty }).brains.flatMap((b) => (b ? [b.skill] : []));
    expect(Math.min(...skills('medium'))).toBeGreaterThan(0.7);
    expect(Math.min(...skills('hard'))).toBeGreaterThan(Math.max(...skills('easy')) - 0.1);
    expect(Math.max(...skills('hard'))).toBeLessThanOrEqual(1);
  });

  it('a rival far ahead of the child crawls on Easy, eases off a little on Medium, and races on Hard', () => {
    const pace = (difficulty: Difficulty) => {
      const { w, me, rival } = standoff(difficulty, 5000, 1000);
      const brain = w.brains[1]!;
      steerRival(brain, rival, w, 1 / 60, me);
      return brain.pace;
    };
    expect(pace('easy')).toBe(0.35);
    expect(pace('medium')).toBeGreaterThan(0.7);
    expect(pace('medium')).toBeLessThan(1);
    expect(pace('hard')).toBe(1);
  });

  it('who goes after a smaller child: Easy only when the child is well ahead, Medium once the child is level, Hard always', () => {
    expect(hunts('easy', 1000, 1000)).toBe(false);
    expect(hunts('easy', 1000, 2000)).toBe(true);
    expect(hunts('medium', 1000, 500)).toBe(false);
    expect(hunts('medium', 1000, 1000)).toBe(true);
    expect(hunts('hard', 1000, 100)).toBe(true);
  });

  it('on every level, rivals leave the wonders for the child and skip the chemical plant', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      const w = round(1, 1, { difficulty, fightBack: true });
      const [me, rival] = w.holes;
      grow(w, 1, 20000);
      me.x = rival.x + 200;
      const wonder = makeProp(1, 'leaning', rival.x + rival.r + 6, rival.z, 0);
      const hazard = makeProp(2, 'chemplant', rival.x - rival.r - 12, rival.z, 0);
      // A lamp post further off: the only thing left for the rival to want.
      const lamp = makeProp(3, 'lamp', rival.x, rival.z + rival.r + 30, 0);
      only(w, [wonder, hazard, lamp]);
      expect(canEat(rival, wonder) && canEat(rival, hazard)).toBe(true);
      const brain = w.brains[1]!;
      for (let i = 0; i < 60 * 4; i++) {
        steerRival(brain, rival, w, 1 / 60, me);
        expect(brain.target?.id).toBe(3);
      }
    }
  });

  it('a steady player wins most Easy rounds, some Medium ones, and hardly any Hard ones', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const [easy, medium, hard] = (['easy', 'medium', 'hard'] as const).map((difficulty) => {
      const results = seeds.map((s) => play(s, 0.7, 'city', { difficulty }));
      return {
        rank: mean(results.map((r) => r.rank)),
        wins: results.filter((r) => r.rank === 1).length,
        top: mean(results.map((r) => r.top)),
      };
    });
    // The child's place drops as the level rises…
    expect(easy.rank).toBeLessThan(medium.rank);
    expect(medium.rank).toBeLessThan(hard.rank);
    // …because the best rival gets bigger.
    expect(easy.top).toBeLessThan(medium.top);
    expect(medium.top).toBeLessThan(hard.top);
    // Easy is still the gentle game; Medium is a race in the middle of the
    // table that the child sometimes wins; Hard is rarely won.
    expect(easy.wins).toBeGreaterThanOrEqual(9);
    expect(medium.wins).toBeGreaterThanOrEqual(1);
    expect(medium.wins).toBeLessThanOrEqual(8);
    expect(medium.rank).toBeGreaterThanOrEqual(1.8);
    expect(medium.rank).toBeLessThanOrEqual(4);
    expect(hard.wins).toBeLessThanOrEqual(4);
    expect(hard.rank).toBeGreaterThanOrEqual(3);
  });
});
