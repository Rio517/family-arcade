import { describe, expect, it } from 'vitest';

import { FrameRunner } from './FrameRunner';

function evenFrames(totalMicros: number, frameCount: number): number[] {
  const base = Math.floor(totalMicros / frameCount);
  const extra = totalMicros % frameCount;
  return Array.from({ length: frameCount }, (_, index) => base + (index < extra ? 1 : 0));
}

function runFrames(frames: readonly number[]) {
  const runner = new FrameRunner({ tickRate: 60, maxTicksPerFrame: 1_000 });
  let ticks = 0;
  for (const frame of frames) ticks += runner.deliverMicros(frame);
  return { ticks, remainderMicros: runner.remainderMicros };
}

describe('integer-microsecond frame runner', () => {
  it('converts 60 Hz, 30 Hz, and irregular delivery into the same integer ticks', () => {
    const irregularTenSeconds = [
      500_000, 17_003, 2_000_000, 83_111, 999_999, 1, 4_000_000, 300_000, 2_099_886,
    ];

    expect(runFrames(evenFrames(10_000_000, 600))).toEqual({ ticks: 600, remainderMicros: 0 });
    expect(runFrames(evenFrames(10_000_000, 300))).toEqual({ ticks: 600, remainderMicros: 0 });
    expect(runFrames(irregularTenSeconds)).toEqual({ ticks: 600, remainderMicros: 0 });
  });

  it('caps work per delivered frame without discarding backlog', () => {
    const runner = new FrameRunner({ tickRate: 60, maxTicksPerFrame: 6 });

    expect(runner.deliverMicros(500_000)).toBe(6);
    expect(runner.backlogTicks).toBe(24);
    expect(runner.deliverMicros(0)).toBe(6);
    expect(runner.backlogTicks).toBe(18);
  });

  it('uses a rational remainder instead of accumulating rounded frame intervals', () => {
    const frames = Array.from({ length: 60 * 60 * 10 }, () => 16_667);
    const runner = new FrameRunner({ tickRate: 60, maxTicksPerFrame: 6 });
    let ticks = 0;

    for (const frame of frames) ticks += runner.deliverMicros(frame);

    expect(ticks).toBe(36_000);
    expect(runner.backlogTicks).toBe(0);
    expect(runner.remainderNumerator).toBe(720_000);
  });

  it('reset clears fractional time and queued work for pause or restart', () => {
    const runner = new FrameRunner({ tickRate: 60, maxTicksPerFrame: 2 });
    runner.deliverMicros(500_001);

    runner.reset();

    expect(runner.backlogTicks).toBe(0);
    expect(runner.remainderNumerator).toBe(0);
    expect(runner.remainderMicros).toBe(0);
    expect(runner.deliverMicros(0)).toBe(0);
  });

  it.each([-1, 1.5, Number.POSITIVE_INFINITY])('rejects invalid delivered microseconds %s', (micros) => {
    const runner = new FrameRunner({ tickRate: 60, maxTicksPerFrame: 6 });
    expect(() => runner.deliverMicros(micros)).toThrow(/non-negative safe integer/);
  });
});
