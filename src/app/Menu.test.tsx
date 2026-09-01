import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createCampaign } from '@games/caribbean/domain/createCampaign';
import { createJournal } from '@games/caribbean/domain/replay';
import { saveCampaign } from '@games/caribbean/storage/persistence';
import { Menu } from './Menu';
import { GAMES } from './registry';

function renderMenu() {
  return render(
    <MemoryRouter>
      <Menu />
    </MemoryRouter>,
  );
}

describe('<Menu> — the arcade landing page', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('lists every registry game (and Yahtzee) as a ticket', () => {
    renderMenu();
    // Driven by the registry itself so a newly added game can't be missed.
    for (const name of ['Yahtzee', ...GAMES.map((g) => g.title)]) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
  });

  describe('the poster behind every ticket', () => {
    it('a tap opens the ticket into its poster — picture, facts, blurb, Play — one at a time', () => {
      renderMenu();
      // Closed: no poster, and the ticket is not a link — Play lives inside.
      expect(screen.queryByTestId('ticket-poster-chess')).toBeNull();
      expect(screen.queryByRole('link', { name: /Play Chess/ })).toBeNull();

      fireEvent.click(screen.getByTestId('ticket-open-chess'));
      const poster = screen.getByTestId('ticket-poster-chess');
      expect(screen.getByTestId('ticket-open-chess')).toHaveAttribute('aria-expanded', 'true');
      expect(within(poster).getByRole('img')).toHaveAttribute('alt', expect.stringMatching(/Chess/));
      expect(within(poster).getAllByRole('listitem').length).toBeGreaterThanOrEqual(2);
      expect(within(poster).getByRole('link', { name: /Play Chess/ })).toHaveAttribute('href', '/chess');

      // Opening another closes the first.
      fireEvent.click(screen.getByTestId('ticket-open-risk'));
      expect(screen.queryByTestId('ticket-poster-chess')).toBeNull();
      expect(screen.getByTestId('ticket-poster-risk')).toBeInTheDocument();
      // A second tap on the open one folds it.
      fireEvent.click(screen.getByTestId('ticket-open-risk'));
      expect(screen.queryByTestId('ticket-poster-risk')).toBeNull();
    });

    it('Escape folds the open ticket', () => {
      renderMenu();
      fireEvent.click(screen.getByTestId('ticket-open-racer'));
      expect(screen.getByTestId('ticket-poster-racer')).toBeInTheDocument();
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByTestId('ticket-poster-racer')).toBeNull();
    });

    it('every registry game opens, with a Play link to its own path', () => {
      renderMenu();
      for (const game of GAMES) {
        fireEvent.click(screen.getByTestId(`ticket-open-${game.id}`));
        const poster = screen.getByTestId(`ticket-poster-${game.id}`);
        expect(within(poster).getByRole('link', { name: new RegExp(`Play ${game.title}`) })).toHaveAttribute('href', game.path);
      }
    });

    it('Yahtzee opens too; its Play is the calculator page', () => {
      renderMenu();
      fireEvent.click(screen.getByTestId('ticket-open-yahtzee'));
      const poster = screen.getByTestId('ticket-poster-yahtzee');
      expect(within(poster).getByRole('link', { name: /Play Yahtzee/ }).getAttribute('href')).toMatch(/calculator\.html$/);
    });
  });

  it('every ticket wears a player-count badge from its descriptor', () => {
    renderMenu();
    for (const game of GAMES) {
      const ticket = document.querySelector(`.game-${game.id}`)!;
      const { min, max } = game.players;
      const label = min === max ? `For ${min} player${min === 1 ? '' : 's'}` : `For ${min}–${max} players`;
      expect(ticket.querySelector(`[aria-label="${label}"]`)).not.toBeNull();
    }
    // Yahtzee's hand-built ticket gets the same treatment.
    expect(document.querySelector('.game-yahtzee [aria-label="For 1 player"]')).not.toBeNull();
  });

  it('says "one player per device" exactly where the chairs are fewer than the players', () => {
    renderMenu();
    for (const game of GAMES) {
      const ticket = document.querySelector(`.game-${game.id}`)!;
      const hint = ticket.querySelector('.tk-devices');
      if (game.seats.max < game.players.max) expect(hint, game.id).not.toBeNull();
      else expect(hint, game.id).toBeNull();
    }
    // Ship Battle is the one the family gets wrong: two players, one per iPad.
    expect(document.querySelector('.game-battleship .tk-devices')).not.toBeNull();
  });

  it('games with computer opponents wear the little robot, with a tooltip', () => {
    renderMenu();
    for (const id of ['risk', 'battleship']) {
      const badge = document.querySelector(`.game-${id} [aria-label="Has computer players"]`);
      expect(badge).not.toBeNull();
      expect(badge!.getAttribute('title')).toMatch(/computer/i);
    }
    expect(document.querySelector('.game-unicorn [aria-label="Has computer players"]')).toBeNull();
  });

  // The UX review's returning-player row (docs/mockups/20260831-party-ui), now shipped: the
  // game you were playing, before the whole catalogue.
  it('a saved game becomes one unboxed Continue row above the tickets', () => {
    localStorage.setItem('risk-campaign-v1', JSON.stringify({
      v: 1,
      savedAt: 456,
      state: {
        mapId: 'classic',
        phase: 'reinforce',
        players: [{ name: 'Mario' }, { name: 'Peach' }],
        territories: {},
        current: 0,
        diceBag: [1, 2, 3],
      },
    }));
    renderMenu();
    const row = screen.getByTestId('continue-risk');
    expect(row).toHaveTextContent('Continue Risk ›');
    expect(row).toHaveAttribute('href', '/risk');
    // The box and its header give way to the row.
    expect(screen.queryByText(/Save Station/)).toBeNull();
    // And it comes before the catalogue in the document.
    const tix = document.querySelector('.tix')!;
    expect(row.compareDocumentPosition(tix) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows no Continue rows when nothing is saved', () => {
    renderMenu();
    expect(screen.queryByLabelText('Carry on')).toBeNull();
    expect(document.querySelectorAll('[data-testid^="continue-"]')).toHaveLength(0);
  });

  it('lists saved games with resume links', () => {
    // A saved hotseat chess game…
    localStorage.setItem('chess:local:v1', JSON.stringify({
      v: 1,
      whiteName: 'Alice',
      blackName: 'Bob',
      log: [{ from: { row: 6, col: 4 }, to: { row: 4, col: 4 } }],
      updatedAt: 123,
    }));
    renderMenu();

    const chess = screen.getByTestId('continue-chess-local');
    expect(chess).toHaveTextContent('Continue Chess ›');
    expect(chess).toHaveTextContent(/1 move in/);
    expect(chess.getAttribute('href')).toContain('/chess?resume=local');
  });

  it('renders rows from a registry game’s savedGames hook (Risk)', () => {
    // A mid-campaign Risk save — its row comes purely from the registry
    // descriptor's savedGames() hook; Menu has no Risk-specific code.
    localStorage.setItem('risk-campaign-v1', JSON.stringify({
      v: 1,
      savedAt: 456,
      state: {
        mapId: 'classic',
        phase: 'reinforce',
        players: [{ name: 'Mario' }, { name: 'Peach' }],
        // The loader shape-checks everything the engine indexes into.
        territories: {},
        current: 0,
        diceBag: [1, 2, 3],
      },
    }));
    renderMenu();

    const risk = screen.getByTestId('continue-risk');
    expect(risk).toHaveTextContent('Continue Risk ›');
    expect(risk).toHaveTextContent('campaign · 2 generals');
    expect(risk.getAttribute('href')).toContain('/risk');
  });

  it('ignores a corrupt chess save instead of crashing the arcade', () => {
    localStorage.setItem('chess:local:v1', '{not json');
    renderMenu();
    expect(screen.queryByTestId('resume-chess-local')).toBeNull();
  });

  it('registers Caribbean immediately after Magic Coins with its exact descriptor', () => {
    const unicornIndex = GAMES.findIndex((game) => game.id === 'unicorn');
    expect(GAMES[unicornIndex + 1]).toMatchObject({
      id: 'caribbean',
      title: 'Caribbean Career',
      tag: '3D battles',
      players: { min: 1, max: 1 },
      computer: true,
      path: '/caribbean',
      description: 'Trade, chase rumours, and command a growing fleet across the Caribbean.',
      releaseStatus: 'under-construction',
    });
  });

  it('marks Caribbean as under construction without disabling play', () => {
    renderMenu();

    const ticket = screen.getByTestId('game-ticket-caribbean');
    expect(ticket).toHaveAttribute('data-release-status', 'under-construction');
    expect(ticket).toHaveTextContent('Under construction · playable');
    // Still playable: open the ticket and Play goes to the game.
    fireEvent.click(screen.getByTestId('ticket-open-caribbean'));
    expect(screen.getByTestId('game-play-caribbean')).toHaveAttribute('href', '/caribbean');
  });

  it('reads a Caribbean Continue row without writing and links to clean resume', () => {
    const result = saveCampaign(
      localStorage,
      createJournal(createCampaign({ seed: 1702, name: 'Morgan', length: 'voyage' })),
      {
        build: 'fixture',
        savedAt: 100,
        expectedRevision: { currentRaw: null, previousRaw: null },
      },
    );
    if (!result.ok) throw new Error(`fixture save failed: ${result.reason}`);
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const descriptor = GAMES.find((game) => game.id === 'caribbean');

    expect(descriptor?.savedGames?.()).toEqual([expect.objectContaining({
      key: 'caribbean',
      to: '/caribbean?resume=1',
      color: '#4ec5c1',
      title: 'Caribbean Career — Morgan',
      meta: 'Voyage · Bridgetown · 3.4 months provisions',
    })]);
    expect(writes).not.toHaveBeenCalled();

    renderMenu();
    const row = screen.getByTestId('continue-caribbean');
    expect(row).toHaveTextContent('Continue Caribbean Career ›');
    expect(row).toHaveTextContent('Voyage · Bridgetown · 3.4 months provisions');
    expect(row.getAttribute('href')).toContain('/caribbean?resume=1');
    writes.mockRestore();
  });

  it('returns no Caribbean Continue row when storage access throws', () => {
    const property = Object.getOwnPropertyDescriptor(window, 'localStorage');
    const denied = new DOMException('Storage denied', 'SecurityError');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw denied; },
    });
    try {
      const descriptor = GAMES.find((game) => game.id === 'caribbean');
      expect(descriptor?.savedGames?.()).toEqual([]);
    } finally {
      if (property) Object.defineProperty(window, 'localStorage', property);
      else Reflect.deleteProperty(window, 'localStorage');
    }
  });
});
