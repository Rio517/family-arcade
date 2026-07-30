import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Placement } from './Placement';
import { autoPlace, isFleetComplete } from '@games/battleship/domain/board';
import { seededRng } from '@test/helpers';
import type { Fleet } from '@games/battleship/domain/types';

describe('<Placement>', () => {
  it('auto-places a complete legal fleet', () => {
    const onChange = vi.fn();
    render(<Placement skinId="aqua" fleet={[]} onChange={onChange} onReady={vi.fn()} waiting={false} />);
    fireEvent.click(screen.getByTestId('auto-place'));
    const fleet = onChange.mock.calls[0][0] as Fleet;
    expect(isFleetComplete(fleet)).toBe(true);
  });

  it('disables Ready until the fleet is complete', () => {
    const { rerender } = render(
      <Placement skinId="aqua" fleet={[]} onChange={vi.fn()} onReady={vi.fn()} waiting={false} />,
    );
    expect(screen.getByTestId('ready')).toBeDisabled();

    const full = autoPlace(seededRng(5));
    rerender(<Placement skinId="aqua" fleet={full} onChange={vi.fn()} onReady={vi.fn()} waiting={false} />);
    expect(screen.getByTestId('ready')).not.toBeDisabled();
  });

  it('fires onReady when confirmed with a complete fleet', () => {
    const onReady = vi.fn();
    render(
      <Placement skinId="aqua" fleet={autoPlace(seededRng(9))} onChange={vi.fn()} onReady={onReady} waiting={false} />,
    );
    fireEvent.click(screen.getByTestId('ready'));
    expect(onReady).toHaveBeenCalled();
  });

  it('clears the board', () => {
    const onChange = vi.fn();
    render(
      <Placement skinId="aqua" fleet={autoPlace(seededRng(1))} onChange={onChange} onReady={vi.fn()} waiting={false} />,
    );
    fireEvent.click(screen.getByTestId('clear-fleet'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('fast start places a full fleet and readies in one tap', () => {
    const onChange = vi.fn();
    const onReady = vi.fn();
    render(<Placement skinId="aqua" fleet={[]} onChange={onChange} onReady={onReady} waiting={false} />);
    fireEvent.click(screen.getByTestId('fast-start'));
    expect(isFleetComplete(onChange.mock.calls[0][0] as Fleet)).toBe(true);
    expect(onReady).toHaveBeenCalled();
  });

  it('hides fast start once the player is waiting', () => {
    render(
      <Placement skinId="aqua" fleet={autoPlace(seededRng(2))} onChange={vi.fn()} onReady={vi.fn()} waiting />,
    );
    expect(screen.queryByTestId('fast-start')).toBeNull();
  });

  it('places the selected ship where you tap an empty cell', () => {
    const onChange = vi.fn();
    render(<Placement skinId="aqua" fleet={[]} onChange={onChange} onReady={vi.fn()} waiting={false} />);
    // Carrier is selected first by default; tap A1.
    fireEvent.click(screen.getByTestId('cell-own-0-0'));
    const fleet = onChange.mock.calls[0][0] as Fleet;
    expect(fleet).toHaveLength(1);
    expect(fleet[0]).toMatchObject({ shipId: 'carrier', row: 0, col: 0, orientation: 'H' });
  });

  it('picks a placed ship back up when you tap it', () => {
    const onChange = vi.fn();
    const fleet: Fleet = [{ shipId: 'destroyer', row: 0, col: 0, orientation: 'H' }];
    render(<Placement skinId="aqua" fleet={fleet} onChange={onChange} onReady={vi.fn()} waiting={false} />);
    fireEvent.click(screen.getByTestId('cell-own-0-0')); // destroyer occupies A1
    expect(onChange).toHaveBeenCalledWith([]); // removed so it can be re-placed
  });

  it('un-places a ship via its remove (X) control', () => {
    const onChange = vi.fn();
    const fleet: Fleet = [{ shipId: 'destroyer', row: 0, col: 0, orientation: 'H' }];
    render(<Placement skinId="aqua" fleet={fleet} onChange={onChange} onReady={vi.fn()} waiting={false} />);
    fireEvent.click(screen.getByTestId('unplace-destroyer'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('rotates a placed ship in place when it fits', () => {
    const onChange = vi.fn();
    const fleet: Fleet = [{ shipId: 'destroyer', row: 0, col: 0, orientation: 'H' }];
    render(<Placement skinId="aqua" fleet={fleet} onChange={onChange} onReady={vi.fn()} waiting={false} />);
    fireEvent.click(screen.getByTestId('rotate-destroyer'));
    const next = onChange.mock.calls[0][0] as Fleet;
    expect(next.find((p) => p.shipId === 'destroyer')?.orientation).toBe('V');
  });

  it('rotates a ship on the bottom edge by pulling it inward instead of off-board', () => {
    const onChange = vi.fn();
    // Carrier (size 5) horizontal on the bottom row — rotating about its bow
    // would run 4 cells off the board, so it must shift up to stay in bounds.
    const fleet: Fleet = [{ shipId: 'carrier', row: 9, col: 2, orientation: 'H' }];
    render(<Placement skinId="aqua" fleet={fleet} onChange={onChange} onReady={vi.fn()} waiting={false} />);
    fireEvent.click(screen.getByTestId('rotate-carrier'));
    const next = onChange.mock.calls[0][0] as Fleet;
    // Board is 10 tall; a size-5 vertical ship must anchor at row 5 to fit.
    expect(next.find((p) => p.shipId === 'carrier')).toMatchObject({
      orientation: 'V',
      row: 5,
      col: 2,
    });
  });

  it('ignores a tap that would run the ship off the board', () => {
    const onChange = vi.fn();
    render(<Placement skinId="aqua" fleet={[]} onChange={onChange} onReady={vi.fn()} waiting={false} />);
    // Carrier (size 5) is selected first; horizontal from column 8 runs off-board.
    fireEvent.click(screen.getByTestId('cell-own-0-8'));
    expect(onChange).not.toHaveBeenCalled();
  });

  // Drag repositioning hit-tests against the grid cells' GEOMETRY (so the 2px
  // gaps between cells can't flash the preview red). jsdom's
  // getBoundingClientRect returns zeros, so we stub a 10px-pitch grid: cell
  // (row, col) occupies x ∈ [col*10, col*10+10), y ∈ [row*10, row*10+10).
  const CELL = 10;
  function stubGridLayout() {
    const spy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const r = this.getAttribute('data-row');
        const c = this.getAttribute('data-col');
        const row = r === null ? 0 : Number(r);
        const col = c === null ? 0 : Number(c);
        const left = col * CELL;
        const top = row * CELL;
        return {
          left, top, width: CELL, height: CELL,
          right: left + CELL, bottom: top + CELL,
          x: left, y: top, toJSON: () => ({}),
        } as DOMRect;
      });
    return () => spy.mockRestore();
  }

  // jsdom lacks PointerEvent (and drops clientX from it), but a MouseEvent with
  // a pointer* type both triggers React's onPointerDown and carries clientX.
  const pointer = (type: string, clientX = 0, clientY = 0) =>
    new MouseEvent(type, { clientX, clientY, bubbles: true });

  it('commits a drag that drops a ship on a legal cell', () => {
    const onChange = vi.fn();
    const fleet: Fleet = [{ shipId: 'destroyer', row: 0, col: 0, orientation: 'H' }];
    render(<Placement skinId="aqua" fleet={fleet} onChange={onChange} onReady={vi.fn()} waiting={false} />);
    const restore = stubGridLayout();

    // Grab the destroyer near its bow, drag to the middle of cell C3 (2,2).
    fireEvent(screen.getByTestId('ship-overlay-destroyer'), pointer('pointerdown', 2, 5));
    fireEvent(window, pointer('pointermove', 25, 25));
    fireEvent(window, pointer('pointerup'));
    restore();

    const next = onChange.mock.calls.at(-1)?.[0] as Fleet;
    expect(next).toContainEqual({ shipId: 'destroyer', row: 2, col: 2, orientation: 'H' });
  });

  it('does not commit a drag that ends on an illegal cell', () => {
    const onChange = vi.fn();
    const fleet: Fleet = [
      { shipId: 'carrier', row: 0, col: 0, orientation: 'H' }, // occupies A1–E1
      { shipId: 'destroyer', row: 5, col: 0, orientation: 'H' },
    ];
    render(<Placement skinId="aqua" fleet={fleet} onChange={onChange} onReady={vi.fn()} waiting={false} />);
    const restore = stubGridLayout();

    // Drop the destroyer onto the carrier at (0,0) — an illegal overlap.
    fireEvent(screen.getByTestId('ship-overlay-destroyer'), pointer('pointerdown', 2, 5));
    fireEvent(window, pointer('pointermove', 5, 5));
    fireEvent(window, pointer('pointerup'));
    restore();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('crossing a cell line mid-drag keeps the preview on-board (no red flash)', () => {
    const onChange = vi.fn();
    const fleet: Fleet = [{ shipId: 'destroyer', row: 0, col: 0, orientation: 'H' }];
    render(<Placement skinId="aqua" fleet={fleet} onChange={onChange} onReady={vi.fn()} waiting={false} />);
    const restore = stubGridLayout();

    fireEvent(screen.getByTestId('ship-overlay-destroyer'), pointer('pointerdown', 2, 5));
    // Exactly on the boundary line between cells (x = 30 is the 2|3 edge):
    // the old elementFromPoint hit-test fell into the gap here and flagged
    // the drag off-board. Geometry maps it to a cell, so the drop commits.
    fireEvent(window, pointer('pointermove', 30, 20));
    fireEvent(window, pointer('pointerup'));
    restore();

    const next = onChange.mock.calls.at(-1)?.[0] as Fleet;
    expect(next).toContainEqual({ shipId: 'destroyer', row: 2, col: 3, orientation: 'H' });
  });

  it('places a ship dragged in from its sidebar chip onto the board', () => {
    const onChange = vi.fn();
    render(<Placement skinId="aqua" fleet={[]} onChange={onChange} onReady={vi.fn()} waiting={false} />);
    const restore = stubGridLayout();

    // Carrier is the first (selected) ship; drag its chip to cell (3,4).
    fireEvent(screen.getByTestId('ship-chip-carrier'), pointer('pointerdown', 5, 5));
    fireEvent(window, pointer('pointermove', 45, 35));
    fireEvent(window, pointer('pointerup'));
    restore();

    const next = onChange.mock.calls.at(-1)?.[0] as Fleet;
    expect(next).toContainEqual({ shipId: 'carrier', row: 3, col: 4, orientation: 'H' });
  });

  it('does not place a sidebar-dragged ship dropped off the board', () => {
    const onChange = vi.fn();
    render(<Placement skinId="aqua" fleet={[]} onChange={onChange} onReady={vi.fn()} waiting={false} />);
    const restore = stubGridLayout();
    fireEvent(screen.getByTestId('ship-chip-carrier'), pointer('pointerdown', 5, 5));
    fireEvent(window, pointer('pointermove', 500, 500)); // far outside the 100px grid
    fireEvent(window, pointer('pointerup'));
    restore();

    expect(onChange).not.toHaveBeenCalled();
  });
});
