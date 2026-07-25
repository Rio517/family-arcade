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

  it('places the selected ship where you tap an empty cell', () => {
    const onChange = vi.fn();
    render(<Placement skinId="aqua" fleet={[]} onChange={onChange} onReady={vi.fn()} waiting={false} />);
    // Carrier is selected first by default; tap A1.
    fireEvent.click(screen.getByTestId('cell-own-0-0'));
    const fleet = onChange.mock.calls[0][0] as Fleet;
    expect(fleet).toHaveLength(1);
    expect(fleet[0]).toMatchObject({ shipId: 'carrier', row: 0, col: 0, orientation: 'H' });
  });
});
