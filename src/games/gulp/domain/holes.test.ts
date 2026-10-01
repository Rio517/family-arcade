import { describe, expect, it } from 'vitest';
import { FIT, footSize, makeProp } from './catalog';
import { START_R, comboOf, levelOf, massFor, radiusFor } from './growth';
import { CHILD_GROWTH, GIANT_LEVEL, RESPAWN, canEat } from './holes';
import { faceOff, grow, only, round, still } from './testing';
import { stepWorld, type WorldEvent } from './world';

describe('eating', () => {
  it('a fresh hole can eat a tree, so level 1 is cones, benches and trees', () => {
    const w = round();
    const me = w.holes[0];
    expect(me.r).toBe(START_R);
    expect(canEat(me, makeProp(1, 'tree', me.x, me.z, 0))).toBe(true);
    expect(canEat(me, makeProp(2, 'car', me.x, me.z, 0))).toBe(false);
  });

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
    // Just short of fitting a car, the first step up from the start.
    me.r = footSize('car') / FIT - 0.001;
    me.mass = massFor(me.r);
    expect(levelOf(me.r)).toBe(1);
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

  it('on Easy, a computer hole never swallows the child', () => {
    const { w, me } = faceOff('easy');
    grow(w, 1, 400);
    grow(w, 0, 100);
    stepWorld(w, 0.016, still);
    expect(me.alive).toBe(true);
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

describe('food and combos', () => {
  it('on Easy the child grows faster from the same meal than on Medium; the score is the same', () => {
    const grown = (difficulty: 'easy' | 'medium') => {
      const w = round(1, 0, { difficulty });
      const me = w.holes[0];
      only(w, [makeProp(1, 'bench', me.x, me.z, 0)]);
      stepWorld(w, 1 / 60, still);
      return { mass: me.mass, score: me.score };
    };
    expect(grown('easy').mass).toBeCloseTo((grown('medium').mass * CHILD_GROWTH.easy) / CHILD_GROWTH.medium, 6);
    expect(grown('easy').score).toBe(grown('medium').score);
  });

  it('a treat says yum; healthy food gives a health bonus and shakes off a knock', () => {
    const w = round(1, 0, { difficulty: 'medium' });
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
    expect(me.mass).toBeCloseTo(start + (cart.points + fruit.points + bonus) * CHILD_GROWTH.medium, 6);
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

  it('a combo adds at most 5,000 to one bite: a mountain in a full streak is not a jackpot', () => {
    const w = round();
    const me = grow(w, 0, 400000);
    const mountain = makeProp(1, 'mountain', me.x, me.z, 0);
    only(w, [mountain]);
    me.streak = 100;
    me.comboTime = 1;
    const events = stepWorld(w, 1 / 60, still);
    const eat = events.find((e) => e.type === 'eat');
    expect(eat?.type === 'eat' && eat.gained).toBe(mountain.points + 5000);
  });

  it('a giant (level 14 and up) takes tiny things without a fuss: no points, no gulp; a tree still counts', () => {
    const w = round(1, 0);
    const me = grow(w, 0, 200000);
    expect(levelOf(me.r)).toBeGreaterThanOrEqual(GIANT_LEVEL);
    only(w, [makeProp(1, 'cone', me.x, me.z, 0), makeProp(2, 'bench', me.x + 1, me.z, 0), makeProp(3, 'tree', me.x - 1, me.z, 0)]);
    const score = me.score;
    const events = stepWorld(w, 1 / 60, still);
    expect(events.filter((e) => e.type === 'crumb').map((e) => (e.type === 'crumb' ? e.prop.kind : ''))).toEqual(['cone', 'bench']);
    expect(events.filter((e) => e.type === 'eat').map((e) => (e.type === 'eat' ? e.prop.kind : ''))).toEqual(['tree']);
    expect(w.props.size).toBe(0);
    expect(me.score - score).toBeLessThan(20);
  });
});
