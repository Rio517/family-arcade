/** Helpers the Gulp Universe rule tests share: set up a round, a city, a hole. */
import { seededRng } from '@shared/rng';
import type { Prop } from './catalog';
import { MAPS, type MapId } from './city';
import { massFor } from './growth';
import { createBrain, steerRival, type Difficulty } from './rivals';
import { indexProps } from './space';
import { createWorld, levelOf, standings, stepWorld, type Options, type World } from './world';

const NAMES = ['Big Gulp', 'Sir Slurps', 'Nom Nom', 'Hungry Hattie', 'Captain Crumbs', 'Munch Bunch', 'Gobbler', 'Chompers', 'Slurpy Sue'];
export const rivals = (n: number) => NAMES.slice(0, n).map((name, i) => ({ name, skin: i + 1 }));
export const still = { x: 0, z: 0 };

/** A round with no countdown, the child and `n` computer holes, nothing switched on. */
export const round = (seed = 1, n = 0, opts: Partial<Options> = {}) =>
  createWorld(seededRng(seed), { name: 'You', skin: 0 }, rivals(n), {
    duration: 120,
    countdown: 0,
    powerups: false,
    fightBack: false,
    ...opts,
  });

/** Clear the city and put exactly these things in it. */
export function only(w: World, props: Prop[]): void {
  w.props = new Map(props.map((p) => [p.id, p]));
  indexProps(w);
}

/**
 * Make a hole about as big as `size` says: the radius 1.6 + 0.3 × √size, with
 * the mass the game needs for that radius.
 */
export function grow(w: World, i: number, size: number) {
  const h = w.holes[i];
  h.r = 1.6 + 0.3 * Math.sqrt(size);
  h.mass = massFor(h.r);
  return h;
}

/** The child and one rival side by side in an empty city, the rival held still. */
export function faceOff(difficulty: Difficulty = 'medium') {
  const w = round(1, 1, { difficulty });
  only(w, []);
  const [me, rival] = w.holes;
  w.brains[1] = null; // Hold the rival still: this is about the rule.
  rival.x = me.x + 1;
  rival.z = me.z;
  return { w, me, rival };
}

/**
 * A stand-in for a child playing a two-minute round: steers like a middling
 * rival, with no kindness slow-down. `extra` can set the difficulty.
 */
export function play(seed: number, skill: number, map: MapId = 'city', extra: Partial<Options> = {}) {
  const w = round(seed, MAPS[map].rivals, { map, ...extra });
  const brain = { ...createBrain(seededRng(seed + 50), 'easy'), skill };
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
