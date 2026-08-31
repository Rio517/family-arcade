import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TicketList } from './TicketList';
import type { StoredUser } from './users';

const u = (id: string, name: string): StoredUser => ({
  id,
  profile: { name, pronouns: 'he/him', points: 0, wins: 0, losses: 0, unlocked: [], lastSkinId: '', history: [] },
});
const ROSTER = [u('a', 'Papa'), u('b', 'Klara'), u('c', 'Flora')];

describe('<TicketList>', () => {
  it('lists every ticket and picks on tap', () => {
    const onPick = vi.fn();
    render(<TicketList users={ROSTER} onPick={onPick} onCreate={() => {}} />);
    expect(screen.getAllByTestId(/^ticket-user-/)).toHaveLength(3);
    fireEvent.click(screen.getByTestId('ticket-user-b'));
    expect(onPick).toHaveBeenCalledWith('b');
  });

  it('filters as you type and Enter takes the top match', () => {
    const onPick = vi.fn();
    render(<TicketList users={ROSTER} onPick={onPick} onCreate={() => {}} />);
    const field = screen.getByTestId('ticket-name');
    fireEvent.change(field, { target: { value: 'fl' } });
    expect(screen.getAllByTestId(/^ticket-user-/)).toHaveLength(1);
    expect(screen.queryByTestId('ticket-create')).toBeNull();
    fireEvent.submit(field.closest('form')!);
    expect(onPick).toHaveBeenCalledWith('c');
  });

  it('offers to make a ticket only when nobody matches', () => {
    const onCreate = vi.fn();
    render(<TicketList users={ROSTER} onPick={() => {}} onCreate={onCreate} />);
    const field = screen.getByTestId('ticket-name');
    fireEvent.change(field, { target: { value: '  Nana ' } });
    expect(screen.getByTestId('ticket-empty')).toBeInTheDocument();
    expect(screen.getByTestId('ticket-create')).toHaveTextContent('Make a ticket for Nana');
    fireEvent.click(screen.getByTestId('ticket-create'));
    expect(onCreate).toHaveBeenCalledWith('Nana');
  });

  it('Enter makes the ticket when nobody matches', () => {
    const onCreate = vi.fn();
    render(<TicketList users={ROSTER} onPick={() => {}} onCreate={onCreate} />);
    const field = screen.getByTestId('ticket-name');
    fireEvent.change(field, { target: { value: 'Nana' } });
    fireEvent.submit(field.closest('form')!);
    expect(onCreate).toHaveBeenCalledWith('Nana');
  });

  it("typing a saved ticket's whole name still finds it (no dead end)", () => {
    const onPick = vi.fn();
    render(<TicketList users={[u('d', 'Mommy Zoë')]} onPick={onPick} onCreate={() => {}} />);
    const field = screen.getByTestId('ticket-name');
    fireEvent.change(field, { target: { value: 'Mommy Zoe' } });
    expect(screen.getByTestId('ticket-user-d')).toBeInTheDocument();
    expect(screen.queryByTestId('ticket-create')).toBeNull();
    fireEvent.submit(field.closest('form')!);
    expect(onPick).toHaveBeenCalledWith('d');
  });

  it('never offers a duplicate ticket', () => {
    render(<TicketList users={ROSTER} onPick={() => {}} onCreate={() => {}} />);
    fireEvent.change(screen.getByTestId('ticket-name'), { target: { value: 'papa' } });
    expect(screen.getByTestId('ticket-user-a')).toBeInTheDocument();
    expect(screen.queryByTestId('ticket-create')).toBeNull();
  });

  it('marks the signed-in ticket', () => {
    render(<TicketList users={ROSTER} activeId="b" onPick={() => {}} onCreate={() => {}} />);
    expect(screen.getByTestId('ticket-user-b')).toHaveTextContent(/you/i);
    expect(screen.getByTestId('ticket-user-a')).not.toHaveTextContent(/you/i);
  });

  it('keeps each ticket its roster colour while filtering', () => {
    render(<TicketList users={ROSTER} onPick={() => {}} onCreate={() => {}} />);
    const before = screen.getByTestId('ticket-user-c').getAttribute('style');
    fireEvent.change(screen.getByTestId('ticket-name'), { target: { value: 'fl' } });
    expect(screen.getByTestId('ticket-user-c').getAttribute('style')).toBe(before);
  });

  it('invites a brand-new browser to make its first ticket', () => {
    render(<TicketList users={[]} onPick={() => {}} onCreate={() => {}} />);
    expect(screen.getByText('Pick your player or type your name.')).toBeInTheDocument();
    expect(screen.getByTestId('ticket-name')).toHaveFocus();
  });

  it('never grabs the keyboard when there are tickets to tap', () => {
    render(<TicketList users={ROSTER} onPick={() => {}} onCreate={() => {}} />);
    expect(screen.getByTestId('ticket-name')).not.toHaveFocus();
  });
});
