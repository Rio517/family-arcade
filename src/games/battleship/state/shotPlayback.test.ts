import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IN_MS, OUT_MS, ShotPlayer, logUpTo } from './shotPlayback';
import type { GameLog, ShotEvent } from '@games/battleship/domain/types';

const shot = (by: 'host' | 'guest', row: number, col: number, hit = false, sunk: ShotEvent['sunk'] = null): ShotEvent => ({
  type: 'shot', by, row, col, hit, sunk, allSunk: false,
});
const START: GameLog = [{ type: 'start', first: 'host' }];

describe('logUpTo', () => {
  it('keeps every non-shot event and only the first n shots', () => {
    const log: GameLog = [...START, shot('host', 0, 0), shot('guest', 1, 1), shot('host', 2, 2)];
    expect(logUpTo(log, 1)).toEqual([...START, shot('host', 0, 0)]);
    expect(logUpTo(log, 3)).toEqual(log);
    expect(logUpTo(log, 0)).toEqual(START);
  });
});

describe('ShotPlayer — view state only', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('treats shots already in the log as long gone', () => {
    const p = new ShotPlayer(4);
    expect(p.getSnapshot().revealed).toBe(4);
    expect(p.getSnapshot().current).toBeNull();
  });

  it('holds our new shot back while the salvo flies, then reveals it on impact', () => {
    const p = new ShotPlayer(0);
    const log: GameLog = [...START, shot('host', 3, 4, true)];
    p.sync(log, 'host', true);
    let s = p.getSnapshot();
    expect(s.revealed).toBe(0);
    expect(s.current?.mine).toBe(true);
    expect(s.cue).toMatchObject({ type: 'fire', row: 3, col: 4 });
    vi.advanceTimersByTime(OUT_MS - 1);
    expect(p.getSnapshot().revealed).toBe(0);
    vi.advanceTimersByTime(1);
    s = p.getSnapshot();
    expect(s.revealed).toBe(1);
    expect(s.current).toBeNull();
    expect(s.last).toMatchObject({ mine: true, kind: 'hit', watched: true, fresh: true });
  });

  it("plays the enemy's shell coming in, and queues a shot that lands meanwhile", () => {
    const p = new ShotPlayer(0);
    const one: GameLog = [...START, shot('host', 0, 0)];
    p.sync(one, 'host', true);
    const two: GameLog = [...one, shot('guest', 5, 5, true)];
    p.sync(two, 'host', true);
    expect(p.getSnapshot().current?.mine).toBe(true);
    vi.advanceTimersByTime(OUT_MS);
    const s = p.getSnapshot();
    expect(s.revealed).toBe(1);
    expect(s.current).toMatchObject({ mine: false, kind: 'hit' });
    expect(s.cue).toMatchObject({ type: 'incoming', row: 5, col: 5, ms: IN_MS });
    vi.advanceTimersByTime(IN_MS);
    expect(p.getSnapshot().revealed).toBe(2);
  });

  it('a skip shows every shot at once and never touches the log', () => {
    const p = new ShotPlayer(0);
    const log: GameLog = [...START, shot('host', 0, 0), shot('guest', 1, 1)];
    const before = JSON.stringify(log);
    p.sync(log, 'host', true);
    p.skip();
    const s = p.getSnapshot();
    expect(s.revealed).toBe(2);
    expect(s.current).toBeNull();
    expect(s.cue?.type).toBe('skip');
    expect(JSON.stringify(log)).toBe(before);
    // Nothing left to fire later: the timers were cleared with the skip.
    vi.advanceTimersByTime(5000);
    expect(p.getSnapshot().revealed).toBe(2);
  });

  it('catches up after a burst (a reconnect): only the newest shot plays', () => {
    const p = new ShotPlayer(0);
    const log: GameLog = [...START, shot('host', 0, 0), shot('guest', 1, 1), shot('host', 2, 2)];
    p.sync(log, 'host', true);
    const s = p.getSnapshot();
    expect(s.revealed).toBe(2);
    expect(s.current?.index).toBe(2);
  });

  it('with Watch the shots off, reveals at once (an enemy hit still cues its blast)', () => {
    const p = new ShotPlayer(0);
    p.sync([...START, shot('guest', 4, 4, true)], 'host', false);
    const s = p.getSnapshot();
    expect(s.revealed).toBe(1);
    expect(s.current).toBeNull();
    expect(s.cue).toMatchObject({ type: 'impact', row: 4, col: 4, kind: 'hit' });
  });

  it('turning the setting off mid-shot shows the result straight away', () => {
    const p = new ShotPlayer(0);
    const log: GameLog = [...START, shot('host', 0, 0)];
    p.sync(log, 'host', true);
    expect(p.getSnapshot().current).not.toBeNull();
    p.sync(log, 'host', false);
    expect(p.getSnapshot().revealed).toBe(1);
    expect(p.getSnapshot().current).toBeNull();
  });

  it('starts clean when a rematch empties the log', () => {
    const p = new ShotPlayer(3);
    p.sync(START, 'host', true);
    expect(p.getSnapshot()).toMatchObject({ revealed: 0, current: null, last: null });
  });
});
