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

import { useCallback, useState, useSyncExternalStore } from 'react';
import { getLineupsSnapshot, setLineup, subscribeLineups } from './lineupStore';
import { EMPTY_SEAT, lineupOf, seatedUserIds, seatsFromLineup, type Seat } from './seats';
import type { StoredUser } from './users';
import { getUsersSnapshot, subscribeUsers } from './usersStore';

export interface UseSeats {
  seats: Seat[];
  users: StoredUser[];
  setSeats: (next: Seat[]) => void;
  /** Persist this lineup for the game — call when the game starts. */
  remember: () => void;
}

/** Fit chosen chairs to the seeded table: keep what's chosen, take the rest
 * from the seed unless that ticket is already seated. */
function fit(chosen: Seat[], seeded: Seat[]): Seat[] {
  const next = chosen.slice(0, seeded.length);
  const taken = new Set(seatedUserIds(next));
  for (let i = next.length; i < seeded.length; i++) {
    const s = seeded[i];
    if (s.kind === 'ticket' && taken.has(s.userId)) {
      next.push(EMPTY_SEAT);
    } else {
      next.push(s);
      if (s.kind === 'ticket') taken.add(s.userId);
    }
  }
  return next;
}

export function useSeats(gameId: string, count: number): UseSeats {
  const roster = useSyncExternalStore(subscribeUsers, getUsersSnapshot);
  const lineups = useSyncExternalStore(subscribeLineups, getLineupsSnapshot);
  const seeded = seatsFromLineup(roster.users, lineups[gameId] ?? null, roster.activeId, count);
  // null until a chair is touched — the seed stays live until then.
  const [chosen, setChosen] = useState<Seat[] | null>(null);
  const seats = chosen ? fit(chosen, seeded) : seeded;

  const remember = useCallback(() => {
    setLineup(gameId, lineupOf(seats));
  }, [gameId, seats]);

  return { seats, users: roster.users, setSeats: setChosen, remember };
}
