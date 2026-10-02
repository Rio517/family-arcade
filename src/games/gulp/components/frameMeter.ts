/**
 * A frame-time readout for measuring a device: `?fps` in the address (before
 * the `#`) shows, over the last two seconds, the gap between frames and how
 * long the rules and the drawing took, as the typical frame and the slowest
 * one in twenty. It is how an iPad is checked before it hosts a shared round.
 */

/** How far back the readout looks, and how often it rewrites itself. */
const WINDOW_MS = 2000;
const EVERY_MS = 500;

export const frameMeterWanted = () => typeof location !== 'undefined' && new URLSearchParams(location.search).has('fps');

/** The value `q` of the way up the sorted samples (0.5 the median, 0.95 the slow end). */
export function percentile(values: readonly number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

interface Sample {
  at: number;
  gap: number;
  rules: number;
  draw: number;
}

export class FrameMeter {
  private samples: Sample[] = [];
  private shown = 0;

  constructor(private readonly el: HTMLElement) {}

  /** One frame: `at` and `gap` from the frame clock, `rules` and `draw` as measured, all in ms. */
  add(at: number, gap: number, rules: number, draw: number): void {
    this.samples.push({ at, gap, rules, draw });
    while (this.samples.length && this.samples[0].at < at - WINDOW_MS) this.samples.shift();
    if (at - this.shown < EVERY_MS) return;
    this.shown = at;
    this.el.textContent = describe(this.samples);
  }
}

/** "frame 16.7 / 18.2 ms · rules 0.3 / 0.6 · draw 6.1 / 9.4", typical then slow. */
export function describe(samples: readonly Sample[]): string {
  const pair = (pick: (s: Sample) => number) => {
    const v = samples.map(pick);
    return `${percentile(v, 0.5).toFixed(1)} / ${percentile(v, 0.95).toFixed(1)}`;
  };
  return `frame ${pair((s) => s.gap)} ms · rules ${pair((s) => s.rules)} · draw ${pair((s) => s.draw)}`;
}
