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
import {
  loadChessGame,
  loadLocalChessGame,
  saveChessGame,
  type StoredChessGame,
  type StoredLocalChess,
} from '@games/chess/storage/chessPersistence';
import type { FinishInfo } from '@games/chess/domain/session';
import type { Ply, Square } from '@games/chess/domain/types';

const sq = (name: string): Square => ({ row: 8 - Number(name[1]), col: 'abcdefgh'.indexOf(name[0]) });
const ply = (from: string, to: string): Ply => ({ from: sq(from), to: sq(to) });
/** 1.e4 e5 2.Nf3 — three plies of an ordinary game. */
const THREE_PLIES: Ply[] = [ply('e2', 'e4'), ply('e7', 'e5'), ply('g1', 'f3')];
/** Fool's mate — a game that is over. */
const FOOLS_MATE: Ply[] = [ply('f2', 'f3'), ply('e7', 'e5'), ply('g2', 'g4'), ply('d8', 'h4')];

/** A save under 'QRST' as Kai vs Rio; the chair and the log vary per case. */
function savedGame(over: Partial<StoredChessGame>): StoredChessGame {
  return {
    code: 'QRST',
    side: 'guest',
    myName: 'Kai',
    oppName: 'Rio',
    log: THREE_PLIES,
    finished: false,
    updatedAt: 1,
    myColor: 'w',
    seatedUserId: 'u1',
    ...over,
  };
}

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

describe('useChess — sitting down again under a saved code', () => {
  // A guest who reloads mid-game is seated again by the party under the same
  // code. That must pick the game back up, not start a fresh one over the save.
  it('the same code and the same chair resume the saved game — log, colour and opponent intact', () => {
    saveChessGame(savedGame({}));
    const { result } = renderHook(() => useChess({ name: 'Kai', onFinish: vi.fn() }));
    act(() => result.current.startTable({ role: 'guest', code: 'QRST', seatedUserId: 'u1' }));

    expect(h.state.joinCode).toBe('QRST');
    expect(result.current).toMatchObject({ phase: 'play', side: 'guest', myColor: 'w', oppName: 'Rio', code: 'QRST' });
    expect(result.current.log).toEqual(THREE_PLIES);
    // The save survives the sit-down, three plies and all.
    expect(loadChessGame('QRST')).toMatchObject({ side: 'guest', myColor: 'w', log: THREE_PLIES, seatedUserId: 'u1' });
  });

  it("a save from the other chair is somebody else's game — the guest sits down fresh", () => {
    saveChessGame(savedGame({ side: 'host', myName: 'Rio', oppName: 'Kai', myColor: 'b' }));
    const { result } = renderHook(() => useChess({ name: 'Kai', onFinish: vi.fn() }));
    act(() => result.current.startTable({ role: 'guest', code: 'QRST', seatedUserId: 'u2' }));

    expect(h.state.joinCode).toBe('QRST');
    // A fresh guest session: no moves, the default colour, no opponent yet.
    expect(result.current).toMatchObject({ side: 'guest', myColor: 'b', oppName: '', log: [] });
    expect(loadChessGame('QRST')).toMatchObject({ side: 'guest', log: [], seatedUserId: 'u2' });
  });

  it('a finished save under a reused code is not resumed — that game is over', () => {
    saveChessGame(savedGame({ log: FOOLS_MATE, finished: true }));
    const { result } = renderHook(() => useChess({ name: 'Kai', onFinish: vi.fn() }));
    act(() => result.current.startTable({ role: 'guest', code: 'QRST', seatedUserId: 'u1' }));

    expect(result.current).toMatchObject({ phase: 'play', log: [] });
  });
});

describe('useChess — leaving the table', () => {
  it('hangs up, forgets the save, and is back in the lobby — no dead board left on screen', () => {
    const { result } = renderHook(() => useChess({ name: 'Kai', onFinish: vi.fn() }));
    act(() => result.current.startTable({ role: 'guest', code: 'WXYZ', seatedUserId: 'u2' }));
    act(() => h.state.handlers.onStatus('dialing'));
    expect(result.current).toMatchObject({ phase: 'play', status: 'dialing' });
    expect(loadChessGame('WXYZ')).not.toBeNull();

    act(() => result.current.leave());
    expect(result.current).toMatchObject({ phase: 'lobby', mode: null, side: null, code: '', status: 'idle' });
    expect(loadChessGame('WXYZ')).toBeNull();
  });
});

