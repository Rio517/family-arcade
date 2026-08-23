import { describe, expect, it } from 'vitest';
import { defaultProfile } from './profile';
import {
  activeProfile,
  activeUser,
  addUser,
  emptyUsersState,
  migrateDeviceProfile,
  normalizeUsersState,
  setActiveUser,
  updateActiveProfile,
} from './users';

describe('normalizeUsersState', () => {
  it('degrades garbage to an empty roster', () => {
    expect(normalizeUsersState(null)).toEqual(emptyUsersState());
    expect(normalizeUsersState('nope')).toEqual(emptyUsersState());
    expect(normalizeUsersState({ users: 'x', activeId: 3 })).toEqual(emptyUsersState());
  });

  it('drops malformed users and clears an activeId that matches nobody', () => {
    const state = normalizeUsersState({
      users: [{ id: 'a', createdAt: 5, profile: { name: 'Rio' } }, { nope: true }, null],
      activeId: 'ghost',
    });
    expect(state.users).toHaveLength(1);
    expect(state.users[0].profile.name).toBe('Rio');
    expect(state.activeId).toBeNull();
  });
});

describe('migrateDeviceProfile', () => {
  it('ignores a missing or untouched device profile', () => {
    expect(migrateDeviceProfile(null, 1)).toEqual(emptyUsersState());
    expect(migrateDeviceProfile(defaultProfile(), 1)).toEqual(emptyUsersState());
  });

  it('adopts a named device profile and keeps that person signed in', () => {
    const old = { ...defaultProfile(), name: 'Klara', points: 500, wins: 4 };
    const state = migrateDeviceProfile(old, 7);
    expect(state.users).toHaveLength(1);
    expect(state.users[0].profile).toMatchObject({ name: 'Klara', points: 500, wins: 4 });
    expect(state.activeId).toBe(state.users[0].id);
  });

  it('adopts a nameless-but-played profile without signing anyone in', () => {
    const old = { ...defaultProfile(), points: 120 };
    const state = migrateDeviceProfile(old, 7);
    expect(state.users[0].profile.name).toBe('Player 1');
    expect(state.activeId).toBeNull();
  });
});

describe('roster transitions', () => {
  it('addUser trims the name and signs the new player in', () => {
    const state = addUser(emptyUsersState(), 'u1', '  Flora  ', 3);
    expect(activeUser(state)?.id).toBe('u1');
    expect(activeProfile(state)?.name).toBe('Flora');
    expect(activeProfile(state)?.points).toBe(0);
  });

  it('setActiveUser switches between known players and ignores strangers', () => {
    let state = addUser(emptyUsersState(), 'u1', 'Rio', 1);
    state = addUser(state, 'u2', 'Klara', 2);
    expect(state.activeId).toBe('u2');
    state = setActiveUser(state, 'u1');
    expect(activeProfile(state)?.name).toBe('Rio');
    expect(setActiveUser(state, 'ghost')).toBe(state);
    expect(setActiveUser(state, null).activeId).toBeNull();
  });

  it('updateActiveProfile touches only the signed-in player', () => {
    let state = addUser(emptyUsersState(), 'u1', 'Rio', 1);
    state = addUser(state, 'u2', 'Klara', 2);
    state = updateActiveProfile(state, { ...activeProfile(state)!, points: 999 });
    expect(state.users.find((u) => u.id === 'u2')?.profile.points).toBe(999);
    expect(state.users.find((u) => u.id === 'u1')?.profile.points).toBe(0);
    expect(updateActiveProfile(setActiveUser(state, null), defaultProfile()).users).toEqual(
      state.users,
    );
  });
});
