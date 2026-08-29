import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PartyValue } from './PartyContext';
import { getUsersSnapshot, resetUsersStore, setUsersState } from '@shared/profile/usersStore';
import { addUser, emptyUsersState, setActiveUser } from '@shared/profile/users';

/**
 * A stand-in for GameConnection that records what the party does with its
 * link: which code it hosted or dialled, under which broker prefix, and every
 * message it sent. Tests poke the handlers to play the other device. Hoisted,
 * because vi.mock's factory runs before the rest of this module.
 */
const { links, FakeLink } = vi.hoisted(() => {
  type Handlers = {
    onStatus: (status: string, detail?: string) => void;
    onOpen: () => void;
    onMessage: (msg: unknown) => void;
  };
  class FakeLink {
    hosted: string | null = null;
    dialled: string | null = null;
    sent: unknown[] = [];
    destroyed = false;
    constructor(
      public handlers: Handlers,
      public config: { prefix: string; isMessage: (v: unknown) => boolean },
    ) {
      links.all.push(this);
    }
    host(code: string) {
      this.hosted = code;
      this.handlers.onStatus('hosting');
    }
    join(code: string) {
      this.dialled = code;
      this.handlers.onStatus('dialing');
    }
    send(msg: unknown) {
      this.sent.push(msg);
      return true;
    }
    destroy() {
      this.destroyed = true;
    }
    /** The other device connects: the channel opens on both ends. */
    connect() {
      this.handlers.onStatus('connected');
      this.handlers.onOpen();
    }
    /** The other device speaks (validated as the real link would). */
    receive(msg: unknown) {
      if (this.config.isMessage(msg)) this.handlers.onMessage(msg);
    }
  }
  const links = { all: [] as FakeLink[] };
  return { links, FakeLink };
});
vi.mock('@shared/net/peer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/net/peer')>();
  return { ...actual, GameConnection: FakeLink };
});

// The provider is imported after the mock is in place.
import { PartyProvider, useParty } from './PartyContext';

let party: PartyValue;
function Probe() {
  party = useParty();
  return (
    <p data-testid="probe">
      {party.myName}|{party.status}|{party.theirName ?? '-'}|{party.code}|{party.role ?? '-'}
    </p>
  );
}

const link = () => links.all[links.all.length - 1];
const hellos = (l: InstanceType<typeof FakeLink>) =>
  l.sent.filter((m) => (m as { t: string }).t === 'hello') as { t: string; name: string }[];
const roster = () => getUsersSnapshot();

beforeEach(() => {
  localStorage.clear();
  resetUsersStore();
  links.all.length = 0;
  const two = addUser(addUser(emptyUsersState(), 'u1', 'Rio'), 'u2', 'Klara');
  setUsersState(setActiveUser(two, 'u2'));
});
afterEach(() => vi.restoreAllMocks());

describe('<PartyProvider>', () => {
  it('wears the signed-in ticket and follows it live', () => {
    render(<PartyProvider><Probe /></PartyProvider>);
    expect(screen.getByTestId('probe')).toHaveTextContent(/^Klara\|/);
    act(() => setUsersState(setActiveUser(roster(), 'u1')));
    expect(screen.getByTestId('probe')).toHaveTextContent(/^Rio\|/);
  });

  it('hostParty hosts a four-character code on the party prefix and says hello when the link opens', () => {
    render(<PartyProvider><Probe /></PartyProvider>);
    let code = '';
    act(() => {
      code = party.hostParty();
    });
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
    expect(link().hosted).toBe(code);
    expect(link().config.prefix).toBe('party-v1-');
    expect(party.role).toBe('host');
    expect(party.inParty).toBe(false);
    act(() => link().connect());
    expect(party.inParty).toBe(true);
    expect(hellos(link())).toEqual([{ t: 'hello', name: 'Klara' }]);
  });

  it('a ticket switch mid-party re-introduces you on the wire', () => {
    render(<PartyProvider><Probe /></PartyProvider>);
    act(() => void party.hostParty());
    act(() => link().connect());
    act(() => setUsersState(setActiveUser(roster(), 'u1')));
    expect(hellos(link()).at(-1)).toEqual({ t: 'hello', name: 'Rio' });
  });

  it("learns the friend's name from their hello — clamped, and never blank", () => {
    render(<PartyProvider><Probe /></PartyProvider>);
    act(() => party.joinParty('abcd'));
    expect(link().dialled).toBe('ABCD');
    expect(party.role).toBe('guest');
    act(() => link().connect());
    act(() => link().receive({ t: 'hello', name: 'K'.repeat(40) }));
    expect(party.theirName).toBe('K'.repeat(24));
    act(() => link().receive({ t: 'hello', name: '' }));
    expect(party.theirName).toBe('Friend');
  });

  it('leaveParty tears the link down and forgets the friend', () => {
    render(<PartyProvider><Probe /></PartyProvider>);
    act(() => void party.hostParty());
    act(() => link().connect());
    act(() => link().receive({ t: 'hello', name: 'Kai' }));
    const l = link();
    act(() => party.leaveParty());
    expect(l.destroyed).toBe(true);
    expect(party.inParty).toBe(false);
    expect(party.theirName).toBeNull();
    expect(party.code).toBe('');
    expect(party.role).toBeNull();
  });

  it('never turns the mic on by itself', () => {
    render(<PartyProvider><Probe /></PartyProvider>);
    act(() => void party.hostParty());
    act(() => link().connect());
    expect(party.call.active).toBe(false);
    expect(party.call.status).toBe('idle');
  });
});
