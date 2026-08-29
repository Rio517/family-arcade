import { beforeEach, describe, expect, it } from 'vitest';
import { TINCTURES, loadColors, normalizeColors, pickColor, saveColors, tinctureName } from './riskColors';

const hex = (i: number) => TINCTURES[i].hex;

beforeEach(() => localStorage.clear());

describe('normalizeColors', () => {
  it('opens with the six tinctures in order', () => {
    expect(normalizeColors(null)).toEqual(TINCTURES.map((t) => t.hex));
  });

  it('keeps a saved order and repairs repeats and strangers with the first free tincture', () => {
    expect(normalizeColors([hex(1), hex(1), '#123456', hex(0)])).toEqual([
      hex(1),
      hex(0),
      hex(2),
      hex(3),
      hex(4),
      hex(5),
    ]);
  });
});

describe('pickColor', () => {
  it('swaps with whoever held the tincture, so no two chairs ever match', () => {
    const colors = normalizeColors(null);
    const next = pickColor(colors, 2, hex(0));
    expect(next[2]).toBe(hex(0));
    expect(next[0]).toBe(hex(2));
    expect(new Set(next).size).toBe(6);
    expect(colors[2]).toBe(hex(2)); // pure
  });

  it('is a no-op for the chair that already has it or for a colour off the palette', () => {
    const colors = normalizeColors(null);
    expect(pickColor(colors, 1, hex(1))).toBe(colors);
    expect(pickColor(colors, 1, '#ff00ff')).toBe(colors);
  });
});

describe('storage', () => {
  it('remembers the chairs across a reload and names each tincture', () => {
    saveColors(pickColor(normalizeColors(null), 0, hex(4)));
    expect(loadColors()[0]).toBe(hex(4));
    expect(loadColors()[4]).toBe(hex(0));
    expect(tinctureName(hex(4))).toBe('Plum');
    expect(tinctureName('#000')).toBe('General');
    localStorage.setItem('risk:colors:v1', '{bad');
    expect(loadColors()).toEqual(TINCTURES.map((t) => t.hex));
  });
});
