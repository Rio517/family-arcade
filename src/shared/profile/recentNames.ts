/**
 * The five most-recently-used player names, kept in localStorage so the name
 * picker can offer "who's playing?" as one-tap chips — handy for a recurring
 * guest like Kai who isn't one of the household regulars.
 *
 * Pure-ish: all storage access is wrapped so a blocked or corrupt store just
 * degrades to an empty list rather than throwing.
 */

const KEY = 'arcade.recentNames';
const MAX = 5;

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is string => typeof n === 'string').slice(0, MAX);
  } catch {
    return [];
  }
}

function write(names: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(names.slice(0, MAX)));
  } catch {
    /* storage blocked — names just won't persist */
  }
}

/** The recent names, most-recent first. */
export function getRecentNames(): string[] {
  return read();
}

/**
 * Remember `name` as the most recent. Case-insensitive de-dupe (so "Kai" and
 * "kai" don't both appear), trimmed, capped at {@link MAX}. Blank names are
 * ignored. Returns the updated list.
 */
export function rememberName(name: string): string[] {
  const clean = name.trim().slice(0, 20);
  if (!clean) return read();
  const existing = read().filter((n) => n.toLowerCase() !== clean.toLowerCase());
  const next = [clean, ...existing].slice(0, MAX);
  write(next);
  return next;
}

/** Merge recent names with the household regulars, de-duped, recent first. */
export function nameSuggestions(regulars: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of [...getRecentNames(), ...regulars]) {
    const key = n.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(n.trim());
  }
  return out.slice(0, 6);
}
