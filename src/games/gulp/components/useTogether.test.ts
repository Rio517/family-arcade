import { describe, expect, it } from 'vitest';
import { seededRng } from '@shared/rng';
import { partyGuestCode, tableCode } from './useTogether';

const LOOKALIKES = /[ILO0-9]/;

describe('table letters', () => {
  it('are four letters with nothing that reads like a 1 or a 0', () => {
    const rng = seededRng(7);
    for (let i = 0; i < 500; i++) {
      const code = tableCode(rng);
      expect(code).toMatch(/^[A-Z]{4}$/);
      expect(code).not.toMatch(LOOKALIKES);
    }
  });

  it("a party guest's letters are the same on both devices, and differ from party to party", () => {
    expect(partyGuestCode('K7QZ')).toBe(partyGuestCode('K7QZ'));
    expect(partyGuestCode('K7QZ')).toMatch(/^[A-Z]{4}$/);
    expect(partyGuestCode('K7QZ')).not.toMatch(LOOKALIKES);
    const many = new Set(['AB23', 'AB24', 'XYZW', 'K7QZ', 'MMMM'].map(partyGuestCode));
    expect(many.size).toBe(5);
  });
});
