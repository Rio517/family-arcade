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
}));

import { useChess } from './useChess';
import { loadChessGame, saveChessGame } from '@games/chess/storage/chessPersistence';

beforeEach(() => {
  localStorage.clear();
  h.state.handlers = null;
  h.state.sent = [];
  h.state.hostCode = '';
  h.state.joinCode = '';
});

describe('useChess — sitting down at an online table', () => {
  it('host: listens on the given code as my ticket, playing White unless told otherwise', () => {
    const { result } = renderHook(() => useChess({ name: 'Rio', onFinish: vi.fn() }));
    act(() => result.current.startTable({ role: 'host', code: 'ABCD', seatedUserId: 'u1' }));

    expect(h.state.hostCode).toBe('ABCD');
    expect(result.current).toMatchObject({
      phase: 'play',
      mode: 'online',
      side: 'host',
      myColor: 'w',
      code: 'ABCD',
      myName: 'Rio',
    });
    // The seat is saved with the game, so a refresh credits the same ticket.
    expect(loadChessGame('ABCD')).toMatchObject({ side: 'host', myColor: 'w', seatedUserId: 'u1' });

    // The hello on open says the ticket's name — no "Player" stand-in.
    act(() => h.state.handlers.onOpen());
    expect(h.state.sent.find((m) => m.t === 'hello')).toMatchObject({ name: 'Rio', side: 'host' });
  });

  it('guest: dials the code and takes the other colour from a host who chose Black', () => {
    const { result } = renderHook(() => useChess({ name: 'Kai', onFinish: vi.fn() }));
    act(() => result.current.startTable({ role: 'guest', code: 'WXYZ', seatedUserId: 'u2', hostSide: 'b' }));

    expect(h.state.joinCode).toBe('WXYZ');
    expect(result.current).toMatchObject({ side: 'guest', myColor: 'w', code: 'WXYZ', myName: 'Kai' });
    // White moves first — and this guest IS White.
    expect(result.current.canMove).toBe(true);
    expect(loadChessGame('WXYZ')).toMatchObject({ side: 'guest', myColor: 'w', seatedUserId: 'u2' });
  });

  it('a chair with nobody signed in is remembered as null, not forgotten', () => {
    const { result } = renderHook(() => useChess({ name: 'Rio', onFinish: vi.fn() }));
    act(() => result.current.startTable({ role: 'host', code: 'ABCD', seatedUserId: null }));
    expect(loadChessGame('ABCD')).toMatchObject({ seatedUserId: null });
  });

  it('resuming a saved game brings back the colour and the seat', () => {
    saveChessGame({
      code: 'RSME',
      side: 'host',
      myName: 'Rio',
      oppName: 'Kai',
      log: [],
      finished: false,
      updatedAt: 1,
      myColor: 'b',
      seatedUserId: 'u1',
    });
    const { result } = renderHook(() => useChess({ name: 'Rio', onFinish: vi.fn() }));
    act(() => result.current.resumeGame('RSME'));

    expect(h.state.hostCode).toBe('RSME');
    expect(result.current).toMatchObject({ side: 'host', myColor: 'b', oppName: 'Kai', canMove: false });
    expect(loadChessGame('RSME')).toMatchObject({ myColor: 'b', seatedUserId: 'u1' });
  });
});
