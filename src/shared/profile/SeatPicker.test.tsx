import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { SeatPicker } from './SeatPicker';
import { EMPTY_SEAT, type Seat } from './seats';
import { getUsersSnapshot, resetUsersStore, setUsersState } from './usersStore';
import { addUser, emptyUsersState, setActiveUser, updateActiveProfile } from './users';

const ticket = (userId: string): Seat => ({ kind: 'ticket', userId });

beforeEach(() => {
  localStorage.clear();
  resetUsersStore();
  const roster = addUser(addUser(addUser(emptyUsersState(), 'u1', 'Rio'), 'u2', 'Klara'), 'u3', 'Flora');
  setUsersState(setActiveUser(roster, 'u2'));
});

describe('<SeatPicker>', () => {
  it('shows the chairs with names, marks you, and invites a tap for empty ones', () => {
    render(<SeatPicker seats={[ticket('u2'), EMPTY_SEAT]} onChange={() => {}} />);
    expect(screen.getByTestId('seat-0')).toHaveTextContent('Klara');
    expect(screen.getByTestId('seat-0')).toHaveTextContent(/you/i);
    expect(screen.getByTestId('seat-1')).toHaveTextContent(/tap a ticket/i);
    // Every chair announces its number, filled or not.
    expect(screen.getByTestId('seat-0')).toHaveTextContent(/Chair 1:/);
    expect(screen.getByTestId('seat-1')).toHaveTextContent(/Chair 2:/);
  });

  it('tapping a ticket in the strip fills the first empty chair', () => {
    const onChange = vi.fn();
    render(<SeatPicker seats={[ticket('u2'), EMPTY_SEAT, EMPTY_SEAT]} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('strip-user-u3'));
    expect(onChange).toHaveBeenCalledWith([ticket('u2'), ticket('u3'), EMPTY_SEAT]);
  });

  it('× empties a chair, names whose it was, and keeps the keyboard on that chair', () => {
    const onChange = vi.fn();
    render(<SeatPicker seats={[ticket('u2'), ticket('u1')]} onChange={onChange} />);
    const clear = screen.getByTestId('seat-0-clear');
    expect(clear).toHaveAccessibleName('Clear chair 1: Klara');
    fireEvent.click(clear);
    expect(onChange).toHaveBeenCalledWith([EMPTY_SEAT, ticket('u1')]);
    expect(screen.getByTestId('seat-0')).toHaveFocus();
  });

  it('greys the strip when every chair is taken', () => {
    const onChange = vi.fn();
    render(<SeatPicker seats={[ticket('u2'), ticket('u1')]} onChange={onChange} />);
    expect(screen.getByTestId('strip-user-u3')).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByTestId('strip-user-u3'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('names are derived at render — a rename at the booth shows up in the chair', () => {
    render(<SeatPicker seats={[ticket('u2')]} onChange={() => {}} />);
    expect(screen.getByTestId('seat-0')).toHaveTextContent('Klara');
    act(() => {
      const users = getUsersSnapshot();
      const me = users.users.find((u) => u.id === 'u2')!;
      setUsersState(updateActiveProfile(users, { ...me.profile, name: 'Klarabelle' }));
    });
    expect(screen.getByTestId('seat-0')).toHaveTextContent('Klarabelle');
  });

  it('lets the game label and colour chairs; a bot chair here reads as Someone', () => {
    render(
      <SeatPicker
        seats={[ticket('u2'), { kind: 'bot', botId: 'cadet' }]}
        onChange={() => {}}
        rowLabel={(i) => (i === 0 ? 'White' : 'Black')}
        accent={(i) => (i === 0 ? '#fff' : '#000')}
      />,
    );
    expect(screen.getByTestId('seat-0')).toHaveTextContent('White');
    expect(screen.getByTestId('seat-1')).toHaveTextContent('Black');
    // Only Risk seats generals, and Risk draws its own chairs.
    expect(screen.getByTestId('seat-1')).toHaveTextContent('Someone');
  });
});
