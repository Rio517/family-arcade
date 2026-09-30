/**
 * What Gulp Universe keeps on this device between visits, apart from scores
 * (see scores.ts): the menu's choices, and the deck the wonders are dealt
 * from, so a family sees every wonder before any comes round again.
 *
 * Storage can be missing (private mode) or hold bad data; every read falls
 * back to a fresh start and every write is allowed to fail quietly.
 */
import type { PropKind } from '../domain/catalog';
import { WONDER_COUNT, type MapId } from '../domain/city';
import type { Difficulty } from '../domain/rivals';
import { dealWonders } from '../domain/wonders';

const SETTINGS_KEY = 'gulp:settings:v1';
const DECK_KEY = 'gulp:wonder-deck:v1';

export interface Settings {
  map: MapId;
  /** Round length: the map's own, twice that, or 0 for endless. */
  length: 'short' | 'long' | 'endless';
  powerups: boolean;
  fightBack: boolean;
  /** Things grow back and eaten buildings are rebuilt, bigger as the round goes on. */
  regrow: boolean;
  /** How hard the computer holes play; settings saved before there was a choice play Easy. */
  difficulty?: Difficulty;
  skin: number;
  muted: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  map: 'city',
  length: 'short',
  powerups: true,
  fightBack: false,
  regrow: true,
  skin: 0,
  muted: false,
  difficulty: 'easy',
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* private mode or bad data: defaults */
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* not saved: fine */
  }
}

/** Deal this round's wonders from the deck kept between rounds (see domain/wonders.ts). */
export function dealRoundWonders(map: MapId, rng: () => number): PropKind[] {
  let deck: PropKind[] = [];
  try {
    deck = JSON.parse(localStorage.getItem(DECK_KEY) ?? '[]') as PropKind[];
  } catch {
    /* no deck yet */
  }
  const { dealt, deck: rest } = dealWonders(deck, WONDER_COUNT[map], rng);
  try {
    localStorage.setItem(DECK_KEY, JSON.stringify(rest));
  } catch {
    /* not saved: a fresh shuffle next time */
  }
  return dealt;
}
