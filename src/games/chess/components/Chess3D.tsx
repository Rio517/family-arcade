/**
 * Chess3D — the React face of the three.js board. Holds the same tap-to-move
 * selection logic as the 2D board (select your piece, tap a legal square,
 * promotion picker when needed) and feeds positions/marks to the ChessScene.
 * Lazy-loaded so three.js never weighs down the initial bundle.
 */
import { useEffect, useRef, useState } from 'react';
import { useDismissOnEscape } from '@shared/ui/useDismissOnEscape';
import { ChessScene } from './three/ChessScene';
import { ChessPiece } from './chessPieces';
import { SCENE_PALETTES, useChessTheme } from './chessTheme';
import { findKing, inCheck, legalMovesFrom } from '@games/chess/domain/rules';
import {
  sameSquare,
  type Color,
  type GameState,
  type Ply,
  type PromotionType,
  type Square,
} from '@games/chess/domain/types';

interface Chess3DProps {
  board: GameState;
  orientation: Color;
  interactive: boolean;
  movableColor: Color;
  lastMove?: { from: Square; to: Square } | null;
  onMove: (ply: Ply) => void;
}

const PROMO_ORDER: PromotionType[] = ['q', 'r', 'b', 'n'];

export default function Chess3D({ board, orientation, interactive, movableColor, lastMove, onMove }: Chess3DProps) {
  const holder = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ChessScene | null>(null);
  const { theme } = useChessTheme();
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  useDismissOnEscape(promotion !== null, () => setPromotion(null));

  // Latest-props ref so the scene's stable tap callback sees fresh state.
  const live = useRef({ board, interactive, movableColor, selected });
  live.current = { board, interactive, movableColor, selected };
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => {
    setSelected(null);
    setPromotion(null);
  }, [board]);

  // Mount the scene once.
  useEffect(() => {
    if (!holder.current) return;
    const reducedMotion =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let scene: ChessScene | null = null;
    try {
      scene = new ChessScene(holder.current, {
        orientation,
        reducedMotion,
        palette: SCENE_PALETTES[theme],
        onTap: (sq) => {
          const { board: b, interactive: canAct, movableColor: mc, selected: sel } = live.current;
          const piece = b.board[sq.row][sq.col];
          if (sel) {
            if (sameSquare(sel, sq)) return setSelected(null);
            const moves = legalMovesFrom(b, sel).filter((m) => sameSquare(m.to, sq));
            if (moves.length > 0) {
              if (moves.some((m) => m.promotion)) setPromotion({ from: sel, to: sq });
              else onMoveRef.current({ from: sel, to: sq });
              return setSelected(null);
            }
          }
          if (canAct && piece && piece.color === mc) setSelected((cur) => (cur && sameSquare(cur, sq) ? null : sq));
          else setSelected(null);
        },
      });
      sceneRef.current = scene;
      // A theme switch rebuilds the scene mid-game — repopulate it right away.
      scene.setPosition(live.current.board.board, null);
    } catch {
      setFailed(true); // no WebGL on this device — the 2D views still work
    }
    return () => {
      scene?.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orientation, theme]);

  // Position + marks follow the game state.
  useEffect(() => {
    sceneRef.current?.setPosition(board.board, lastMove ?? null);
  }, [board, lastMove]);

  useEffect(() => {
    const targets = selected && interactive ? legalMovesFrom(board, selected).map((m) => m.to) : [];
    // No check highlight in the king hunt — kings live dangerously there.
    const checkSq = !board.kingHunt && inCheck(board, board.turn) ? findKing(board.board, board.turn) : null;
    sceneRef.current?.setMarks({ selected, targets, lastMove: lastMove ?? null, checkSq });
  }, [board, selected, interactive, lastMove]);

  if (failed) {
    return (
      <p className="subtle center chess3d-fallback" data-testid="chess3d-fallback">
        3D isn’t supported on this device — try the Table or Flat view.
      </p>
    );
  }

  return (
    <div className="chess3d">
      <div className="chess3d-canvas" ref={holder} data-testid="chess3d" />
      <p className="chess3d-hint subtle center">Drag to orbit · pinch or scroll to zoom · tap a piece to move</p>

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
                  data-testid={`promote3d-${t}`}
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
