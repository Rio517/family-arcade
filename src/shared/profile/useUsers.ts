/**
 * React binding for the player roster: who exists on this browser, who is
 * signed in, and the two roster moves (sign in, add a player). Renaming goes
 * through useProfile().setName — it edits the signed-in player's profile like
 * any other profile write, and only the booth does it.
 */

import { useCallback, useSyncExternalStore } from 'react';
import { activeUser, addUser, setActiveUser, type StoredUser } from './users';
import { getUsersSnapshot, makeUserId, setUsersState, subscribeUsers } from './usersStore';

export interface UseUsers {
  users: StoredUser[];
  /** The signed-in player, or null when the gate should ask. */
  active: StoredUser | null;
  signIn: (id: string) => void;
  /** Create a brand-new player (signed in immediately). */
  newPlayer: (name: string) => void;
}

export function useUsers(): UseUsers {
  const state = useSyncExternalStore(subscribeUsers, getUsersSnapshot);

  const signIn = useCallback((id: string) => {
    setUsersState(setActiveUser(getUsersSnapshot(), id));
  }, []);

  const newPlayer = useCallback((name: string) => {
    setUsersState(addUser(getUsersSnapshot(), makeUserId(), name, Date.now()));
  }, []);

  return { users: state.users, active: activeUser(state), signIn, newPlayer };
}
