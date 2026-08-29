import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TicketStrip } from './TicketStrip';
import { EMPTY_SEAT, type Seat } from './seats';
import { getUsersSnapshot, resetUsersStore, setUsersState } from './usersStore';
import { addUser, emptyUsersState, setActiveUser } from './users';

const ticket = (userId: string): Seat => ({ kind: 'ticket', userId });

beforeEach(() => {
  localStorage.clear();
  resetUsersStore();
  const roster = addUser(addUser(addUser(emptyUsersState(), 'u1', 'Rio'), 'u2', 'Klara'), 'u3', 'Flora');
  setUsersState(setActiveUser(roster, 'u2'));
});

describe('<TicketStrip>', () => {
  it('shows every ticket as a chip; a seated one is taken but still reachable', () => {
    const onChange = vi.fn();
    render(<TicketStrip seats={[ticket('u2'), EMPTY_SEAT]} onChange={onChange} />);
    expect(screen.getAllByTestId(/^strip-user-/)).toHaveLength(3);
    const klara = screen.getByTestId('strip-user-u2');
    expect(klara).toHaveAttribute('aria-disabled', 'true');
    expect(klara).not.toBeDisabled(); // a screen reader still hears she's at the table
    expect(klara).toHaveAccessibleName(/already at the table/);
    fireEvent.click(klara);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('strip-user-u3'));
    expect(onChange).toHaveBeenCalledWith([ticket('u2'), ticket('u3')]);
  });

  it('+ New player makes a ticket for someone else, seats them, and signs nobody in', () => {
    const onChange = vi.fn();
    render(<TicketStrip seats={[ticket('u2'), EMPTY_SEAT]} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('strip-new'));
    expect(screen.getByTestId('strip-name')).toHaveFocus();
    fireEvent.change(screen.getByTestId('strip-name'), { target: { value: '  Nana ' } });
    fireEvent.click(screen.getByTestId('strip-create'));
    const nana = getUsersSnapshot().users.find((u) => u.profile.name === 'Nana');
    expect(nana).toBeDefined();
    expect(onChange).toHaveBeenCalledWith([ticket('u2'), ticket(nana!.id)]);
    expect(getUsersSnapshot().activeId).toBe('u2');
    expect(screen.queryByTestId('strip-name')).toBeNull();
  });

  it('refuses a blank or duplicate name', () => {
    const onChange = vi.fn();
    render(<TicketStrip seats={[EMPTY_SEAT]} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('strip-new'));
    expect(screen.getByTestId('strip-create')).toBeDisabled();
    fireEvent.change(screen.getByTestId('strip-name'), { target: { value: 'klara' } });
    expect(screen.getByTestId('strip-create')).toBeDisabled();
    fireEvent.submit(screen.getByTestId('strip-name').closest('form')!);
    expect(onChange).not.toHaveBeenCalled();
    expect(getUsersSnapshot().users).toHaveLength(3);
  });

  it('Never mind folds the form away and forgets what was typed', () => {
    render(<TicketStrip seats={[EMPTY_SEAT]} onChange={() => {}} />);
    fireEvent.click(screen.getByTestId('strip-new'));
    fireEvent.change(screen.getByTestId('strip-name'), { target: { value: 'Nan' } });
    fireEvent.click(screen.getByTestId('strip-cancel'));
    expect(screen.queryByTestId('strip-name')).toBeNull();
    fireEvent.click(screen.getByTestId('strip-new'));
    expect(screen.getByTestId('strip-name')).toHaveValue('');
  });

  it('a full table greys every chip, says so, and closes the door to new players', () => {
    const onChange = vi.fn();
    render(<TicketStrip seats={[ticket('u1'), ticket('u2')]} onChange={onChange} />);
    expect(screen.getByTestId('strip-user-u3')).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByTestId('strip-user-u3'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('strip-new')).toBeDisabled();
    expect(screen.getByText(/every chair is taken/i)).toBeInTheDocument();
  });

  it('says "this device" — true on the iPad and on the computer', () => {
    render(<TicketStrip seats={[EMPTY_SEAT]} onChange={() => {}} />);
    expect(screen.getByText('Tickets on this device')).toBeInTheDocument();
  });
});
