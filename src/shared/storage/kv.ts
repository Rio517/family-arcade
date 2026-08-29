/**
 * Tiny defensive localStorage helpers shared across the app.
 *
 * Every read/write is wrapped so a full quota, private-mode, or otherwise
 * unavailable `localStorage` degrades to a no-op / null instead of throwing —
 * a storage hiccup should never brick a game.
 *
 * Key scheme (from 2026-08-29 on): shared state is `arcade.<thing>.v<n>`
 * (`arcade.users.v1`, `arcade.lineup.v1`); a game's own state is
 * `<game>:<thing>:v<n>` (`chess:local:v1`, `bship:lastSession:v1`). Older
 * dash-form keys — `risk-campaign-v1`, `chess-view-v1`, `chess-theme-v1`,
 * `chess-freeplay-view-v1`, `bs-fleet-era-v1`, `bs-fleet-view-v1`,
 * `risk-help-seen-v1` — and the unversioned `caribbean:campaign:current`
 * predate the scheme and stay as they are: a renamed key costs the family
 * their saves. Every key is normalized on read by a pure `normalizeX(raw)`.
 */

export function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage full or unavailable — non-fatal */
  }
}

export function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
