import { describe, expect, it } from 'vitest';
import { isChessMessage, reconcileLogs } from './protocol';
import type { GameLog } from './types';

const ply = (fr: number, fc: number, tr: number, tc: number) => ({
  from: { row: fr, col: fc },
  to: { row: tr, col: tc },
});

/**
 * isChessMessage is the single choke point between the wire and the engine —
 * the transport only forwards what it accepts. These tests pin the adversarial
 * side: out-of-range squares, malformed plies, and oversized strings must
 * never reach replay(). (Battleship and racer have the same file; chess was
 * the one protocol without a dedicated test.)
 */
describe('isChessMessage', () => {
  it('accepts the well-formed message set', () => {
    expect(isChessMessage({ t: 'hello', v: 1, side: 'host', name: 'Mario' })).toBe(true);
    expect(isChessMessage({ t: 'move', ply: ply(6, 4, 4, 4) })).toBe(true);
    expect(isChessMessage({ t: 'move', ply: { ...ply(1, 0, 0, 0), promotion: 'q' } })).toBe(true);
    expect(isChessMessage({ t: 'sync', wantRematch: false, log: [ply(6, 4, 4, 4)] })).toBe(true);
    expect(isChessMessage({ t: 'sync', wantRematch: false, log: [], epoch: 2 })).toBe(true);
    expect(isChessMessage({ t: 'rematch' })).toBe(true);
  });

  it('rejects non-messages and unknown tags', () => {
    expect(isChessMessage(null)).toBe(false);
    expect(isChessMessage('hello')).toBe(false);
    expect(isChessMessage({ t: 'teleport' })).toBe(false);
  });

  it('rejects moves with out-of-range or malformed squares', () => {
    expect(isChessMessage({ t: 'move', ply: ply(6, 4, 8, 4) })).toBe(false); // row 8 off-board
    expect(isChessMessage({ t: 'move', ply: ply(-1, 0, 0, 0) })).toBe(false);
    expect(isChessMessage({ t: 'move', ply: ply(0.5, 0, 1, 0) })).toBe(false); // fractional
    expect(isChessMessage({ t: 'move', ply: { from: { row: 0 }, to: { row: 1, col: 1 } } })).toBe(false);
    expect(isChessMessage({ t: 'move', ply: { ...ply(1, 0, 0, 0), promotion: 'king' } })).toBe(false);
  });

  it('rejects a hello with a bad side, missing version, or oversized name', () => {
    expect(isChessMessage({ t: 'hello', v: 1, side: 'referee', name: 'M' })).toBe(false);
    // The host's colour rides on the hello; anything but w/b is refused, and
    // a hello without one (an older build) is still fine.
    expect(isChessMessage({ t: 'hello', v: 1, side: 'host', name: 'M', color: 'b' })).toBe(true);
    expect(isChessMessage({ t: 'hello', v: 1, side: 'host', name: 'M', color: 'white' })).toBe(false);
    expect(isChessMessage({ t: 'hello', v: 1, side: 'host', name: 'M', color: 7 })).toBe(false);
    expect(isChessMessage({ t: 'hello', side: 'host', name: 'M' })).toBe(false);
    expect(isChessMessage({ t: 'hello', v: 1, side: 'host', name: 'x'.repeat(101) })).toBe(false);
  });

  it('rejects syncs that could stall the receiver', () => {
    const huge = Array.from({ length: 1001 }, () => ply(6, 4, 4, 4));
    expect(isChessMessage({ t: 'sync', wantRematch: false, log: huge })).toBe(false);
    expect(isChessMessage({ t: 'sync', wantRematch: false, log: [ply(6, 4, 9, 4)] })).toBe(false);
    expect(isChessMessage({ t: 'sync', wantRematch: false, log: [], epoch: -1 })).toBe(false);
    expect(isChessMessage({ t: 'sync', wantRematch: false, log: [], epoch: 2.5 })).toBe(false);
  });
});

describe('reconcileLogs', () => {
  const a = ply(6, 4, 4, 4);
  const b = ply(1, 4, 3, 4);
  const c = ply(6, 3, 5, 3);

  it('adopts a strictly longer prefix-compatible log', () => {
    const ours: GameLog = [a];
    const theirs: GameLog = [a, b];
    expect(reconcileLogs(ours, theirs)).toBe(theirs);
  });

  it('keeps ours against a longer-but-divergent log (single-writer guarantee)', () => {
    const ours: GameLog = [a];
    const theirs: GameLog = [c, b];
    expect(reconcileLogs(ours, theirs)).toBe(ours);
  });

  it('keeps ours when theirs is shorter or equal', () => {
    const ours: GameLog = [a, b];
    expect(reconcileLogs(ours, [a])).toBe(ours);
    expect(reconcileLogs(ours, [a, b])).toBe(ours);
  });
});
