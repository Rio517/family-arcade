import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { loadSession } from '@games/battleship/storage/sessionStore';

/**
 * The hook's seam with the page: how a table starts. The session state
 * machine and the wire are covered elsewhere (session.test, loopback.test,
 * app.integration.test); here the network is a stand-in that only records
 * what the hook asked of it — host or join, and under which code.
 */
const wire = vi.hoisted(() => ({ host: [] as string[], join: [] as string[] }));
vi.mock('@shared/net/peer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/net/peer')>();
  class GameConnection {
    constructor(private handlers: { onStatus: (status: string, detail?: string) => void }) {}
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

beforeEach(() => {
  localStorage.clear();
  wire.host.length = 0;
  wire.join.length = 0;
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
    act(() => result.current.startSoloGame('bobble'));

    expect(result.current.code).toBe('SOLO');
    expect(result.current.side).toBe('host');
    expect(result.current.myName).toBe('Klara');
    expect(wire.host).toEqual([]); // the loopback captain, never the network
  });
});
