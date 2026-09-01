import { describe, expect, it } from 'vitest';
import { easing, follow, followAngle } from './follow';

describe('easing', () => {
  it('closes half the gap in one half-life, whatever the frame rate', () => {
    // One 100ms frame, or three shorter ones, must land in the same place.
    const oneStep = follow(0, 1, easing(0.1, 0.1));
    let stepped = 0;
    for (let i = 0; i < 4; i++) stepped = follow(stepped, 1, easing(0.025, 0.1));
    expect(oneStep).toBeCloseTo(0.5, 5);
    expect(stepped).toBeCloseTo(oneStep, 5);
  });

  it('snaps when there is no half-life', () => {
    expect(easing(0.016, 0)).toBe(1);
    expect(easing(0.016, -1)).toBe(1);
  });

  it('never overshoots, however long the frame took', () => {
    // A tab that slept for a minute must not fling the mask past its target.
    const k = easing(60, 0.1);
    expect(k).toBeLessThanOrEqual(1);
    expect(follow(0, 1, k)).toBeLessThanOrEqual(1);
  });
});

describe('follow', () => {
  it('eases toward the target and settles on it', () => {
    let v = 0;
    for (let i = 0; i < 200; i++) v = follow(v, 10, easing(1 / 60, 0.05));
    expect(v).toBeCloseTo(10, 6);
  });

  it('damps a one-frame spike', () => {
    // The tracker jitters by 1 for a single frame; a tenth of it lands.
    const jittered = follow(0, 1, easing(1 / 60, 0.1));
    expect(jittered).toBeLessThan(0.15);
  });
});

describe('followAngle', () => {
  it('turns the short way across the ±π seam', () => {
    const next = followAngle(Math.PI - 0.05, -Math.PI + 0.05, 0.5);
    // Half of a 0.1 rad turn onward, not most of the way round the circle.
    expect(next).toBeCloseTo(Math.PI, 5);
  });

  it('matches plain following well inside the seam', () => {
    expect(followAngle(0.2, 0.6, 0.5)).toBeCloseTo(follow(0.2, 0.6, 0.5), 6);
  });
});
