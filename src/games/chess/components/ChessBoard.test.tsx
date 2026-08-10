import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { StrictMode, useState } from 'react';
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

  // ── Real pointer sequences ────────────────────────────────────────────
  // A real tap or drag is pointerdown → pointerup → (sometimes) click; the
  // click-only tests above never exercise that path. These do. Drops are
  // hit-tested by board geometry, so the suite stubs one rect for the grid
  // (800×800 at the origin — 100px squares, display coords) and drives the
  // pointer in those coordinates: square centre = (col·100+50, row·100+50).

  describe('pointer sequences', () => {
    const originalElementFromPoint = document.elementFromPoint;

    beforeEach(() => {
      // jsdom has no layout: give the board a real rect and all else zeros.
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        const size = this.getAttribute?.('data-testid') === 'chess-board' ? 800 : 0;
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

    /** ChessBoard as ChessPage hosts it: onMove updates parent state. */
    function Harness({ onPly }: { onPly: (ply: unknown) => void }) {
      const [, setMoves] = useState(0);
      return (
        <ChessBoard
          board={initialState()}
          orientation="w"
          interactive
          movableColor="w"
          onMove={(ply) => {
            onPly(ply);
            setMoves((n) => n + 1);
          }}
        />
      );
    }

    it('drag-to-move commits exactly once, with no render-phase update of the parent', () => {
      const errSpy = vi.spyOn(console, 'error');
      const onPly = vi.fn();
      // StrictMode, like the real app shell: double-invoked updaters and
      // re-mounted effects must not double the emitted move.
      render(<StrictMode><Harness onPly={onPly} /></StrictMode>);

      fireEvent.pointerDown(screen.getByTestId('sq-e2'), { clientX: 450, clientY: 650 });
      // Move and release land in one batch, as a fast browser drag does —
      // this is what pushes the setDrag updater into the render phase.
      act(() => {
        windowPointer('pointermove', 450, 450);
        windowPointer('pointerup', 450, 450);
      });

      expect(onPly).toHaveBeenCalledTimes(1);
      expect(onPly).toHaveBeenCalledWith({ from: { row: 6, col: 4 }, to: { row: 4, col: 4 } });
      const renderPhaseWarnings = errSpy.mock.calls.filter((args) =>
        args.some((a) => typeof a === 'string' && a.includes('Cannot update a component')),
      );
      expect(renderPhaseWarnings).toEqual([]);
    });

    it('duplicate pointerups emit the move exactly once (event-sourced log must never double)', () => {
      const onPly = vi.fn();
      render(<StrictMode><Harness onPly={onPly} /></StrictMode>);

      fireEvent.pointerDown(screen.getByTestId('sq-e2'), { clientX: 450, clientY: 650 });
      // A two-finger lift can deliver two pointerups in one batch, before
      // React has re-rendered and detached the drag listeners.
      act(() => {
        windowPointer('pointermove', 450, 450);
        windowPointer('pointerup', 450, 450);
        windowPointer('pointerup', 450, 450);
      });

      expect(onPly).toHaveBeenCalledTimes(1);
    });

    it('a pointercancel abandons the drag without committing', () => {
      const onPly = vi.fn();
      render(<Harness onPly={onPly} />);

      fireEvent.pointerDown(screen.getByTestId('sq-e2'), { clientX: 450, clientY: 650 });
      act(() => {
        windowPointer('pointermove', 450, 450);
        window.dispatchEvent(new ((window.PointerEvent ?? window.MouseEvent) as typeof MouseEvent)('pointercancel', { bubbles: true }));
      });

      expect(onPly).not.toHaveBeenCalled();
      // The ghost is gone: no square is marked as being dragged from.
      expect(document.querySelector('.chess-drag')).toBeNull();
    });

    it('a drop lands even when another element covers the board (geometry, not stacking)', () => {
      const onPly = vi.fn();
      render(<Harness onPly={onPly} />);
      // The board's rect is known even in jsdom via the suite's rect stub;
      // meanwhile elementFromPoint sees only an overlay riding above the
      // board — the floating video call card during online play.
      const overlay = document.createElement('div');
      overlay.className = 'pv';
      document.body.appendChild(overlay);
      document.elementFromPoint = () => overlay;

      fireEvent.pointerDown(screen.getByTestId('sq-e2'), { clientX: 450, clientY: 650 });
      act(() => {
        windowPointer('pointermove', 450, 450);
        windowPointer('pointerup', 450, 450);
      });
      overlay.remove();

      expect(onPly).toHaveBeenCalledWith({ from: { row: 6, col: 4 }, to: { row: 4, col: 4 } });
    });

    it('a tap keeps the piece selected even when the browser delivers the trailing click', () => {
      render(
        <ChessBoard board={initialState()} orientation="w" interactive movableColor="w" onMove={vi.fn()} />,
      );

      // Tap = pointerdown and pointerup on the same square, then the native
      // click on it (Chrome suppresses that click; Safari delivers it).
      fireEvent.pointerDown(screen.getByTestId('sq-e2'), { clientX: 450, clientY: 650 });
      act(() => {
        windowPointer('pointerup', 450, 650);
      });
      fireEvent.click(screen.getByTestId('sq-e2'));

      expect(screen.getByTestId('sq-e4').className).toMatch(/target/);
    });

    it('drops map through the orientation when Black sits at the bottom', () => {
      const onMove = vi.fn();
      render(
        <ChessBoard board={{ ...initialState(), turn: 'b' }} orientation="b" interactive movableColor="b" onMove={onMove} />,
      );

      // Viewed from Black's side, d7 renders at display (row 6, col 4) and
      // d5 at display (row 4, col 4) — same screen path as White's e-pawn.
      fireEvent.pointerDown(screen.getByTestId('sq-d7'), { clientX: 450, clientY: 650 });
      act(() => {
        windowPointer('pointermove', 450, 450);
        windowPointer('pointerup', 450, 450);
      });

      expect(onMove).toHaveBeenCalledWith({ from: { row: 1, col: 3 }, to: { row: 3, col: 3 } });
    });

    it('two plain clicks still toggle the selection off (keyboard path)', () => {
      render(
        <ChessBoard board={initialState()} orientation="w" interactive movableColor="w" onMove={vi.fn()} />,
      );
      fireEvent.click(screen.getByTestId('sq-e2'));
      expect(screen.getByTestId('sq-e4').className).toMatch(/target/);
      fireEvent.click(screen.getByTestId('sq-e2'));
      expect(screen.getByTestId('sq-e4').className).not.toMatch(/target/);
    });
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
