import { describe, expect, it } from 'vitest';
import { isRacerMsg } from './protocol';

const coin = (id: number) => ({ id, x: 0, z: 0, hue: 200 });

describe('isRacerMsg', () => {
  it('accepts well-formed messages', () => {
    expect(isRacerMsg({ t: 'hello', name: 'Klara', driver: 'unicorn' })).toBe(true);
    expect(isRacerMsg({ t: 'hello', name: 'Klara', driver: 'unicorn', inRace: true })).toBe(true);
    expect(isRacerMsg({ t: 'go', target: 20 })).toBe(true);
    expect(isRacerMsg({ t: 'pos', x: 1, z: 2, heading: 0.5, speed: 30 })).toBe(true);
    expect(
      isRacerMsg({
        t: 'world',
        coins: [coin(1)],
        scores: [3, 5],
        status: 'racing',
        winner: null,
        elapsed: 12.5,
      }),
    ).toBe(true);
    expect(
      isRacerMsg({
        t: 'worldDelta',
        spawned: [coin(17)],
        removed: [3, 9],
        scores: [6, 5],
        status: 'over',
        winner: 0,
        elapsed: 31.2,
      }),
    ).toBe(true);
    expect(
      isRacerMsg({
        t: 'worldDelta',
        spawned: [],
        removed: [],
        scores: [0, 0],
        status: 'racing',
        winner: null,
        elapsed: 1,
      }),
    ).toBe(true);
    expect(isRacerMsg({ t: 'rematch' })).toBe(true);
  });

  it('rejects malformed or foreign data', () => {
    expect(isRacerMsg(null)).toBe(false);
    expect(isRacerMsg({ t: 'nope' })).toBe(false);
    expect(isRacerMsg({ t: 'pos', x: 1, z: 2 })).toBe(false); // missing fields
    expect(isRacerMsg({ t: 'hello', name: 5, driver: 'x' })).toBe(false);
    expect(isRacerMsg({ t: 'hello', name: 'K', driver: 'x', inRace: 'yes' })).toBe(false);
    // Oversized display strings are refused at the wire.
    expect(isRacerMsg({ t: 'hello', name: 'x'.repeat(101), driver: 'unicorn' })).toBe(false);
    expect(isRacerMsg({ t: 'hello', name: 'K', driver: 'x'.repeat(101) })).toBe(false);
    expect(isRacerMsg({ t: 'world', coins: 'x', scores: [1, 2], status: 'racing', winner: null, elapsed: 1 })).toBe(false);
    expect(isRacerMsg({ t: 'world', coins: [], scores: [1], status: 'racing', winner: null, elapsed: 1 })).toBe(false);
    expect(isRacerMsg({ t: 'world', coins: [], scores: [1, 2], status: 'racing', winner: 2, elapsed: 1 })).toBe(false);
    expect(isRacerMsg({ t: 'pos', x: NaN, z: 0, heading: 0, speed: 0 })).toBe(false);
    expect(isRacerMsg({ t: 'worldDelta', spawned: [], scores: [1, 2], status: 'racing', winner: null, elapsed: 1 })).toBe(false); // no removed
    expect(
      isRacerMsg({ t: 'worldDelta', spawned: [], removed: ['3'], scores: [1, 2], status: 'racing', winner: null, elapsed: 1 }),
    ).toBe(false);
  });

  it('caps every coin array so a forged giant message cannot flood the guest', () => {
    const legit = Array.from({ length: 64 }, (_, i) => coin(i));
    const flood = Array.from({ length: 65 }, (_, i) => coin(i));
    const base = { scores: [0, 0] as [number, number], status: 'racing', winner: null, elapsed: 1 };

    expect(isRacerMsg({ t: 'world', coins: legit, ...base })).toBe(true);
    expect(isRacerMsg({ t: 'world', coins: flood, ...base })).toBe(false);
    expect(isRacerMsg({ t: 'worldDelta', spawned: legit, removed: [], ...base })).toBe(true);
    expect(isRacerMsg({ t: 'worldDelta', spawned: flood, removed: [], ...base })).toBe(false);
    expect(isRacerMsg({ t: 'worldDelta', spawned: [], removed: flood.map((c) => c.id), ...base })).toBe(false);
  });
});
