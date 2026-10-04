/**
 * The "darker arcade" pitch: which start-screen look and which effects a
 * reviewer is trying, read from the address so it works in a production
 * build on an iPad.
 *
 *   #/play?look=a|b|c        the lobby, fleet and placing screens
 *   #/play?fx=a|b            fire, explosions, water and the guns together
 *   #/play?fire=b&water=a    any one effect overridden on its own
 *   #/play?look=today&fx=today   the game before the pitch
 *
 * The start screens default to look C, Battle Station, the family's pick; the
 * effects default to today's until one is picked. A choice is kept
 * for the browser tab (sessionStorage), so ‹ Menu and back again keeps the
 * option being reviewed. Purely cosmetic and purely local: nothing here
 * reaches the game log or the other device.
 */
import { useCallback, useEffect, useState } from 'react';

export type LookId = 'today' | 'a' | 'b' | 'c';
export type FxId = 'today' | 'a' | 'b';

export interface PitchFx {
  fire: FxId;
  boom: FxId;
  water: FxId;
  /** Ships train their guns and fire, and the shell flies, before the impact. */
  guns: boolean;
}

export interface Pitch {
  look: LookId;
  fx: PitchFx;
  /** The effects package as chosen (single-effect overrides aside). */
  fxPack: FxId;
  /** A pitch parameter was given in this tab: show the reviewer's switcher. */
  reviewing: boolean;
  /** `?bar=0` hides the switcher (screenshots of an option). */
  showBar: boolean;
}

const KEY = 'bs-pitch-v1';
const LOOKS: readonly LookId[] = ['today', 'a', 'b', 'c'];
/** The start screens the family picked. */
const DEFAULT_LOOK: LookId = 'c';
const FXS: readonly FxId[] = ['today', 'a', 'b'];

export const TODAY_FX: PitchFx = { fire: 'today', boom: 'today', water: 'today', guns: false };

interface Stored {
  look?: LookId;
  fx?: FxId;
  fire?: FxId;
  boom?: FxId;
  water?: FxId;
  bar?: boolean;
}

/**
 * Every query parameter in the address: the router's (after `#`) wins over the
 * page's. `look` comes from the router's part alone: a `?look=` before the `#`
 * is the landing page's own option and must not restyle Ship Battle.
 */
function addressParams(): URLSearchParams {
  const out = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
  out.delete('look');
  const hash = typeof location === 'undefined' ? '' : location.hash;
  const q = hash.indexOf('?');
  if (q >= 0) new URLSearchParams(hash.slice(q + 1)).forEach((v, k) => out.set(k, v));
  return out;
}

const pick = <T extends string>(v: string | null | undefined, from: readonly T[]): T | undefined =>
  v && (from as readonly string[]).includes(v.toLowerCase()) ? (v.toLowerCase() as T) : undefined;

function loadStored(): Stored {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : {};
  } catch {
    return {};
  }
}

function saveStored(s: Stored): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode: the address still carries the choice */
  }
}

/** Fold the address into what this tab remembers, and remember the result. */
function resolveStored(): Stored {
  const p = addressParams();
  const s = loadStored();
  const next: Stored = { ...s };
  const look = pick(p.get('look'), LOOKS);
  const fx = pick(p.get('fx'), FXS);
  if (look) next.look = look;
  if (fx) {
    // A whole-package choice resets any single-effect override.
    next.fx = fx;
    delete next.fire;
    delete next.boom;
    delete next.water;
  }
  for (const k of ['fire', 'boom', 'water'] as const) {
    const v = pick(p.get(k), FXS);
    if (v) next[k] = v;
  }
  if (p.get('bar') === '0') next.bar = false;
  else if (p.get('bar') === '1') next.bar = true;
  if (JSON.stringify(next) !== JSON.stringify(s)) saveStored(next);
  return next;
}

function toPitch(s: Stored): Pitch {
  const pack = s.fx ?? 'today';
  const fx: PitchFx = {
    fire: s.fire ?? pack,
    boom: s.boom ?? pack,
    water: s.water ?? pack,
    guns: pack !== 'today',
  };
  const look = s.look ?? DEFAULT_LOOK;
  const reviewing = s.look !== undefined || s.fx !== undefined || s.fire !== undefined || s.boom !== undefined || s.water !== undefined;
  return { look, fx, fxPack: pack, reviewing, showBar: reviewing && s.bar !== false };
}

/** The pitch for this tab, re-read whenever the address changes. */
export function usePitch(): Pitch & { choose: (change: { look?: LookId; fx?: FxId }) => void } {
  const [pitch, setPitch] = useState<Pitch>(() => toPitch(resolveStored()));
  useEffect(() => {
    const onHash = () => setPitch(toPitch(resolveStored()));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const choose = useCallback((change: { look?: LookId; fx?: FxId }) => {
    const s = loadStored();
    const next: Stored = { ...s, ...change };
    if (change.fx) {
      delete next.fire;
      delete next.boom;
      delete next.water;
    }
    saveStored(next);
    setPitch(toPitch(next));
  }, []);
  return { ...pitch, choose };
}

// ── Watch the shots ─────────────────────────────────────────────────────────

const WATCH_KEY = 'bs-watch-shots-v1';

/** The device asks for reduced motion. */
export const prefersReduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The per-device "Watch the shots" setting: on, every shot plays its guns and
 * its flight before the impact; off, the result lands at once. Off by default
 * for anyone who asked their device for reduced motion.
 */
export function useWatchShots(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(WATCH_KEY);
      if (v === 'on') return true;
      if (v === 'off') return false;
    } catch {
      /* fall through to the default */
    }
    return !prefersReduced();
  });
  const set = useCallback((next: boolean) => {
    setOn(next);
    try {
      localStorage.setItem(WATCH_KEY, next ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, []);
  return [on, set];
}