describe('useChess — who is playing, for the result', () => {
  const rio = { name: 'Rio', userId: 'u1' };
  const flora = { name: 'Flora', userId: 'u2' };

  /** Play fool's mate on whatever session is live: Black wins on ply four. */
  function playFoolsMate(move: (p: Ply) => void) {
    for (const p of FOOLS_MATE) act(() => move(p));
  }

  it('exposes the seated ticket online, like Ship Battle does', () => {
    const { result } = renderHook(() => useChess({ name: 'Rio', onFinish: vi.fn() }));
    expect(result.current.seatedUserId).toBeNull();
    act(() => result.current.startTable({ role: 'host', code: 'ABCD', seatedUserId: 'u1' }));
    expect(result.current.seatedUserId).toBe('u1');
  });

  it('a same-device game starts with both tickets, saves them, and hands them to onFinish', () => {
    const onFinish = vi.fn<(info: FinishInfo) => void>();
    const { result } = renderHook(() => useChess({ name: 'Rio', onFinish }));
    act(() => result.current.startLocal(rio, flora));
    expect(result.current).toMatchObject({ mode: 'local', myName: 'Rio', oppName: 'Flora', seatedUserId: null });

    act(() => result.current.move(FOOLS_MATE[0]));
    expect(loadLocalChessGame()).toMatchObject({ whiteUserId: 'u1', blackUserId: 'u2' });

    for (const p of FOOLS_MATE.slice(1)) act(() => result.current.move(p));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0]).toMatchObject({
      winner: 'b',
      iWon: null,
      whiteUserId: 'u1',
      blackUserId: 'u2',
      whiteName: 'Rio',
      blackName: 'Flora',
      seatedUserId: null,
    });
  });

  it('blank names fall back to White and Black, and a ticketless chair stays null', () => {
    const { result } = renderHook(() => useChess({ name: 'Rio', onFinish: vi.fn() }));
    act(() => result.current.startLocal({ name: '  ', userId: 'u1' }, { name: '', userId: null }));
    expect(result.current).toMatchObject({ myName: 'White', oppName: 'Black' });
  });

  it('resuming the same-device save brings the tickets back to the finish', () => {
    const onFinish = vi.fn<(info: FinishInfo) => void>();
    const first = renderHook(() => useChess({ name: 'Rio', onFinish: vi.fn() }));
    act(() => first.result.current.startLocal(rio, flora));
    act(() => first.result.current.move(FOOLS_MATE[0]));
    first.unmount();

    const { result } = renderHook(() => useChess({ name: 'Rio', onFinish }));
    act(() => result.current.resumeLocal());
    expect(result.current).toMatchObject({ mode: 'local', myName: 'Rio', oppName: 'Flora' });
    playFoolsMate((p) => result.current.move(p)); // the first ply is refused (already played)
    expect(onFinish.mock.calls[0][0]).toMatchObject({ whiteUserId: 'u1', blackUserId: 'u2' });
  });

  it('a save from before tickets rode along resumes and finishes with null chairs', () => {
    const old: StoredLocalChess = { v: 1, whiteName: 'Rio', blackName: 'Flora', log: FOOLS_MATE.slice(0, 3), updatedAt: 1 };
    localStorage.setItem('chess:local:v1', JSON.stringify(old));
    const onFinish = vi.fn<(info: FinishInfo) => void>();
    const { result } = renderHook(() => useChess({ name: 'Rio', onFinish }));
    act(() => result.current.resumeLocal());
    act(() => result.current.move(FOOLS_MATE[3]));
    expect(onFinish.mock.calls[0][0]).toMatchObject({ winner: 'b', whiteUserId: null, blackUserId: null, whiteName: 'Rio', blackName: 'Flora' });
  });
});
