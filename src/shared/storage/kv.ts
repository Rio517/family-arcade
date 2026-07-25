/**
 * Tiny defensive localStorage helpers shared across the app.
 *
 * Every read/write is wrapped so a full quota, private-mode, or otherwise
 * unavailable `localStorage` degrades to a no-op / null instead of throwing —
 * a storage hiccup should never brick a game.
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
