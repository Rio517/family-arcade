import { describe, expect, it } from 'vitest';
import { playerColor } from './playerColors';

describe('playerColor', () => {
  it('hands out the six ticket colours by roster position, then wraps', () => {
    const first = Array.from({ length: 6 }, (_, i) => playerColor(i));
    expect(new Set(first).size).toBe(6);
    expect(playerColor(6)).toBe(playerColor(0));
    expect(playerColor(13)).toBe(playerColor(1));
  });

  it('a ticket missing from the roster still gets a colour', () => {
    expect(playerColor(-1)).toBe(playerColor(0));
  });
});
