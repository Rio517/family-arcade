import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BEAT_MS, IN_MS, OUT_MS, SINK_BEAT_MS, ShotPlayer, WARN_MS, logUpTo } from './shotPlayback';
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
    vi.advanceTimersByTime(OUT_MS + BEAT_MS);
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
    expect(p.getSnapshot()).toMatchObject({ revealed: 0, current: null, last: null, beat: false });
  });
});

describe('ShotPlayer — their answer waits a beat behind our result', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('holds our result on the radar for a beat before their shell starts', () => {
    const p = new ShotPlayer(0);
    const one: GameLog = [...START, shot('host', 0, 0, true)];
    p.sync(one, 'host', true);
    // The computer answers while our salvo is still in the air.
    const two: GameLog = [...one, shot('guest', 5, 5, true)];
    vi.advanceTimersByTime(300);
    p.sync(two, 'host', true);
    vi.advanceTimersByTime(OUT_MS - 300);
    let s = p.getSnapshot();
    // Our hit is on the radar; their shot is held back, not yet playing.
    expect(s.revealed).toBe(1);
    expect(s.last).toMatchObject({ mine: true, kind: 'hit' });
    expect(s.current).toBeNull();
    expect(s.beat).toBe(true);
    vi.advanceTimersByTime(BEAT_MS - 1);
    expect(p.getSnapshot().current).toBeNull();
    vi.advanceTimersByTime(1);
    s = p.getSnapshot();
    expect(s.beat).toBe(false);
    expect(s.current).toMatchObject({ mine: false, kind: 'hit', ms: IN_MS });
    expect(s.cue).toMatchObject({ type: 'incoming', row: 5, col: 5, warn: WARN_MS, ms: IN_MS });
    vi.advanceTimersByTime(IN_MS);
    expect(p.getSnapshot().revealed).toBe(2);
  });

  it('their shell is announced by the warning ring before it flies', () => {
    expect(WARN_MS).toBeGreaterThan(0);
    expect(IN_MS - WARN_MS).toBeGreaterThanOrEqual(800);
  });

  it('holds longer after we sink one, while it goes down on the radar', () => {
    const p = new ShotPlayer(0);
    const log: GameLog = [...START, shot('host', 0, 0, true, 'destroyer'), shot('guest', 5, 5)];
    p.sync([...START, shot('host', 0, 0, true, 'destroyer')], 'host', true);
    p.sync(log, 'host', true);
    vi.advanceTimersByTime(OUT_MS);
    expect(p.getSnapshot().last?.kind).toBe('sunk');
    vi.advanceTimersByTime(BEAT_MS);
    expect(p.getSnapshot().beat).toBe(true);
    expect(SINK_BEAT_MS).toBeGreaterThan(BEAT_MS);
    vi.advanceTimersByTime(SINK_BEAT_MS - BEAT_MS);
    expect(p.getSnapshot().current?.mine).toBe(false);
  });

  it('a shot of theirs that comes in after the beat has passed plays at once', () => {
    const p = new ShotPlayer(0);
    const one: GameLog = [...START, shot('host', 0, 0)];
    p.sync(one, 'host', true);
    vi.advanceTimersByTime(OUT_MS + BEAT_MS + 50);
    p.sync([...one, shot('guest', 2, 2)], 'host', true);
    expect(p.getSnapshot()).toMatchObject({ beat: false, current: { mine: false } });
  });

  it('their shot after their own (no result of ours on screen) needs no beat', () => {
    const p = new ShotPlayer(1);
    const log: GameLog = [...START, shot('host', 0, 0), shot('guest', 2, 2)];
    p.sync(log, 'host', true);
    expect(p.getSnapshot().current?.mine).toBe(false);
  });

  it('a tap during the beat shows everything at once; the log is untouched', () => {
    const p = new ShotPlayer(0);
    const log: GameLog = [...START, shot('host', 0, 0, true), shot('guest', 5, 5, true)];
    const before = JSON.stringify(log);
    p.sync([...START, shot('host', 0, 0, true)], 'host', true);
    p.sync(log, 'host', true);
    vi.advanceTimersByTime(OUT_MS + 10);
    expect(p.getSnapshot().beat).toBe(true);
    p.skip();
    const s = p.getSnapshot();
    expect(s).toMatchObject({ revealed: 2, current: null, beat: false });
    expect(s.cue?.type).toBe('skip');
    expect(JSON.stringify(log)).toBe(before);
    vi.advanceTimersByTime(5000);
    expect(p.getSnapshot()).toMatchObject({ revealed: 2, current: null, beat: false });
  });

  it('turning Watch the shots off during the beat shows their shot straight away', () => {
    const p = new ShotPlayer(0);
    const log: GameLog = [...START, shot('host', 0, 0), shot('guest', 5, 5)];
    p.sync([...START, shot('host', 0, 0)], 'host', true);
    p.sync(log, 'host', true);
    vi.advanceTimersByTime(OUT_MS + 10);
    p.sync(log, 'host', false);
    expect(p.getSnapshot()).toMatchObject({ revealed: 2, current: null, beat: false });
    vi.advanceTimersByTime(5000);
    expect(p.getSnapshot().current).toBeNull();
  });
});

describe('ShotPlayer — what brings their attack in', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Their k-th shot (1-based), behind k-1 earlier exchanges, as the cue that plays it. */
  const theirCue = (k: number, ourSinks: ShotEvent['sunk'][] = []) => {
    const log: GameLog = [...START];
    for (let i = 1; i < k; i++) log.push(shot('host', 9, i, false, ourSinks[i - 1] ?? null), shot('guest', 0, i));
    const p = new ShotPlayer(log.filter((e) => e.type === 'shot').length);
    p.sync(log, 'host', true);
    p.sync([...log, shot('guest', 8, 8)], 'host', true);
    return p.getSnapshot().cue;
  };

  it('every third attack of theirs is a plane while their carrier is afloat', () => {
    const via = [1, 2, 3, 4, 5, 6].map((k) => theirCue(k)?.via);
    expect(via).toEqual(['shell', 'plane', 'shell', 'shell', 'plane', 'shell']);
    // The same shot always comes the same way.
    expect(theirCue(5)?.via).toBe('plane');
  });

  it('once we sink their carrier, every attack is a shell', () => {
    expect(theirCue(5, ['carrier'])?.via).toBe('shell');
    expect(theirCue(5, [null, null, 'battleship'])?.via).toBe('plane');
  });

  it('our own salvo carries no plane choice of theirs', () => {
    const p = new ShotPlayer(0);
    p.sync([...START, shot('host', 1, 1)], 'host', true);
    expect(p.getSnapshot().cue).toMatchObject({ type: 'fire', via: 'shell' });
  });
});
