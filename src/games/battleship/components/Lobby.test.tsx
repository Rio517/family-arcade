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

function setup(initialJoinCode?: string) {
  const onHost = vi.fn();
  const onJoin = vi.fn();
  const onSolo = vi.fn();
  const onHostTable = vi.fn();
  render(
    <Lobby onHost={onHost} onJoin={onJoin} onSolo={onSolo} onHostTable={onHostTable} initialJoinCode={initialJoinCode} />,
  );
  return { onHost, onJoin, onSolo, onHostTable };
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
    expect(screen.getByTestId('playing-as')).toHaveTextContent("You're Rio");
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

  it('signposts the two doors: play together and play solo', () => {
    setup();
    expect(screen.getByText(/play together — two devices/i)).toBeInTheDocument();
    expect(screen.getByText(/play solo — just you/i)).toBeInTheDocument();
    expect(screen.queryByTestId('battle-party-play')).toBeNull();
    expect(screen.queryByTestId('battle-party-waiting')).toBeNull();
  });

  it('offers a battle against the computer with a levelled captain ladder', () => {
    const { onSolo } = setup();
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
    expect(onSolo).toHaveBeenCalledWith('wake');
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
    // The computer captains are still there for a game on your own.
    expect(screen.getByTestId('solo-game')).toBeInTheDocument();

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
    expect(screen.getByTestId('solo-game')).toBeInTheDocument();
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
    expect(screen.getByTestId('solo-game')).toBeInTheDocument();
  });
});
