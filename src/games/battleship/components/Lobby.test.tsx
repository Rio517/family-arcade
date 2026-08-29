import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Lobby } from './Lobby';
import { resetUsersStore, setUsersState } from '@shared/profile/usersStore';
import { addUser, emptyUsersState, setActiveUser } from '@shared/profile/users';

function setup(name = 'Rio') {
  const onHost = vi.fn();
  const onJoin = vi.fn();
  const onSolo = vi.fn();
  render(<Lobby name={name} onHost={onHost} onJoin={onJoin} onSolo={onSolo} />);
  return { onHost, onJoin, onSolo };
}

beforeEach(() => {
  localStorage.clear();
  resetUsersStore();
  // A ticket is the identity: Rio is signed in, so the lobby never asks.
  setUsersState(setActiveUser(addUser(emptyUsersState(), 'u1', 'Rio'), 'u1'));
});

describe('<Lobby>', () => {
  it('says who is playing instead of asking for a name', () => {
    setup('Rio');
    expect(screen.getByTestId('playing-as')).toHaveTextContent("You're Rio");
    expect(screen.queryByTestId('name-input')).toBeNull();
  });

  it('creates a game with the signed-in captain’s name', () => {
    const { onHost } = setup('Rio');
    fireEvent.click(screen.getByTestId('create-game'));
    expect(onHost).toHaveBeenCalledWith('Rio');
  });

  it('falls back to a default name when blank', () => {
    const { onHost } = setup('   ');
    fireEvent.click(screen.getByTestId('create-game'));
    expect(onHost).toHaveBeenCalledWith('Captain');
  });

  it('joins with a normalized 4-char code', () => {
    const { onJoin } = setup('Rio');
    fireEvent.click(screen.getByTestId('show-join'));
    const input = screen.getByTestId('code-input') as HTMLInputElement;
    // lowercase + an ambiguous/invalid char get normalized away.
    fireEvent.change(input, { target: { value: 'ab1cd' } });
    expect(input.value).toBe('ABCD'); // '1' filtered, capped at 4
    fireEvent.click(screen.getByTestId('join-game'));
    expect(onJoin).toHaveBeenCalledWith('ABCD', 'Rio');
  });

  it('pre-fills a shared join code', () => {
    render(<Lobby name="Kid" onHost={vi.fn()} onJoin={vi.fn()} onSolo={vi.fn()} initialJoinCode="wxyz" />);
    expect((screen.getByTestId('code-input') as HTMLInputElement).value).toBe('WXYZ');
  });

  it('signposts the two doors: play together and play solo', () => {
    setup('Rio');
    expect(screen.getByText(/play together — two devices/i)).toBeInTheDocument();
    expect(screen.getByText(/play solo — just you/i)).toBeInTheDocument();
  });

  it('offers a battle against the computer with a levelled captain ladder', () => {
    const { onSolo } = setup('Klara');
    fireEvent.click(screen.getByTestId('solo-game'));
    // Four captains, gentlest first — each says its level and what it means.
    const ladder = ['bobble', 'marlin', 'wake', 'grimtide'].map((id) =>
      screen.getByTestId(`captain-${id}`),
    );
    expect(ladder[0]).toHaveTextContent('Deckhand Bobble');
    expect(ladder[0]).toHaveTextContent(/level 1, easiest/i);
    expect(ladder[3]).toHaveTextContent('Admiral Grimtide');
    expect(ladder[3]).toHaveTextContent(/level 4, the boss/i);
    fireEvent.click(ladder[2]);
    expect(onSolo).toHaveBeenCalledWith('wake', 'Klara');
  });
});
