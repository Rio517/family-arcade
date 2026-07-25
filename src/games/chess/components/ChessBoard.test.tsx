import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChessBoard } from './ChessBoard';
import { initialState } from '@games/chess/domain/rules';
import { parseFen } from '@games/chess/domain/fen';

describe('<ChessBoard>', () => {
  it('renders all 64 squares with the opening position', () => {
    render(
      <ChessBoard board={initialState()} orientation="w" interactive movableColor="w" onMove={vi.fn()} />,
    );
    expect(screen.getByTestId('sq-e1')).toBeInTheDocument();
    expect(screen.getByTestId('sq-e8')).toBeInTheDocument();
    // 64 squares.
    expect(screen.getByTestId('chess-board').querySelectorAll('.sq')).toHaveLength(64);
  });

  it('click-to-move: selecting a piece then a legal target emits the ply', () => {
    const onMove = vi.fn();
    render(
      <ChessBoard board={initialState()} orientation="w" interactive movableColor="w" onMove={onMove} />,
    );
    fireEvent.click(screen.getByTestId('sq-e2')); // pick up the e-pawn
    // The two-square target should now be marked.
    expect(screen.getByTestId('sq-e4').className).toMatch(/target/);
    fireEvent.click(screen.getByTestId('sq-e4'));
    expect(onMove).toHaveBeenCalledWith({ from: { row: 6, col: 4 }, to: { row: 4, col: 4 } });
  });

  it('does not let you pick up the wrong colour', () => {
    const onMove = vi.fn();
    render(
      <ChessBoard board={initialState()} orientation="w" interactive movableColor="w" onMove={onMove} />,
    );
    fireEvent.click(screen.getByTestId('sq-e7')); // a black pawn — not White's to move
    expect(screen.getByTestId('sq-e5').className).not.toMatch(/target/);
  });

  it('is inert when not interactive', () => {
    const onMove = vi.fn();
    render(
      <ChessBoard board={initialState()} orientation="w" interactive={false} movableColor="w" onMove={onMove} />,
    );
    fireEvent.click(screen.getByTestId('sq-e2'));
    expect(screen.getByTestId('sq-e4').className).not.toMatch(/target/);
  });

  it('routes a promotion through the picker before emitting', () => {
    const onMove = vi.fn();
    // A lone White pawn one step from promoting on a8.
    render(
      <ChessBoard board={parseFen('8/P7/8/8/8/8/8/k6K w - - 0 1')} orientation="w" interactive movableColor="w" onMove={onMove} />,
    );
    fireEvent.click(screen.getByTestId('sq-a7'));
    fireEvent.click(screen.getByTestId('sq-a8'));
    // No move yet — the picker is up.
    expect(onMove).not.toHaveBeenCalled();
    expect(screen.getByTestId('promote-q')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('promote-n')); // choose a knight
    expect(onMove).toHaveBeenCalledWith({ from: { row: 1, col: 0 }, to: { row: 0, col: 0 }, promotion: 'n' });
  });

  it('flips coordinates when oriented for Black', () => {
    render(
      <ChessBoard board={initialState()} orientation="b" interactive movableColor="b" onMove={vi.fn()} />,
    );
    // e1 and e8 still exist by name; orientation only changes their screen slot.
    const board = screen.getByTestId('chess-board');
    const squares = board.querySelectorAll('.sq');
    // First rendered square (top-left) is h1 when viewed from Black's side.
    expect(squares[0].getAttribute('data-testid')).toBe('sq-h1');
  });
});
