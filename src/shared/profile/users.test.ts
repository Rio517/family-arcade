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

  it('keeps one ticket per id and ignores keys it no longer stores', () => {
    const state = normalizeUsersState({
      users: [
        { id: 'a', createdAt: 'x', profile: { name: 'Rio' } },
        { id: 'a', createdAt: 2, profile: { name: 'Rio again' } },
      ],
      activeId: 'a',
    });
    expect(state.users).toHaveLength(1);
    expect(state.users[0]).toEqual({ id: 'a', profile: expect.objectContaining({ name: 'Rio' }) });
    expect(state.activeId).toBe('a');
  });

  it('caps a stored name at 20 characters like setName does', () => {
    const state = normalizeUsersState({
      users: [{ id: 'a', createdAt: 1, profile: { name: '  Bartholomew Fitzgerald III  ' } }],
      activeId: null,
    });
    expect(state.users[0].profile.name).toBe('Bartholomew Fitzgera');
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

  it('keeps pronouns independent when stored players are normalized and switched', () => {
    let state = normalizeUsersState({
      users: [
        { id: 'rio', createdAt: 1, profile: { name: 'Rio', pronouns: 'they/them' } },
        { id: 'klara', createdAt: 2, profile: { name: 'Klara', pronouns: 'she/her' } },
      ],
      activeId: 'rio',
    });

    expect(activeProfile(state)).toMatchObject({ name: 'Rio', pronouns: 'they/them' });
    state = setActiveUser(state, 'klara');
    expect(activeProfile(state)).toMatchObject({ name: 'Klara', pronouns: 'she/her' });
    expect(state.users).toEqual([
      expect.objectContaining({ id: 'rio', profile: expect.objectContaining({ pronouns: 'they/them' }) }),
      expect.objectContaining({ id: 'klara', profile: expect.objectContaining({ pronouns: 'she/her' }) }),
    ]);
  });
});

describe('migrateDeviceProfile', () => {
  it('ignores a missing or untouched device profile', () => {
    expect(migrateDeviceProfile(null)).toEqual(emptyUsersState());
    expect(migrateDeviceProfile(defaultProfile())).toEqual(emptyUsersState());
  });

  it('adopts a named device profile and keeps that person signed in', () => {
    const old = { ...defaultProfile(), name: 'Klara', points: 500, wins: 4 };
    const state = migrateDeviceProfile(old);
    expect(state.users).toHaveLength(1);
    expect(state.users[0].profile).toMatchObject({ name: 'Klara', points: 500, wins: 4 });
    expect(state.activeId).toBe(state.users[0].id);
  });

  it('adopts a nameless-but-played profile without signing anyone in', () => {
    const old = { ...defaultProfile(), points: 120 };
    const state = migrateDeviceProfile(old);
    expect(state.users[0].profile.name).toBe('Player 1');
    expect(state.activeId).toBeNull();
  });
});

describe('roster transitions', () => {
  it('addUser appends a trimmed ticket and leaves the signed-in player alone', () => {
    let state = addUser(emptyUsersState(), 'u1', '  Flora  ');
    expect(state.activeId).toBeNull();
    expect(state.users[0].profile).toMatchObject({ name: 'Flora', points: 0 });
    state = setActiveUser(state, 'u1');
    state = addUser(state, 'u2', 'Rio');
    expect(activeUser(state)?.id).toBe('u1');
    expect(state.users.map((u) => u.id)).toEqual(['u1', 'u2']);
  });

  it('setActiveUser switches between known players and ignores strangers', () => {
    let state = addUser(emptyUsersState(), 'u1', 'Rio');
    state = addUser(state, 'u2', 'Klara');
    expect(state.activeId).toBeNull();
    state = setActiveUser(state, 'u1');
    expect(activeProfile(state)?.name).toBe('Rio');
    expect(setActiveUser(state, 'ghost')).toBe(state);
    expect(setActiveUser(state, null).activeId).toBeNull();
  });

  it('addUser trims and caps the name at 20 characters', () => {
    const state = addUser(emptyUsersState(), 'u1', '  Bartholomew Fitzgerald III  ');
    expect(state.users[0].profile.name).toBe('Bartholomew Fitzgera');
  });

  it('updateActiveProfile touches only the signed-in player', () => {
    let state = addUser(emptyUsersState(), 'u1', 'Rio');
    state = setActiveUser(addUser(state, 'u2', 'Klara'), 'u2');
    state = updateActiveProfile(state, { ...activeProfile(state)!, points: 999 });
    expect(state.users.find((u) => u.id === 'u2')?.profile.points).toBe(999);
    expect(state.users.find((u) => u.id === 'u1')?.profile.points).toBe(0);
    expect(updateActiveProfile(setActiveUser(state, null), defaultProfile()).users).toEqual(
      state.users,
    );
  });
});
