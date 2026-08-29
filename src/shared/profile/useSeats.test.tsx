import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { EMPTY_SEAT, fillNextEmpty } from './seats';
import { LINEUP_KEY, resetLineupStore, setLineup } from './lineupStore';
import { useSeats } from './useSeats';
import { resetUsersStore, setUsersState } from './usersStore';
import { addUser, emptyUsersState, setActiveUser } from './users';

beforeEach(() => {
  localStorage.clear();
  resetUsersStore();
  resetLineupStore();
  const roster = addUser(addUser(addUser(emptyUsersState(), 'u1', 'Rio'), 'u2', 'Klara'), 'u3', 'Flora');
  setUsersState(setActiveUser(roster, 'u2'));
});

describe('useSeats', () => {
  it('seats the signed-in ticket first when the game has no lineup', () => {
    const { result } = renderHook(() => useSeats('chess', 2));
    expect(result.current.seats).toEqual([{ kind: 'ticket', userId: 'u2' }, EMPTY_SEAT]);
    expect(result.current.users.map((u) => u.id)).toEqual(['u1', 'u2', 'u3']);
  });

  it('opens with the remembered lineup when there is one', () => {
    setLineup('risk', [{ userId: 'u3' }, { bot: 'vex' }, { userId: 'u1' }]);
    const { result } = renderHook(() => useSeats('risk', 3));
    expect(result.current.seats).toEqual([
      { kind: 'ticket', userId: 'u3' },
      { kind: 'bot', botId: 'vex' },
      { kind: 'ticket', userId: 'u1' },
    ]);
  });

  it('remember() writes the lineup for next time', () => {
    const { result } = renderHook(() => useSeats('unicorn', 2));
    act(() => result.current.setSeats(fillNextEmpty(result.current.seats, { kind: 'ticket', userId: 'u1' })));
    act(() => result.current.remember());
    expect(JSON.parse(localStorage.getItem(LINEUP_KEY) ?? '{}')).toEqual({
      unicorn: [{ userId: 'u2' }, { userId: 'u1' }],
    });
  });

  it('a table that learns its size after mount still restores the remembered chairs', () => {
    // Magic Coins asks "how many?" first, so the hook mounts at 1 chair.
    setLineup('unicorn', [{ userId: 'u3' }, { userId: 'u1' }]);
    const { result, rerender } = renderHook(({ count }) => useSeats('unicorn', count), {
      initialProps: { count: 1 },
    });
    expect(result.current.seats).toEqual([{ kind: 'ticket', userId: 'u3' }]);
    rerender({ count: 2 });
    expect(result.current.seats).toEqual([{ kind: 'ticket', userId: 'u3' }, { kind: 'ticket', userId: 'u1' }]);
  });

  it('once chairs are chosen, a bigger table fills the new chairs from the lineup, never seating anyone twice', () => {
    setLineup('risk', [{ userId: 'u3' }, { bot: 'vex' }, { userId: 'u1' }]);
    const { result, rerender } = renderHook(({ count }) => useSeats('risk', count), {
      initialProps: { count: 1 },
    });
    act(() => result.current.setSeats([{ kind: 'ticket', userId: 'u1' }]));
    rerender({ count: 3 });
    expect(result.current.seats).toEqual([
      { kind: 'ticket', userId: 'u1' },
      { kind: 'bot', botId: 'vex' },
      EMPTY_SEAT, // u1 is already in chair one
    ]);
  });

  it('a bigger table keeps the chairs already chosen and adds empties', () => {
    const { result, rerender } = renderHook(({ count }) => useSeats('risk', count), {
      initialProps: { count: 2 },
    });
    act(() => result.current.setSeats([{ kind: 'ticket', userId: 'u2' }, { kind: 'bot', botId: 'cadet' }]));
    rerender({ count: 4 });
    expect(result.current.seats).toEqual([
      { kind: 'ticket', userId: 'u2' },
      { kind: 'bot', botId: 'cadet' },
      EMPTY_SEAT,
      EMPTY_SEAT,
    ]);
    rerender({ count: 1 });
    expect(result.current.seats).toEqual([{ kind: 'ticket', userId: 'u2' }]);
  });
});
