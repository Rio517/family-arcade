import { describe, expect, it } from 'vitest';
import { pickPlayerForTouch, steerToward, TOUCH_DEADZONE, type PlayerPos } from './input';

const PLAYERS: PlayerPos[] = [
  { id: 0, x: 100, y: 300 },
  { id: 1, x: 500, y: 300 },
  { id: 2, x: 900, y: 300 },
];

describe('pickPlayerForTouch', () => {
  it('claims the nearest character', () => {
    expect(pickPlayerForTouch(PLAYERS, new Set(), { x: 120, y: 310 })).toBe(0);
    expect(pickPlayerForTouch(PLAYERS, new Set(), { x: 520, y: 290 })).toBe(1);
    expect(pickPlayerForTouch(PLAYERS, new Set(), { x: 880, y: 300 })).toBe(2);
  });

  it('skips characters another finger already holds', () => {
    // A second finger lands nearest player 0, but player 0 is taken → next nearest.
    const taken = new Set([0]);
    expect(pickPlayerForTouch(PLAYERS, taken, { x: 130, y: 300 })).toBe(1);
  });

  it('lets three fingers each take a different character', () => {
    const taken = new Set<number>();
    const a = pickPlayerForTouch(PLAYERS, taken, { x: 110, y: 300 })!;
    taken.add(a);
    const b = pickPlayerForTouch(PLAYERS, taken, { x: 510, y: 300 })!;
    taken.add(b);
    const c = pickPlayerForTouch(PLAYERS, taken, { x: 890, y: 300 })!;
    taken.add(c);
    expect(new Set([a, b, c])).toEqual(new Set([0, 1, 2]));
  });

  it('returns null when every character is taken', () => {
    expect(pickPlayerForTouch(PLAYERS, new Set([0, 1, 2]), { x: 400, y: 300 })).toBeNull();
  });
});

describe('steerToward', () => {
  it('points a unit vector from the character to the finger', () => {
    const d = steerToward({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(d.x).toBeCloseTo(1);
    expect(d.y).toBeCloseTo(0);
  });

  it('is zero inside the deadzone so a resting finger does not jitter', () => {
    const d = steerToward({ x: 0, y: 0 }, { x: TOUCH_DEADZONE - 1, y: 0 });
    expect(d).toEqual({ x: 0, y: 0 });
  });

  it('normalizes diagonal drags', () => {
    const d = steerToward({ x: 0, y: 0 }, { x: 60, y: 80 });
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1);
    expect(d.x).toBeCloseTo(0.6);
    expect(d.y).toBeCloseTo(0.8);
  });
});
