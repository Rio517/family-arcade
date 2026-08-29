/**
 * React binding for a game's chairs: seeds them from the remembered lineup
 * (or the signed-in ticket), hands back the roster for the strip, and
 * `remember()` writes the lineup when the game actually starts — a picker
 * left half-filled and abandoned changes nothing for next time.
 */

import { useCallback, useState, useSyncExternalStore } from 'react';
import { getLineupsSnapshot, setLineup, subscribeLineups } from './lineupStore';
import { EMPTY_SEAT, lineupOf, seatsFromLineup, type Seat } from './seats';
import type { StoredUser } from './users';
import { getUsersSnapshot, subscribeUsers } from './usersStore';

export interface UseSeats {
  seats: Seat[];
  users: StoredUser[];
  setSeats: (next: Seat[]) => void;
  /** Persist this lineup for the game — call when the game starts. */
  remember: () => void;
}

/** Fit chosen chairs to the table size: keep what's chosen, pad with empties. */
function fit(seats: Seat[], count: number): Seat[] {
  if (seats.length === count) return seats;
  const next = seats.slice(0, count);
  while (next.length < count) next.push(EMPTY_SEAT);
  return next;
}

export function useSeats(gameId: string, count: number): UseSeats {
  const roster = useSyncExternalStore(subscribeUsers, getUsersSnapshot);
  const lineups = useSyncExternalStore(subscribeLineups, getLineupsSnapshot);
  const [chosen, setChosen] = useState<Seat[]>(() =>
    seatsFromLineup(roster.users, lineups[gameId] ?? null, roster.activeId, count),
  );
  const seats = fit(chosen, count);

  const remember = useCallback(() => {
    setLineup(gameId, lineupOf(fit(chosen, count)));
  }, [gameId, chosen, count]);

  return { seats, users: roster.users, setSeats: setChosen, remember };
}
