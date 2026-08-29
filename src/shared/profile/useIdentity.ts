/**
 * Who is on this browser and who is playing: the roster, the signed-in
 * ticket, and every move that changes identity — sign in, make a ticket,
 * rename. Only the gate, the booth, PlayingAs and the seat pickers use it;
 * `src/games/**` cannot import it (ESLint), so no game ever writes a name.
 * Games read the signed-in ticket through useProfile().
 */

import { useCallback, useSyncExternalStore } from 'react';
import { setName as pureSetName } from './profile';
import { activeUser, addUser, setActiveUser, updateActiveProfile, type StoredUser } from './users';
import { getUsersSnapshot, makeUserId, setUsersState, subscribeUsers } from './usersStore';

export interface UseIdentity {
  users: StoredUser[];
  /** The signed-in player, or null when the gate should ask. */
  active: StoredUser | null;
  signIn: (id: string) => void;
  /** Make a ticket for someone else at the table; returns its id. Nobody's sign-in changes. */
  addPlayer: (name: string) => string;
  /** Make a ticket and sign it in — the gate and "Change". */
  newPlayer: (name: string) => void;
  /** Rename the signed-in ticket (the booth's Edit profile). */
  setName: (name: string) => void;
}

export function useIdentity(): UseIdentity {
  const state = useSyncExternalStore(subscribeUsers, getUsersSnapshot);

  const signIn = useCallback((id: string) => {
    setUsersState(setActiveUser(getUsersSnapshot(), id));
  }, []);

  const addPlayer = useCallback((name: string) => {
    const id = makeUserId();
    setUsersState(addUser(getUsersSnapshot(), id, name));
    return id;
  }, []);

  const newPlayer = useCallback((name: string) => {
    const id = makeUserId();
    setUsersState(setActiveUser(addUser(getUsersSnapshot(), id, name), id));
  }, []);

  const setName = useCallback((name: string) => {
    const users = getUsersSnapshot();
    const me = activeUser(users);
    if (me) setUsersState(updateActiveProfile(users, pureSetName(me.profile, name)));
  }, []);

  return { users: state.users, active: activeUser(state), signIn, addPlayer, newPlayer, setName };
}
