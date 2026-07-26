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

  it('defaults to the tabletop (tilt) view and remembers turning it off', () => {
    const { container } = renderPage();
    fireEvent.click(screen.getByTestId('mode-local'));
    fireEvent.click(screen.getByTestId('start-local'));

    // Tabletop view is the default…
    expect(container.querySelector('.chess-wrap')?.classList.contains('tilt')).toBe(true);

    // …and the toggle flips to flat and persists the choice.
    fireEvent.click(screen.getByTestId('chess-tilt-toggle'));
    expect(container.querySelector('.chess-wrap')?.classList.contains('tilt')).toBe(false);
    expect(localStorage.getItem('chess-tilt-v1')).toBe('0');
  });

  it('reaching the online lobby shows create/join controls', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('mode-online'));
    expect(screen.getByTestId('chess-create')).toBeInTheDocument();
    expect(screen.getByTestId('chess-join-code')).toBeInTheDocument();
  });
});
