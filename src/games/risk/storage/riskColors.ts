/**
 * The six heraldic tinctures a general can march under, and which chair wears
 * which — remembered on this device (`risk:colors:v1`) so Klara's cobalt is
 * still hers next war night. No two chairs ever share a tincture: picking a
 * colour another chair holds swaps the two, so a six-general council always
 * has a colour for everyone and nobody hits a dead end.
 */

import { safeGet, safeSet } from '@shared/storage/kv';

export interface Tincture {
  name: string;
  hex: string;
}

// Kept bright enough that the dark border lines read against them, and the
// six stay easy to tell apart.
export const TINCTURES: readonly Tincture[] = [
  { name: 'Crimson', hex: '#cf3a30' },
  { name: 'Cobalt', hex: '#3f78bd' },
  { name: 'Forest', hex: '#4f9c60' },
  { name: 'Amber', hex: '#d69a34' },
  { name: 'Plum', hex: '#9b5aa6' },
  { name: 'Teal', hex: '#2fa199' },
];

const KEY = 'risk:colors:v1';

export function tinctureName(hex: string): string {
  return TINCTURES.find((t) => t.hex === hex)?.name ?? 'General';
}

/** Six unique tinctures, chair by chair: unknown or repeated entries fall back
 * to the first tincture nobody else has, so the invariant holds on read. */
export function normalizeColors(raw: unknown): string[] {
  const wanted = Array.isArray(raw) ? raw : [];
  const used = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < TINCTURES.length; i++) {
    const w = wanted[i];
    const ok = typeof w === 'string' && TINCTURES.some((t) => t.hex === w) && !used.has(w);
    const hex = ok ? w : TINCTURES.find((t) => !used.has(t.hex))!.hex;
    used.add(hex);
    out.push(hex);
  }
  return out;
}

/** Give chair `index` the tincture `hex`; whoever held it takes the old one. */
export function pickColor(colors: string[], index: number, hex: string): string[] {
  const holder = colors.indexOf(hex);
  if (holder === index || !TINCTURES.some((t) => t.hex === hex)) return colors;
  const next = colors.slice();
  if (holder !== -1) next[holder] = colors[index];
  next[index] = hex;
  return next;
}

export function loadColors(): string[] {
  const raw = safeGet(KEY);
  if (!raw) return normalizeColors(null);
  try {
    return normalizeColors(JSON.parse(raw));
  } catch {
    return normalizeColors(null);
  }
}

export function saveColors(colors: string[]): void {
  safeSet(KEY, JSON.stringify(colors));
}
