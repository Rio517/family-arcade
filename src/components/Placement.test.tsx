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

  it('ignores a tap that would run the ship off the board', () => {
    const onChange = vi.fn();
    render(<Placement skinId="aqua" fleet={[]} onChange={onChange} onReady={vi.fn()} waiting={false} />);
    // Carrier (size 5) is selected first; horizontal from column 8 runs off-board.
    fireEvent.click(screen.getByTestId('cell-own-0-8'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
