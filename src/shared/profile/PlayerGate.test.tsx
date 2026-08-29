import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PlayerGate } from './PlayerGate';
import { getUsersSnapshot, resetUsersStore, setUsersState } from './usersStore';
import { addUser, emptyUsersState, setActiveUser } from './users';

function gate() {
  return render(
    <MemoryRouter>
      <PlayerGate gameTitle="Galaxy Chess">
        <p data-testid="the-game">the game</p>
      </PlayerGate>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  resetUsersStore();
});

describe('<PlayerGate>', () => {
  it('lets a signed-in player straight through', () => {
    setUsersState(addUser(emptyUsersState(), 'u1', 'Rio', 1));
    gate();
    expect(screen.getByTestId('the-game')).toBeInTheDocument();
    expect(screen.queryByTestId('player-gate')).not.toBeInTheDocument();
  });

  it('a brand-new browser just types a name — no five-name chips', () => {
    gate();
    expect(screen.queryByTestId('the-game')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pgate-chip-Klara')).toBeNull();
    // The subtitle and the field's label both say it; the label is the field's.
    expect(screen.getByLabelText('Make your ticket')).toBe(screen.getByTestId('pgate-name'));
    expect(screen.getByTestId('pgate-name')).toHaveFocus();
    fireEvent.change(screen.getByTestId('pgate-name'), { target: { value: 'Klara' } });
    fireEvent.click(screen.getByTestId('pgate-create'));
    expect(screen.getByTestId('the-game')).toBeInTheDocument();
    expect(getUsersSnapshot().users.map((u) => u.profile.name)).toEqual(['Klara']);
  });

  it('creates a ticket from a typed name on Enter', () => {
    gate();
    fireEvent.change(screen.getByTestId('pgate-name'), { target: { value: '  Kai  ' } });
    fireEvent.submit(screen.getByTestId('pgate-name').closest('form')!);
    expect(screen.getByTestId('the-game')).toBeInTheDocument();
    expect(getUsersSnapshot().users[0]?.profile.name).toBe('Kai');
  });

  it('shows existing tickets when players exist but nobody is signed in', () => {
    let roster = addUser(emptyUsersState(), 'u1', 'Rio', 1);
    roster = addUser(roster, 'u2', 'Klara', 2);
    setUsersState(setActiveUser(roster, null));
    gate();
    expect(screen.getByText(/Galaxy Chess needs a player/)).toBeInTheDocument();
    // A returning player taps their stub; the field must not steal focus.
    expect(screen.getByTestId('pgate-name')).not.toHaveFocus();
    fireEvent.click(screen.getByTestId('pgate-user-u2'));
    expect(screen.getByTestId('the-game')).toBeInTheDocument();
  });

  it('filters the tickets as you type and Enter takes the top match', () => {
    let roster = addUser(emptyUsersState(), 'u1', 'Rio', 1);
    roster = addUser(roster, 'u2', 'Klara', 2);
    setUsersState(setActiveUser(roster, null));
    gate();
    fireEvent.change(screen.getByTestId('pgate-name'), { target: { value: 'kl' } });
    expect(screen.queryByTestId('pgate-user-u1')).toBeNull();
    fireEvent.submit(screen.getByTestId('pgate-name').closest('form')!);
    expect(getUsersSnapshot().activeId).toBe('u2');
    expect(screen.getByTestId('the-game')).toBeInTheDocument();
  });

  it('ignores a blank name', () => {
    gate();
    fireEvent.submit(screen.getByTestId('pgate-name').closest('form')!);
    expect(screen.queryByTestId('the-game')).not.toBeInTheDocument();
  });
});
