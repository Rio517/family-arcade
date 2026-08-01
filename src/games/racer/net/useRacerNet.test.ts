import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// Capture the handlers the hook hands to GameConnection, and record what it
// sends, so we can drive the handshake without a real WebRTC connection.
const h = vi.hoisted(() => ({
  state: { handlers: null as any, sent: [] as any[], hostCode: '', joinCode: '' },
}));

vi.mock('@shared/net/peer', () => ({
  GameConnection: class {
    constructor(handlers: any) {
      h.state.handlers = handlers;
    }
    host(code: string) {
      h.state.hostCode = code;
    }
    join(code: string) {
      h.state.joinCode = code;
    }
    send(msg: any) {
      h.state.sent.push(msg);
      return true;
    }
    destroy() {}
  },
  generateCode: () => 'ABCD',
}));

import { useRacerNet } from './useRacerNet';

const world = {
  t: 'world' as const,
  coins: [{ id: 1, x: 0, z: 0, hue: 1 }],
  scores: [2, 3] as [number, number],
  status: 'racing' as const,
  winner: null,
  elapsed: 5,
};

beforeEach(() => {
  h.state.handlers = null;
  h.state.sent = [];
  h.state.hostCode = '';
  h.state.joinCode = '';
});

describe('useRacerNet handshake', () => {
  it('host: introduces itself on open and starts the race when a fresh guest says hello', () => {
    const { result } = renderHook(() =>
      useRacerNet({ name: 'Rio', driver: 'unicorn', target: 20, inRace: () => false, getWorld: () => null }),
    );
    act(() => result.current.host());
    expect(h.state.hostCode).toBe('ABCD');
    expect(result.current.code).toBe('ABCD');

    act(() => h.state.handlers.onOpen());
    expect(h.state.sent.find((m) => m.t === 'hello')).toMatchObject({ name: 'Rio', driver: 'unicorn', inRace: false });

    act(() => h.state.handlers.onMessage({ t: 'hello', name: 'Kai', driver: 'dragon', inRace: false }));
    expect(result.current.theirDriver).toBe('dragon');
    expect(result.current.theirName).toBe('Kai');
    expect(h.state.sent.some((m) => m.t === 'go')).toBe(true);
    expect(result.current.startNonce).toBe(1);
  });

  it('host: does NOT restart the race for a guest that reconnects mid-race', () => {
    const { result } = renderHook(() =>
      useRacerNet({ name: 'Rio', driver: 'unicorn', target: 20, inRace: () => false, getWorld: () => null }),
    );
    act(() => result.current.host());
    act(() => h.state.handlers.onOpen());
    act(() => h.state.handlers.onMessage({ t: 'hello', name: 'Kai', driver: 'dragon', inRace: true }));
    expect(h.state.sent.some((m) => m.t === 'go')).toBe(false);
    expect(result.current.startNonce).toBe(0);
  });

  it('guest: mirrors an inbound world into the ref', () => {
    const { result } = renderHook(() => useRacerNet({ name: 'Kai', driver: 'dragon', target: 20 }));
    act(() => result.current.join('WXYZ'));
    expect(h.state.joinCode).toBe('WXYZ');
    act(() => h.state.handlers.onMessage(world));
    expect(result.current.remoteWorldRef.current).not.toBeNull();
  });

  it('host: ignores world claims a hostile peer might send (host is the authority)', () => {
    const { result } = renderHook(() =>
      useRacerNet({ name: 'Rio', driver: 'unicorn', target: 20, inRace: () => false }),
    );
    act(() => result.current.host());
    act(() => h.state.handlers.onMessage(world));
    expect(result.current.remoteWorldRef.current).toBeNull();
  });
});
