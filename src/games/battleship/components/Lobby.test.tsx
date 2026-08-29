import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { resetUsersStore, setUsersState } from '@shared/profile/usersStore';
import { addUser, emptyUsersState, setActiveUser } from '@shared/profile/users';
import type { PartyValue } from '@shared/party/PartyContext';

// A controllable useParty so each party state renders without a network.
const mockParty = vi.hoisted(() => ({ value: null as any }));
vi.mock('@shared/party/PartyContext', () => ({ useParty: () => mockParty.value }));

import { Lobby } from './Lobby';

function makeParty(over: Partial<PartyValue> = {}): PartyValue {
  return {
    myName: 'Rio',
    status: 'idle',
    code: '',
    role: null,
    inParty: false,
    theirName: null,
    hostParty: vi.fn(() => 'ABCD'),
    joinParty: vi.fn(),
    leaveParty: vi.fn(),
    retry: vi.fn(),
    reconnecting: false,
    table: null,
    knock: null,
    openTable: vi.fn(() => 'WXYZ'),
    closeTable: vi.fn(),
    knockOn: vi.fn(),
    clearKnock: vi.fn(),
    resolveGame: () => null,
    call: {
      active: false,
      status: 'idle',
      muted: false,
      cameraOn: false,
      localStream: null,
      remoteStream: null,
      start: vi.fn(),
      stop: vi.fn(),
      toggleMute: vi.fn(),
      toggleCamera: vi.fn(),
    },
    ...over,
  } as PartyValue;
}

/** The party as seen from one side of it, already linked to the friend. */
const inPartyAs = (role: 'host' | 'guest', over: Partial<PartyValue> = {}) =>
  makeParty({ inParty: true, status: 'connected', role, code: 'PRTY', theirName: 'Kai', ...over });

function setup(initialJoinCode?: string) {
  const onHost = vi.fn();
  const onJoin = vi.fn();
  const onSolo = vi.fn();
  const onHostTable = vi.fn();
  const lobby = () => (
    <Lobby onHost={onHost} onJoin={onJoin} onSolo={onSolo} onHostTable={onHostTable} initialJoinCode={initialJoinCode} />
  );
  const view = render(lobby());
  return { onHost, onJoin, onSolo, onHostTable, rerender: () => view.rerender(lobby()) };
}

beforeEach(() => {
  mockParty.value = makeParty();
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
    mockParty.value = inPartyAs('host');
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

  it('as guest: knocks once, waits, then joins the table the moment it opens', () => {
    mockParty.value = inPartyAs('guest');
    const { onJoin, rerender } = setup();

    expect(mockParty.value.knockOn).toHaveBeenCalledTimes(1);
    expect(mockParty.value.knockOn).toHaveBeenCalledWith('battleship');
    expect(screen.getByTestId('battle-party-waiting')).toHaveTextContent('Waiting for Kai to open Ship Battle');
    expect(screen.queryByTestId('create-game')).toBeNull();
    expect(screen.queryByTestId('show-join')).toBeNull();
    expect(onJoin).not.toHaveBeenCalled();

    // A rerender with the same (absent) table knocks no second time.
    rerender();
    expect(mockParty.value.knockOn).toHaveBeenCalledTimes(1);

    // The host opens Ship Battle: the party carries the code, the lobby joins.
    mockParty.value = inPartyAs('guest', { knockOn: mockParty.value.knockOn, table: { game: 'battleship', code: 'QRST' } });
    rerender();
    expect(onJoin).toHaveBeenCalledTimes(1);
    expect(onJoin).toHaveBeenCalledWith('QRST');

    // Still the same table on the next render — no double join.
    rerender();
    expect(onJoin).toHaveBeenCalledTimes(1);
  });

  it('as guest: a table for another game is not ours — keep waiting, and knock', () => {
    mockParty.value = inPartyAs('guest', { table: { game: 'chess', code: 'CHSS' } });
    const { onJoin } = setup();
    expect(mockParty.value.knockOn).toHaveBeenCalledWith('battleship');
    expect(screen.getByTestId('battle-party-waiting')).toBeInTheDocument();
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('as guest: a Ship Battle table already open joins straight away without knocking', () => {
    mockParty.value = inPartyAs('guest', { table: { game: 'battleship', code: 'QRST' } });
    const { onJoin } = setup();
    expect(mockParty.value.knockOn).not.toHaveBeenCalled();
    expect(onJoin).toHaveBeenCalledWith('QRST');
  });

  it('while reconnecting: says so and hides the code doors', () => {
    mockParty.value = makeParty({ reconnecting: true });
    setup();
    expect(screen.getByTestId('battle-party-reconnecting')).toHaveTextContent('Reconnecting to your party');
    expect(screen.queryByTestId('create-game')).toBeNull();
    expect(screen.queryByTestId('show-join')).toBeNull();
    expect(screen.queryByTestId('battle-party-play')).toBeNull();
    expect(screen.getByTestId('solo-game')).toBeInTheDocument();
  });
});
