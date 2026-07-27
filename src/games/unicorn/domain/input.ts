/**
 * Pure input helpers for the Unicorn game's steering — kept apart from the
 * React page so the multi-touch rules can be unit-tested.
 *
 * The touch model: on a shared tablet, each finger grabs its OWN character.
 * When a finger presses down it claims the nearest character that no other
 * finger already holds, and from then on that finger steers that character
 * until it lifts. So two or three kids can each drag a different character at
 * the same time.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface PlayerPos {
  id: number;
  x: number;
  y: number;
}

/** A finger has to be this far from a character before it starts steering it. */
export const TOUCH_DEADZONE = 14;

/**
 * Pick which character a new touch should control: the closest one that is not
 * already held by another finger. Returns null if every character is taken.
 */
export function pickPlayerForTouch(players: PlayerPos[], taken: Set<number>, touch: Pt): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const p of players) {
    if (taken.has(p.id)) continue;
    const d = Math.hypot(p.x - touch.x, p.y - touch.y);
    if (d < bestD) {
      bestD = d;
      best = p.id;
    }
  }
  return best;
}

/**
 * Steering direction from a character toward the finger holding it: a unit
 * vector, or zero while the finger sits right on top (inside the deadzone).
 */
export function steerToward(from: Pt, to: Pt, deadzone = TOUCH_DEADZONE): Pt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d <= deadzone) return { x: 0, y: 0 };
  return { x: dx / d, y: dy / d };
}
