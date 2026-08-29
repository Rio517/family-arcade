import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { loadSession, saveSession, type GameSession } from '@games/battleship/storage/sessionStore';
import type { Fleet, GameLog } from '@games/battleship/domain/types';

/**
 * The hook's seam with the page: how a table starts. The session state
 * machine and the wire are covered elsewhere (session.test, loopback.test,
 * app.integration.test); here the network is a stand-in that only records
 * what the hook asked of it — host or join, and under which code.
 */
const wire = vi.hoisted(() => ({
  host: [] as string[],
  join: [] as string[],
  /** Push a message to the hook as if the peer had sent it. */
  deliver: null as ((msg: unknown) => void) | null,
}));
vi.mock('@shared/net/peer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/net/peer')>();
  class GameConnection {
    constructor(private handlers: { onStatus: (status: string, detail?: string) => void; onMessage: (msg: unknown) => void }) {
      wire.deliver = (msg) => handlers.onMessage(msg);
    }
    host(code: string) {
      wire.host.push(code);
      this.handlers.onStatus('hosting');
    }
    join(code: string) {
      wire.join.push(code);
      this.handlers.onStatus('dialing');
    }
    send() {
      return false;
    }
    destroy() {}
  }
  return { ...actual, GameConnection };
});

import { useBattleship } from './useBattleship';

/** Mount the hook for a signed-in captain; the name comes from the ticket, never from the lobby. */
function mount(name = 'Rio') {
  return renderHook(() => useBattleship({ name, skinId: 'aqua', onFinish: vi.fn() }));
}

/** A legal, hand-placed fleet: five ships on even rows, all pointing east. */
const FLEET: Fleet = [
  { shipId: 'carrier', row: 0, col: 0, orientation: 'H' },
  { shipId: 'battleship', row: 2, col: 0, orientation: 'H' },
  { shipId: 'cruiser', row: 4, col: 0, orientation: 'H' },
  { shipId: 'submarine', row: 6, col: 0, orientation: 'H' },
  { shipId: 'destroyer', row: 8, col: 0, orientation: 'H' },
];

/** A battle two shots in: the host opened fire and missed, the guest answered in kind. */
const MID_BATTLE: GameLog = [
  { type: 'start', first: 'host' },
  { type: 'shot', by: 'host', row: 9, col: 9, hit: false, sunk: null, allSunk: false },
  { type: 'shot', by: 'guest', row: 9, col: 9, hit: false, sunk: null, allSunk: false },
];

/** Write the save a reload would find: Kai mid-battle under `code`, on `side`. */
function seedSave(side: 'host' | 'guest', code: string, over: Partial<GameSession> = {}) {
  saveSession({
    code,
    side,
    myName: 'Kai',
    mySkinId: 'aqua',
    seatedUserId: 'u-kai',
    oppName: 'Rio',
    oppSkinId: 'aqua',
    myFleet: FLEET,
    myReady: true,
    oppReady: true,
    log: MID_BATTLE,
    epoch: 0,
    finished: false,
    updatedAt: 1,
    ...over,
  });
}

beforeEach(() => {
  localStorage.clear();
  wire.host.length = 0;
  wire.join.length = 0;
  wire.deliver = null;
});

describe('useBattleship.startTable', () => {
  it('hosts a table under the given code as the signed-in captain, remembering who sat down', () => {
    const { result } = mount('Rio');
    act(() => result.current.startTable({ role: 'host', code: 'ABCD', seatedUserId: 'u-rio' }));

    expect(result.current.phase).toBe('fleet');
    expect(result.current.side).toBe('host');
    expect(result.current.code).toBe('ABCD');
    expect(result.current.myName).toBe('Rio');
    expect(result.current.seatedUserId).toBe('u-rio');
    expect(wire.host).toEqual(['ABCD']);
    // The save carries the seat too, so a resume credits the same ticket.
    expect(loadSession('ABCD')?.seatedUserId).toBe('u-rio');
  });

  it('joins a table as guest by code', () => {
    const { result } = mount('Kai');
    act(() => result.current.startTable({ role: 'guest', code: 'WXYZ', seatedUserId: 'u-kai' }));

    expect(result.current.side).toBe('guest');
    expect(result.current.code).toBe('WXYZ');
    expect(result.current.myName).toBe('Kai');
    expect(wire.join).toEqual(['WXYZ']);
    expect(wire.host).toEqual([]);
    expect(loadSession('WXYZ')?.seatedUserId).toBe('u-kai');
  });

  it('seats nobody when the ticket id is unknown', () => {
    const { result } = mount();
    act(() => result.current.startTable({ role: 'host', code: 'ABCD', seatedUserId: null }));
    expect(result.current.seatedUserId).toBeNull();
    expect(loadSession('ABCD')?.seatedUserId).toBeNull();
  });
});

