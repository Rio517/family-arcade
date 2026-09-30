import { describe, expect, it } from 'vitest';
import { PACING_SAMPLE, shouldHold60 } from './pacing';

const repeat = (pattern: number[]) => Array.from({ length: PACING_SAMPLE }, (_, i) => pattern[i % pattern.length]);

describe('frame pacing', () => {
  it('leaves a 60 Hz screen alone, even when it drops frames', () => {
    expect(shouldHold60(repeat([16.7, 16.7, 33.3]))).toBe(false);
  });

  it('leaves a fast screen that keeps its beat at full speed', () => {
    expect(shouldHold60(repeat([8.3]))).toBe(false);
    expect(shouldHold60(repeat([8.3, 8.3, 8.3, 8.3, 8.3, 8.3, 8.3, 8.3, 8.3, 8.3, 8.3, 8.3, 8.3, 8.3, 8.3, 8.3, 8.3, 8.3, 8.3, 16.7]))).toBe(false);
  });

  it('holds a fast screen that keeps missing its beat to 60', () => {
    expect(shouldHold60(repeat([8.3, 16.7, 8.3, 25]))).toBe(true);
  });

  it('waits for enough frames before deciding', () => {
    expect(shouldHold60([8.3, 25, 8.3, 25])).toBe(false);
  });
});
