import { beforeEach, describe, expect, it } from 'vitest';
import { getProfileSnapshot, setProfileState, subscribeProfile } from './profileStore';
import { defaultProfile } from './profile';
import { getUsersSnapshot, resetUsersStore, setUsersState } from './usersStore';
import { addUser, emptyUsersState, setActiveUser } from './users';

beforeEach(() => {
  localStorage.clear();
  resetUsersStore();
});

describe('the profile facade over the player roster', () => {
  it('reads as a stable signed-out default when nobody is signed in', () => {
    expect(getProfileSnapshot()).toEqual(defaultProfile());
    expect(getProfileSnapshot()).toBe(getProfileSnapshot()); // stable reference
  });

  it('drops a write with nobody signed in — only the roster makes players', () => {
    setProfileState({ ...defaultProfile(), name: 'Kai', points: 40 });
    expect(getProfileSnapshot()).toEqual(defaultProfile());
    expect(getUsersSnapshot().users).toEqual([]);
    expect(localStorage.getItem('arcade.users.v1')).toBeNull();
  });

  it('writes land on the signed-in player only, and switching swaps everything back', () => {
    let roster = addUser(emptyUsersState(), 'u1', 'Rio', 1);
    roster = addUser(roster, 'u2', 'Klara', 2);
    setUsersState(roster);

    setProfileState({ ...getProfileSnapshot(), points: 777 }); // Klara is active
    expect(getProfileSnapshot()).toMatchObject({ name: 'Klara', points: 777 });

    setUsersState(setActiveUser(getUsersSnapshot(), 'u1'));
    expect(getProfileSnapshot()).toMatchObject({ name: 'Rio', points: 0 });

    setUsersState(setActiveUser(getUsersSnapshot(), 'u2'));
    expect(getProfileSnapshot()).toMatchObject({ name: 'Klara', points: 777 });
  });

  it('notifies subscribers on change and stops after unsubscribe', () => {
    setUsersState(addUser(emptyUsersState(), 'u1', 'Rio', 1));
    let hits = 0;
    const unsub = subscribeProfile(() => hits++);

    setProfileState({ ...getProfileSnapshot(), points: 999 });
    expect(hits).toBe(1);
    expect(getProfileSnapshot().points).toBe(999);

    setProfileState(getProfileSnapshot()); // same reference — no-op, no notify
    expect(hits).toBe(1);

    unsub();
    setProfileState({ ...getProfileSnapshot(), points: 5 });
    expect(hits).toBe(1); // no longer listening
    expect(getProfileSnapshot().points).toBe(5);
  });

  it('adopts the old device profile as the first player on first load', () => {
    localStorage.setItem(
      'bship:profile:v1',
      JSON.stringify({ ...defaultProfile(), name: 'Flora', points: 350, wins: 3 }),
    );
    resetUsersStore();
    expect(getProfileSnapshot()).toMatchObject({ name: 'Flora', points: 350, wins: 3 });
    expect(getUsersSnapshot().users).toHaveLength(1);
  });

  it('recovers from corrupt roster JSON', () => {
    localStorage.setItem('arcade.users.v1', '{not json');
    resetUsersStore();
    expect(getProfileSnapshot()).toEqual(defaultProfile());
  });
});
