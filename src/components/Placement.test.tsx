import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Placement } from './Placement';
import { autoPlace, isFleetComplete } from '../game/board';
import { seededRng } from '../test/helpers';
import type { Fleet } from '../game/types';

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

  it('ignores a tap that would run the ship off the board', () => {
    const onChange = vi.fn();
    render(<Placement skinId="aqua" fleet={[]} onChange={onChange} onReady={vi.fn()} waiting={false} />);
    // Carrier (size 5) is selected first; horizontal from column 8 runs off-board.
    fireEvent.click(screen.getByTestId('cell-own-0-8'));
    expect(onChange).not.toHaveBeenCalled();
  });

  // Drag repositioning leans on layout APIs jsdom doesn't implement
  // (getBoundingClientRect returns zeros, elementFromPoint returns null), so we
  // stub them to drive the pointer lifecycle deterministically.
  function stubDragLayout(targetTestId: string) {
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ left: 0, top: 0, width: 40, height: 20, right: 40, bottom: 20, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    // jsdom has no elementFromPoint at all, so assign rather than spy.
    const target = screen.getByTestId(targetTestId);
    (document as unknown as { elementFromPoint: (x: number, y: number) => Element | null }).elementFromPoint = () =>
      target as unknown as Element;
    return () => {
      rect.mockRestore();
      delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
    };
  }

  // jsdom lacks PointerEvent (and drops clientX from it), but a MouseEvent with
  // a pointer* type both triggers React's onPointerDown and carries clientX.
  const pointer = (type: string, clientX = 0, clientY = 0) =>
    new MouseEvent(type, { clientX, clientY, bubbles: true });

  it('commits a drag that drops a ship on a legal cell', () => {
    const onChange = vi.fn();
    const fleet: Fleet = [{ shipId: 'destroyer', row: 0, col: 0, orientation: 'H' }];
    render(<Placement skinId="aqua" fleet={fleet} onChange={onChange} onReady={vi.fn()} waiting={false} />);
    const restore = stubDragLayout('cell-own-2-2'); // drop target C3

    fireEvent(screen.getByTestId('ship-overlay-destroyer'), pointer('pointerdown', 5, 5));
    fireEvent(window, pointer('pointermove', 90, 45));
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
    // Drop the destroyer onto the carrier — an illegal overlap.
    const restore = stubDragLayout('cell-own-0-0');

    fireEvent(screen.getByTestId('ship-overlay-destroyer'), pointer('pointerdown', 5, 5));
    fireEvent(window, pointer('pointermove', 0, 5));
    fireEvent(window, pointer('pointerup'));
    restore();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('places a ship dragged in from its sidebar chip onto the board', () => {
    const onChange = vi.fn();
    render(<Placement skinId="aqua" fleet={[]} onChange={onChange} onReady={vi.fn()} waiting={false} />);
    const restore = stubDragLayout('cell-own-3-4'); // drop target E4

    // Carrier is the first (selected) ship; drag its chip onto the board.
    fireEvent(screen.getByTestId('ship-chip-carrier'), pointer('pointerdown', 5, 5));
    fireEvent(window, pointer('pointermove', 20, 20));
    fireEvent(window, pointer('pointerup'));
    restore();

    const next = onChange.mock.calls.at(-1)?.[0] as Fleet;
    expect(next).toContainEqual({ shipId: 'carrier', row: 3, col: 4, orientation: 'H' });
  });

  it('does not place a sidebar-dragged ship dropped off the board', () => {
    const onChange = vi.fn();
    render(<Placement skinId="aqua" fleet={[]} onChange={onChange} onReady={vi.fn()} waiting={false} />);
    // No elementFromPoint stub → the pointer is never "over" a cell.
    (document as unknown as { elementFromPoint: () => Element | null }).elementFromPoint = () => null;
    fireEvent(screen.getByTestId('ship-chip-carrier'), pointer('pointerdown', 5, 5));
    fireEvent(window, pointer('pointermove', 500, 500));
    fireEvent(window, pointer('pointerup'));
    delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;

    expect(onChange).not.toHaveBeenCalled();
  });
});
