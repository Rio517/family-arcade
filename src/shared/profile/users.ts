/**
 * The player roster for one browser: several people share a device, and each
 * keeps their own profile (points, wins, unlocks, history) across every game.
 * At most one player is signed in ("active") at a time; games read and write
 * that player's profile through the existing profileStore facade.
 *
 * All functions here are pure — persistence and id/time generation live in
 * usersStore.ts, so these transitions are unit-testable and share nothing.
 */

import { defaultProfile, normalizeProfile, type Profile } from './profile';

export interface StoredUser {
  id: string;
  createdAt: number;
  profile: Profile;
}

export interface UsersState {
  users: StoredUser[];
  /** Who is signed in on this browser (null = nobody, the gate will ask). */
  activeId: string | null;
}

export function emptyUsersState(): UsersState {
  return { users: [], activeId: null };
}

/** Merge a possibly-partial stored object onto defaults (forward-compatible). */
export function normalizeUsersState(raw: unknown): UsersState {
  if (typeof raw !== 'object' || raw === null) return emptyUsersState();
  const r = raw as Partial<UsersState>;
  const users: StoredUser[] = Array.isArray(r.users)
    ? r.users.flatMap((u) => {
        if (typeof u !== 'object' || u === null) return [];
        const su = u as Partial<StoredUser>;
        if (typeof su.id !== 'string' || !su.id) return [];
        return [
          {
            id: su.id,
            createdAt: Number.isFinite(su.createdAt) ? (su.createdAt as number) : 0,
            profile: normalizeProfile(su.profile),
          },
        ];
      })
    : [];
  const activeId =
    typeof r.activeId === 'string' && users.some((u) => u.id === r.activeId) ? r.activeId : null;
  return { users, activeId };
}

/** Anything worth keeping in this profile? (Decides whether migration adopts it.) */
function hasSubstance(p: Profile): boolean {
  return (
    Boolean(p.name.trim()) ||
    p.points > 0 ||
    p.wins > 0 ||
    p.losses > 0 ||
    p.history.length > 0 ||
    p.unlocked.length > 0
  );
}

/**
 * First run on a browser that used the old one-profile-per-device save: that
 * profile becomes the first player, so nobody loses points or history. If it
 * carried a name, the device was effectively already signed in as that person,
 * so they stay signed in; a nameless profile waits for the gate to ask.
 */
export function migrateDeviceProfile(old: Profile | null, now: number): UsersState {
  if (!old || !hasSubstance(old)) return emptyUsersState();
  const named = Boolean(old.name.trim());
  const user: StoredUser = {
    id: 'player-legacy',
    createdAt: now,
    profile: { ...old, name: old.name.trim() || 'Player 1' },
  };
  return { users: [user], activeId: named ? user.id : null };
}

/** Add a brand-new player and sign them in. */
export function addUser(state: UsersState, id: string, name: string, now: number): UsersState {
  const profile = { ...defaultProfile(), name: name.trim().slice(0, 20) || 'Player' };
  return { users: [...state.users, { id, createdAt: now, profile }], activeId: id };
}

/** Sign a player in (or everyone out with null). Unknown ids are ignored. */
export function setActiveUser(state: UsersState, id: string | null): UsersState {
  if (id !== null && !state.users.some((u) => u.id === id)) return state;
  if (state.activeId === id) return state;
  return { ...state, activeId: id };
}

export function activeUser(state: UsersState): StoredUser | null {
  return state.users.find((u) => u.id === state.activeId) ?? null;
}

export function activeProfile(state: UsersState): Profile | null {
  return activeUser(state)?.profile ?? null;
}

/** Replace the signed-in player's profile. No-op when nobody is signed in. */
export function updateActiveProfile(state: UsersState, profile: Profile): UsersState {
  if (!state.activeId) return state;
  return {
    ...state,
    users: state.users.map((u) => (u.id === state.activeId ? { ...u, profile } : u)),
  };
}
