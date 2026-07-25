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

  it('reaching the online lobby shows create/join controls', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('mode-online'));
    expect(screen.getByTestId('chess-create')).toBeInTheDocument();
    expect(screen.getByTestId('chess-join-code')).toBeInTheDocument();
  });
});
