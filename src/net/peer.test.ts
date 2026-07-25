import { describe, expect, it } from 'vitest';
import { generateCode, normalizeCode } from './peer';
import { seededRng } from '../test/helpers';

describe('generateCode', () => {
  it('produces a 4-character code from the safe alphabet', () => {
    const code = generateCode(seededRng(1));
    expect(code).toHaveLength(4);
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
  });

  it('never emits look-alike characters (I, O, L, 0, 1)', () => {
    for (let seed = 0; seed < 40; seed++) {
      expect(generateCode(seededRng(seed))).not.toMatch(/[IOL01]/);
    }
  });

  it('is deterministic for a given seed', () => {
    expect(generateCode(seededRng(9))).toBe(generateCode(seededRng(9)));
  });
});

describe('normalizeCode', () => {
  it('uppercases, drops invalid characters, and caps at 4', () => {
    expect(normalizeCode('ab1cd')).toBe('ABCD'); // the ambiguous '1' is dropped
    expect(normalizeCode('  wxyz  ')).toBe('WXYZ');
    expect(normalizeCode('abcdef')).toBe('ABCD'); // capped to 4
    expect(normalizeCode('!!')).toBe('');
  });
});
