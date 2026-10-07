/**
 * Keys and the mouse take turns steering. A steering key takes over at once;
 * the mouse gets the hole back only when it moves after the keys have been
 * quiet for a moment. Without the wait, a mouse resting over the stage pulls
 * the hole its way the instant the keys are let go.
 */

/** How long after the last steering key the mouse waits before it may steer. */
export const MOUSE_WAIT_AFTER_KEYS_MS = 1000;

/** Whether a mouse move may take over steering: no steering key held, and none pressed or let go for a second. */
export function mouseMayTakeOver(keysHeld: number, lastKeyAt: number, now: number): boolean {
  return keysHeld === 0 && now - lastKeyAt >= MOUSE_WAIT_AFTER_KEYS_MS;
}
