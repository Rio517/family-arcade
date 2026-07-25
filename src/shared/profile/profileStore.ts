/**
 * Persistence for the device profile (points, wins/losses, unlocks, history).
 * One profile per device, shared across every game. Reads are defensive: bad or
 * partial JSON degrades to a sane default rather than throwing.
 */

import { normalizeProfile, type Profile } from './profile';
import { safeGet, safeSet } from '@shared/storage/kv';

// Historical key (kept so existing players don't lose their profile).
const PROFILE_KEY = 'bship:profile:v1';

export function loadProfile(): Profile {
  const raw = safeGet(PROFILE_KEY);
  if (!raw) return normalizeProfile(null);
  try {
    return normalizeProfile(JSON.parse(raw));
  } catch {
    return normalizeProfile(null);
  }
}

export function saveProfile(profile: Profile): void {
  safeSet(PROFILE_KEY, JSON.stringify(profile));
}
