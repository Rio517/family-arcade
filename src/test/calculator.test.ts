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
 * The page never calls window.confirm/alert — "new game", "resume",
 * "add player" and "remove player" are in-page modal overlays — so no
 * dialog stubs are needed.
 *
 * The logger is multi-player on one device: storage is the versioned
 * { v: 2, players: [{ name, state, savedAt }], active } shape, and the two
 * older single-player forms (wrapped { state, updatedAt } and legacy bare
 * state) migrate into a one-player game on load.
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
const PROFILE_KEY = 'bship:profile:v1';
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

interface CardState {
  scores: Record<ScoreKey, number | null>;
  yahtzeeBonusCount: number;
}
interface StoredPlayer { name: string; state: CardState; savedAt: number; }
interface StoredV2 { v: 2; players: StoredPlayer[]; active: number; }

/** Serialize a stored game in the OLD v1 wrapped `{ state, updatedAt }` form. */
function storedGameV1(
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
  /** Open the add-player modal and add a name via the free-text input. */
  addPlayerByText: (name: string) => void;
  stored: () => StoredV2;
  /** The active player's entry in storage. */
  activeStored: () => StoredPlayer;
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
  const stored = (): StoredV2 => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error('nothing in localStorage');
    return JSON.parse(raw);
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
    addPlayerByText(name) {
      el('add-player-tab').click();
      (el('add-player-input') as HTMLInputElement).value = name;
      el('add-player-submit').click();
    },
    stored,
    activeStored() {
      const s = stored();
      return s.players[s.active];
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
    expect(page.activeStored().state.yahtzeeBonusCount).toBe(0);
  });
});

describe('calculator.html — player tabs', () => {
  it('player 1 defaults to the shared arcade profile name', () => {
    const page = loadPage({ [PROFILE_KEY]: JSON.stringify({ name: 'Rio' }) });
    expect(page.text('player-tab-0')).toBe('Rio');
    // The name rides along once the game first saves.
    page.score('ones', 1);
    expect(page.stored().players[0].name).toBe('Rio');
  });

  it('falls back to "Player 1" when the profile is absent or unparseable', () => {
    const missing = loadPage();
    expect(missing.text('player-tab-0')).toBe('Player 1');

    const broken = loadPage({ [PROFILE_KEY]: '{oops' });
    expect(broken.text('player-tab-0')).toBe('Player 1');
  });

  it('never writes the shared profile key', () => {
    const seed = JSON.stringify({ name: 'Rio', color: 'orange' });
    const page = loadPage({ [PROFILE_KEY]: seed });
    page.score('ones', 4);
    page.addPlayerByText('Klara');
    page.score('twos', 6);
    expect(page.window.localStorage.getItem(PROFILE_KEY)).toBe(seed);
  });

  it('the + tab adds a player from a roster chip and switches to their tab', () => {
    const page = loadPage();
    page.el('add-player-tab').click();
    expect(page.el('add-player-modal').classList.contains('open')).toBe(true);
    page.el('roster-chip-klara').click();
    expect(page.el('add-player-modal').classList.contains('open')).toBe(false);
    expect(page.text('player-tab-1')).toBe('Klara');
    // The new player is active with a fresh, empty card.
    expect(page.el('player-tab-1').getAttribute('aria-selected')).toBe('true');
    expect(page.text('grand-total')).toBe('0');
    expect(page.stored().players).toHaveLength(2);
    expect(page.stored().active).toBe(1);
  });

  it('adds a free-text player, trimmed and capped at 20 characters', () => {
    const page = loadPage();
    page.addPlayerByText('  Grandma Aleksandra Jo  ');
    // Trimmed, then sliced to 20 chars.
    expect(page.text('player-tab-1')).toBe('Grandma Aleksandra J');
    expect(page.stored().players[1].name).toBe('Grandma Aleksandra J');
  });

  it('ignores an empty or whitespace-only name', () => {
    const page = loadPage();
    page.addPlayerByText('   ');
    expect(page.find('player-tab-1')).toBeNull();
    // Modal stays open so they can try again.
    expect(page.el('add-player-modal').classList.contains('open')).toBe(true);
  });

  it('roster chips hide names already at the table, in family order', () => {
    const page = loadPage({ [PROFILE_KEY]: JSON.stringify({ name: 'Flora' }) });
    page.el('add-player-tab').click();
    // Flora is player 1 already, so her chip is hidden.
    expect(page.find('roster-chip-flora')).toBeNull();
    const chips = [...page.document.querySelectorAll('#roster-chips .roster-chip')]
      .map((c) => c.textContent);
    expect(chips).toEqual(['Rio', 'Klara', 'Mommy', 'Papa']);

    page.el('roster-chip-mommy').click();
    page.el('add-player-tab').click();
    expect(page.find('roster-chip-mommy')).toBeNull();
    expect(page.find('roster-chip-rio')).not.toBeNull();
  });

  it('each player has an isolated scorecard; switching tabs swaps the whole card', () => {
    const page = loadPage();
    page.score('fives', 25);
    page.score('yahtzee', 50);
    page.score('yahtzee', 50); // +100 bonus for player 1
    expect(page.text('grand-total')).toBe('175');

    page.el('add-player-tab').click();
    page.el('roster-chip-klara').click();
    // Klara's card starts empty — no scores, no yahtzee bonus row.
    expect(page.text('grand-total')).toBe('0');
    expect(page.find('yahtzee-bonus')).toBeNull();
    expect(page.el('row-fives').querySelector('.score')?.textContent).toBe('—');

    page.score('ones', 3);
    expect(page.text('grand-total')).toBe('3');

    // Back to player 1: their card is exactly as they left it.
    page.el('player-tab-0').click();
    expect(page.text('grand-total')).toBe('175');
    expect(page.el('row-fives').querySelector('.score')?.textContent).toBe('25');
    expect(page.el('row-ones').querySelector('.score')?.textContent).toBe('—');
    expect(page.text('yahtzee-bonus')).toBe('100');

    // And Klara's single score survived the round trip.
    page.el('player-tab-1').click();
    expect(page.text('grand-total')).toBe('3');
  });

  it('caps the table at 6 players by hiding the + tab', () => {
    const page = loadPage();
    for (const name of ['Rio', 'Klara', 'Flora', 'Mommy', 'Papa']) {
      page.el('add-player-tab').click();
      page.el(`roster-chip-${name.toLowerCase()}`).click();
    }
    expect(page.stored().players).toHaveLength(6);
    expect(page.find('add-player-tab')).toBeNull();
  });

  it('removing the active player asks first, then drops only that card', () => {
    const page = loadPage();
    page.score('twos', 4);
    page.el('add-player-tab').click();
    page.el('roster-chip-papa').click();
    page.score('sixes', 12);

    // Papa is active; the × sits on his tab.
    page.el('remove-player').click();
    expect(page.el('confirm-remove-modal').classList.contains('open')).toBe(true);

    // Cancel keeps him.
    page.el('confirm-remove-cancel').click();
    expect(page.el('confirm-remove-modal').classList.contains('open')).toBe(false);
    expect(page.stored().players).toHaveLength(2);

    // Confirm removes him; player 1's card is untouched.
    page.el('remove-player').click();
    page.el('confirm-remove-ok').click();
    expect(page.stored().players).toHaveLength(1);
    expect(page.find('player-tab-1')).toBeNull();
    expect(page.text('grand-total')).toBe('4');
  });

  it('the last remaining player has no remove control', () => {
    const page = loadPage();
    expect(page.find('remove-player')).toBeNull();
  });
});

