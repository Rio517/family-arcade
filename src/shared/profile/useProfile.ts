/**
 * React binding around the pure, game-neutral profile logic. Loads once from
 * localStorage and writes back on every change, so points and unlocks survive
 * refreshes and are shared across every game on the device.
 *
 * It exposes generic profile actions plus an escape hatch, `update`, so a game
 * can apply its own profile transitions (e.g. buying a skin) without this hook
 * needing to know about that game.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  recordResult as pureRecordResult,
  setName as pureSetName,
  type Profile,
  type ResultInput,
} from './profile';
import { loadProfile, saveProfile } from './profileStore';

export interface UseProfile {
  profile: Profile;
  setName: (name: string) => void;
  recordResult: (input: ResultInput) => void;
  /** Apply any pure profile transition; returns whether it changed anything. */
  update: (fn: (p: Profile) => Profile | null) => boolean;
}

export function useProfile(): UseProfile {
  const [profile, setProfile] = useState<Profile>(() => loadProfile());

  useEffect(() => {
    saveProfile(profile);
  }, [profile]);

  const setName = useCallback((name: string) => setProfile((p) => pureSetName(p, name)), []);

  const recordResult = useCallback((input: ResultInput) => {
    setProfile((p) => pureRecordResult(p, input));
  }, []);

  const update = useCallback((fn: (p: Profile) => Profile | null): boolean => {
    let changed = false;
    setProfile((p) => {
      const next = fn(p);
      if (next && next !== p) {
        changed = true;
        return next;
      }
      return p;
    });
    return changed;
  }, []);

  return { profile, setName, recordResult, update };
}
