import { describe, expect, it } from 'vitest';
import { isMessage, isPrefix, reconcileLogs } from './protocol';
import type { GameLog } from './types';

const start: GameLog = [{ type: 'start', first: 'host' }];

function shot(by: 'host' | 'guest', row: number, col: number): GameLog[number] {
  return { type: 'shot', by, row, col, hit: false, sunk: null, allSunk: false };
}

describe('isPrefix', () => {
  it('treats the empty log as a prefix of anything', () => {
    expect(isPrefix([], start)).toBe(true);
  });
  it('recognises a genuine prefix', () => {
    const short = [...start, shot('host', 1, 1)];
    const long = [...short, shot('guest', 2, 2)];
    expect(isPrefix(short, long)).toBe(true);
  });
  it('rejects a longer log as a prefix of a shorter one', () => {
    const short = [...start];
    const long = [...start, shot('host', 1, 1)];
    expect(isPrefix(long, short)).toBe(false);
  });
  it('rejects diverging logs of equal length', () => {
    expect(isPrefix([shot('host', 1, 1)], [shot('host', 2, 2)])).toBe(false);
  });
});

describe('reconcileLogs', () => {
  it('keeps the longer log when reconnecting (peer ahead)', () => {
    const ours = [...start];
    const theirs = [...start, shot('host', 1, 1), shot('guest', 2, 2)];
    expect(reconcileLogs(ours, theirs)).toBe(theirs);
  });

  it('keeps our log when we are ahead', () => {
    const ours = [...start, shot('host', 1, 1)];
    const theirs = [...start];
    expect(reconcileLogs(ours, theirs)).toBe(ours);
  });

  it('is idempotent for identical logs', () => {
    const log = [...start, shot('host', 1, 1)];
    expect(reconcileLogs(log, [...log])).toEqual(log);
  });

  it('models the "fire lost on disconnect" recovery', () => {
    // Attacker fired but never received the settled shot; defender did append
    // it. On reconnect the defender's longer log wins and the attacker adopts
    // the result — no duplicate, no lost move.
    const attackerLog = [...start]; // never saw the result
    const defenderLog = [...start, shot('host', 4, 4)];
    const merged = reconcileLogs(attackerLog, defenderLog);
    expect(merged).toEqual(defenderLog);
  });
});

describe('isMessage', () => {
  it('accepts each known message tag', () => {
    expect(isMessage({ t: 'hello', v: 1, side: 'host', name: 'A', skinId: 'aqua' })).toBe(true);
    expect(isMessage({ t: 'fire', row: 1, col: 2 })).toBe(true);
    expect(isMessage({ t: 'sync', log: [], ready: false })).toBe(true);
    expect(isMessage({ t: 'rematch' })).toBe(true);
  });
  it('rejects junk', () => {
    expect(isMessage(null)).toBe(false);
    expect(isMessage('fire')).toBe(false);
    expect(isMessage({ t: 'nope' })).toBe(false);
  });
});
