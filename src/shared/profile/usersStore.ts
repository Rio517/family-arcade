/**
 * Persistence + shared reactive store for the player roster. Same pattern as
 * the old device-profile store: one module-level snapshot, every hook
 * subscribes via useSyncExternalStore, writes go straight to localStorage.
 *
 * On the very first load of a browser that used the old one-profile-per-device
 * save, that profile is adopted as the first player (see migrateDeviceProfile)
 * so nobody's points or history are lost.
 */

import { normalizeProfile } from './profile';
import { emptyUsersState, migrateDeviceProfile, normalizeUsersState, type UsersState } from './users';
import { safeGet, safeSet } from '@shared/storage/kv';

const USERS_KEY = 'arcade.users.v1';
/** The old single-profile key (kept under its historical name in kv). */
const LEGACY_PROFILE_KEY = 'bship:profile:v1';

function load(): UsersState {
  const raw = safeGet(USERS_KEY);
  if (raw) {
    try {
      return normalizeUsersState(JSON.parse(raw));
    } catch {
      return emptyUsersState();
    }
  }
  const legacy = safeGet(LEGACY_PROFILE_KEY);
  if (!legacy) return emptyUsersState();
  try {
    return migrateDeviceProfile(normalizeProfile(JSON.parse(legacy)), Date.now());
  } catch {
    return emptyUsersState();
  }
}

let current: UsersState = load();
const listeners = new Set<() => void>();

export function getUsersSnapshot(): UsersState {
  return current;
}

export function subscribeUsers(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Replace the roster, persist it, and wake every subscriber. */
export function setUsersState(next: UsersState): void {
  if (next === current) return;
  current = next;
  safeSet(USERS_KEY, JSON.stringify(current));
  listeners.forEach((l) => l());
}

/** Re-read the store from storage. For tests, to isolate between cases. */
export function resetUsersStore(): void {
  current = load();
}

/** A fresh player id — uniqueness matters, prettiness doesn't. */
export function makeUserId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
