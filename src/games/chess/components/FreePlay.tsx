/**
 * Free play — a rules-free sandbox board. Piece trays sit beside the board;
 * drag (or tap) pieces onto any square, move them anywhere, drag them off to
 * remove. No turns, no legality — it's a toy chess set. Ends when the player
 * taps "End play"… or becomes a REAL game: "Start game" promotes whatever's
 * on the board into a full rules-bound hotseat match (each side needs its
 * king, and the game can't already be over — that's it).
 */
import { lazy, Suspense, useEffect, useState, type PointerEvent } from 'react';
import { ChessPiece, pieceName } from './chessPieces';
import { CHESS_THEMES, useChessTheme } from './chessTheme';
import { initialState, setupIssue } from '@games/chess/domain/rules';
import { FILES, RANKS, type Board, type Color, type Piece, type PieceType, type Square } from '@games/chess/domain/types';

// The 3D sandbox shares the game's three.js scene; loaded only when picked.
const FreePlay3D = lazy(() => import('./FreePlay3D'));

const TRAY_TYPES: PieceType[] = ['k', 'q', 'r', 'b', 'n', 'p'];

const emptyBoard = (): Board => Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));

/** What's currently "in hand": a fresh tray piece, or one lifted off the board. */
interface Hand {
  piece: Piece;
  from: Square | null;
}

interface FreePlayProps {
  onExit: () => void;
  /** Promote the current setup into a real rules-bound game. */
  onStartGame: (board: Board) => void;
}

