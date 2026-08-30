import { StrictMode, useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PartyValue } from './PartyContext';
import { getUsersSnapshot, resetUsersStore, setUsersState } from '@shared/profile/usersStore';
import { addUser, emptyUsersState, setActiveUser } from '@shared/profile/users';
import { PARTY_TTL_MS } from './party';
import { PARTY_KEY, saveParty } from './partyStore';

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
  const value = useParty();
  // Captured after commit (never during render — the compiler rule is right
  // to object to that); every test reads it inside or after an act().
  useEffect(() => {
    party = value;
  });
  return (
    <p data-testid="probe">
      {value.myName}|{value.status}|{value.theirName ?? '-'}|{value.code}|{value.role ?? '-'}
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

const tables = (l: InstanceType<typeof FakeLink>) => l.sent.filter((m) => (m as { t: string }).t === 'table');
const stored = () => JSON.parse(localStorage.getItem(PARTY_KEY) ?? 'null');

describe('the party is the table', () => {
  beforeEach(() => {
    window.__ARCADE_TEST_NOW__ = () => 1_000_000;
  });
  afterEach(() => {
    delete window.__ARCADE_TEST_NOW__;
  });

  it('the host opens a table under a fresh code and tells the friend', () => {
    render(<PartyProvider><Probe /></PartyProvider>);
    let partyCode = '';
    act(() => {
      partyCode = party.hostParty();
    });
    act(() => link().connect());
    let tableCode = '';
    act(() => {
      tableCode = party.openTable('chess', 'w');
    });
    expect(tableCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
    expect(tableCode).not.toBe(partyCode);
    expect(party.table).toEqual({ game: 'chess', code: tableCode, hostSide: 'w' });
    expect(tables(link())).toEqual([{ t: 'table', game: 'chess', code: tableCode, hostSide: 'w' }]);
    // Remembered with the party, so a reload can re-announce it.
    expect(stored()).toMatchObject({ code: partyCode, role: 'host', table: { game: 'chess', code: tableCode } });
    // Closing names the table: another code (a code-door game, a solo one) is ignored.
    act(() => party.closeTable('ZZZZ'));
    expect(party.table).not.toBeNull();
    act(() => party.closeTable(tableCode));
    expect(party.table).toBeNull();
    expect(link().sent.at(-1)).toEqual({ t: 'table-closed' });
    expect(stored().table).toBeNull();
  });

  it('a guest cannot close the table — only the host says when it is over', () => {
    render(<PartyProvider><Probe /></PartyProvider>);
    act(() => party.joinParty('AB23'));
    act(() => link().connect());
    act(() => link().receive({ t: 'table', game: 'chess', code: 'CD45' }));
    act(() => party.closeTable('CD45'));
    expect(party.table).toEqual({ game: 'chess', code: 'CD45' });
    expect(link().sent.some((m) => (m as { t: string }).t === 'table-closed')).toBe(false);
  });

  it('a fresh channel re-announces the open table', () => {
    render(<PartyProvider><Probe /></PartyProvider>);
    act(() => void party.hostParty());
    act(() => link().connect());
    act(() => void party.openTable('racer'));
    act(() => link().connect()); // the friend's device reconnects
    expect(tables(link())).toHaveLength(2);
  });

  it('the guest learns of the table and of its closing; the host hears a knock', () => {
    render(<PartyProvider><Probe /></PartyProvider>);
    act(() => party.joinParty('AB23'));
    act(() => link().connect());
    act(() => link().receive({ t: 'table', game: 'chess', code: 'CD45' }));
    expect(party.table).toEqual({ game: 'chess', code: 'CD45' });
    act(() => link().receive({ t: 'table-closed' }));
    expect(party.table).toBeNull();
    act(() => party.knockOn('racer'));
    expect(link().sent.at(-1)).toEqual({ t: 'knock', game: 'racer' });
  });

  it('the host hears a knock and can clear it', () => {
    render(<PartyProvider><Probe /></PartyProvider>);
    act(() => void party.hostParty());
    act(() => link().connect());
    act(() => link().receive({ t: 'knock', game: 'racer' }));
    expect(party.knock).toBe('racer');
    act(() => party.clearKnock());
    expect(party.knock).toBeNull();
  });

  it('a fresh channel with no table says so — a guest that slept through the closing forgets it', () => {
    render(<PartyProvider><Probe /></PartyProvider>);
    act(() => void party.hostParty());
    act(() => link().connect());
    let tableCode = '';
    act(() => {
      tableCode = party.openTable('racer');
    });
    act(() => party.closeTable(tableCode));
    act(() => link().connect()); // the friend's device comes back
    const afterReopen = link().sent.slice(link().sent.lastIndexOf({ t: 'hello', name: 'Klara' }));
    expect(afterReopen.some((m) => (m as { t: string }).t === 'table')).toBe(false);
    expect(link().sent.at(-1)).toEqual({ t: 'table-closed' });
  });

  it('opening a table answers the knock', () => {
    render(<PartyProvider><Probe /></PartyProvider>);
    act(() => void party.hostParty());
    act(() => link().connect());
    act(() => link().receive({ t: 'knock', game: 'chess' }));
    expect(party.knock).toBe('chess');
    act(() => void party.openTable('chess', 'w'));
    expect(party.knock).toBeNull();
  });

  it('a guest ignores a knock and a host ignores a table — each message has one direction', () => {
    const r = render(<PartyProvider><Probe /></PartyProvider>);
    act(() => party.joinParty('AB23'));
    act(() => link().connect());
    act(() => link().receive({ t: 'knock', game: 'chess' }));
    expect(party.knock).toBeNull();
    r.unmount();

    render(<PartyProvider><Probe /></PartyProvider>);
    act(() => void party.hostParty());
    act(() => link().connect());
    act(() => link().receive({ t: 'table', game: 'chess', code: 'CD45' }));
    expect(party.table).toBeNull();
    act(() => link().receive({ t: 'table-closed' }));
    expect(party.table).toBeNull();
  });

  it('wearing an effect tells the friend, is re-said on a fresh channel, and is forgotten on leaving', () => {
    render(<PartyProvider><Probe /></PartyProvider>);
    act(() => void party.hostParty());
    act(() => link().connect());
    act(() => party.setEffects(['dragon']));
    expect(party.effects).toEqual(['dragon']);
    expect(link().sent.at(-1)).toEqual({ t: 'effects', effects: ['dragon'] });
    // The friend's device reconnects: it hears what I'm wearing again.
    act(() => link().connect());
    expect(link().sent.at(-1)).toEqual({ t: 'effects', effects: ['dragon'] });
    act(() => party.setEffects([]));
    expect(link().sent.at(-1)).toEqual({ t: 'effects', effects: [] });
    act(() => party.setEffects(['peace']));
    act(() => party.leaveParty());
    expect(party.effects).toEqual([]);
  });

  it("hears what the friend is wearing — and ignores an effect this build doesn't know", () => {
    render(<PartyProvider><Probe /></PartyProvider>);
    act(() => party.joinParty('AB23'));
    act(() => link().connect());
    act(() => link().receive({ t: 'effects', effects: ['peace', 'laser-eyes', 'dragon'] }));
    expect(party.theirEffects).toEqual(['peace', 'dragon']);
    act(() => link().receive({ t: 'effects', effects: [] }));
    expect(party.theirEffects).toEqual([]);
    act(() => link().receive({ t: 'effects', effects: ['dragon'] }));
    act(() => party.leaveParty());
    expect(party.theirEffects).toEqual([]);
  });

  it('resolves a game id through the app, staying game-blind itself', () => {
    render(
      <PartyProvider resolveGame={(id) => (id === 'chess' ? { title: 'Chess', path: '/chess' } : null)}>
        <Probe />
      </PartyProvider>,
    );
    expect(party.resolveGame('chess')).toEqual({ title: 'Chess', path: '/chess' });
    expect(party.resolveGame('bingo')).toBeNull();
  });
});

describe('a remembered party', () => {
  beforeEach(() => {
    window.__ARCADE_TEST_NOW__ = () => 1_000_000;
  });
  afterEach(() => {
    delete window.__ARCADE_TEST_NOW__;
  });

  it('the host re-hosts the same code on load, reconnecting, with its table ready to announce', () => {
    saveParty({ code: 'AB23', role: 'host', at: 999_000, table: { game: 'chess', code: 'CD45', hostSide: 'b' } });
    render(<PartyProvider><Probe /></PartyProvider>);
    expect(party.reconnecting).toBe(true);
    expect(party.role).toBe('host');
    expect(party.code).toBe('AB23');
    expect(link().hosted).toBe('AB23');
    expect(party.table).toEqual({ game: 'chess', code: 'CD45', hostSide: 'b' });
    act(() => link().connect());
    expect(party.reconnecting).toBe(false);
    expect(party.inParty).toBe(true);
    expect(tables(link())).toEqual([{ t: 'table', game: 'chess', code: 'CD45', hostSide: 'b' }]);
  });

  it('the guest re-dials the same code on load', () => {
    saveParty({ code: 'AB23', role: 'guest', at: 999_000, table: null });
    render(<PartyProvider><Probe /></PartyProvider>);
    expect(party.reconnecting).toBe(true);
    expect(link().dialled).toBe('AB23');
  });

  it('survives StrictMode mounting the provider twice — the remembered party is dialled by the surviving link', () => {
    saveParty({ code: 'AB23', role: 'guest', at: 999_000, table: null });
    render(
      <StrictMode>
        <PartyProvider><Probe /></PartyProvider>
      </StrictMode>,
    );
    expect(link().dialled).toBe('AB23');
    expect(link().destroyed).toBe(false);
    expect(party.reconnecting).toBe(true);
  });

  it('a stale party is left alone', () => {
    saveParty({ code: 'AB23', role: 'guest', at: 1_000_000 - PARTY_TTL_MS - 1, table: null });
    render(<PartyProvider><Probe /></PartyProvider>);
    expect(party.reconnecting).toBe(false);
    expect(links.all).toHaveLength(0);
    expect(localStorage.getItem(PARTY_KEY)).toBeNull();
  });

  it('a remembered guest whose rejoin fails is not stuck reconnecting — it can try again, then get through', () => {
    saveParty({ code: 'AB23', role: 'guest', at: 999_000, table: null });
    render(<PartyProvider><Probe /></PartyProvider>);
    expect(party.reconnecting).toBe(true);
    act(() => link().handlers.onStatus('error', 'Could not reach that party'));
    expect(party.status).toBe('error');
    expect(party.reconnecting).toBe(false);
    act(() => party.retry());
    expect(party.reconnecting).toBe(true);
    act(() => link().connect());
    expect(party.reconnecting).toBe(false);
    expect(party.inParty).toBe(true);
  });

  it('starting a party by hand is never "reconnecting", even right after a remembered one was left', () => {
    saveParty({ code: 'AB23', role: 'guest', at: 999_000, table: null });
    render(<PartyProvider><Probe /></PartyProvider>);
    act(() => party.leaveParty());
    act(() => void party.hostParty());
    expect(party.reconnecting).toBe(false);
    expect(party.status).toBe('hosting');
  });

  it('leaving forgets the party; an error can be retried on the same code', () => {
    render(<PartyProvider><Probe /></PartyProvider>);
    act(() => party.joinParty('AB23'));
    expect(stored()).toMatchObject({ code: 'AB23', role: 'guest' });
    act(() => link().handlers.onStatus('error', 'Could not reach that party'));
    expect(party.status).toBe('error');
    act(() => party.retry());
    expect(links.all).toHaveLength(2);
    expect(link().dialled).toBe('AB23');
    act(() => party.leaveParty());
    expect(localStorage.getItem(PARTY_KEY)).toBeNull();
  });
});
