import { describe, expect, it } from 'vitest';
import { SKINS } from '../components/skins';
import { makeProp } from '../domain/catalog';
import { stepWorld } from '../domain/world';
import { snapshotOf, tickOf } from './codec';
import { isGulpMsg, type RoundSettings } from './protocol';
import { buildRound } from './round';

const settings: RoundSettings = { map: 'city', difficulty: 'medium', duration: 240, powerups: true, fightBack: false };
const seat = (name: string, human = true) => ({ name, skin: 1, human });

describe('Gulp wire protocol', () => {
  it('knows every skin there is', () => {
    expect(isGulpMsg({ t: 'pick', skin: SKINS.length - 1 })).toBe(true);
    expect(isGulpMsg({ t: 'pick', skin: SKINS.length })).toBe(false);
  });

  it('accepts the joining messages', () => {
    expect(isGulpMsg({ t: 'hello', name: 'Klara', skin: 0, token: 'a1b2', inRound: false })).toBe(true);
    expect(isGulpMsg({ t: 'lobby', settings, children: [seat('Klara'), seat('Rio')], you: 1 })).toBe(true);
    expect(isGulpMsg({ t: 'start', seed: 12345, settings, wonders: ['irontower'], seats: [seat('Klara'), seat('Rio'), seat('Big Gulp', false)], you: 1 })).toBe(true);
    expect(isGulpMsg({ t: 'ready' })).toBe(true);
    expect(isGulpMsg({ t: 'pos', seq: 3, x: 1234, z: -560, vx: 12, vz: 0 })).toBe(true);
    expect(isGulpMsg({ t: 'over', order: [2, 0, 1] })).toBe(true);
    expect(isGulpMsg({ t: 'again' })).toBe(true);
    expect(isGulpMsg({ t: 'resync' })).toBe(true);
  });

  it('turns away anything malformed or out of range', () => {
    expect(isGulpMsg(null)).toBe(false);
    expect(isGulpMsg({ t: 'nope' })).toBe(false);
    expect(isGulpMsg({ t: 'hello', name: 'x'.repeat(500), skin: 0, token: 't', inRound: false })).toBe(false);
    expect(isGulpMsg({ t: 'lobby', settings: { ...settings, map: 'moon' }, children: [seat('Klara'), seat('Rio')], you: 1 })).toBe(false);
    expect(isGulpMsg({ t: 'lobby', settings, children: Array.from({ length: 5 }, (_, i) => seat(`k${i}`)), you: 1 })).toBe(false);
    // A guest's own seat is one of the guests' seats.
    expect(isGulpMsg({ t: 'lobby', settings, children: [seat('Klara'), seat('Rio')], you: 2 })).toBe(false);
    // The host is seat 0: a guest is told a seat from 1 to 3, inside the seat list.
    expect(isGulpMsg({ t: 'start', seed: 1, settings, wonders: [], seats: [seat('Klara'), seat('Rio')], you: 0 })).toBe(false);
    expect(isGulpMsg({ t: 'start', seed: 1, settings, wonders: [], seats: [seat('Klara'), seat('Rio')], you: 2 })).toBe(false);
    expect(isGulpMsg({ t: 'start', seed: 1, settings, wonders: ['moonbase'], seats: [seat('Klara'), seat('Rio')], you: 1 })).toBe(false);
    // Positions travel as whole hundredths.
    expect(isGulpMsg({ t: 'pos', seq: 3, x: 12.5, z: 0, vx: 0, vz: 0 })).toBe(false);
    expect(isGulpMsg({ t: 'pos', seq: 3, x: Infinity, z: 0, vx: 0, vz: 0 })).toBe(false);
    expect(isGulpMsg({ t: 'over', order: [99] })).toBe(false);
  });
});

describe('the round on the wire', () => {
  // A round a few seconds in: two children and a computer hole, things eaten and built.
  const w = buildRound({ seed: 9, settings, wonders: [], seats: [seat('Klara'), seat('Rio'), seat('Big Gulp', false)] });
  for (let i = 0; i < 60 * 8; i++) stepWorld(w, 1 / 60, { x: 1, z: 0 });
  const [thing] = w.city.props;
  const built = makeProp(w.nextPropId, 'house', 10, 20, Math.PI / 2, 1, 1.2);
  const good = tickOf(
    w,
    [
      { type: 'eat', prop: thing, hole: 0, gained: 3 },
      { type: 'eat', prop: makeProp(-7, 'policecar', 5, 6, 0.5), hole: 1, gained: 8 },
      { type: 'rebuild', prop: built, replaces: null },
      { type: 'boom', x: 1.234, z: -5.678, size: 8 },
      { type: 'back', person: w.people[3] },
    ],
    20,
  );
  /** The good tick with one thing changed, as a broken or hostile device might send it. */
  const junk = (change: (t: Record<string, unknown> & { holes: number[][]; events: unknown[][]; clock: number[] }) => void) => {
    const t = JSON.parse(JSON.stringify(good)) as Parameters<typeof change>[0];
    change(t);
    return isGulpMsg(t);
  };

  it('accepts a real tick and a real snapshot', () => {
    expect(good.sum).toBeDefined();
    expect(isGulpMsg(good)).toBe(true);
    expect(isGulpMsg(snapshotOf(w, 21))).toBe(true);
  });

  it('turns away junk ticks', () => {
    expect(junk(() => {})).toBe(true);
    // Fractions, non-numbers, and more than a tick may hold.
    expect(junk((t) => (t.holes[0][0] = 12.5))).toBe(false);
    expect(junk((t) => (t.holes[1][4] = Number.NaN))).toBe(false);
    expect(junk((t) => (t.holes[0][7] = 2))).toBe(false);
    expect(junk((t) => (t.holes = Array.from({ length: 13 }, () => t.holes[0])))).toBe(false);
    expect(junk((t) => (t.holes = []))).toBe(false);
    expect(junk((t) => (t.events = Array.from({ length: 2001 }, () => [1, 5])))).toBe(false);
    expect(junk((t) => (t.cops = 'police'))).toBe(false);
    expect(junk((t) => (t.seq = -1))).toBe(false);
    expect(junk((t) => (t.clock[2] = 7))).toBe(false);
    expect(junk((t) => (t.sum = [1, 2]))).toBe(false);
    // Unknown kinds and codes, and ids out of range.
    expect(junk((t) => (t.events = [[3, [5000, 'moonbase', 0, 0, 0, 0, 100], 0]]))).toBe(false);
    expect(junk((t) => (t.events = [[99, 1]]))).toBe(false);
    expect(junk((t) => (t.events = [[10, 0, 3, 50]]))).toBe(false);
    expect(junk((t) => (t.events = [[0, 12, -1, 3]]))).toBe(false);
    expect(junk((t) => (t.events = [[0, 0, 0, 3]]))).toBe(false);
    expect(junk((t) => (t.events = [[18, 3, -1, 10_000]]))).toBe(false);
    expect(junk((t) => (t.attacks = [[0, 1, 9, 0, 0, 0, 0, 0]]))).toBe(false);
    // A police car swallowed is sent in full; by id alone the guest could not show it.
    expect(junk((t) => (t.events = [[0, -7, 1, 8]]))).toBe(false);
    expect(junk((t) => (t.events = [[5, 'x'.repeat(500), 0, 0]]))).toBe(false);
  });
});
