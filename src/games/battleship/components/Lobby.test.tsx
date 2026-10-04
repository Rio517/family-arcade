import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { resetUsersStore, setUsersState } from '@shared/profile/usersStore';
import { addUser, emptyUsersState, setActiveUser } from '@shared/profile/users';
import type { PartyValue } from '@shared/party/PartyContext';
import { fakeParty, fakePartyWithKai } from '@shared/party/testing';

// A controllable useParty so each party state renders without a network.
const mockParty = vi.hoisted(() => ({ value: null as unknown as PartyValue }));
vi.mock('@shared/party/PartyContext', () => ({ useParty: () => mockParty.value }));

import { Lobby } from './Lobby';

function setup(initialJoinCode?: string, era: 'classic' | 'modern' = 'classic') {
  const onHost = vi.fn();
  const onEra = vi.fn();
  const onJoin = vi.fn();
  const onSolo = vi.fn();
  const onHostTable = vi.fn();
  render(
    <Lobby
      onHost={onHost}
      onJoin={onJoin}
      onSolo={onSolo}
      era={era}
      onEra={onEra}
      onHostTable={onHostTable}
      initialJoinCode={initialJoinCode}
    />,
  );
  return { onHost, onJoin, onSolo, onEra, onHostTable };
}

beforeEach(() => {
  mockParty.value = fakeParty();
  localStorage.clear();
  resetUsersStore();
  // A ticket is the identity: Rio is signed in, so the lobby never asks.
  setUsersState(setActiveUser(addUser(emptyUsersState(), 'u1', 'Rio'), 'u1'));
});

describe('<Lobby> on your own', () => {
  it('says who is playing instead of asking for a name', () => {
    setup();
    expect(screen.getByTestId('playing-as')).toHaveTextContent('Rio');
    expect(screen.getByTestId('playing-as-change')).toHaveTextContent('Switch player ›');
    expect(screen.queryByTestId('name-input')).toBeNull();
  });

  it('creates a game — the page supplies the code and the ticket', () => {
    const { onHost } = setup();
    fireEvent.click(screen.getByTestId('create-game'));
    expect(onHost).toHaveBeenCalledTimes(1);
    expect(onHost).toHaveBeenCalledWith();
  });

  it('joins with a normalized 4-char code', () => {
    const { onJoin } = setup();
    fireEvent.click(screen.getByTestId('show-join'));
    const input = screen.getByTestId('code-input') as HTMLInputElement;
    // lowercase + an ambiguous/invalid char get normalized away.
    fireEvent.change(input, { target: { value: 'ab1cd' } });
    expect(input.value).toBe('ABCD'); // '1' filtered, capped at 4
    fireEvent.click(screen.getByTestId('join-game'));
    expect(onJoin).toHaveBeenCalledWith('ABCD');
  });

  it('pre-fills a shared join code', () => {
    setup('wxyz');
    expect((screen.getByTestId('code-input') as HTMLInputElement).value).toBe('WXYZ');
  });

  it('signposts the two doors: play together and play the computer', () => {
    setup();
    expect(screen.getByText(/^play together$/i)).toBeInTheDocument();
    expect(screen.getByText(/^play the computer$/i)).toBeInTheDocument();
    expect(screen.queryByTestId('battle-party-play')).toBeNull();
    expect(screen.queryByTestId('battle-party-waiting')).toBeNull();
  });

  it('one tap on a level starts that computer captain — no ladder, no second screen', () => {
    const { onSolo } = setup();
    expect(screen.getByText(/pick a level/i)).toBeInTheDocument();
    const keys = [1, 2, 3, 4].map((n) => screen.getByTestId(`level-${n}`));
    expect(keys.map((k) => k.textContent)).toEqual(['1Easy', '2Fair', '3Sharp', '4Boss']);
    expect(keys[0]).toHaveAccessibleName('Level 1, Easy');
    expect(screen.queryByTestId('solo-game')).toBeNull();
    // The captains' names stay in the game, not on the keys.
    expect(screen.queryByText(/Bobble|Marlin|Wake|Grimtide/)).toBeNull();
    fireEvent.click(keys[0]);
    expect(onSolo).toHaveBeenLastCalledWith('bobble');
    fireEvent.click(keys[1]);
    expect(onSolo).toHaveBeenLastCalledWith('marlin');
    fireEvent.click(keys[2]);
    expect(onSolo).toHaveBeenLastCalledWith('wake');
    fireEvent.click(keys[3]);
    expect(onSolo).toHaveBeenLastCalledWith('grimtide');
  });

  it('switches between classic and modern ships with one tap, showing the current choice', () => {
    const { onEra } = setup(undefined, 'modern');
    expect(screen.getByTestId('ships-modern')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('ships-classic')).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByTestId('ships-classic'));
    expect(onEra).toHaveBeenCalledWith('classic');
  });
});

describe('<Lobby> in a party', () => {
  it('as host: one tap opens the table for the friend — no codes to share', () => {
    mockParty.value = fakePartyWithKai('host');
    const { onHost, onHostTable } = setup();

    const play = screen.getByTestId('battle-party-play');
    expect(play).toHaveTextContent('Play Ship Battle with Kai');
    expect(screen.queryByTestId('create-game')).toBeNull();
    expect(screen.queryByTestId('show-join')).toBeNull();
    // The levels are still there for a game on your own.
    expect(screen.getByTestId('level-1')).toBeInTheDocument();

    fireEvent.click(play);
    expect(mockParty.value.openTable).toHaveBeenCalledWith('battleship');
    expect(onHostTable).toHaveBeenCalledWith('WXYZ');
    expect(onHost).not.toHaveBeenCalled();
  });

  it('as guest: shows the waiting door — the knocking and the walking in are the page’s door', () => {
    mockParty.value = fakePartyWithKai('guest');
    const { onJoin } = setup();

    expect(screen.getByTestId('battle-party-waiting')).toHaveTextContent('Waiting for Kai to open Ship Battle');
    expect(screen.queryByTestId('create-game')).toBeNull();
    expect(screen.queryByTestId('show-join')).toBeNull();
    expect(screen.getByTestId('level-1')).toBeInTheDocument();
    // The lobby only shows the door; usePartyDoor on the page knocks and seats.
    expect(mockParty.value.knockOn).not.toHaveBeenCalled();
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('while reconnecting: says so and hides the code doors', () => {
    mockParty.value = fakeParty({ reconnecting: true });
    setup();
    expect(screen.getByTestId('battle-party-reconnecting')).toHaveTextContent('Reconnecting to your party');
    expect(screen.queryByTestId('create-game')).toBeNull();
    expect(screen.queryByTestId('show-join')).toBeNull();
    expect(screen.queryByTestId('battle-party-play')).toBeNull();
    expect(screen.getByTestId('level-1')).toBeInTheDocument();
  });
});
