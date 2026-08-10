import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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

  it('lists every registry game (and Yahtzee) as a ticket', () => {
    renderMenu();
    // Driven by the registry itself so a newly added game can't be missed.
    for (const name of ['Yahtzee', ...GAMES.map((g) => g.title)]) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
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

  it('games with computer opponents wear the little robot, with a tooltip', () => {
    renderMenu();
    for (const id of ['risk', 'battleship']) {
      const badge = document.querySelector(`.game-${id} [aria-label="Has computer players"]`);
      expect(badge).not.toBeNull();
      expect(badge!.getAttribute('title')).toMatch(/computer/i);
    }
    expect(document.querySelector('.game-unicorn [aria-label="Has computer players"]')).toBeNull();
  });

  it('hides the Save Station when nothing is saved', () => {
    renderMenu();
    expect(screen.queryByLabelText('Saved games')).toBeNull();
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

    const chess = screen.getByTestId('resume-chess-local');
    expect(chess).toHaveTextContent('Alice vs Bob');
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

    const risk = screen.getByTestId('resume-risk');
    expect(risk).toHaveTextContent('Risk — Mario, Peach');
    expect(risk).toHaveTextContent('campaign · 2 generals');
    expect(risk.getAttribute('href')).toContain('/risk');
  });

  it('ignores a corrupt chess save instead of crashing the arcade', () => {
    localStorage.setItem('chess:local:v1', '{not json');
    renderMenu();
    expect(screen.queryByTestId('resume-chess-local')).toBeNull();
  });
});
