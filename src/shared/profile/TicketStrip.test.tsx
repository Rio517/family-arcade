import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TicketStrip } from './TicketStrip';
import { getUsersSnapshot, resetUsersStore, setUsersState } from './usersStore';
import { addUser, emptyUsersState, setActiveUser } from './users';

beforeEach(() => {
  localStorage.clear();
  resetUsersStore();
  const roster = addUser(addUser(addUser(emptyUsersState(), 'u1', 'Rio'), 'u2', 'Klara'), 'u3', 'Flora');
  setUsersState(setActiveUser(roster, 'u2'));
});

describe('<TicketStrip>', () => {
  it('shows every ticket as a chip; seated ones are taken', () => {
    const onPick = vi.fn();
    render(<TicketStrip seated={new Set(['u2'])} onPick={onPick} />);
    expect(screen.getAllByTestId(/^strip-user-/)).toHaveLength(3);
    expect(screen.getByTestId('strip-user-u2')).toBeDisabled();
    fireEvent.click(screen.getByTestId('strip-user-u2'));
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('strip-user-u3'));
    expect(onPick).toHaveBeenCalledWith('u3');
  });

  it('+ New player makes a ticket for someone else without signing them in', () => {
    const onPick = vi.fn();
    render(<TicketStrip seated={new Set()} onPick={onPick} />);
    fireEvent.click(screen.getByTestId('strip-new'));
    fireEvent.change(screen.getByTestId('strip-name'), { target: { value: '  Nana ' } });
    fireEvent.click(screen.getByTestId('strip-create'));
    const nana = getUsersSnapshot().users.find((u) => u.profile.name === 'Nana');
    expect(nana).toBeDefined();
    expect(onPick).toHaveBeenCalledWith(nana!.id);
    expect(getUsersSnapshot().activeId).toBe('u2');
    // The field folds away once the ticket is made.
    expect(screen.queryByTestId('strip-name')).toBeNull();
  });

  it('refuses a blank or duplicate name', () => {
    const onPick = vi.fn();
    render(<TicketStrip seated={new Set()} onPick={onPick} />);
    fireEvent.click(screen.getByTestId('strip-new'));
    expect(screen.getByTestId('strip-create')).toBeDisabled();
    fireEvent.change(screen.getByTestId('strip-name'), { target: { value: 'klara' } });
    expect(screen.getByTestId('strip-create')).toBeDisabled();
    fireEvent.submit(screen.getByTestId('strip-name').closest('form')!);
    expect(onPick).not.toHaveBeenCalled();
    expect(getUsersSnapshot().users).toHaveLength(3);
  });

  it('a full table greys every chip', () => {
    const onPick = vi.fn();
    render(<TicketStrip seated={new Set(['u1'])} onPick={onPick} full />);
    expect(screen.getByTestId('strip-user-u3')).toBeDisabled();
    expect(screen.getByText(/every chair is taken/i)).toBeInTheDocument();
  });
});
