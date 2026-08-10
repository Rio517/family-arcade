import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useDismissOnEscape } from '@shared/ui/useDismissOnEscape';
import { ChessPiece } from './chessPieces';
import { findKing, inCheck, legalMovesFrom } from '@games/chess/domain/rules';
import {
  FILES,
  RANKS,
  sameSquare,
  type Color,
  type GameState,
  type Ply,
  type PromotionType,
  type Square,
} from '@games/chess/domain/types';

interface ChessBoardProps {
  board: GameState;
  /** Which colour sits at the bottom of the view. */
  orientation: Color;
  /** May the local player move right now? */
  interactive: boolean;
  /** Which colour the local player may pick up (local mode: side to move). */
  movableColor: Color;
  /** The most recent move, highlighted so both players can follow along. */
  lastMove?: { from: Square; to: Square } | null;
  onMove: (ply: Ply) => void;
}

/** Map an on-screen row/col back to a board square given the orientation. */
function fromDisplay(r: number, c: number, orientation: Color): Square {
  return orientation === 'w'
    ? { row: r, col: c }
    : { row: 7 - r, col: 7 - c };
}

/** Map a board square to its on-screen row/col given the orientation. */
function toDisplay(sq: Square, orientation: Color): { r: number; c: number } {
  return orientation === 'w'
    ? { r: sq.row, c: sq.col }
    : { r: 7 - sq.row, c: 7 - sq.col };
}

const PROMO_ORDER: PromotionType[] = ['q', 'r', 'b', 'n'];

