import { describe as group, expect, it } from 'vitest';
import { describe, FrameMeter, percentile } from './frameMeter';

group('frame meter', () => {
  it('reads the typical and the slow end of the samples', () => {
    const v = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(percentile(v, 0.5)).toBe(11);
    expect(percentile(v, 0.95)).toBe(20);
    expect(percentile([], 0.5)).toBe(0);
  });

  it('says frame, rules and draw times, typical then slow', () => {
    const samples = [
      { at: 0, gap: 16, rules: 0.2, draw: 6 },
      { at: 16, gap: 17, rules: 0.4, draw: 8 },
    ];
    expect(describe(samples)).toBe('frame 17.0 / 17.0 ms · rules 0.4 / 0.4 · draw 8.0 / 8.0');
  });

  it('looks back two seconds and rewrites itself twice a second', () => {
    const el = document.createElement('div');
    const meter = new FrameMeter(el);
    meter.add(600, 40, 1, 20);
    expect(el.textContent).toContain('frame 40.0');
    for (let at = 616; at < 3000; at += 16) meter.add(at, 16, 0.2, 5);
    // The slow frame at 600 ms has left the two-second window.
    expect(el.textContent).toBe('frame 16.0 / 16.0 ms · rules 0.2 / 0.2 · draw 5.0 / 5.0');
  });
});
