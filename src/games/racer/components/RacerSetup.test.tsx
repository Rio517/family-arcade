import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { PartyValue } from '@shared/party/PartyContext';
import type { RacerNet } from '../net/useRacerNet';

/**
 * The two-player lobby on the party (Phase 3b): with no party it keeps its
 * code doors; in a party the host gets one "Race {friend}" button and the
 * guest is auto-seated the moment the host opens the racer's table. The net
 * layer is a fake here — what the lobby *asks* of it is the contract.
 */

// A controllable useParty so each party state renders without a network.
const mockParty = vi.hoisted(() => ({ value: null as any }));
vi.mock('@shared/party/PartyContext', () => ({ useParty: () => mockParty.value }));

import { DRIVERS, RacerLobby } from './RacerSetup';

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
    resolveGame: (id: string) => (id === 'racer' ? { title: 'Rainbow Racer', path: '/racer' } : null),
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

function makeNet(over: Partial<RacerNet> = {}): RacerNet {
  return {
    status: 'idle',
    code: '',
    role: null,
    seatedUserId: null,
    connected: false,
    startNonce: 0,
    theirName: 'Friend',
    theirDriver: null,
    startTable: vi.fn(),
    leave: vi.fn(),
    sendPos: vi.fn(),
    sendWorld: vi.fn(),
    sendWorldDelta: vi.fn(),
    hostRestart: vi.fn(),
    requestRematch: vi.fn(),
    remotePosRef: { current: null },
    remoteWorldRef: { current: null },
    ...over,
  };
}

const lobby = (net: RacerNet, seatedUserId: string | null = 'u1') => (
  <RacerLobby driver={DRIVERS[0]} net={net} seatedUserId={seatedUserId} />
);

/** Only characters the real generateCode can emit (no look-alikes O/0, I/1, L). */
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;

const inPartyAsHost = () => makeParty({ inParty: true, status: 'connected', role: 'host', theirName: 'Kai' });
const inPartyAsGuest = (table: PartyValue['table'] = null) =>
  makeParty({ inParty: true, status: 'connected', role: 'guest', theirName: 'Rio', table });

/** The lobby's code doors: create, or join with a code. */
function expectCodeDoors(present: boolean) {
  expect(screen.queryByTestId('racer-create') !== null).toBe(present);
  expect(screen.queryByTestId('racer-show-join') !== null).toBe(present);
}

beforeEach(() => {
  mockParty.value = makeParty();
  localStorage.clear();
});

describe('<RacerLobby> — not in a party', () => {
  it('offers both code doors and none of the party screens', () => {
    render(lobby(makeNet()));
    expectCodeDoors(true);
    expect(screen.queryByTestId('racer-party-play')).toBeNull();
    expect(screen.queryByTestId('racer-party-waiting')).toBeNull();
    expect(screen.queryByTestId('racer-party-reconnecting')).toBeNull();
  });

  it('Create a game hosts a fresh 4-character table seated as the signed-in ticket', () => {
    const net = makeNet();
    render(lobby(net, 'u-rio'));
    fireEvent.click(screen.getByTestId('racer-create'));

    expect(net.startTable).toHaveBeenCalledTimes(1);
    const opts = vi.mocked(net.startTable).mock.calls[0][0];
    expect(opts).toMatchObject({ role: 'host', seatedUserId: 'u-rio' });
    expect(opts.code).toMatch(CODE_RE);
  });

  it('Connect → dials the typed code as a guest seated as the signed-in ticket', () => {
    const net = makeNet();
    render(lobby(net, 'u-kai'));
    fireEvent.click(screen.getByTestId('racer-show-join'));
    fireEvent.change(screen.getByTestId('racer-code-input'), { target: { value: 'wxyz' } });
    fireEvent.click(screen.getByTestId('racer-join'));

    expect(net.startTable).toHaveBeenCalledWith({ role: 'guest', code: 'WXYZ', seatedUserId: 'u-kai' });
  });

  it('a host waiting on a code shows it, and Back only leaves the link (no party table to close)', () => {
    const net = makeNet({ role: 'host', code: 'QRST', status: 'hosting' });
    render(lobby(net));
    expect(screen.getByTestId('racer-code')).toHaveTextContent('QRST');

    fireEvent.click(screen.getByTestId('racer-lobby-back'));
    expect(net.leave).toHaveBeenCalledTimes(1);
    expect(mockParty.value.closeTable).not.toHaveBeenCalled();
  });
});

