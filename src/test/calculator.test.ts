/**
 * Tests for the standalone Yahtzee logger (public/calculator.html).
 *
 * The page is a single self-contained HTML file with inline JS that runs
 * synchronously at parse time — it sits outside the src/ module tree, so we
 * load the real file with node fs and execute it inside an isolated JSDOM
 * instance (`runScripts: 'dangerously'`). Each instance gets its own
 * localStorage (seedable via `beforeParse`), which lets us simulate a page
 * reload by constructing a fresh JSDOM with the previous storage contents.
 *
 * The page never calls window.confirm/alert — "new game" and "resume" are
 * in-page modal overlays — so no dialog stubs are needed.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';

// jsdom ships no bundled type declarations and @types/jsdom is not a
// devDependency; load it via createRequire so tsc doesn't demand types,
// and give the constructor a minimal local shape.
const require = createRequire(resolve(process.cwd(), 'package.json'));
type JsdomInstance = { window: Window & typeof globalThis; };
type JsdomCtor = new (
  html: string,
  options: {
    url: string;
    runScripts: 'dangerously';
    beforeParse?: (window: Window & typeof globalThis) => void;
  },
) => JsdomInstance;
const { JSDOM } = require('jsdom') as { JSDOM: JsdomCtor };

const STORAGE_KEY = 'yahtzee-logger-v1';
const HOUR_MS = 60 * 60 * 1000;

// Vitest runs with the project root as cwd; under the jsdom environment
// import.meta.url is not a file: URL, so resolve from cwd instead.
const html = readFileSync(resolve(process.cwd(), 'public/calculator.html'), 'utf8');

type ScoreKey =
  | 'ones' | 'twos' | 'threes' | 'fours' | 'fives' | 'sixes'
  | 'threeKind' | 'fourKind' | 'fullHouse'
  | 'smallStraight' | 'largeStraight' | 'yahtzee' | 'chance';

const EMPTY_SCORES: Record<ScoreKey, number | null> = {
  ones: null, twos: null, threes: null, fours: null, fives: null, sixes: null,
  threeKind: null, fourKind: null, fullHouse: null,
  smallStraight: null, largeStraight: null, yahtzee: null, chance: null,
};

/** Serialize a stored game in the page's wrapped `{ state, updatedAt }` form. */
function storedGame(
  scores: Partial<Record<ScoreKey, number>>,
  updatedAt: number,
  yahtzeeBonusCount = 0,
): string {
  return JSON.stringify({
    state: { scores: { ...EMPTY_SCORES, ...scores }, yahtzeeBonusCount },
    updatedAt,
  });
}

interface Page {
  window: Window & typeof globalThis;
  document: Document;
  /** Element by data-testid; throws when absent so tests fail loudly. */
  el: (testId: string) => HTMLElement;
  /** Element by data-testid, or null (for "should not exist" checks). */
  find: (testId: string) => HTMLElement | null;
  /** Text content of a data-testid element. */
  text: (testId: string) => string;
  /** Open a row's picker and choose one of its preset score options. */
  score: (key: ScoreKey, value: number) => void;
  stored: () => { state: { scores: Record<ScoreKey, number | null>; yahtzeeBonusCount: number }; updatedAt: number };
}

const openWindows: Array<Window & typeof globalThis> = [];
afterEach(() => {
  for (const w of openWindows.splice(0)) {
    (w as unknown as { close: () => void }).close();
  }
});

/** Load the real calculator page, optionally pre-seeding localStorage. */
function loadPage(storageSeed?: Record<string, string>): Page {
  const dom = new JSDOM(html, {
    url: 'http://localhost/calculator.html',
    runScripts: 'dangerously',
    beforeParse(window) {
      if (storageSeed) {
        for (const [k, v] of Object.entries(storageSeed)) {
          window.localStorage.setItem(k, v);
        }
      }
    },
  });
  const window = dom.window;
  openWindows.push(window);
  const document = window.document;

  const find = (testId: string) =>
    document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  const el = (testId: string) => {
    const found = find(testId);
    if (!found) throw new Error(`No element with data-testid="${testId}"`);
    return found;
  };
  return {
    window,
    document,
    el,
    find,
    text: (testId) => el(testId).textContent ?? '',
    score(key, value) {
      el(`row-${key}`).click();
      el(`option-${key}-${value}`).click();
    },
    stored() {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) throw new Error('nothing in localStorage');
      return JSON.parse(raw);
    },
  };
}

