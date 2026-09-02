import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PlayingAs } from './PlayingAs';
import { getUsersSnapshot, resetUsersStore, setUsersState } from './usersStore';
import { addUser, emptyUsersState, setActiveUser } from './users';

function seed() {
  // Klara signed in, Flora waiting in the roster.
  let roster = addUser(emptyUsersState(), 'u1', 'Flora');
  roster = addUser(roster, 'u2', 'Klara');
  setUsersState(setActiveUser(roster, 'u2'));
}

beforeEach(() => {
  localStorage.clear();
  resetUsersStore();
});

describe('<PlayingAs>', () => {
  it('says who you are', () => {
    seed();
    render(<PlayingAs />);
    expect(screen.getByTestId('playing-as')).toHaveTextContent('Klara');
    expect(screen.queryByTestId('switch-name')).toBeNull();
  });

  it('renders nothing when nobody is signed in', () => {
    seed();
    setUsersState(setActiveUser(getUsersSnapshot(), null));
    render(<PlayingAs />);
    expect(screen.queryByTestId('playing-as')).toBeNull();
  });

  it('Switch player opens the picker over the page; picking switches and closes', () => {
    seed();
    render(<PlayingAs />);
    fireEvent.click(screen.getByTestId('playing-as-change'));
    expect(screen.getByTestId('playing-as-change')).toHaveAttribute('aria-expanded', 'true');
    // A modal over the page, so the lobby underneath doesn't move.
    const dialog = screen.getByRole('dialog', { name: 'Choose who is playing' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByTestId('switch-picker')).toBeInTheDocument();
    expect(screen.getByTestId('switch-user-u2')).toHaveTextContent(/you/i);
    fireEvent.click(screen.getByTestId('switch-user-u1'));
    expect(getUsersSnapshot().activeId).toBe('u1');
    expect(screen.getByTestId('playing-as')).toHaveTextContent('Flora');
    expect(screen.queryByTestId('switch-name')).toBeNull();
  });

  it('picking your own ticket again just closes the list', () => {
    seed();
    render(<PlayingAs />);
    fireEvent.click(screen.getByTestId('playing-as-change'));
    fireEvent.click(screen.getByTestId('switch-user-u2'));
    expect(getUsersSnapshot().activeId).toBe('u2');
    expect(screen.queryByTestId('switch-name')).toBeNull();
    expect(screen.getByTestId('playing-as-change')).toHaveFocus();
  });

  it('makes a new ticket from the list and signs it in', () => {
    seed();
    render(<PlayingAs />);
    fireEvent.click(screen.getByTestId('playing-as-change'));
    fireEvent.change(screen.getByTestId('switch-name'), { target: { value: 'Nana' } });
    fireEvent.click(screen.getByTestId('switch-create'));
    expect(screen.getByTestId('playing-as')).toHaveTextContent('Nana');
    expect(getUsersSnapshot().users.map((u) => u.profile.name)).toContain('Nana');
  });

  it('Escape and Close shut the picker and hand focus back', () => {
    seed();
    render(<PlayingAs />);
    fireEvent.click(screen.getByTestId('playing-as-change'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('switch-name')).toBeNull();
    expect(screen.getByTestId('playing-as-change')).toHaveFocus();

    fireEvent.click(screen.getByTestId('playing-as-change'));
    fireEvent.click(screen.getByTestId('switch-picker-close'));
    expect(screen.queryByTestId('switch-name')).toBeNull();
    expect(screen.getByTestId('playing-as-change')).toHaveFocus();
  });

  it('says where a profile is kept, when asked', () => {
    seed();
    render(<PlayingAs />);
    fireEvent.click(screen.getByTestId('playing-as-change'));
    expect(screen.queryByTestId('switch-where')).toBeNull();
    fireEvent.click(screen.getByTestId('switch-info'));
    expect(screen.getByTestId('switch-where')).toHaveTextContent(/never in the cloud/i);
  });

  // The UX review's identity copy (docs/mockups/20260831-party-ui), now shipped: one name,
  // one verb, and the instruction every picker shares.
  it('shows the name and Switch player, with one picker instruction', () => {
    seed();
    render(<PlayingAs />);
    const line = screen.getByTestId('playing-as');
    expect(line).toHaveTextContent('Klara');
    expect(line).not.toHaveTextContent("You're");
    expect(screen.getByTestId('playing-as-change')).toHaveTextContent('Switch player');
    fireEvent.click(screen.getByTestId('playing-as-change'));
    expect(screen.getByText('Pick your player or type your name.')).toBeInTheDocument();
  });
});