export function ChessBoard({
  board,
  orientation,
  interactive,
  movableColor,
  lastMove,
  onMove,
}: ChessBoardProps) {
  const [selected, setSelected] = useState<Square | null>(null);
  const [drag, setDrag] = useState<{
    from: Square;
    pointerId: number;
    x: number;
    y: number;
    over: Square | null;
  } | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  useDismissOnEscape(promotion !== null, () => setPromotion(null));
  const gridRef = useRef<HTMLDivElement>(null);
  // The square a tap just selected via pointerdown. Some browsers still fire
  // the native click after a cancelled pointerdown; that click must not
  // toggle the fresh selection back off.
  const justPickedRef = useRef<Square | null>(null);

  // Clear any in-progress selection when the position or turn changes.
  useEffect(() => {
    setSelected(null);
    setDrag(null);
    setPromotion(null);
  }, [board]);

  const legal = selected ? legalMovesFrom(board, selected) : [];
  const targets = legal.map((m) => m.to);
  const isTarget = (sq: Square) => targets.some((t) => sameSquare(t, sq));

  // No check highlight in the king hunt — kings live dangerously there.
  const checkedKing =
    !board.kingHunt && inCheck(board, board.turn) ? findKing(board.board, board.turn) : null;

  const canPickUp = (sq: Square): boolean => {
    const p = board.board[sq.row][sq.col];
    return interactive && !!p && p.color === movableColor;
  };

  /** Commit a move, routing promotions through the picker first. */
  const commit = (from: Square, to: Square) => {
    const moves = legalMovesFrom(board, from).filter((m) => sameSquare(m.to, to));
    if (moves.length === 0) return;
    if (moves.some((m) => m.promotion)) {
      setPromotion({ from, to });
    } else {
      onMove({ from, to });
    }
    setSelected(null);
  };

  // ── Click-to-move ──────────────────────────────────────────────────────
  const handleClick = (sq: Square) => {
    if (promotion) return;
    if (selected && isTarget(sq)) {
      commit(selected, sq);
      return;
    }
    if (justPickedRef.current && sameSquare(justPickedRef.current, sq)) {
      justPickedRef.current = null;
      return; // trailing click of the tap that just selected this square
    }
    if (canPickUp(sq)) {
      setSelected((cur) => (cur && sameSquare(cur, sq) ? null : sq));
    } else {
      setSelected(null);
    }
  };

  // ── Pointer drag ───────────────────────────────────────────────────────
  // Hit-test by geometry: map the pointer into the grid's rect and divide
  // into the 8×8. elementFromPoint reports whatever is stacked on top (the
  // floating video card can ride over the board) and jsdom lacks it; the
  // rect math has neither problem. Assumes the board isn't CSS-rotated —
  // orientation flips by remapping squares, not by transforming the grid.
  const squareFromPoint = (clientX: number, clientY: number): Square | null => {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    const c = Math.floor(((clientX - rect.left) / rect.width) * 8);
    const r = Math.floor(((clientY - rect.top) / rect.height) * 8);
    if (r < 0 || r > 7 || c < 0 || c > 7) return null;
    return fromDisplay(r, c, orientation);
  };

  const onPiecePointerDown = (sq: Square, e: PointerEvent) => {
    if (!canPickUp(sq)) return;
    e.preventDefault();
    setSelected(sq);
    setDrag({ from: sq, pointerId: e.pointerId, x: e.clientX, y: e.clientY, over: sq });
  };

  useEffect(() => {
    if (!drag) return;
    const from = drag.from;
    const pointerId = drag.pointerId;
    // The listeners stay attached until React flushes and cleans up, so a
    // duplicate or foreign pointerup could otherwise commit a second time —
    // and a doubled onMove corrupts the event-sourced game log.
    let done = false;
    const onMoveEvt = (e: globalThis.PointerEvent) => {
      if (done || e.pointerId !== pointerId) return;
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY, over: squareFromPoint(e.clientX, e.clientY) } : d));
    };
    const onUp = (e: globalThis.PointerEvent) => {
      if (done || e.pointerId !== pointerId) return;
      done = true;
      // Commit here in the event handler, never inside the setDrag updater —
      // an updater runs during render, where updating the parent is illegal.
      const to = squareFromPoint(e.clientX, e.clientY);
      setDrag(null);
      if (to && isTarget(to)) {
        commit(from, to);
      } else if (to && sameSquare(to, from)) {
        // The tap ended where it started: remember the square briefly so the
        // browser's trailing click (if delivered) doesn't undo the selection.
        justPickedRef.current = from;
        window.setTimeout(() => {
          justPickedRef.current = null;
        }, 0);
      }
    };
    const onCancel = (e: globalThis.PointerEvent) => {
      if (done || e.pointerId !== pointerId) return;
      done = true;
      setDrag(null);
    };
    window.addEventListener('pointermove', onMoveEvt);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMoveEvt);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.from, selected]);

  // Display order: 8 rows × 8 cols in screen space.
  const rows = Array.from({ length: 8 }, (_, r) => r);
  const cols = Array.from({ length: 8 }, (_, c) => c);
  const fileLabels = orientation === 'w' ? FILES.split('') : FILES.split('').reverse();
  const rankLabels = orientation === 'w' ? RANKS.split('') : RANKS.split('').reverse();

  return (
    <div className={`chess-wrap orient-${orientation}`}>
      <div className="chess-ranks" aria-hidden="true">
        {rankLabels.map((r) => <span key={r}>{r}</span>)}
      </div>
      <div className="chess-board" ref={gridRef} data-testid="chess-board">
        {rows.map((r) =>
          cols.map((c) => {
            const sq = fromDisplay(r, c, orientation);
            const piece = board.board[sq.row][sq.col];
            const dark = (r + c) % 2 === 1;
            const sel = selected && sameSquare(selected, sq);
            const target = isTarget(sq);
            const last = lastMove && (sameSquare(lastMove.from, sq) || sameSquare(lastMove.to, sq));
            const check = checkedKing && sameSquare(checkedKing, sq);
            const dragging = drag && sameSquare(drag.from, sq);
            const classes = [
              'sq',
              dark ? 'dark' : 'light',
              sel ? 'sel' : '',
              last ? 'last' : '',
              check ? 'check' : '',
              target ? (piece ? 'capture' : 'target') : '',
            ].filter(Boolean).join(' ');
            // The last-moved piece slides in from its origin square via a
            // board-plane translate on the outer span.
            const slidIn = lastMove && sameSquare(lastMove.to, sq);
            const slideStyle =
              slidIn && lastMove
                ? (() => {
                    const f = toDisplay(lastMove.from, orientation);
                    const t = toDisplay(lastMove.to, orientation);
                    return {
                      ['--dx' as string]: `${(f.c - t.c) * 100}%`,
                      ['--dy' as string]: `${(f.r - t.r) * 100}%`,
                    };
                  })()
                : undefined;
            return (
              <button
                key={`${r}-${c}`}
                type="button"
                className={classes}
                data-testid={`sq-${FILES[sq.col]}${8 - sq.row}`}
                onClick={() => handleClick(sq)}
                onPointerDown={piece ? (e) => onPiecePointerDown(sq, e) : undefined}
                style={piece && canPickUp(sq) ? { touchAction: 'none' } : undefined}
              >
                {piece && !dragging && (
                  <span
                    className={`pslide ${slidIn ? 'slid' : ''}`}
                    style={slideStyle}
                    key={slidIn && lastMove ? `m-${lastMove.from.row}${lastMove.from.col}${lastMove.to.row}${lastMove.to.col}` : 'p'}
                  >
                    <span className="pstand">
                      <ChessPiece color={piece.color} type={piece.type} />
                    </span>
                  </span>
                )}
              </button>
            );
          }),
        )}
      </div>
      <div className="chess-files" aria-hidden="true">
        {fileLabels.map((f) => <span key={f}>{f}</span>)}
      </div>

      {/* The piece being dragged, following the pointer. */}
      {drag && (() => {
        const p = board.board[drag.from.row][drag.from.col];
        return p ? (
          <div className="chess-drag" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
            <ChessPiece color={p.color} type={p.type} size={52} />
          </div>
        ) : null;
      })()}

      {/* Promotion picker overlay. */}
      {promotion && (
        /* Backdrop click is a mouse convenience; Escape (above) and the
           picker's own buttons are the keyboard path. */
        /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
        <div className="promo-backdrop" onClick={() => setPromotion(null)}>
          <div className="promo" role="dialog" aria-label="Choose promotion">
            <div className="promo-title">Promote to</div>
            <div className="promo-row">
              {PROMO_ORDER.map((t) => (
                <button
                  key={t}
                  className="promo-btn"
                  data-testid={`promote-${t}`}
                  onClick={() => {
                    onMove({ from: promotion.from, to: promotion.to, promotion: t });
                    setPromotion(null);
                  }}
                >
                  <ChessPiece color={movableColor} type={t} size={40} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
