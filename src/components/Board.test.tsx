import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Board, type BoardCell, type PlacedShip } from './Board';
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

  it('marks own ship cells with the ship class (styled, no emoji)', () => {
    const cells = waterGrid();
    cells[1][1] = { state: 'ship' };
    render(<Board cells={cells} skinId="aqua" variant="own" />);
    expect(screen.getByTestId('cell-own-1-1').className).toContain('ship');
    expect(screen.getByTestId('cell-own-1-1').textContent).toBe('');
  });

  it('places ship overlays on the right grid lines and applies state classes', () => {
    const ships: PlacedShip[] = [
      { shipId: 'carrier', row: 1, col: 2, size: 5, orientation: 'H' },
      { shipId: 'destroyer', row: 3, col: 4, size: 2, orientation: 'V', sunk: true },
    ];
    render(<Board cells={waterGrid()} skinId="aqua" variant="own" ships={ships} />);

    // Grid line for a 0-indexed cell n is n + 2 (line 1 is the label track).
    const carrier = screen.getByTestId('ship-overlay-carrier');
    expect(carrier.style.gridColumn).toBe('4 / span 5'); // horizontal → spans columns
    expect(carrier.style.gridRow).toBe('3');

    const destroyer = screen.getByTestId('ship-overlay-destroyer');
    expect(destroyer.style.gridRow).toBe('5 / span 2'); // vertical → spans rows
    expect(destroyer.style.gridColumn).toBe('6');
    expect(destroyer.className).toContain('sunk');

    // No pointer handler → overlays are read-only (battle board).
    expect(carrier.className).toContain('static');
  });

  it('shows on-board rotate/remove controls only for the selected ship', () => {
    const onShipRotate = vi.fn();
    const onShipRemove = vi.fn();
    const ships: PlacedShip[] = [
      { shipId: 'carrier', row: 0, col: 0, size: 5, orientation: 'H' },
      { shipId: 'destroyer', row: 2, col: 0, size: 2, orientation: 'H' },
    ];
    render(
      <Board
        cells={waterGrid()}
        skinId="aqua"
        variant="own"
        ships={ships}
        selectedShipId="carrier"
        onShipPointerDown={vi.fn()}
        onShipRotate={onShipRotate}
        onShipRemove={onShipRemove}
      />,
    );
    // Controls exist for the selected ship, not the others.
    expect(screen.getByTestId('board-rotate-carrier')).toBeInTheDocument();
    expect(screen.queryByTestId('board-rotate-destroyer')).toBeNull();

    fireEvent.click(screen.getByTestId('board-rotate-carrier'));
    expect(onShipRotate).toHaveBeenCalledWith('carrier');
    fireEvent.click(screen.getByTestId('board-remove-carrier'));
    expect(onShipRemove).toHaveBeenCalledWith('carrier');
  });
});
