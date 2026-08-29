/**
 * React binding around the pure, game-neutral profile logic: the signed-in
 * player's profile, read from the roster store and written back on every
 * change, so points and unlocks follow that player into every game.
 *
 * It exposes generic profile actions plus an escape hatch, `update`, so a game
 * can apply its own profile transitions (e.g. buying a skin) without this hook
 * needing to know about that game.
 */

import { useCallback, useSyncExternalStore } from 'react';
import {
  recordResult as pureRecordResult,
  setPronouns as pureSetPronouns,
  type Profile,
  type ResultInput,
} from './profile';
import { getProfileSnapshot, setProfileState, subscribeProfile } from './profileStore';

export interface UseProfile {
  profile: Profile;
  /** Pronouns are profile data a game may ask for (Caribbean's commission);
   * the *name* is identity and lives in useIdentity, which games can't import. */
  setPronouns: (pronouns: string) => void;
  recordResult: (input: ResultInput) => void;
  /** Apply any pure profile transition; returns whether it changed anything. */
  update: (fn: (p: Profile) => Profile | null) => boolean;
}

export function useProfile(): UseProfile {
  // Subscribe to the one shared profile store, so every consumer (menu, party
  // bar, the game on screen) reflects the same identity, live. Persistence
  // happens inside the store on each change.
  const profile = useSyncExternalStore(subscribeProfile, getProfileSnapshot);

  const setPronouns = useCallback((pronouns: string) => {
    setProfileState(pureSetPronouns(getProfileSnapshot(), pronouns));
  }, []);

  const recordResult = useCallback((input: ResultInput) => {
    setProfileState(pureRecordResult(getProfileSnapshot(), input));
  }, []);

  const update = useCallback((fn: (p: Profile) => Profile | null): boolean => {
    const prev = getProfileSnapshot();
    const next = fn(prev);
    if (next && next !== prev) {
      setProfileState(next);
      return true;
    }
    return false;
  }, []);

  return { profile, setPronouns, recordResult, update };
}