describe('<RacerLobby> — party host', () => {
  it('shows one Race {friend} button and no code doors', () => {
    mockParty.value = inPartyAsHost();
    render(lobby(makeNet()));

    expect(screen.getByTestId('racer-party-play')).toHaveTextContent('Race Kai');
    expectCodeDoors(false);
    expect(screen.queryByTestId('racer-party-waiting')).toBeNull();
  });

  it('Race {friend} opens the racer table on the party and hosts under its code', () => {
    mockParty.value = inPartyAsHost();
    const net = makeNet();
    render(lobby(net, 'u-rio'));
    fireEvent.click(screen.getByTestId('racer-party-play'));

    expect(mockParty.value.openTable).toHaveBeenCalledWith('racer');
    expect(net.startTable).toHaveBeenCalledWith({ role: 'host', code: 'WXYZ', seatedUserId: 'u-rio' });
  });

  it('while the table is open it waits for the friend by name — no code to share — and Back closes the table', () => {
    mockParty.value = inPartyAsHost();
    const net = makeNet({ role: 'host', code: 'WXYZ', status: 'hosting' });
    render(lobby(net));

    expect(screen.queryByTestId('racer-code')).toBeNull();
    expect(screen.getByText(/Waiting for Kai/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('racer-lobby-back'));
    expect(net.leave).toHaveBeenCalledTimes(1);
    expect(mockParty.value.closeTable).toHaveBeenCalledTimes(1);
  });
});

describe('<RacerLobby> — party guest', () => {
  it('knocks on the racer once at mount and waits for the host by name, with no code doors', () => {
    mockParty.value = inPartyAsGuest();
    const net = makeNet();
    const { rerender } = render(lobby(net));

    expect(mockParty.value.knockOn).toHaveBeenCalledTimes(1);
    expect(mockParty.value.knockOn).toHaveBeenCalledWith('racer');
    expect(screen.getByTestId('racer-party-waiting')).toHaveTextContent('Waiting for Rio to open Rainbow Racer');
    expectCodeDoors(false);
    expect(net.startTable).not.toHaveBeenCalled();

    // A re-render does not knock again.
    rerender(lobby(net));
    expect(mockParty.value.knockOn).toHaveBeenCalledTimes(1);
  });

  it('auto-joins the table exactly once when the host opens the racer', () => {
    mockParty.value = inPartyAsGuest();
    const net = makeNet();
    const { rerender } = render(lobby(net, 'u-kai'));
    expect(net.startTable).not.toHaveBeenCalled();

    mockParty.value = inPartyAsGuest({ game: 'racer', code: 'QRST' });
    rerender(lobby(net, 'u-kai'));
    expect(net.startTable).toHaveBeenCalledTimes(1);
    expect(net.startTable).toHaveBeenCalledWith({ role: 'guest', code: 'QRST', seatedUserId: 'u-kai' });

    // The same table announced again (a party reconnect re-hears it) is not a second dial.
    mockParty.value = inPartyAsGuest({ game: 'racer', code: 'QRST' });
    rerender(lobby(makeNet({ ...net, role: 'guest', code: 'QRST', status: 'dialing' }), 'u-kai'));
    expect(net.startTable).toHaveBeenCalledTimes(1);
  });

  it('a table already open for the racer seats the guest at mount without knocking', () => {
    mockParty.value = inPartyAsGuest({ game: 'racer', code: 'QRST' });
    const net = makeNet();
    render(lobby(net, 'u-kai'));

    expect(mockParty.value.knockOn).not.toHaveBeenCalled();
    expect(net.startTable).toHaveBeenCalledWith({ role: 'guest', code: 'QRST', seatedUserId: 'u-kai' });
  });

  it("ignores another game's table, and keeps waiting", () => {
    mockParty.value = inPartyAsGuest({ game: 'chess', code: 'QRST', hostSide: 'w' });
    const net = makeNet();
    render(lobby(net));

    expect(mockParty.value.knockOn).toHaveBeenCalledWith('racer');
    expect(net.startTable).not.toHaveBeenCalled();
    expect(screen.getByTestId('racer-party-waiting')).toBeInTheDocument();
  });

  it('drops the link when the host closes the table, and re-dials a fresh code when it reopens', () => {
    mockParty.value = inPartyAsGuest({ game: 'racer', code: 'QRST' });
    const net = makeNet();
    const { rerender } = render(lobby(net, 'u-kai'));
    expect(net.startTable).toHaveBeenCalledTimes(1);

    // The host backed out: the table closes while we were dialing.
    mockParty.value = inPartyAsGuest();
    rerender(lobby(makeNet({ ...net, role: 'guest', code: 'QRST', status: 'dialing' }), 'u-kai'));
    expect(net.leave).toHaveBeenCalledTimes(1);

    // Back to waiting; then the host opens a fresh table.
    rerender(lobby(net, 'u-kai'));
    expect(screen.getByTestId('racer-party-waiting')).toBeInTheDocument();
    mockParty.value = inPartyAsGuest({ game: 'racer', code: 'VWXY' });
    rerender(lobby(net, 'u-kai'));
    expect(net.startTable).toHaveBeenCalledTimes(2);
    expect(net.startTable).toHaveBeenLastCalledWith({ role: 'guest', code: 'VWXY', seatedUserId: 'u-kai' });
  });

  it('a fresh code arriving over a live link hangs up before dialing again (no doubled peer)', () => {
    mockParty.value = inPartyAsGuest({ game: 'racer', code: 'QRST' });
    const net = makeNet();
    const { rerender } = render(lobby(net, 'u-kai'));

    mockParty.value = inPartyAsGuest({ game: 'racer', code: 'VWXY' });
    rerender(lobby(makeNet({ ...net, role: 'guest', code: 'QRST', status: 'dialing' }), 'u-kai'));
    expect(net.leave).toHaveBeenCalledTimes(1);
    expect(net.startTable).toHaveBeenCalledTimes(2);
    expect(net.startTable).toHaveBeenLastCalledWith({ role: 'guest', code: 'VWXY', seatedUserId: 'u-kai' });
  });

  it('while dialing it says whose race it is joining, with no Back of its own (the shell menu leaves)', () => {
    mockParty.value = inPartyAsGuest({ game: 'racer', code: 'QRST' });
    render(lobby(makeNet({ role: 'guest', code: 'QRST', status: 'dialing' })));

    expect(screen.getByRole('heading', { name: /Rio/ })).toBeInTheDocument();
    expect(screen.queryByTestId('racer-lobby-back')).toBeNull();
    expectCodeDoors(false);
  });
});

describe('<RacerLobby> — party reconnecting', () => {
  it('says so and shows no doors at all', () => {
    mockParty.value = makeParty({ reconnecting: true, status: 'dialing', role: 'guest' });
    render(lobby(makeNet()));

    expect(screen.getByTestId('racer-party-reconnecting')).toHaveTextContent('Reconnecting to your party');
    expectCodeDoors(false);
    expect(screen.queryByTestId('racer-party-play')).toBeNull();
    expect(screen.queryByTestId('racer-party-waiting')).toBeNull();
    expect(mockParty.value.knockOn).not.toHaveBeenCalled();
  });
});
