/**
 * The profile facade every game reads and writes — now backed by the player
 * roster (usersStore) instead of one profile per device. `getProfileSnapshot`
 * is the signed-in player's profile; writes land on that player, so switching
 * players at the gate or the ticket booth swaps everyone's points, unlocks,
 * and history in one move. Games never need to know the roster exists.
 */

import { defaultProfile, type Profile } from './profile';
import { activeProfile, updateActiveProfile } from './users';
import { getUsersSnapshot, setUsersState, subscribeUsers } from './usersStore';

// Signed-out placeholder. One stable reference — useSyncExternalStore treats a
// fresh object per read as an endless re-render loop.
const SIGNED_OUT: Profile = defaultProfile();

export function getProfileSnapshot(): Profile {
  return activeProfile(getUsersSnapshot()) ?? SIGNED_OUT;
}

export const subscribeProfile = subscribeUsers;

/**
 * Replace the signed-in player's profile, persist, wake subscribers. With
 * nobody signed in the write is dropped: every writer sits behind the gate or
 * inside the booth's signed-in branch, so this only happens on corrupt
 * storage — and minting a nameless "Player" ticket would be worse than losing
 * one write. Only the roster (TicketList → newPlayer) creates players.
 */
export function setProfileState(next: Profile): void {
  const users = getUsersSnapshot();
  if (!users.activeId) return;
  if (activeProfile(users) === next) return;
  setUsersState(updateActiveProfile(users, next));
}