export function FreePlay({ onExit, onStartGame }: FreePlayProps) {
  const { theme, setTheme } = useChessTheme();
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [hand, setHand] = useState<Hand | null>(null);
  const [drag, setDrag] = useState<{ hand: Hand; x: number; y: number } | null>(null);
  // Why the current setup can't start as a game — shown after a failed
  // "Start game" tap, cleared as soon as the board changes.
  const [startIssue, setStartIssue] = useState<string | null>(null);
  useEffect(() => setStartIssue(null), [board]);

  const tryStartGame = () => {
    const issue = setupIssue(board);
    if (issue) setStartIssue(issue);
    else onStartGame(board);
  };
  // 2D or 3D sandbox; follows the game's view if 3D was picked there.
  const [view, setView] = useState<'2d' | '3d'>(() => {
    try {
      const own = localStorage.getItem('chess-freeplay-view-v1');
      if (own === '2d' || own === '3d') return own;
      return localStorage.getItem('chess-view-v1') === '3d' ? '3d' : '2d';
    } catch { return '2d'; }
  });
  const pickView = (v: '2d' | '3d') => {
    setView(v);
    setDrag(null);
    try { localStorage.setItem('chess-freeplay-view-v1', v); } catch { /* ignore */ }
  };

  const setSquare = (sq: Square, p: Piece | null, prev: Board): Board => {
    const next = prev.map((row) => row.slice());
    next[sq.row][sq.col] = p;
    return next;
  };

  /** Drop whatever is held onto a square (or nowhere, removing it). */
  const drop = (h: Hand, target: Square | null) => {
    setBoard((prev) => {
      let next = prev;
      if (h.from) next = setSquare(h.from, null, next); // lift off its old square
      if (target) next = setSquare(target, h.piece, next); // off-board drop = removed
      return next;
    });
    // A tray piece stays in hand — it's a stamp: keep tapping squares to place
    // more (fill the board with queens!). A piece moved from the board is a
    // one-shot; dropping it empties the hand.
    setHand(h.from === null && target ? { piece: h.piece, from: null } : null);
  };

  // ── Tap flow: tap to pick up (tray or board), tap a square to put down ──
  const tapTray = (piece: Piece) => {
    setHand((h) => (h && !h.from && h.piece.color === piece.color && h.piece.type === piece.type ? null : { piece, from: null }));
  };
  const tapSquare = (sq: Square) => {
    if (hand) {
      drop(hand, sq);
      return;
    }
    const p = board[sq.row][sq.col];
    if (p) setHand({ piece: p, from: sq });
  };

  // ── Drag flow (transform-safe, same technique as the game board) ──
  const squareFromPoint = (x: number, y: number): Square | null => {
    const el = document.elementFromPoint?.(x, y);
    const btn = el?.closest?.('[data-testid^="fp-sq-"]');
    if (!btn) return null;
    const name = btn.getAttribute('data-testid')!.slice(6);
    const col = FILES.indexOf(name[0]);
    const row = RANKS.indexOf(name[1]);
    return col >= 0 && row >= 0 ? { row, col } : null;
  };
  const startDrag = (h: Hand, e: PointerEvent) => {
    e.preventDefault();
    setHand(null);
    setDrag({ hand: h, x: e.clientX, y: e.clientY });
  };
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: globalThis.PointerEvent) => setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    const onUp = (e: globalThis.PointerEvent) => {
      setDrag((d) => {
        if (d) drop(d.hand, squareFromPoint(e.clientX, e.clientY));
        return null;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);

  const rows = Array.from({ length: 8 }, (_, r) => r);

  const tray = (color: Color) => (
    <div className={`fp-tray ${color === 'w' ? 'white' : 'black'}`} data-testid={`fp-tray-${color}`}>
      {TRAY_TYPES.map((t) => {
        const held = hand && !hand.from && hand.piece.color === color && hand.piece.type === t;
        return (
          <button
            key={t}
            type="button"
            className={`fp-tray-piece ${held ? 'held' : ''}`}
            aria-label={`${color === 'w' ? 'White' : 'Black'} ${pieceName(t)}`}
            onClick={() => tapTray({ color, type: t })}
            onPointerDown={view === '2d' ? (e) => startDrag({ piece: { color, type: t }, from: null }, e) : undefined}
            style={{ touchAction: 'none' }}
            data-testid={`fp-tray-${color}-${t}`}
          >
            <ChessPiece color={color} type={t} size={34} />
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="freeplay">
      <div className="fp-row">
        {tray('b')}

        {view === '3d' ? (
          <Suspense fallback={<p className="subtle center">Setting up the 3D set…</p>}>
            <FreePlay3D board={board} lifted={hand?.from ?? null} onTap={tapSquare} />
          </Suspense>
        ) : (
        <div className="chess-wrap fp-wrap">
          <div className="chess-ranks" aria-hidden="true">{RANKS.split('').map((r) => <span key={r}>{r}</span>)}</div>
          <div className="chess-board" data-testid="fp-board">
            {rows.map((r) =>
              rows.map((c) => {
                const piece = board[r][c];
                const dark = (r + c) % 2 === 1;
                const lifted = hand?.from && hand.from.row === r && hand.from.col === c;
                return (
                  <button
                    key={`${r}-${c}`}
                    type="button"
                    className={`sq ${dark ? 'dark' : 'light'} ${lifted ? 'sel' : ''}`}
                    data-testid={`fp-sq-${FILES[c]}${8 - r}`}
                    onClick={() => tapSquare({ row: r, col: c })}
                    onPointerDown={piece ? (e) => startDrag({ piece, from: { row: r, col: c } }, e) : undefined}
                    style={piece ? { touchAction: 'none' } : undefined}
                  >
                    {piece && !lifted && (
                      <span className="pslide"><span className="pstand"><ChessPiece color={piece.color} type={piece.type} /></span></span>
                    )}
                  </button>
                );
              }),
            )}
          </div>
          <div className="chess-files" aria-hidden="true">{FILES.split('').map((f) => <span key={f}>{f}</span>)}</div>
        </div>
        )}

        {tray('w')}
      </div>

      <p className="subtle center fp-hint">
        {hand && !hand.from
          ? `Placing ${hand.piece.color === 'w' ? 'white' : 'black'} ${pieceName(hand.piece.type).toLowerCase()}s — keep tapping squares! Tap the tray piece again to stop.`
          : hand
            ? `Holding a ${hand.piece.color === 'w' ? 'white' : 'black'} ${pieceName(hand.piece.type).toLowerCase()} — tap any square to put it down.`
            : view === '3d'
              ? 'Tap a tray piece, then tap the board to place it. Tap a piece on the board to pick it up.'
              : 'Drag pieces from the trays onto the board. Drag a piece off the board to remove it.'}
      </p>

      <div className="fp-actions">
        <div className="chess-view-seg fp-view" role="group" aria-label="Sandbox view">
          <button className={`seg-btn ${view === '2d' ? 'on' : ''}`} onClick={() => pickView('2d')} data-testid="fp-view-2d">2D</button>
          <button className={`seg-btn ${view === '3d' ? 'on' : ''}`} onClick={() => pickView('3d')} data-testid="fp-view-3d">3D</button>
        </div>
        <div className="chess-view-seg fp-theme" role="group" aria-label="Set theme">
          {CHESS_THEMES.map((t) => (
            <button
              key={t.id}
              className={`seg-btn ${theme === t.id ? 'on' : ''}`}
              onClick={() => setTheme(t.id)}
              data-testid={`fp-theme-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {hand && (
          <button
            className="btn"
            onClick={() => (hand.from ? drop(hand, null) : setHand(null))}
            data-testid="fp-remove"
          >
            {hand.from ? '🗑 Remove piece' : 'Put back'}
          </button>
        )}
        <button className="btn" onClick={() => setBoard(initialState().board)} data-testid="fp-lineup">Starting lineup</button>
        <button className="btn" onClick={() => { setBoard(emptyBoard()); setHand(null); }} data-testid="fp-clear">Clear board</button>
        <button className="btn btn-primary" onClick={tryStartGame} data-testid="fp-start-game">▶ Start game</button>
        <button className="btn" onClick={onExit} data-testid="fp-end">End play →</button>
      </div>

      {startIssue && (
        <p className="fp-issue" role="alert" data-testid="fp-start-issue">{startIssue}</p>
      )}

      {/* The piece riding along under the finger while dragging. */}
      {drag && (
        <div className="chess-drag" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <ChessPiece color={drag.hand.piece.color} type={drag.hand.piece.type} size={52} />
        </div>
      )}
    </div>
  );
}
