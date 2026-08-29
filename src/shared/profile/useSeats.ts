/**
 * React binding for a game's chairs: seeds them from the remembered lineup
 * (or the signed-in ticket), hands back the roster for the strip, and
 * `remember()` writes the lineup when the game actually starts — a picker
 * left half-filled and abandoned changes nothing for next time.
 *
 * Until someone touches a chair the table derives live from the lineup, so a
 * game that asks "how many?" after mounting (Magic Coins, Risk's count row)
 * still restores every remembered chair. Once touched, a bigger table keeps
 * what was chosen and fills the new chairs from the lineup.
 */

import { useState, useSyncExternalStore } from 'react';
import { getLineupsSnapshot, setLineup, subscribeLineups } from './lineupStore';
import { EMPTY_SEAT, fillChairs, lineupOf, seatsFromLineup, type Seat } from './seats';
import type { StoredUser } from './users';
import { getUsersSnapshot, subscribeUsers } from './usersStore';

export interface UseSeats {
  seats: Seat[];
  users: StoredUser[];
  /** The signed-in ticket's id, for the "you" mark. */
  activeId: string | null;
  setSeats: (next: Seat[]) => void;
  /** Persist this lineup for the game — call when the game starts. */
  remember: () => void;
}

export function useSeats(gameId: string, count: number): UseSeats {
  const roster = useSyncExternalStore(subscribeUsers, getUsersSnapshot);
  const lineups = useSyncExternalStore(subscribeLineups, getLineupsSnapshot);
  const seeded = seatsFromLineup(roster.users, lineups[gameId] ?? null, roster.activeId, count);
  // null until a chair is touched — the seed stays live until then.
  const [chosen, setChosen] = useState<Seat[] | null>(null);
  const seats = chosen ? fillChairs(count, (i) => chosen[i] ?? seeded[i] ?? EMPTY_SEAT) : seeded;

  // Called from click handlers only; the array is fresh every render, so a
  // memoised version would be rebuilt every time anyway.
  const remember = () => setLineup(gameId, lineupOf(seats));
  const setSeats = (next: Seat[]) => setChosen(next);

  return { seats, users: roster.users, activeId: roster.activeId, setSeats, remember };
}
