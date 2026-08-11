import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { FreePlay } from './FreePlay';

// The sandbox's drag path had no coverage at all — every existing test taps.
// Drops are hit-tested by board geometry (same technique as ChessBoard), so
// the suite stubs one 800×800 rect for the fp-board (100px squares) and
// drives the pointer in display coordinates.
describe('<FreePlay> drag', () => {
  const originalElementFromPoint = document.elementFromPoint;

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const size = this.getAttribute?.('data-testid') === 'fp-board' ? 800 : 0;
      return {
        x: 0, y: 0, left: 0, top: 0, right: size, bottom: size,
        width: size, height: size, toJSON: () => ({}),
      } as DOMRect;
    });
  });

  afterEach(() => {
    document.elementFromPoint = originalElementFromPoint;
    vi.restoreAllMocks();
  });

  function windowPointer(type: 'pointermove' | 'pointerup', x: number, y: number) {
    const Ctor = (window.PointerEvent ?? window.MouseEvent) as typeof MouseEvent;
    window.dispatchEvent(new Ctor(type, { clientX: x, clientY: y, bubbles: true }));
  }

  it('drags a tray piece onto the board even when another element covers it', () => {
    render(<FreePlay onExit={vi.fn()} onStartGame={vi.fn()} />);
    // Whatever is stacked above the board (the floating video card during a
    // call) must not eat the drop — geometry, not element stacking.
    const overlay = document.createElement('div');
    document.body.appendChild(overlay);
    document.elementFromPoint = () => overlay;

    fireEvent.pointerDown(screen.getByTestId('fp-tray-w-q'), { clientX: 900, clientY: 400 });
    act(() => {
      windowPointer('pointermove', 450, 350);
      windowPointer('pointerup', 450, 350);
    });
    overlay.remove();

    // e5 = display col 4, row 3 with 100px squares.
    expect(screen.getByTestId('fp-sq-e5').querySelector('svg')).toBeTruthy();
  });
});

describe('<FreePlay> stamp toggle', () => {
  it('with a tray piece in hand, tapping an identical piece removes it', () => {
    render(<FreePlay onExit={vi.fn()} onStartGame={vi.fn()} />);

    // Pick up a white queen from the tray (the stamp) and place one on e5.
    fireEvent.click(screen.getByTestId('fp-tray-w-q'));
    fireEvent.click(screen.getByTestId('fp-sq-e5'));
    expect(screen.getByTestId('fp-sq-e5').querySelector('svg')).toBeTruthy();

    // Tapping the same square again removes it — before, the tap re-placed
    // the identical piece and looked like it did nothing.
    fireEvent.click(screen.getByTestId('fp-sq-e5'));
    expect(screen.getByTestId('fp-sq-e5').querySelector('svg')).toBeNull();

    // The stamp is still in hand: a third tap places again.
    fireEvent.click(screen.getByTestId('fp-sq-e5'));
    expect(screen.getByTestId('fp-sq-e5').querySelector('svg')).toBeTruthy();

    // A DIFFERENT piece is replaced, not removed — the stamp paints over it.
    fireEvent.click(screen.getByTestId('fp-tray-b-n'));
    fireEvent.click(screen.getByTestId('fp-sq-e5'));
    expect(screen.getByTestId('fp-sq-e5').querySelector('svg')).toBeTruthy();
  });
});
