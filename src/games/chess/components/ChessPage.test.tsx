import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChessPage } from './ChessPage';

function renderPage(entry = '/chess') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ChessPage />
    </MemoryRouter>,
  );
}

describe('<ChessPage> — local flow', () => {
  beforeEach(() => localStorage.clear());

  it('offers a mode picker with both same-device and online options', () => {
    renderPage();
    expect(screen.getByTestId('mode-local')).toBeInTheDocument();
    expect(screen.getByTestId('mode-online')).toBeInTheDocument();
  });

  it('starts a same-device game and shows the board', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('mode-local'));
    fireEvent.click(screen.getByTestId('start-local'));
    expect(screen.getByTestId('chess-board')).toBeInTheDocument();
    expect(screen.getByTestId('chess-turn')).toHaveTextContent(/White to move/);
  });

  it('plays a move and hands the turn to Black', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('mode-local'));
    fireEvent.click(screen.getByTestId('start-local'));

    fireEvent.click(screen.getByTestId('sq-e2'));
    fireEvent.click(screen.getByTestId('sq-e4'));

    // The pawn has moved (a piece SVG now sits on e4) and it's Black's turn.
    expect(screen.getByTestId('sq-e4').querySelector('svg')).toBeTruthy();
    expect(screen.getByTestId('sq-e2').querySelector('svg')).toBeNull();
    expect(screen.getByTestId('chess-turn')).toHaveTextContent(/Black to move/);
  });

  it('names the player whose move it is, and takes moves back', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('mode-local'));

    // Give the two players real names.
    fireEvent.change(screen.getByTestId('white-name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByTestId('black-name'), { target: { value: 'Bob' } });
    fireEvent.click(screen.getByTestId('start-local'));

    expect(screen.getByTestId('chess-turn')).toHaveTextContent(/Alice to move/);

    // Nothing to undo before the first move.
    expect(screen.getByTestId('chess-undo')).toBeDisabled();

    fireEvent.click(screen.getByTestId('sq-e2'));
    fireEvent.click(screen.getByTestId('sq-e4'));
    expect(screen.getByTestId('chess-turn')).toHaveTextContent(/Bob to move/);
    expect(screen.getByTestId('sq-e4').querySelector('svg')).toBeTruthy();

    // Undo restores the pawn and hands the turn back to Alice.
    fireEvent.click(screen.getByTestId('chess-undo'));
    expect(screen.getByTestId('sq-e4').querySelector('svg')).toBeNull();
    expect(screen.getByTestId('sq-e2').querySelector('svg')).toBeTruthy();
    expect(screen.getByTestId('chess-turn')).toHaveTextContent(/Alice to move/);
    expect(screen.getByTestId('chess-undo')).toBeDisabled();
  });

  it('shows the move log and can return to an earlier move', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('mode-local'));
    fireEvent.click(screen.getByTestId('start-local'));

    // Play 1.e4 e5 2.Nf3.
    for (const [from, to] of [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3']]) {
      fireEvent.click(screen.getByTestId(`sq-${from}`));
      fireEvent.click(screen.getByTestId(`sq-${to}`));
    }
    expect(screen.getByTestId('sq-f3').querySelector('svg')).toBeTruthy();

    // Open the log — three plies are listed.
    fireEvent.click(screen.getByTestId('chess-log-open'));
    expect(screen.getByRole('dialog', { name: /move log/i })).toBeInTheDocument();
    expect(screen.getByTestId('log-ply-0')).toHaveTextContent('e4');
    expect(screen.getByTestId('log-ply-2')).toHaveTextContent(/Nf3/);

    // Pick the position after 1.e4 and rewind to it.
    fireEvent.click(screen.getByTestId('log-ply-0'));
    fireEvent.click(screen.getByTestId('chess-log-return'));

    // The knight move is undone, the board is back to Black-to-move after 1.e4.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('sq-f3').querySelector('svg')).toBeNull();
    expect(screen.getByTestId('sq-e4').querySelector('svg')).toBeTruthy();
    expect(screen.getByTestId('chess-turn')).toHaveTextContent(/Black to move/);
  });

  it('offers exactly two views — flat (the default) and 3D', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('mode-local'));
    fireEvent.click(screen.getByTestId('start-local'));

    // Flat is the default; the old tabletop mode is gone.
    expect(screen.getByTestId('view-flat')).toBeInTheDocument();
    expect(screen.getByTestId('view-3d')).toBeInTheDocument();
    expect(screen.queryByTestId('view-table')).toBeNull();
    expect(screen.getByTestId('chess-board')).toBeInTheDocument();

    // Re-picking Flat persists the choice.
    fireEvent.click(screen.getByTestId('view-flat'));
    expect(localStorage.getItem('chess-view-v1')).toBe('flat');
  });

  it('free play: place, move, clear, and end the sandbox', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('mode-free'));

    // Tap a white queen in the tray — it becomes a stamp: every square tapped
    // gets a queen, without re-picking from the tray.
    fireEvent.click(screen.getByTestId('fp-tray-w-q'));
    fireEvent.click(screen.getByTestId('fp-sq-e5'));
    fireEvent.click(screen.getByTestId('fp-sq-a1'));
    fireEvent.click(screen.getByTestId('fp-sq-h8'));
    expect(screen.getByTestId('fp-sq-e5').querySelector('svg')).toBeTruthy();
    expect(screen.getByTestId('fp-sq-a1').querySelector('svg')).toBeTruthy();
    expect(screen.getByTestId('fp-sq-h8').querySelector('svg')).toBeTruthy();

    // Tapping the tray piece again puts the stamp down.
    fireEvent.click(screen.getByTestId('fp-tray-w-q'));

    // Now board pieces can be picked up and moved — a one-shot, not a stamp.
    fireEvent.click(screen.getByTestId('fp-sq-e5'));
    fireEvent.click(screen.getByTestId('fp-sq-b2'));
    expect(screen.getByTestId('fp-sq-e5').querySelector('svg')).toBeNull();
    expect(screen.getByTestId('fp-sq-b2').querySelector('svg')).toBeTruthy();

    // Pick a piece up and remove it via the remove button (the 3D-friendly path).
    fireEvent.click(screen.getByTestId('fp-sq-a1'));
    fireEvent.click(screen.getByTestId('fp-remove'));
    expect(screen.getByTestId('fp-sq-a1').querySelector('svg')).toBeNull();

    // Views, resets, and exit live in the ☰ menu.
    fireEvent.click(screen.getByTestId('fp-menu'));
    expect(screen.getByTestId('fp-view-3d')).toBeInTheDocument();

    // Starting lineup asks first (it replaces the whole board), then fills 32.
    fireEvent.click(screen.getByTestId('fp-lineup'));
    expect(screen.getByTestId('fp-confirm-lineup')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('fp-confirm-lineup'));
    expect(screen.getByTestId('fp-board').querySelectorAll('svg').length).toBe(32);

    // Clear also confirms — and cancelling leaves the board alone.
    fireEvent.click(screen.getByTestId('fp-menu'));
    fireEvent.click(screen.getByTestId('fp-clear'));
    fireEvent.click(screen.getByTestId('fp-confirm-cancel'));
    expect(screen.getByTestId('fp-board').querySelectorAll('svg').length).toBe(32);
    fireEvent.click(screen.getByTestId('fp-clear'));
    fireEvent.click(screen.getByTestId('fp-confirm-clear'));
    expect(screen.getByTestId('fp-board').querySelectorAll('svg').length).toBe(0);

    // Exit (in the menu) returns to the mode picker.
    fireEvent.click(screen.getByTestId('fp-menu'));
    fireEvent.click(screen.getByTestId('fp-end'));
    expect(screen.getByTestId('mode-free')).toBeInTheDocument();
  });

  it('switches the whole set to the unicorn theme and remembers it', () => {
    const { container } = renderPage();
    fireEvent.click(screen.getByTestId('mode-local'));
    fireEvent.click(screen.getByTestId('start-local'));

    // Classic by default.
    expect(container.querySelector('.chess-theme-classic')).toBeTruthy();
    expect(screen.getByTestId('sq-e2').querySelector('svg')?.getAttribute('data-piece-theme')).toBeNull();

    // One tap: pink board class + unicorn piece art everywhere, persisted.
    fireEvent.click(screen.getByTestId('theme-unicorn'));
    expect(container.querySelector('.chess-theme-unicorn')).toBeTruthy();
    expect(screen.getByTestId('sq-e2').querySelector('svg')?.getAttribute('data-piece-theme')).toBe('unicorn');
    expect(localStorage.getItem('chess-theme-v1')).toBe('unicorn');

    // And the Galaxy Fleet is one more tap away.
    fireEvent.click(screen.getByTestId('theme-galaxy'));
    expect(container.querySelector('.chess-theme-galaxy')).toBeTruthy();
    expect(screen.getByTestId('sq-e2').querySelector('svg')?.getAttribute('data-piece-theme')).toBe('galaxy');
    expect(localStorage.getItem('chess-theme-v1')).toBe('galaxy');
  });

  it('restores a stored galaxy theme on load', () => {
    localStorage.setItem('chess-theme-v1', 'galaxy');
    const { container } = renderPage();
    fireEvent.click(screen.getByTestId('mode-local'));
    fireEvent.click(screen.getByTestId('start-local'));
    expect(container.querySelector('.chess-theme-galaxy')).toBeTruthy();
    expect(screen.getByTestId('sq-e2').querySelector('svg')?.getAttribute('data-piece-theme')).toBe('galaxy');
  });

  it('free play can promote its setup into a real rules-bound game', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('mode-free'));

    // No kings on the board yet — starting is refused with a friendly reason.
    fireEvent.click(screen.getByTestId('fp-start-game'));
    expect(screen.getByTestId('fp-start-issue')).toHaveTextContent(/king/i);

    // Place the two kings and a white queen (tray pieces stamp, so tap the
    // tray again to stop before switching pieces).
    fireEvent.click(screen.getByTestId('fp-tray-w-k'));
    fireEvent.click(screen.getByTestId('fp-sq-e1'));
    fireEvent.click(screen.getByTestId('fp-tray-w-k'));
    fireEvent.click(screen.getByTestId('fp-tray-b-k'));
    fireEvent.click(screen.getByTestId('fp-sq-e8'));
    fireEvent.click(screen.getByTestId('fp-tray-b-k'));
    fireEvent.click(screen.getByTestId('fp-tray-w-q'));
    fireEvent.click(screen.getByTestId('fp-sq-d4'));
    fireEvent.click(screen.getByTestId('fp-start-game'));

    // A real game now: the rules board is up, White to move, position live.
    expect(screen.getByTestId('chess-board')).toBeInTheDocument();
    expect(screen.getByTestId('chess-turn')).toHaveTextContent(/White to move/);
    expect(screen.getByTestId('sq-d4').querySelector('svg')).toBeTruthy();

    // And it IS rules-bound: the queen may not hop like a knight.
    fireEvent.click(screen.getByTestId('sq-d4'));
    fireEvent.click(screen.getByTestId('sq-e6'));
    expect(screen.getByTestId('sq-e6').querySelector('svg')).toBeNull();
    // …but slides legally, handing the turn to Black.
    fireEvent.click(screen.getByTestId('sq-d4'));
    fireEvent.click(screen.getByTestId('sq-d6'));
    expect(screen.getByTestId('sq-d6').querySelector('svg')).toBeTruthy();
    expect(screen.getByTestId('chess-turn')).toHaveTextContent(/Black to move/);
  });

  it('refuses to start a free-play game that is already checkmate', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('mode-free'));

    // Ka1 trapped by Qb2 guarded by Kb3 — mate before move one.
    fireEvent.click(screen.getByTestId('fp-tray-w-k'));
    fireEvent.click(screen.getByTestId('fp-sq-a1'));
    fireEvent.click(screen.getByTestId('fp-tray-w-k'));
    fireEvent.click(screen.getByTestId('fp-tray-b-q'));
    fireEvent.click(screen.getByTestId('fp-sq-b2'));
    fireEvent.click(screen.getByTestId('fp-tray-b-q'));
    fireEvent.click(screen.getByTestId('fp-tray-b-k'));
    fireEvent.click(screen.getByTestId('fp-sq-b3'));
    fireEvent.click(screen.getByTestId('fp-tray-b-k'));

    fireEvent.click(screen.getByTestId('fp-start-game'));
    expect(screen.getByTestId('fp-start-issue')).toHaveTextContent(/checkmated/);
    // Still in the sandbox, not a game.
    expect(screen.queryByTestId('chess-board')).toBeNull();
  });

  it('free play offers the theme picker too (in the menu)', () => {
    localStorage.setItem('chess-theme-v1', 'unicorn');
    const { container } = renderPage();
    fireEvent.click(screen.getByTestId('mode-free'));

    // The stored choice applies, and the sandbox can switch back.
    expect(container.querySelector('.chess-theme-unicorn')).toBeTruthy();
    fireEvent.click(screen.getByTestId('fp-tray-w-q'));
    fireEvent.click(screen.getByTestId('fp-sq-e5'));
    expect(screen.getByTestId('fp-sq-e5').querySelector('svg')?.getAttribute('data-piece-theme')).toBe('unicorn');

    fireEvent.click(screen.getByTestId('fp-menu'));
    fireEvent.click(screen.getByTestId('fp-theme-galaxy'));
    expect(container.querySelector('.chess-theme-galaxy')).toBeTruthy();

    fireEvent.click(screen.getByTestId('fp-theme-classic'));
    expect(container.querySelector('.chess-theme-classic')).toBeTruthy();
  });

  it('reaching the online lobby shows create/join controls', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('mode-online'));
    expect(screen.getByTestId('chess-create')).toBeInTheDocument();
    expect(screen.getByTestId('chess-join-code')).toBeInTheDocument();
  });
});
