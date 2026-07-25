import { useState } from 'react';
import { VictoryFX } from '@shared/ui/VictoryFX';
import { BrokenShipIcon, ScalesIcon, TrophyIcon } from '@shared/ui/icons';
import type { Mode } from '@games/chess/domain/session';
import type { Color, Status } from '@games/chess/domain/types';

interface ChessResultProps {
  status: Status;
  winner: Color | null;
  mode: Mode;
  /** Online: did I win? null in local mode or on a draw. */
  iWon: boolean | null;
  myName: string;
  oppName: string;
  /** Online only. */
  pointsEarned: number;
  totalPoints: number;
  iWantRematch: boolean;
  oppWantsRematch: boolean;
  onRematch: () => void;
  onExit: () => void;
}

const REASON: Record<Status, string> = {
  playing: '',
  check: '',
  checkmate: 'Checkmate',
  stalemate: 'Stalemate — no legal moves left',
  'draw-fifty': 'Draw — fifty moves without a capture or pawn move',
  'draw-material': 'Draw — not enough material to mate',
};

const colorName = (c: Color) => (c === 'w' ? 'White' : 'Black');

export function ChessResult(props: ChessResultProps) {
  const { status, winner, mode, iWon, myName, oppName, pointsEarned, totalPoints } = props;
  const isDraw = winner === null;

  // Pick emblem + headline for the three cases: draw, online (me), local (colour).
  let emblem: 'win' | 'loss' | 'draw';
  let headline: string;
  let flavor: string;
  if (isDraw) {
    emblem = 'draw';
    headline = 'Draw';
    flavor = REASON[status] || 'An even match.';
  } else if (mode === 'online') {
    emblem = iWon ? 'win' : 'loss';
    headline = iWon ? 'You Win!' : 'Good Game!';
    flavor = iWon
      ? `Checkmate — well played, ${myName || 'Captain'}!`
      : `${oppName || 'Your opponent'} found the mate this time. Rematch?`;
  } else {
    // Local hotseat: celebrate the winning colour.
    emblem = 'win';
    headline = `${colorName(winner)} Wins!`;
    flavor = `${colorName(winner)} delivered checkmate. Good game!`;
  }

  const [reveal] = useState(true); // stable; the reveal is CSS-driven
  const showConfetti = emblem === 'win';
  const EmblemIcon = emblem === 'win' ? TrophyIcon : emblem === 'loss' ? BrokenShipIcon : ScalesIcon;

  return (
    <div className="stack">
      <div className={`panel result-panel ${emblem === 'win' ? 'won' : emblem === 'loss' ? 'lost' : 'drawn'}`}>
        {showConfetti && <VictoryFX />}
        <div className="result-hero">
          <div className={`result-emblem ${emblem}`} aria-hidden="true">
            <EmblemIcon size={78} />
          </div>
          <div className={`big ${reveal ? 'reveal' : ''} ${emblem === 'win' ? 'win' : 'loss'}`}>{headline}</div>
          <p className="result-flavor reveal">{flavor}</p>
          {mode === 'online' && !isDraw && (
            <>
              <div className="earned reveal">
                +{pointsEarned} points{iWon ? '!' : ' for a good game'}
              </div>
              <div className="subtle reveal" style={{ marginTop: 6 }}>
                You now have {totalPoints} points.
              </div>
            </>
          )}
        </div>
      </div>

      <div className="panel stack">
        {props.oppWantsRematch && !props.iWantRematch && mode === 'online' && (
          <p className="subtle center">{oppName || 'Your opponent'} wants a rematch!</p>
        )}
        {props.iWantRematch && !props.oppWantsRematch && mode === 'online' && (
          <p className="subtle center">Waiting for {oppName || 'your opponent'} to jump back in…</p>
        )}
        <button
          className="btn btn-primary btn-lg btn-block"
          onClick={props.onRematch}
          disabled={mode === 'online' && props.iWantRematch}
          data-testid="chess-rematch"
        >
          {mode === 'online' && props.iWantRematch ? 'Rematch requested' : 'Play again'}
        </button>
        <button className="btn btn-block" onClick={props.onExit} data-testid="chess-exit">
          ← Back to menu
        </button>
      </div>
    </div>
  );
}
