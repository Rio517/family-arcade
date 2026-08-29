import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useIdentity } from './useIdentity';
import { getUsersSnapshot, resetUsersStore, setUsersState } from './usersStore';
import { addUser, emptyUsersState, setActiveUser } from './users';

beforeEach(() => {
  localStorage.clear();
  resetUsersStore();
  // Rio and Klara on the roster; Klara signed in.
  const roster = addUser(addUser(emptyUsersState(), 'u1', 'Rio'), 'u2', 'Klara');
  setUsersState(setActiveUser(roster, 'u2'));
});

describe('useIdentity', () => {
  it('reads the roster and who is signed in', () => {
    const { result } = renderHook(() => useIdentity());
    expect(result.current.users.map((u) => u.profile.name)).toEqual(['Rio', 'Klara']);
    expect(result.current.active?.profile.name).toBe('Klara');
  });

  it('addPlayer makes a ticket without changing who is signed in', () => {
    const { result } = renderHook(() => useIdentity());
    let id = '';
    act(() => {
      id = result.current.addPlayer('  Nana ');
    });
    expect(id).not.toBe('');
    expect(getUsersSnapshot().users.map((u) => u.profile.name)).toEqual(['Rio', 'Klara', 'Nana']);
    expect(getUsersSnapshot().activeId).toBe('u2');
  });

  it('newPlayer makes a ticket and signs it in', () => {
    const { result } = renderHook(() => useIdentity());
    act(() => result.current.newPlayer('Nana'));
    expect(result.current.active?.profile.name).toBe('Nana');
  });

  it('signIn switches tickets; setName renames only the signed-in one', () => {
    const { result } = renderHook(() => useIdentity());
    act(() => result.current.signIn('u1'));
    expect(result.current.active?.id).toBe('u1');
    act(() => result.current.setName('  Rio the Great  '));
    const names = getUsersSnapshot().users.map((u) => u.profile.name);
    expect(names).toEqual(['Rio the Great', 'Klara']);
  });
});
