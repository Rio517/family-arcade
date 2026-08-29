import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useProfile } from './useProfile';
import { addUser, emptyUsersState, setActiveUser } from './users';
import { getUsersSnapshot, resetUsersStore, setUsersState } from './usersStore';

function Probe() {
  const p = useProfile();
  return (
    <p data-testid="probe">
      {p.userId ?? '-'}|{p.profile.name}
    </p>
  );
}

beforeEach(() => {
  localStorage.clear();
  resetUsersStore();
});

describe('useProfile().userId', () => {
  it('is the signed-in ticket id — live — and null when nobody is signed in', () => {
    const two = addUser(addUser(emptyUsersState(), 'u1', 'Rio'), 'u2', 'Klara');
    setUsersState(setActiveUser(two, 'u2'));
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('u2|Klara');
    act(() => setUsersState(setActiveUser(getUsersSnapshot(), 'u1')));
    expect(screen.getByTestId('probe')).toHaveTextContent('u1|Rio');
    act(() => setUsersState(setActiveUser(getUsersSnapshot(), null)));
    expect(screen.getByTestId('probe')).toHaveTextContent(/^-\|/);
  });
});
