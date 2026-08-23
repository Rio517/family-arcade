/**
 * The profile facade every game reads and writes — now backed by the player
 * roster (usersStore) instead of one profile per device. `getProfileSnapshot`
 * is the signed-in player's profile; writes land on that player, so switching
 * players at the gate or the ticket booth swaps everyone's points, unlocks,
 * and history in one move. Games never need to know the roster exists.
 */

import { defaultProfile, type Profile } from './profile';
import { activeProfile, addUser, updateActiveProfile } from './users';
import { getUsersSnapshot, makeUserId, resetUsersStore, setUsersState, subscribeUsers } from './usersStore';

// Signed-out placeholder. One stable reference — useSyncExternalStore treats a
// fresh object per read as an endless re-render loop.
const SIGNED_OUT: Profile = defaultProfile();

export function getProfileSnapshot(): Profile {
  return activeProfile(getUsersSnapshot()) ?? SIGNED_OUT;
}

export const subscribeProfile = subscribeUsers;

/** Replace the signed-in player's profile, persist, wake subscribers. */
export function setProfileState(next: Profile): void {
  const users = getUsersSnapshot();
  if (users.activeId) {
    if (activeProfile(users) === next) return;
    setUsersState(updateActiveProfile(users, next));
    return;
  }
  // Defensive: a profile write with nobody signed in (say, a rename from the
  // party bar before any game door was opened) mints that person on the spot.
  const withUser = addUser(users, makeUserId(), next.name || 'Player', Date.now());
  setUsersState(updateActiveProfile(withUser, next));
}

/** Re-read the store from storage. For tests, to isolate between cases. */
export function resetProfileStore(): void {
  resetUsersStore();
}
