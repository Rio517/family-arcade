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

  it('ignores a corrupt chess save instead of crashing the arcade', () => {
    localStorage.setItem('chess:local:v1', '{not json');
    renderMenu();
    expect(screen.queryByTestId('resume-chess-local')).toBeNull();
  });
});
