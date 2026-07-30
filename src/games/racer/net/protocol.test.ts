import { describe, expect, it } from 'vitest';
import { isRacerMsg } from './protocol';

describe('isRacerMsg', () => {
  it('accepts well-formed messages', () => {
    expect(isRacerMsg({ t: 'hello', name: 'Klara', driver: 'unicorn' })).toBe(true);
    expect(isRacerMsg({ t: 'go', target: 20 })).toBe(true);
    expect(isRacerMsg({ t: 'pos', x: 1, z: 2, heading: 0.5, speed: 30 })).toBe(true);
    expect(
      isRacerMsg({
        t: 'world',
        coins: [{ id: 1, x: 0, z: 0, hue: 200 }],
        scores: [3, 5],
        status: 'racing',
        winner: null,
        elapsed: 12.5,
      }),
    ).toBe(true);
    expect(isRacerMsg({ t: 'rematch' })).toBe(true);
  });

  it('rejects malformed or foreign data', () => {
    expect(isRacerMsg(null)).toBe(false);
    expect(isRacerMsg({ t: 'nope' })).toBe(false);
    expect(isRacerMsg({ t: 'pos', x: 1, z: 2 })).toBe(false); // missing fields
    expect(isRacerMsg({ t: 'hello', name: 5, driver: 'x' })).toBe(false);
    expect(isRacerMsg({ t: 'world', coins: 'x', scores: [1, 2], status: 'racing', winner: null, elapsed: 1 })).toBe(false);
    expect(isRacerMsg({ t: 'world', coins: [], scores: [1], status: 'racing', winner: null, elapsed: 1 })).toBe(false);
    expect(isRacerMsg({ t: 'pos', x: NaN, z: 0, heading: 0, speed: 0 })).toBe(false);
  });
});
