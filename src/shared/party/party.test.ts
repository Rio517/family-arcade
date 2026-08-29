import { describe, expect, it } from 'vitest';
import { PARTY_TTL_MS, isFresh, normalizeParty, normalizeTable, type StoredParty } from './party';

const good: StoredParty = { code: 'AB23', role: 'guest', at: 1_000, table: null };

describe('normalizeParty', () => {
  it('keeps a well-formed party and its table', () => {
    expect(normalizeParty({ ...good, table: { game: 'chess', code: 'CD45', hostSide: 'b' } })).toEqual({
      ...good,
      table: { game: 'chess', code: 'CD45', hostSide: 'b' },
    });
  });

  it('refuses a party whose code could not be a broker id, or whose role is nonsense', () => {
    expect(normalizeParty({ ...good, code: 'ab23' })).toBeNull();
    expect(normalizeParty({ ...good, code: 'AB0' })).toBeNull();
    expect(normalizeParty({ ...good, role: 'admin' })).toBeNull();
    expect(normalizeParty({ ...good, at: 'yesterday' })).toBeNull();
    expect(normalizeParty('AB23')).toBeNull();
    expect(normalizeParty(null)).toBeNull();
  });

  it('drops a bad table but keeps the party', () => {
    expect(normalizeParty({ ...good, table: { game: 'chess', code: 'nope' } })).toEqual({ ...good, table: null });
    expect(normalizeTable({ game: '', code: 'AB23' })).toBeNull();
    // A bad side loses the side, not the table.
    expect(normalizeTable({ game: 'chess', code: 'AB23', hostSide: 'x'.repeat(9) })).toEqual({ game: 'chess', code: 'AB23' });
  });
});

describe('isFresh', () => {
  it('is true within twelve hours and false after — or from the future', () => {
    expect(isFresh(good, good.at + PARTY_TTL_MS)).toBe(true);
    expect(isFresh(good, good.at + PARTY_TTL_MS + 1)).toBe(false);
    expect(isFresh(good, good.at - 1)).toBe(false);
  });
});