describe('calculator.html — new game', () => {
  it('accepting the confirm clears every card but keeps the players', () => {
    const page = loadPage();
    page.score('ones', 4);
    page.score('yahtzee', 50);
    page.el('add-player-tab').click();
    page.el('roster-chip-klara').click();
    page.score('chance', 18);

    page.el('btn-new-game').click();
    expect(page.el('confirm-new-modal').classList.contains('open')).toBe(true);
    page.el('confirm-new-ok').click();
    expect(page.el('confirm-new-modal').classList.contains('open')).toBe(false);

    // Both tabs survive; both cards are blank.
    expect(page.text('player-tab-0')).toBe('Player 1');
    expect(page.text('player-tab-1')).toBe('Klara');
    expect(page.text('grand-total')).toBe('0');
    page.el('player-tab-0').click();
    expect(page.text('grand-total')).toBe('0');
    expect(page.el('row-ones').querySelector('.score')?.textContent).toBe('—');
    const stored = page.stored();
    expect(stored.players).toHaveLength(2);
    for (const p of stored.players) {
      expect(Object.values(p.state.scores).every((v) => v === null)).toBe(true);
      expect(p.state.yahtzeeBonusCount).toBe(0);
    }
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
  it('every committed score is saved in the v2 shape with a timestamp', () => {
    const before = Date.now();
    const page = loadPage();
    page.score('threes', 9);
    const stored = page.stored();
    expect(stored.v).toBe(2);
    expect(stored.active).toBe(0);
    expect(stored.players[0].state.scores.threes).toBe(9);
    expect(stored.players[0].state.scores.chance).toBeNull();
    expect(stored.players[0].savedAt).toBeGreaterThanOrEqual(before);
  });

  it('a reload with a recent stored game restores players and cards silently', () => {
    // Play in one page instance…
    const first = loadPage();
    first.score('fours', 16);
    first.score('largeStraight', 40);
    first.el('add-player-tab').click();
    first.el('roster-chip-mommy').click();
    first.score('twos', 8);
    const raw = first.window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();

    // …then "reload": a fresh JSDOM seeded with the same storage contents.
    const reloaded = loadPage({ [STORAGE_KEY]: raw as string });
    expect(reloaded.el('resume-modal').classList.contains('open')).toBe(false);
    // Mommy was the active tab when we left.
    expect(reloaded.el('player-tab-1').getAttribute('aria-selected')).toBe('true');
    expect(reloaded.text('grand-total')).toBe('8');
    reloaded.el('player-tab-0').click();
    expect(reloaded.text('grand-total')).toBe('56');
    expect(reloaded.el('row-fours').querySelector('.score')?.textContent).toBe('16');
  });

  it('a stored game older than an hour triggers the resume prompt; Continue keeps it', () => {
    const staleAt = Date.now() - 2 * HOUR_MS;
    const page = loadPage({
      [STORAGE_KEY]: storedGameV1({ sixes: 24, yahtzee: 50 }, staleAt, 1),
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
    expect(page.stored().players[0].savedAt).toBeGreaterThan(staleAt);
    expect(page.stored().players[0].state.scores.sixes).toBe(24);
  });

  it('the stale check uses the NEWEST savedAt across players', () => {
    const seed: StoredV2 = {
      v: 2,
      players: [
        {
          name: 'Rio',
          state: { scores: { ...EMPTY_SCORES, ones: 3 }, yahtzeeBonusCount: 0 },
          savedAt: Date.now() - 3 * HOUR_MS,
        },
        {
          name: 'Klara',
          state: { scores: { ...EMPTY_SCORES, twos: 4 }, yahtzeeBonusCount: 0 },
          savedAt: Date.now() - 5 * 60 * 1000, // five minutes ago
        },
      ],
      active: 0,
    };
    // Someone scored five minutes ago → the game is still live, no prompt.
    const page = loadPage({ [STORAGE_KEY]: JSON.stringify(seed) });
    expect(page.el('resume-modal').classList.contains('open')).toBe(false);
    expect(page.text('grand-total')).toBe('3');
  });

  it('choosing Start New on the resume prompt clears the cards but keeps players', () => {
    const page = loadPage({
      [STORAGE_KEY]: storedGameV1({ sixes: 24 }, Date.now() - 2 * HOUR_MS),
    });
    expect(page.el('resume-modal').classList.contains('open')).toBe(true);
    page.el('resume-new').click();
    expect(page.el('resume-modal').classList.contains('open')).toBe(false);
    expect(page.text('grand-total')).toBe('0');
    expect(page.stored().players).toHaveLength(1);
    expect(page.stored().players[0].state.scores.sixes).toBeNull();
  });

  it('migrates the v1 wrapped form into a one-player game named from the profile', () => {
    const page = loadPage({
      [STORAGE_KEY]: storedGameV1({ fours: 12 }, Date.now()),
      [PROFILE_KEY]: JSON.stringify({ name: 'Papa' }),
    });
    expect(page.el('resume-modal').classList.contains('open')).toBe(false);
    expect(page.text('player-tab-0')).toBe('Papa');
    expect(page.text('grand-total')).toBe('12');
    // First save writes the migrated v2 shape.
    page.score('ones', 2);
    const stored = page.stored();
    expect(stored.v).toBe(2);
    expect(stored.players).toHaveLength(1);
    expect(stored.players[0].name).toBe('Papa');
    expect(stored.players[0].state.scores.fours).toBe(12);
  });

  it('migrates the legacy bare-state form into a silent one-player restore', () => {
    const legacy = JSON.stringify({
      scores: { ...EMPTY_SCORES, twos: 8 },
      yahtzeeBonusCount: 0,
    });
    // loadStored() adopts legacy state with a fresh timestamp → silent restore.
    const page = loadPage({ [STORAGE_KEY]: legacy });
    expect(page.el('resume-modal').classList.contains('open')).toBe(false);
    expect(page.text('player-tab-0')).toBe('Player 1');
    expect(page.text('grand-total')).toBe('8');
    page.score('ones', 1);
    expect(page.stored().players[0].state.scores.twos).toBe(8);
  });

  it('corrupt storage is ignored and the card starts empty', () => {
    const page = loadPage({ [STORAGE_KEY]: '{not json' });
    expect(page.el('resume-modal').classList.contains('open')).toBe(false);
    expect(page.text('grand-total')).toBe('0');
  });
});