/** Fill every category; upper = exactly 63 (earns the +35 bonus), lower = 212. */
function fillFullCard(page: Page): void {
  page.score('ones', 3);
  page.score('twos', 6);
  page.score('threes', 9);
  page.score('fours', 12);
  page.score('fives', 15);
  page.score('sixes', 18);
  page.score('threeKind', 20);
  page.score('fourKind', 25);
  page.score('fullHouse', 25);
  page.score('smallStraight', 30);
  page.score('largeStraight', 40);
  page.score('yahtzee', 50);
  page.score('chance', 22);
}

describe('calculator.html — scoring', () => {
  it('renders an empty card with zero totals and open rows', () => {
    const page = loadPage();
    expect(page.text('upper-subtotal')).toBe('0');
    expect(page.text('lower-subtotal')).toBe('0');
    expect(page.text('grand-total')).toBe('0');
    expect(page.text('upper-bonus')).toBe('63 to go');
    expect(page.el('row-ones').querySelector('.score')?.textContent).toBe('—');
  });

  it('a fully scored card computes subtotals, bonus, and grand total', () => {
    const page = loadPage();
    fillFullCard(page);
    // Upper 3+6+9+12+15+18 = 63; lower 20+25+25+30+40+50+22 = 212.
    expect(page.text('upper-subtotal')).toBe('63');
    expect(page.text('lower-subtotal')).toBe('212');
    // Grand total includes the +35 upper bonus: 63 + 35 + 212 = 310.
    expect(page.text('grand-total')).toBe('310');
    // Every row shows its locked value.
    expect(page.el('row-chance').querySelector('.score')?.textContent).toBe('22');
    expect(page.el('row-chance').querySelector('.score')?.classList.contains('locked')).toBe(true);
  });

  it('clearing a locked row via the picker removes its points', () => {
    const page = loadPage();
    page.score('fives', 25);
    expect(page.text('grand-total')).toBe('25');
    page.el('row-fives').click();
    page.el('picker-clear').click();
    expect(page.text('grand-total')).toBe('0');
    expect(page.el('row-fives').querySelector('.score')?.textContent).toBe('—');
  });
});

describe('calculator.html — upper-section bonus', () => {
  it('exactly 63 upper points earns the +35 bonus', () => {
    const page = loadPage();
    page.score('ones', 3);
    page.score('twos', 6);
    page.score('threes', 9);
    page.score('fours', 12);
    page.score('fives', 15);
    page.score('sixes', 18);
    expect(page.text('upper-subtotal')).toBe('63');
    expect(page.text('upper-bonus')).toBe('+35');
    expect(page.document.getElementById('bonus-row')?.classList.contains('bonus-earned')).toBe(true);
    // 63 + 35, no lower scores yet.
    expect(page.text('grand-total')).toBe('98');
  });

  it('62 upper points earns no bonus and shows the points still needed', () => {
    const page = loadPage();
    page.score('ones', 2); // one point short of the 3 needed for 63
    page.score('twos', 6);
    page.score('threes', 9);
    page.score('fours', 12);
    page.score('fives', 15);
    page.score('sixes', 18);
    expect(page.text('upper-subtotal')).toBe('62');
    expect(page.text('upper-bonus')).toBe('1 to go');
    expect(page.document.getElementById('bonus-row')?.classList.contains('bonus-pending')).toBe(true);
    expect(page.text('grand-total')).toBe('62');
  });
});

describe('calculator.html — extra-Yahtzee bonus', () => {
  it('logging a second 50 on a filled Yahtzee box adds a 100-point bonus', () => {
    const page = loadPage();
    page.score('yahtzee', 50);
    expect(page.text('grand-total')).toBe('50');
    expect(page.find('yahtzee-bonus')).toBeNull();

    page.score('yahtzee', 50); // second Yahtzee → +100 bonus, box stays at 50
    expect(page.text('yahtzee-bonus')).toBe('100');
    expect(page.text('lower-subtotal')).toBe('150');
    expect(page.text('grand-total')).toBe('150');

    page.score('yahtzee', 50); // third Yahtzee → ×2
    expect(page.text('yahtzee-bonus')).toBe('200');
    expect(page.text('grand-total')).toBe('250');
    const bonusLabel = page.el('yahtzee-bonus').parentElement?.querySelector('.label');
    expect(bonusLabel?.textContent).toBe('Yahtzee Bonus ×2');
  });

  it('scoring the Yahtzee box 0 wipes accumulated bonuses', () => {
    const page = loadPage();
    page.score('yahtzee', 50);
    page.score('yahtzee', 50);
    expect(page.text('grand-total')).toBe('150');
    page.score('yahtzee', 0);
    expect(page.find('yahtzee-bonus')).toBeNull();
    expect(page.text('grand-total')).toBe('0');
    expect(page.stored().state.yahtzeeBonusCount).toBe(0);
  });
});

