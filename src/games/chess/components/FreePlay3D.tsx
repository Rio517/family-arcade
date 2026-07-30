/**
 * The 3D face of Free play — the same three.js scene as the game board, minus
 * rules: taps come straight back to the sandbox, and the lifted piece's square
 * wears the selection ring. Lazy-loaded, like Chess3D.
 */
import { useEffect, useRef, useState } from 'react';
import { ChessScene } from './three/ChessScene';
import { SCENE_PALETTES, useChessTheme } from './chessTheme';
import type { Board, Square } from '@games/chess/domain/types';

interface Props {
  board: Board;
  /** The square whose piece is currently "in hand", if any. */
  lifted: Square | null;
  onTap: (sq: Square) => void;
}

export default function FreePlay3D({ board, lifted, onTap }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const { theme } = useChessTheme();
  const sceneRef = useRef<ChessScene | null>(null);
  const [failed, setFailed] = useState(false);
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;
  const boardRef = useRef(board);
  boardRef.current = board;

  useEffect(() => {
    if (!holder.current) return;
    let scene: ChessScene | null = null;
    try {
      scene = new ChessScene(holder.current, {
        orientation: 'w',
        palette: SCENE_PALETTES[theme],
        reducedMotion:
          typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
        onTap: (sq) => onTapRef.current(sq),
      });
      sceneRef.current = scene;
      // A theme switch rebuilds the scene — repopulate it right away.
      scene.setPosition(boardRef.current, null);
    } catch {
      setFailed(true);
    }
    return () => {
      scene?.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  useEffect(() => {
    sceneRef.current?.setPosition(board, null);
  }, [board]);

  useEffect(() => {
    sceneRef.current?.setMarks({ selected: lifted, targets: [], lastMove: null, checkSq: null });
  }, [lifted]);

  if (failed) {
    return (
      <p className="subtle center chess3d-fallback" data-testid="fp3d-fallback">
        3D isn’t supported on this device — switch back to 2D.
      </p>
    );
  }

  return (
    <div className="chess3d fp-3d">
      <div className="chess3d-canvas" ref={holder} data-testid="fp-3d" />
      <p className="chess3d-hint subtle center">Drag to orbit · pinch or scroll to zoom</p>
    </div>
  );
}
