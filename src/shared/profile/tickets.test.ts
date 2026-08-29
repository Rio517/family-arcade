import { describe, expect, it } from 'vitest';
import { canCreateTicket, foldName, matchTickets } from './tickets';
import type { StoredUser } from './users';

const u = (id: string, name: string): StoredUser => ({
  id,
  profile: { name, pronouns: 'he/him', points: 0, wins: 0, losses: 0, unlocked: [], lastSkinId: '', history: [] },
});
const ROSTER = [u('a', 'Papa'), u('b', 'Klara'), u('c', 'Flora'), u('d', 'Mommy Zoë')];

describe('foldName', () => {
  it('lower-cases, trims and strips accents', () => {
    expect(foldName('  Zoë ')).toBe('zoe');
  });
});

describe('matchTickets', () => {
  it('returns everyone for a blank query, in roster order', () => {
    expect(matchTickets(ROSTER, '   ').map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('matches a prefix of any word, case- and accent-insensitively', () => {
    expect(matchTickets(ROSTER, 'fl').map((x) => x.id)).toEqual(['c']);
    expect(matchTickets(ROSTER, 'ZO').map((x) => x.id)).toEqual(['d']);
    expect(matchTickets(ROSTER, 'zoe').map((x) => x.id)).toEqual(['d']);
  });

  it('does not match inside a word', () => {
    expect(matchTickets(ROSTER, 'lara')).toEqual([]);
  });

  it('matches a whole multi-word name typed out, spaces and all', () => {
    expect(matchTickets(ROSTER, 'Mommy Zo').map((x) => x.id)).toEqual(['d']);
    expect(matchTickets(ROSTER, 'mommy zoe').map((x) => x.id)).toEqual(['d']);
  });
});

describe('canCreateTicket', () => {
  it('is false for a blank query', () => {
    expect(canCreateTicket(ROSTER, ' ')).toBe(false);
  });

  it('is false when a ticket already has exactly that name (folded)', () => {
    expect(canCreateTicket(ROSTER, 'papa')).toBe(false);
    expect(canCreateTicket(ROSTER, 'Mommy zoe')).toBe(false);
  });

  it('is true for a new name, even one that prefix-matches someone', () => {
    expect(canCreateTicket(ROSTER, 'Pa')).toBe(true);
    expect(canCreateTicket(ROSTER, 'Nana')).toBe(true);
  });
});
