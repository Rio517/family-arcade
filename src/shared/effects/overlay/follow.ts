/**
 * Following the tracked face without the shakes.
 *
 * Every value the tracker reports — the anchor point, the face width, the head
 * pose — moves a little on every frame even when the person is holding still.
 * Driven straight, a mask wearing those numbers buzzes. Each value is eased
 * toward its target instead, by a fraction of the distance that depends on the
 * time since the last frame, so the same easing holds at any frame rate.
 *
 * Pure maths, so the tests exercise it without a canvas.
 */

/**
 * The fraction of the remaining distance to cover this frame, given how long
 * the frame took and the half-life of the easing (the time to close half the
 * gap). A half-life of 0 or less means no easing at all.
 *
 * A long frame — a background tab, a stalled camera — is clamped so the value
 * eases rather than teleports when the tab comes back.
 */
export function easing(dtS: number, halfLifeS: number): number {
  if (!(halfLifeS > 0)) return 1;
  const dt = Math.min(Math.max(dtS, 0), 0.25);
  return 1 - Math.pow(0.5, dt / halfLifeS);
}

/** One eased step from `current` toward `target`. */
export function follow(current: number, target: number, k: number): number {
  return current + (target - current) * k;
}

/**
 * The same over angles, in radians: turns the short way round, so a head that
 * crosses from just under π to just over −π doesn't spin the whole way back.
 */
export function followAngle(current: number, target: number, k: number): number {
  const turn = Math.PI * 2;
  let delta = (target - current) % turn;
  if (delta > Math.PI) delta -= turn;
  if (delta < -Math.PI) delta += turn;
  return current + delta * k;
}
