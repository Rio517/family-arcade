import { useEffect, useRef, useState, type PointerEvent } from 'react';
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
  const [drag, setDrag] = useState<{ from: Square; x: number; y: number; over: Square | null } | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Clear any in-progress selection when the position or turn changes.
  useEffect(() => {
    setSelected(null);
    setDrag(null);
    setPromotion(null);
  }, [board]);

  const legal = selected ? legalMovesFrom(board, selected) : [];
  const targets = legal.map((m) => m.to);
  const isTarget = (sq: Square) => targets.some((t) => sameSquare(t, sq));

  const checkedKing =
    inCheck(board, board.turn) ? findKing(board.board, board.turn) : null;

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
    if (canPickUp(sq)) {
      setSelected((cur) => (cur && sameSquare(cur, sq) ? null : sq));
    } else {
      setSelected(null);
    }
  };

  // ── Pointer drag ───────────────────────────────────────────────────────
  const squareFromPoint = (clientX: number, clientY: number): Square | null => {
    const el = gridRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return null;
    const c = Math.floor(((clientX - rect.left) / rect.width) * 8);
    const r = Math.floor(((clientY - rect.top) / rect.height) * 8);
    if (r < 0 || r > 7 || c < 0 || c > 7) return null;
    return fromDisplay(r, c, orientation);
  };

  const onPiecePointerDown = (sq: Square, e: PointerEvent) => {
    if (!canPickUp(sq)) return;
    e.preventDefault();
    setSelected(sq);
    setDrag({ from: sq, x: e.clientX, y: e.clientY, over: sq });
  };

  useEffect(() => {
    if (!drag) return;
    const onMoveEvt = (e: globalThis.PointerEvent) => {
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY, over: squareFromPoint(e.clientX, e.clientY) } : d));
    };
    const onUp = (e: globalThis.PointerEvent) => {
      const to = squareFromPoint(e.clientX, e.clientY);
      setDrag((d) => {
        if (d && to && isTarget(to)) commit(d.from, to);
        return null;
      });
    };
    window.addEventListener('pointermove', onMoveEvt);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMoveEvt);
      window.removeEventListener('pointerup', onUp);
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
                {piece && !dragging && <ChessPiece color={piece.color} type={piece.type} />}
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
