import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Board, type BoardCell } from './Board';
import { BOARD_SIZE } from '../game/types';

function waterGrid(): BoardCell[][] {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => ({ state: 'water' as const })),
  );
}

describe('<Board>', () => {
  it('renders a full 10×10 grid of cells', () => {
    render(<Board cells={waterGrid()} skinId="aqua" variant="own" />);
    expect(screen.getAllByRole('button')).toHaveLength(BOARD_SIZE * BOARD_SIZE);
  });

  it('fires onCell for an enemy target when active', () => {
    const onCell = vi.fn();
    render(<Board cells={waterGrid()} skinId="ember" variant="enemy" active onCell={onCell} />);
    fireEvent.click(screen.getByTestId('cell-enemy-3-7'));
    expect(onCell).toHaveBeenCalledWith(3, 7);
  });

  it('does not fire when disabled', () => {
    const onCell = vi.fn();
    render(<Board cells={waterGrid()} skinId="ember" variant="enemy" onCell={onCell} disabled />);
    fireEvent.click(screen.getByTestId('cell-enemy-0-0'));
    expect(onCell).not.toHaveBeenCalled();
  });

  it('shows the skin icon on own ship cells', () => {
    const cells = waterGrid();
    cells[1][1] = { state: 'ship' };
    render(<Board cells={cells} skinId="aqua" variant="own" />);
    // Aqua Corps icon is 🛸.
    expect(screen.getByTestId('cell-own-1-1').textContent).toBe('🛸');
  });
});
