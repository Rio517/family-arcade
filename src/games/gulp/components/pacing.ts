/**
 * Frame pacing on fast screens. A 120 Hz screen gives a frame every 8 ms; a
 * busy city that sometimes needs 10 ms then lands frames at 8, 17 and 25 ms,
 * and that uneven rhythm looks like judder even though the average is high.
 * A steady 60 looks smoother, so when a fast screen keeps missing its beat
 * the game drops to every other screen refresh for the rest of the round.
 */

/** How many frame gaps to look at before deciding. */
export const PACING_SAMPLE = 90;

/**
 * Whether to hold to 60 frames a second, given recent gaps between screen
 * refreshes (ms). Never on a 60 Hz screen: there is nothing to hold down to.
 */
export function shouldHold60(gaps: readonly number[]): boolean {
  if (gaps.length < PACING_SAMPLE) return false;
  const sorted = [...gaps].sort((a, b) => a - b);
  // The screen's own beat: the quick end of what it delivers.
  const beat = sorted[Math.floor(sorted.length * 0.1)];
  if (beat >= 12) return false;
  const missed = gaps.filter((g) => g > beat * 1.5).length;
  return missed > gaps.length * 0.08;
}

/** Holding to 60: skip a refresh that comes sooner than this after the last frame drawn (ms). */
export const HOLD_60_GAP = 13;