describe('calculator.html — new game', () => {
  it('accepting the confirm clears the card', () => {
    const page = loadPage();
    page.score('ones', 4);
    page.score('yahtzee', 50);
    page.el('btn-new-game').click();
    expect(page.el('confirm-new-modal').classList.contains('open')).toBe(true);
    page.el('confirm-new-ok').click();
    expect(page.el('confirm-new-modal').classList.contains('open')).toBe(false);
    expect(page.text('grand-total')).toBe('0');
    expect(page.el('row-ones').querySelector('.score')?.textContent).toBe('—');
    expect(page.stored().state.scores.yahtzee).toBeNull();
  });

  it('declining the confirm leaves the card untouched', () => {
    const page = loadPage();
    page.score('ones', 4);
    page.score('yahtzee', 50);
    page.el('btn-new-game').click();
    expect(page.el('confirm-new-modal').classList.contains('open')).toBe(true);
    page.el('confirm-new-cancel').click();
    expect(page.el('confirm-new-modal').classList.contains('open')).toBe(false);
    expect(page.text('grand-total')).toBe('54');
    expect(page.el('row-yahtzee').querySelector('.score')?.textContent).toBe('50');
  });

  it('with no progress, New resets silently without asking', () => {
    const page = loadPage();
    page.el('btn-new-game').click();
    expect(page.el('confirm-new-modal').classList.contains('open')).toBe(false);
    expect(page.text('grand-total')).toBe('0');
  });
});

describe('calculator.html — persistence & resume', () => {
  it('every committed score is saved to localStorage with a timestamp', () => {
    const before = Date.now();
    const page = loadPage();
    page.score('threes', 9);
    const stored = page.stored();
    expect(stored.state.scores.threes).toBe(9);
    expect(stored.state.scores.chance).toBeNull();
    expect(stored.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('a reload with a recent stored game restores it silently', () => {
    // Play in one page instance…
    const first = loadPage();
    first.score('fours', 16);
    first.score('largeStraight', 40);
    const raw = first.window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();

    // …then "reload": a fresh JSDOM seeded with the same storage contents.
    const reloaded = loadPage({ [STORAGE_KEY]: raw as string });
    expect(reloaded.el('resume-modal').classList.contains('open')).toBe(false);
    expect(reloaded.text('grand-total')).toBe('56');
    expect(reloaded.el('row-fours').querySelector('.score')?.textContent).toBe('16');
  });

  it('a stored game older than an hour triggers the resume prompt; Continue keeps it', () => {
    const staleAt = Date.now() - 2 * HOUR_MS;
    const page = loadPage({
      [STORAGE_KEY]: storedGame({ sixes: 24, yahtzee: 50 }, staleAt, 1),
    });
    // The saved game is previewed behind the modal, bonuses included:
    // 24 upper + 50 yahtzee + 100 yahtzee bonus.
    expect(page.el('resume-modal').classList.contains('open')).toBe(true);
    expect(page.document.getElementById('resume-desc')?.textContent).toContain('Found a game from');
    expect(page.text('grand-total')).toBe('174');

    page.el('resume-continue').click();
    expect(page.el('resume-modal').classList.contains('open')).toBe(false);
    expect(page.text('grand-total')).toBe('174');
    // Continue re-saves so the next load within the hour won't re-prompt.
    expect(page.stored().updatedAt).toBeGreaterThan(staleAt);
    expect(page.stored().state.scores.sixes).toBe(24);
  });

  it('choosing Start New on the resume prompt clears the stored game', () => {
    const page = loadPage({
      [STORAGE_KEY]: storedGame({ sixes: 24 }, Date.now() - 2 * HOUR_MS),
    });
    expect(page.el('resume-modal').classList.contains('open')).toBe(true);
    page.el('resume-new').click();
    expect(page.el('resume-modal').classList.contains('open')).toBe(false);
    expect(page.text('grand-total')).toBe('0');
    expect(page.stored().state.scores.sixes).toBeNull();
  });

  it('accepts the legacy bare-state storage form', () => {
    const legacy = JSON.stringify({
      scores: { ...EMPTY_SCORES, twos: 8 },
      yahtzeeBonusCount: 0,
    });
    // loadStored() wraps legacy state with a fresh timestamp → silent restore.
    const page = loadPage({ [STORAGE_KEY]: legacy });
    expect(page.el('resume-modal').classList.contains('open')).toBe(false);
    expect(page.text('grand-total')).toBe('8');
  });

  it('corrupt storage is ignored and the card starts empty', () => {
    const page = loadPage({ [STORAGE_KEY]: '{not json' });
    expect(page.el('resume-modal').classList.contains('open')).toBe(false);
    expect(page.text('grand-total')).toBe('0');
  });
});
