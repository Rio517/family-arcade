/**
 * Chairs at a pass-and-play table. A chair holds a ticket (a roster id), a
 * computer player (a game's own bot id), or nothing — ids only, so a rename at
 * the booth shows up everywhere and nothing goes stale. Names are derived at
 * render with `seatName`. All functions are pure; the lineup store persists
 * `Lineup`s per game, and `seatsFromLineup` is the one place the precedence
 * rule lives: a saved lineup wins wholesale; the signed-in ticket seeds chair
 * one only when the game has no lineup yet.
 */

import type { StoredUser } from './users';

export type Seat =
  | { kind: 'ticket'; userId: string }
  | { kind: 'bot'; botId: string }
  | { kind: 'empty' };

export type LineupEntry = { userId: string } | { bot: string } | null;
export type Lineup = LineupEntry[];

export const EMPTY_SEAT: Seat = { kind: 'empty' };

export function seatsFromLineup(
  users: StoredUser[],
  lineup: Lineup | null,
  activeId: string | null,
  count: number,
): Seat[] {
  const known = new Set(users.map((u) => u.id));
  const seats: Seat[] = [];
  if (!lineup) {
    for (let i = 0; i < count; i++) {
      seats.push(i === 0 && activeId && known.has(activeId) ? { kind: 'ticket', userId: activeId } : EMPTY_SEAT);
    }
    return seats;
  }
  const seated = new Set<string>();
  for (let i = 0; i < count; i++) {
    const entry = lineup[i] ?? null;
    let seat: Seat = EMPTY_SEAT;
    if (entry && 'userId' in entry && known.has(entry.userId) && !seated.has(entry.userId)) {
      seat = { kind: 'ticket', userId: entry.userId };
      seated.add(entry.userId);
    } else if (entry && 'bot' in entry) {
      seat = { kind: 'bot', botId: entry.bot };
    }
    seats.push(seat);
  }
  return seats;
}

export function lineupOf(seats: Seat[]): Lineup {
  return seats.map((s) => (s.kind === 'ticket' ? { userId: s.userId } : s.kind === 'bot' ? { bot: s.botId } : null));
}

export function setSeat(seats: Seat[], index: number, seat: Seat): Seat[] {
  return seats.map((s, i) => (i === index ? seat : s));
}

export function clearSeat(seats: Seat[], index: number): Seat[] {
  return setSeat(seats, index, EMPTY_SEAT);
}

export function swapSeats(seats: Seat[], a: number, b: number): Seat[] {
  const next = seats.slice();
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

/** Seat someone in the first free chair. Returns the same array when the table
 * is full or that ticket is already seated. */
export function fillNextEmpty(seats: Seat[], seat: Seat): Seat[] {
  if (seat.kind === 'ticket' && seatedUserIds(seats).includes(seat.userId)) return seats;
  const i = seats.findIndex((s) => s.kind === 'empty');
  return i === -1 ? seats : setSeat(seats, i, seat);
}

export function seatedUserIds(seats: Seat[]): string[] {
  return seats.flatMap((s) => (s.kind === 'ticket' ? [s.userId] : []));
}

/** The name to show for a chair: the ticket's, the bot's, or '' for empty (or a ticket that vanished). */
export function seatName(seat: Seat, users: StoredUser[], botName: (botId: string) => string): string {
  if (seat.kind === 'ticket') return users.find((u) => u.id === seat.userId)?.profile.name ?? '';
  if (seat.kind === 'bot') return botName(seat.botId);
  return '';
}

export function normalizeLineup(raw: unknown): Lineup {
  if (!Array.isArray(raw)) return [];
  return raw.map((e): LineupEntry => {
    if (typeof e !== 'object' || e === null) return null;
    const r = e as Record<string, unknown>;
    if (typeof r.userId === 'string' && r.userId) return { userId: r.userId };
    if (typeof r.bot === 'string' && r.bot) return { bot: r.bot };
    return null;
  });
}

/** Every game id found is kept — a game that is temporarily unregistered
 * shouldn't lose its lineup. */
export function normalizeLineups(raw: unknown): Record<string, Lineup> {
  if (typeof raw !== 'object' || raw === null) return {};
  const out: Record<string, Lineup> = {};
  for (const [gameId, lineup] of Object.entries(raw as Record<string, unknown>)) {
    out[gameId] = normalizeLineup(lineup);
  }
  return out;
}
