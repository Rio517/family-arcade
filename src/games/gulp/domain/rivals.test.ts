import { describe, expect, it } from 'vitest';
import { makeProp } from './catalog';
import { canEat } from './holes';
import { steerRival, type Difficulty } from './rivals';
import { grow, only, play, round } from './testing';

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

  it('who goes after a smaller child: never on Easy, Medium once the child is level, Hard always', () => {
    expect(hunts('easy', 1000, 1000)).toBe(false);
    expect(hunts('easy', 1000, 5000)).toBe(false);
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
      const hazard = makeProp(2, 'gastank', rival.x - rival.r - 12, rival.z, 0);
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
