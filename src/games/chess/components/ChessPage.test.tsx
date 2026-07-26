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

  it('reaching the online lobby shows create/join controls', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('mode-online'));
    expect(screen.getByTestId('chess-create')).toBeInTheDocument();
    expect(screen.getByTestId('chess-join-code')).toBeInTheDocument();
  });
});