describe('useBattleship.startSoloGame', () => {
  it('sails as the signed-in captain against the chosen computer captain', () => {
    const { result } = mount('Klara');
    act(() => result.current.startSoloGame('bobble', 'u-klara'));

    expect(result.current.code).toBe('SOLO');
    expect(result.current.side).toBe('host');
    expect(result.current.myName).toBe('Klara');
    expect(wire.host).toEqual([]); // the loopback captain, never the network
  });

  it('seats the ticket too, and the save carries it — a solo win is history like any other', () => {
    const { result } = mount('Klara');
    act(() => result.current.startSoloGame('bobble', 'u-klara'));

    expect(result.current.seatedUserId).toBe('u-klara');
    expect(loadSession('SOLO')?.seatedUserId).toBe('u-klara');
  });

  it('seats nobody when the ticket id is unknown', () => {
    const { result } = mount('Klara');
    act(() => result.current.startSoloGame('bobble', null));

    expect(result.current.seatedUserId).toBeNull();
    expect(loadSession('SOLO')?.seatedUserId).toBeNull();
  });
});

/**
 * The finish is the page's cue to record a result. It fires minutes after the
 * table opened, and tickets can change in between — so the seat rides along
 * with it, and the page never has to ask the roster who is signed in now.
 */
describe('useBattleship reports the finish for the seat', () => {
  it('hands onFinish the ticket that sat down at this table', () => {
    seedSave('guest', 'QRST');
    const onFinish = vi.fn();
    const { result } = renderHook(() => useBattleship({ name: 'Kai', skinId: 'aqua', onFinish }));
    act(() => result.current.startTable({ role: 'guest', code: 'QRST', seatedUserId: 'u-kai' }));

    // The host's winning shot arrives in a catch-up sync (the reconnect race).
    const overLog: GameLog = [
      ...MID_BATTLE,
      { type: 'shot', by: 'host', row: 0, col: 0, hit: true, sunk: 'carrier', allSunk: true },
    ];
    act(() => wire.deliver?.({ t: 'sync', log: overLog, ready: true }));

    expect(result.current.phase).toBe('over');
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(
      expect.objectContaining({ won: false, code: 'QRST', opponent: 'Rio', seatedUserId: 'u-kai' }),
    );
  });
});

/**
 * A guest who reloads mid-battle is seated again by the party under the same
 * code — that must pick the saved game back up, not open a fresh one whose
 * empty fleet the persist pass would write over the save (every host shot a
 * miss from then on).
 */
describe('useBattleship.startTable picks a saved game back up', () => {
  it('as guest under the same code: keeps the fleet and the shots, and dials the table again', () => {
    seedSave('guest', 'QRST');
    const { result } = mount('Kai');
    act(() => result.current.startTable({ role: 'guest', code: 'QRST', seatedUserId: 'u-kai' }));

    expect(result.current.phase).toBe('battle');
    expect(result.current.side).toBe('guest');
    expect(result.current.code).toBe('QRST');
    expect(result.current.myFleet).toEqual(FLEET);
    expect(result.current.log).toEqual(MID_BATTLE);
    expect(wire.join).toEqual(['QRST']);
    expect(wire.host).toEqual([]);
    // The save survives the persist pass — a reload never blanks a fleet.
    expect(loadSession('QRST')?.myFleet).toEqual(FLEET);
    expect(loadSession('QRST')?.log).toEqual(MID_BATTLE);
  });

  it('but not a save from the other side of the table', () => {
    seedSave('host', 'QRST');
    const { result } = mount('Kai');
    act(() => result.current.startTable({ role: 'guest', code: 'QRST', seatedUserId: 'u-kai' }));

    expect(result.current.phase).toBe('fleet');
    expect(result.current.side).toBe('guest');
    expect(result.current.myFleet).toEqual([]);
    expect(result.current.log).toEqual([]);
    expect(wire.join).toEqual(['QRST']);
  });

  it('nor a finished one — that table is done, sit down fresh', () => {
    seedSave('guest', 'QRST', { finished: true });
    const { result } = mount('Kai');
    act(() => result.current.startTable({ role: 'guest', code: 'QRST', seatedUserId: 'u-kai' }));

    expect(result.current.phase).toBe('fleet');
    expect(result.current.log).toEqual([]);
  });
});

describe('useBattleship.leave', () => {
  it('drops the save and the seat, so the captain is back in the lobby', () => {
    const { result } = mount('Kai');
    act(() => result.current.startTable({ role: 'guest', code: 'WXYZ', seatedUserId: 'u-kai' }));
    expect(result.current.phase).toBe('fleet');

    act(() => result.current.leave());
    expect(result.current.phase).toBe('lobby');
    expect(result.current.side).toBeNull();
    expect(result.current.code).toBe('');
    expect(loadSession('WXYZ')).toBeNull();
  });
});
