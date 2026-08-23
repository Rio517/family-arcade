import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PlayerGate } from './PlayerGate';
import { resetUsersStore, setUsersState } from './usersStore';
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

  it('offers the family as one-tap tickets on a brand-new browser', () => {
    gate();
    expect(screen.queryByTestId('the-game')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('pgate-chip-Klara'));
    expect(screen.getByTestId('the-game')).toBeInTheDocument();
  });

  it('creates a ticket from a typed name', () => {
    gate();
    fireEvent.change(screen.getByTestId('pgate-name'), { target: { value: '  Kai  ' } });
    fireEvent.submit(screen.getByTestId('pgate-name').closest('form')!);
    expect(screen.getByTestId('the-game')).toBeInTheDocument();
  });

  it('shows existing tickets when players exist but nobody is signed in', () => {
    let roster = addUser(emptyUsersState(), 'u1', 'Rio', 1);
    roster = addUser(roster, 'u2', 'Klara', 2);
    setUsersState(setActiveUser(roster, null));
    gate();
    expect(screen.getByText(/Galaxy Chess needs a player/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('pgate-user-u2'));
    expect(screen.getByTestId('the-game')).toBeInTheDocument();
  });

  it('ignores a blank name', () => {
    gate();
    fireEvent.submit(screen.getByTestId('pgate-name').closest('form')!);
    expect(screen.queryByTestId('the-game')).not.toBeInTheDocument();
  });
});
