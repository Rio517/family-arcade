import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SeatPicker } from './SeatPicker';
import { EMPTY_SEAT, type Seat } from './seats';
import { resetUsersStore, setUsersState } from './usersStore';
import { addUser, emptyUsersState, setActiveUser } from './users';

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
  });

  it('tapping a ticket in the strip fills the first empty chair', () => {
    const onChange = vi.fn();
    render(<SeatPicker seats={[ticket('u2'), EMPTY_SEAT, EMPTY_SEAT]} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('strip-user-u3'));
    expect(onChange).toHaveBeenCalledWith([ticket('u2'), ticket('u3'), EMPTY_SEAT]);
  });

  it('× empties a chair', () => {
    const onChange = vi.fn();
    render(<SeatPicker seats={[ticket('u2'), ticket('u1')]} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('seat-0-clear'));
    expect(onChange).toHaveBeenCalledWith([EMPTY_SEAT, ticket('u1')]);
  });

  it('greys the strip when every chair is taken', () => {
    render(<SeatPicker seats={[ticket('u2'), ticket('u1')]} onChange={() => {}} />);
    expect(screen.getByTestId('strip-user-u3')).toBeDisabled();
  });

  it('names a computer chair through botName and lets the game label and colour chairs', () => {
    render(
      <SeatPicker
        seats={[ticket('u2'), { kind: 'bot', botId: 'cadet' }]}
        onChange={() => {}}
        rowLabel={(i) => (i === 0 ? 'White' : 'Black')}
        accent={(i) => (i === 0 ? '#fff' : '#000')}
        botName={(id) => `General ${id}`}
      />,
    );
    expect(screen.getByTestId('seat-0')).toHaveTextContent('White');
    expect(screen.getByTestId('seat-1')).toHaveTextContent('General cadet');
    expect(screen.getByTestId('seat-1')).toHaveTextContent('Black');
  });
});
