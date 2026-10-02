/**
 * A solo round plays exactly as it always has. Seeded rounds with a child
 * steering a slow circle, stepped at a fixed 1/60 s, must end exactly where
 * these fingerprints say. Each was taken from the rules as they stood before
 * a round could hold several children. A change that moves any of them
 * changes how a solo round plays: the change is wrong, not the fingerprint.
 */
import { describe, expect, it } from 'vitest';
import { MAPS, type MapId } from './city';
import { grow, round } from './testing';
import { stepWorld, type Options, type World } from './world';

/** The child steers a slow circle, once round about every 21 seconds. */
const circle = (i: number) => ({ x: Math.cos(i / 200), z: Math.sin(i / 200) });
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function fingerprint(w: World, events: Record<string, number>) {
  return {
    status: w.status,
    elapsed: r3(w.elapsed),
    holes: w.holes.map((h) => ({ x: r3(h.x), z: r3(h.z), r: r3(h.r), score: h.score, lives: h.lives })),
    props: w.props.size,
    people: w.people.filter((p) => p.alive).length,
    police: w.responders.length,
    attacks: w.attacks.length,
    powerups: w.powerups.length,
    events,
  };
}

/** A seeded solo round with power-ups on, the child `size` big at the start (see `grow`). */
function solo(seed: number, map: MapId, seconds: number, opts: Partial<Options>, size = 0) {
  const w = round(seed, MAPS[map].rivals, { map, powerups: true, ...opts });
  if (size) grow(w, 0, size);
  const events: Record<string, number> = {};
  for (let i = 0; i < seconds * 60; i++) {
    for (const e of stepWorld(w, 1 / 60, circle(i))) events[e.type] = (events[e.type] ?? 0) + 1;
  }
  return fingerprint(w, events);
}

describe('solo rounds play exactly as before', () => {
  it('Town on Easy, 40 seconds', () => {
    expect(solo(7, 'town', 40, { difficulty: 'easy' })).toEqual({
      status: 'playing',
      elapsed: 40,
      holes: [
        { x: 119.52, z: 107.696, r: 3.723, score: 143, lives: Infinity },
        { x: -153.576, z: -118.837, r: 3.421, score: 146, lives: Infinity },
        { x: -110.184, z: 18.181, r: 3.516, score: 145, lives: Infinity },
        { x: -162.015, z: 127.575, r: 3.378, score: 120, lives: Infinity },
        { x: -64.58, z: 100.368, r: 3.524, score: 140, lives: Infinity },
      ],
      props: 2727,
      people: 205,
      police: 3,
      attacks: 0,
      powerups: 1,
      events: { eat: 220, level: 10, food: 7, regrow: 69, power: 1, combo: 10, police: 1, park: 1 },
    });
  });

  it('City on Medium with the city fighting back, 60 seconds', () => {
    expect(solo(8, 'city', 60, { difficulty: 'medium', fightBack: true })).toEqual({
      status: 'playing',
      elapsed: 60,
      holes: [
        { x: 84.837, z: 17.003, r: 3.979, score: 223, lives: 5 },
        { x: -28.502, z: 107.637, r: 3.886, score: 253, lives: 5 },
        { x: 106.818, z: 214.037, r: 4.111, score: 365, lives: 5 },
        { x: -152.153, z: -98.564, r: 4.199, score: 362, lives: 5 },
        { x: -145.73, z: 171.033, r: 4.235, score: 305, lives: 5 },
        { x: -165.336, z: 32.139, r: 4.233, score: 329, lives: 5 },
      ],
      props: 4668,
      people: 304,
      police: 4,
      attacks: 0,
      powerups: 0,
      events: { eat: 432, level: 17, food: 34, regrow: 126, combo: 24, incoming: 2, police: 1, park: 2, power: 1, boom: 3 },
    });
  });

  it('Megalopolis on Hard, 60 seconds', () => {
    expect(solo(9, 'mega', 60, { difficulty: 'hard' })).toEqual({
      status: 'playing',
      elapsed: 60,
      holes: [
        { x: 107.63, z: -214.555, r: 3.342, score: 82, lives: 3 },
        { x: 134.304, z: -13.022, r: 4.254, score: 445, lives: 3 },
        { x: 253.079, z: -76.644, r: 4.395, score: 487, lives: 2 },
        { x: 84.246, z: -161.451, r: 4.444, score: 388, lives: 3 },
        { x: 84.114, z: -146.414, r: 4.226, score: 347, lives: 3 },
        { x: 14.846, z: -169.638, r: 4.174, score: 314, lives: 3 },
        { x: 195.528, z: 30.924, r: 4.626, score: 506, lives: 3 },
      ],
      props: 7402,
      people: 421,
      police: 4,
      attacks: 0,
      powerups: 1,
      events: { eat: 536, food: 16, level: 23, combo: 35, regrow: 125, gulp: 1, respawn: 1, police: 1, park: 2 },
    });
  });

  it('Region on Medium, the child starting big enough to eat buildings, with the army, 60 seconds', () => {
    expect(solo(10, 'region', 60, { difficulty: 'medium', fightBack: true }, 1500)).toEqual({
      status: 'playing',
      elapsed: 60,
      holes: [
        { x: 46.054, z: 12.639, r: 14.812, score: 10742, lives: 5 },
        { x: 47.839, z: -49.611, r: 3.876, score: 416, lives: 5 },
        { x: -10.01, z: 191.069, r: 4.036, score: 518, lives: 5 },
        { x: -237.633, z: -211.562, r: 4.974, score: 1616, lives: 5 },
        { x: -14.667, z: -172.173, r: 5.112, score: 1321, lives: 5 },
        { x: 52.233, z: -257.22, r: 4.417, score: 501, lives: 5 },
        { x: 40.892, z: -100.25, r: 4.002, score: 266, lives: 5 },
        { x: 233.639, z: -46.818, r: 4.105, score: 331, lives: 5 },
        { x: 224.388, z: -185.835, r: 4.792, score: 760, lives: 5 },
      ],
      props: 9230,
      people: 441,
      police: 0,
      attacks: 1,
      powerups: 0,
      events: { eat: 1144, combo: 65, food: 32, level: 28, regrow: 153, rebuild: 49, incoming: 2, boom: 3, power: 1 },
    });
  });
});
