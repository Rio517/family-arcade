/**
 * The move-log popup: the full game in algebraic notation, a preview board for
 * any move you tap, and — in a same-device game — a "return to this move" jump.
 * Also exports the small captured-piece tray used beside the board.
 */
import { useEffect, useState } from 'react';
import { ChessPiece } from './chessPieces';
import { CloseIcon } from '@shared/ui/icons';
import { useDismissOnEscape } from '@shared/ui/useDismissOnEscape';
import { initialState } from '@games/chess/domain/rules';
import type { MoveInfo } from '@games/chess/domain/analysis';
import type { Color, GameState, PieceType } from '@games/chess/domain/types';

/** A non-interactive board, used for the log's position preview. */
export function MiniBoard({ state, orientation = 'w' }: { state: GameState; orientation?: Color }) {
  const order = orientation === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  return (
    <div className="mini-board" role="img" aria-label="Board position">
      {order.map((r) =>
        order.map((c) => {
          const piece = state.board[r][c];
          const dark = (r + c) % 2 === 1;
          return (
            <div key={`${r}-${c}`} className={`msq ${dark ? 'dark' : 'light'}`}>
              {piece && <ChessPiece color={piece.color} type={piece.type} size={30} />}
            </div>
          );
        }),
      )}
    </div>
  );
}

/** A row of captured pieces (already the captured side's colour). */
export function CapturedTray({ pieces, color, lead }: { pieces: PieceType[]; color: Color; lead: number }) {
  return (
    <span className="cap-tray">
      {pieces.length === 0 && <span className="cap-none">no captures yet</span>}
      {pieces.map((t, i) => (
        <ChessPiece key={i} color={color} type={t} size={17} />
      ))}
      {lead > 0 && <span className="cap-lead">+{lead}</span>}
    </span>
  );
}

interface LogModalProps {
  moves: MoveInfo[];
  /** Custom starting position (a free-play game); standard opening if absent. */
  start?: GameState;
  orientation: Color;
  /** Same-device games can jump back; online games are read-only. */
  canReturn: boolean;
  onReturn: (plies: number) => void;
  onClose: () => void;
}

export function ChessLogModal({ moves, start, orientation, canReturn, onReturn, onClose }: LogModalProps) {
  const [sel, setSel] = useState(moves.length - 1);
  useEffect(() => setSel(moves.length - 1), [moves.length]);
  useDismissOnEscape(true, onClose);

  const preview = sel >= 0 && moves[sel] ? moves[sel].after : start ?? initialState();

  // Pair plies into numbered full-moves (White then Black).
  const rows: { no: number; w: number; b: number }[] = [];
  for (let i = 0; i < moves.length; i += 2) rows.push({ no: i / 2 + 1, w: i, b: i + 1 < moves.length ? i + 1 : -1 });

  const cell = (idx: number) =>
    idx < 0 ? (
      <span className="log-move empty" aria-hidden="true" />
    ) : (
      <button
        type="button"
        className={`log-move ${sel === idx ? 'on' : ''}`}
        onClick={() => setSel(idx)}
        data-testid={`log-ply-${idx}`}
      >
        <ChessPiece color={moves[idx].color} type={moves[idx].piece} size={15} />
        {moves[idx].san}
      </button>
    );

  return (
    /* Backdrop click is a mouse convenience; Escape (below) and the Close
       button are the keyboard path. */
    /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal chess-log-modal" role="dialog" aria-label="Move log">
        <div className="modal-head">
          <span className="modal-title">Move log</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="chess-log-body">
          <div className="chess-log-list" data-testid="chess-log-list">
            {moves.length === 0 && <p className="log-empty">No moves yet — the game is at the opening position.</p>}
            {rows.map((row) => (
              <div key={row.no} className="log-row">
                <span className="log-no">{row.no}.</span>
                {cell(row.w)}
                {cell(row.b)}
              </div>
            ))}
          </div>

          <div className="chess-log-preview">
            <MiniBoard state={preview} orientation={orientation} />
            <div className="log-caption">
              {sel >= 0 && moves[sel]
                ? `Position after ${moves[sel].color === 'w' ? `${sel / 2 + 1}.` : `${(sel - 1) / 2 + 1}…`} ${moves[sel].san}`
                : 'Starting position'}
            </div>
            {canReturn && moves.length > 0 && (
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={() => onReturn(sel + 1)}
                data-testid="chess-log-return"
              >
                ↩ Return to this move
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
