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

// ── shared reactive store ────────────────────────────────────────────────
// One device profile, one source of truth. Every `useProfile()` subscribes to
// this single store (via useSyncExternalStore), so a name changed in the party
// bar is instantly seen by the menu and by whatever game is on screen — no more
// per-hook copies drifting apart until the next remount. (localStorage's own
// `storage` event only fires in OTHER tabs, so it can't do this for us.)
let current: Profile = loadProfile();
const listeners = new Set<() => void>();

export function getProfileSnapshot(): Profile {
  return current;
}

export function subscribeProfile(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Replace the shared profile, persist it, and wake every subscriber. */
export function setProfileState(next: Profile): void {
  if (next === current) return;
  current = next;
  saveProfile(current);
  listeners.forEach((l) => l());
}

/** Re-read the store from storage. For tests, to isolate between cases. */
export function resetProfileStore(): void {
  current = loadProfile();
}
