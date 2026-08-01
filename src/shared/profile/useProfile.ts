/**
 * React binding around the pure, game-neutral profile logic. Loads once from
 * localStorage and writes back on every change, so points and unlocks survive
 * refreshes and are shared across every game on the device.
 *
 * It exposes generic profile actions plus an escape hatch, `update`, so a game
 * can apply its own profile transitions (e.g. buying a skin) without this hook
 * needing to know about that game.
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  recordResult as pureRecordResult,
  setName as pureSetName,
  type Profile,
  type ResultInput,
} from './profile';
import { getProfileSnapshot, setProfileState, subscribeProfile } from './profileStore';
import { rememberName } from './recentNames';

export interface UseProfile {
  profile: Profile;
  setName: (name: string) => void;
  recordResult: (input: ResultInput) => void;
  /** Apply any pure profile transition; returns whether it changed anything. */
  update: (fn: (p: Profile) => Profile | null) => boolean;
}

export function useProfile(): UseProfile {
  // Subscribe to the one shared profile store, so every consumer (menu, party
  // bar, the game on screen) reflects the same identity, live. Persistence
  // happens inside the store on each change.
  const profile = useSyncExternalStore(subscribeProfile, getProfileSnapshot);

  // Remember the name for the picker's recent-names chips — but only once it
  // settles (a second after the last keystroke), so we don't store every
  // half-typed prefix.
  useEffect(() => {
    const n = profile.name.trim();
    if (!n) return;
    const id = setTimeout(() => rememberName(n), 1000);
    return () => clearTimeout(id);
  }, [profile.name]);

  const setName = useCallback((name: string) => {
    setProfileState(pureSetName(getProfileSnapshot(), name));
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

  return { profile, setName, recordResult, update };
}
