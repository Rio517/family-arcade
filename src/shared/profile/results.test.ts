import { beforeEach, describe, expect, it } from 'vitest';
import { recordResultFor } from './results';
import { addUser, emptyUsersState, setActiveUser, type UsersState } from './users';
import { getUsersSnapshot, resetUsersStore, setUsersState } from './usersStore';

const result = (won: boolean, code = 'AB23') => ({
  won,
  survivingCells: 0,
  code,
  game: 'chess',
  opponent: 'Kai',
  finishedAt: 1_000_000,
});

const byId = (state: UsersState, id: string) => state.users.find((u) => u.id === id)!.profile;

beforeEach(() => {
  localStorage.clear();
  resetUsersStore();
  setUsersState(setActiveUser(addUser(addUser(emptyUsersState(), 'u1', 'Rio'), 'u2', 'Klara'), 'u2'));
});

describe('recordResultFor — the result lands on the ticket that sat down, not whoever is signed in', () => {
  it('credits the named ticket: points, tally, history — and nobody else', () => {
    recordResultFor('u1', result(true));
    const rio = byId(getUsersSnapshot(), 'u1');
    expect(rio.wins).toBe(1);
    expect(rio.points).toBeGreaterThan(0);
    expect(rio.history[0]).toMatchObject({ code: 'AB23', game: 'chess', opponent: 'Kai', result: 'win' });
    // Klara is signed in, and untouched.
    const klara = byId(getUsersSnapshot(), 'u2');
    expect(klara.wins).toBe(0);
    expect(klara.history).toHaveLength(0);
  });

  it('a loss counts too', () => {
    recordResultFor('u2', result(false));
    expect(byId(getUsersSnapshot(), 'u2').losses).toBe(1);
  });

  it('an unknown or missing ticket records nothing (a bot chair, a save from before tickets)', () => {
    const before = getUsersSnapshot();
    recordResultFor('ghost', result(true));
    recordResultFor(null, result(true));
    expect(getUsersSnapshot()).toBe(before);
  });

  it('persists, so the credit survives a reload', () => {
    recordResultFor('u1', result(true));
    resetUsersStore();
    expect(byId(getUsersSnapshot(), 'u1').wins).toBe(1);
  });
});
