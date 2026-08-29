/**
 * Matching for the ticket list — the one place a player is picked, at the
 * gate and behind "Change". Prefix-on-any-word, case- and accent-folded, so
 * "fl" finds Flora and "zo" finds Mommy Zoë: fast for a seven-year-old.
 */
import type { StoredUser } from './users';

export function foldName(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
}

export function matchTickets(users: StoredUser[], query: string): StoredUser[] {
  const q = foldName(query);
  if (!q) return users;
  return users.filter((u) => foldName(u.profile.name).split(/\s+/).some((w) => w.startsWith(q)));
}

/** A new ticket can be made unless the name is blank or already taken. */
export function canCreateTicket(users: StoredUser[], query: string): boolean {
  const q = foldName(query);
  if (!q) return false;
  return !users.some((u) => foldName(u.profile.name) === q);
}
