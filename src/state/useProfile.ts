/**
 * React binding around the pure profile logic in state/profile.ts. Loads once
 * from localStorage and writes back on every change, so points and unlocks
 * survive refreshes and are shared across every game on the device.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  recordResult as pureRecordResult,
  selectSkin as pureSelectSkin,
  setName as pureSetName,
  unlockSkin as pureUnlockSkin,
  type Profile,
  type ResultInput,
} from './profile';
import { loadProfile, saveProfile } from '../storage/persistence';
import type { Skin } from '../game/constants';

export interface UseProfile {
  profile: Profile;
  setName: (name: string) => void;
  selectSkin: (skinId: string) => void;
  /** Returns true if the unlock succeeded (owned + affordable). */
  unlockSkin: (skin: Skin) => boolean;
  recordResult: (input: ResultInput) => void;
}

export function useProfile(): UseProfile {
  const [profile, setProfile] = useState<Profile>(() => loadProfile());

  useEffect(() => {
    saveProfile(profile);
  }, [profile]);

  const setName = useCallback((name: string) => setProfile((p) => pureSetName(p, name)), []);
  const selectSkin = useCallback((skinId: string) => setProfile((p) => pureSelectSkin(p, skinId)), []);

  const unlockSkin = useCallback((skin: Skin): boolean => {
    let ok = false;
    setProfile((p) => {
      const next = pureUnlockSkin(p, skin);
      if (next) {
        ok = true;
        return pureSelectSkin(next, skin.id);
      }
      return p;
    });
    return ok;
  }, []);

  const recordResult = useCallback((input: ResultInput) => {
    setProfile((p) => pureRecordResult(p, input));
  }, []);

  return { profile, setName, selectSkin, unlockSkin, recordResult };
}
