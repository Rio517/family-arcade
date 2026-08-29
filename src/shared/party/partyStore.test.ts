import { beforeEach, describe, expect, it } from 'vitest';
import { PARTY_TTL_MS } from './party';
import { PARTY_KEY, clearParty, loadParty, saveParty } from './partyStore';

beforeEach(() => localStorage.clear());

describe('partyStore', () => {
  it('remembers a party across a reload and forgets it on leave', () => {
    saveParty({ code: 'AB23', role: 'host', at: 5_000, table: { game: 'racer', code: 'CD45' } });
    expect(loadParty(6_000)).toEqual({ code: 'AB23', role: 'host', at: 5_000, table: { game: 'racer', code: 'CD45' } });
    clearParty();
    expect(loadParty(6_000)).toBeNull();
  });

  it('a stale party is not worth rejoining and is cleared on read', () => {
    saveParty({ code: 'AB23', role: 'guest', at: 0, table: null });
    expect(loadParty(PARTY_TTL_MS + 1)).toBeNull();
    expect(localStorage.getItem(PARTY_KEY)).toBeNull();
  });

  it('corrupt storage reads as no party', () => {
    localStorage.setItem(PARTY_KEY, '{nope');
    expect(loadParty(1)).toBeNull();
    localStorage.setItem(PARTY_KEY, JSON.stringify({ code: 'zz', role: 'host', at: 1 }));
    expect(loadParty(1)).toBeNull();
    expect(localStorage.getItem(PARTY_KEY)).toBeNull();
  });
});
