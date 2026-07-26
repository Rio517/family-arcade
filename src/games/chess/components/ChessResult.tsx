import { VictoryFX } from '@shared/ui/VictoryFX';
import { ScalesIcon } from '@shared/ui/icons';
import { ChessPiece } from './chessPieces';
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
  /** The names in play, so we can announce the winner by name. */
  whiteName: string;
  blackName: string;
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

/** The defeated king, toppled — the emblem when someone is checkmated. */
function FallenKing({ color }: { color: Color }) {
  return (
    <div className="fallen-king" aria-hidden="true">
      <span className="fk-shadow" />
      <span className="fk-piece">
        <ChessPiece color={color} type="k" size={128} />
      </span>
    </div>
  );
}

export function ChessResult(props: ChessResultProps) {
  const { status, winner, mode, iWon, myName, oppName, whiteName, blackName, pointsEarned, totalPoints } = props;
  const isDraw = winner === null;

  let emblem: 'win' | 'loss' | 'draw';
  let headline: string;
  let flavor: string;
  let loserColor: Color = 'b';

  if (isDraw) {
    emblem = 'draw';
    headline = 'A Draw';
    flavor = REASON[status] || 'An even match — honours shared.';
  } else {
    loserColor = winner === 'w' ? 'b' : 'w';
    const winnerName = winner === 'w' ? whiteName : blackName;
    emblem = mode === 'online' && !iWon ? 'loss' : 'win';
    headline = `${winnerName} wins!`;
    if (mode === 'online') {
      flavor = iWon
        ? `Checkmate — well played, ${myName || winnerName}!`
        : `Good game — ${oppName || winnerName} found the mate. Rematch?`;
    } else {
      flavor = `${winnerName} delivers checkmate. Good game, both!`;
    }
  }

  const showConfetti = emblem === 'win';

  return (
    <div className="stack">
      <div className={`panel result-panel ${emblem === 'win' ? 'won' : emblem === 'loss' ? 'lost' : 'drawn'}`}>
        {showConfetti && <VictoryFX />}
        <div className="result-hero">
          {isDraw ? (
            <div className="result-emblem draw" aria-hidden="true">
              <ScalesIcon size={78} />
            </div>
          ) : (
            <FallenKing color={loserColor} />
          )}
          <div className={`big reveal ${emblem === 'win' ? 'win' : 'loss'}`} data-testid="chess-result-headline">
            {headline}
          </div>
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
