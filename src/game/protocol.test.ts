import { describe, expect, it } from 'vitest';
import { isMessage, reconcileLogs } from './protocol';
import type { GameLog } from './types';

const start: GameLog = [{ type: 'start', first: 'host' }];

function shot(by: 'host' | 'guest', row: number, col: number): GameLog[number] {
  return { type: 'shot', by, row, col, hit: false, sunk: null, allSunk: false };
}

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
    expect(reconcileLogs(attackerLog, defenderLog)).toEqual(defenderLog);
  });
});

describe('isMessage — accepts well-formed messages', () => {
  it('accepts each message type with a valid payload', () => {
    expect(isMessage({ t: 'hello', v: 1, side: 'host', name: 'A', skinId: 'aqua' })).toBe(true);
    expect(isMessage({ t: 'ready', ready: true })).toBe(true);
    expect(isMessage({ t: 'fire', row: 0, col: 9 })).toBe(true);
    expect(isMessage({ t: 'shot', event: shot('host', 3, 4) })).toBe(true);
    expect(isMessage({ t: 'start', first: 'guest' })).toBe(true);
    expect(isMessage({ t: 'rematch' })).toBe(true);
    expect(isMessage({ t: 'sync', log: [...start, shot('host', 1, 1)], ready: true })).toBe(true);
  });
});

describe('isMessage — rejects malformed / hostile input', () => {
  it('rejects non-objects and unknown tags', () => {
    expect(isMessage(null)).toBe(false);
    expect(isMessage('fire')).toBe(false);
    expect(isMessage({ t: 'nope' })).toBe(false);
    expect(isMessage({})).toBe(false);
  });

  it('rejects a fire with an out-of-range or non-integer coordinate', () => {
    expect(isMessage({ t: 'fire', row: 99, col: 0 })).toBe(false); // the crash exploit
    expect(isMessage({ t: 'fire', row: -1, col: 0 })).toBe(false);
    expect(isMessage({ t: 'fire', row: 1.5, col: 0 })).toBe(false);
    expect(isMessage({ t: 'fire', row: Number.NaN, col: 0 })).toBe(false);
    expect(isMessage({ t: 'fire', row: 0 })).toBe(false); // missing col
  });

  it('rejects a shot whose event is malformed', () => {
    expect(isMessage({ t: 'shot', event: { type: 'shot', by: 'host', row: 99, col: 0, hit: true, sunk: null, allSunk: false } })).toBe(false);
    expect(isMessage({ t: 'shot', event: { type: 'shot', by: 'nope', row: 0, col: 0, hit: true, sunk: null, allSunk: false } })).toBe(false);
    expect(isMessage({ t: 'shot', event: { type: 'shot', by: 'host', row: 0, col: 0, hit: true, sunk: 'notaship', allSunk: false } })).toBe(false);
    expect(isMessage({ t: 'shot', event: { type: 'start', first: 'host' } })).toBe(false); // wrong event type
  });

  it('rejects a sync whose log contains any malformed event', () => {
    expect(isMessage({ t: 'sync', log: [{ type: 'shot', by: 'host', row: 99, col: 0, hit: true, sunk: null, allSunk: false }], ready: false })).toBe(false);
    expect(isMessage({ t: 'sync', log: 'not-an-array', ready: false })).toBe(false);
    expect(isMessage({ t: 'sync', log: [{ type: 'garbage' }], ready: false })).toBe(false);
  });

  it('rejects a hello missing required fields', () => {
    expect(isMessage({ t: 'hello', v: 1, side: 'host', name: 'A' })).toBe(false); // no skinId
    expect(isMessage({ t: 'hello', side: 'host', name: 'A', skinId: 'aqua' })).toBe(false); // no version
  });
});
