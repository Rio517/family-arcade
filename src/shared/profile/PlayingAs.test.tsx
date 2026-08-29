import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PlayingAs } from './PlayingAs';
import { getUsersSnapshot, resetUsersStore, setUsersState } from './usersStore';
import { addUser, emptyUsersState, setActiveUser } from './users';

function seed() {
  // Klara signed in, Flora waiting in the roster.
  let roster = addUser(emptyUsersState(), 'u1', 'Flora', 1);
  roster = addUser(roster, 'u2', 'Klara', 2);
  setUsersState(roster);
}

beforeEach(() => {
  localStorage.clear();
  resetUsersStore();
});

describe('<PlayingAs>', () => {
  it('says who you are', () => {
    seed();
    render(<PlayingAs />);
    expect(screen.getByTestId('playing-as')).toHaveTextContent("You're Klara");
    expect(screen.queryByTestId('switch-name')).toBeNull();
  });

  it('renders nothing when nobody is signed in', () => {
    seed();
    setUsersState(setActiveUser(getUsersSnapshot(), null));
    render(<PlayingAs />);
    expect(screen.queryByTestId('playing-as')).toBeNull();
  });

  it('Change opens the ticket list; picking a ticket switches and closes', () => {
    seed();
    render(<PlayingAs />);
    fireEvent.click(screen.getByTestId('playing-as-change'));
    expect(screen.getByTestId('playing-as-change')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('switch-user-u2')).toHaveTextContent(/you/i);
    fireEvent.click(screen.getByTestId('switch-user-u1'));
    expect(getUsersSnapshot().activeId).toBe('u1');
    expect(screen.getByTestId('playing-as')).toHaveTextContent("You're Flora");
    expect(screen.queryByTestId('switch-name')).toBeNull();
  });

  it('makes a new ticket from the list and signs it in', () => {
    seed();
    render(<PlayingAs />);
    fireEvent.click(screen.getByTestId('playing-as-change'));
    fireEvent.change(screen.getByTestId('switch-name'), { target: { value: 'Nana' } });
    fireEvent.click(screen.getByTestId('switch-create'));
    expect(screen.getByTestId('playing-as')).toHaveTextContent("You're Nana");
    expect(getUsersSnapshot().users.map((u) => u.profile.name)).toContain('Nana');
  });

  it('Escape and Cancel close the list and hand focus back', () => {
    seed();
    render(<PlayingAs />);
    fireEvent.click(screen.getByTestId('playing-as-change'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('switch-name')).toBeNull();
    expect(screen.getByTestId('playing-as-change')).toHaveFocus();

    fireEvent.click(screen.getByTestId('playing-as-change'));
    fireEvent.click(screen.getByTestId('playing-as-cancel'));
    expect(screen.queryByTestId('switch-name')).toBeNull();
    expect(screen.getByTestId('playing-as-change')).toHaveFocus();
  });
});
