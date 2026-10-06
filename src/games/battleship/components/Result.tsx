import { useState } from 'react';
import { VictoryFX } from '@shared/ui/VictoryFX';
import { BrokenShipIcon, TrophyIcon } from '@shared/ui/icons';

interface ResultProps {
  won: boolean;
  pointsEarned: number;
  /** The player's running total — left out when the ticket signed in is not
   * the one the points landed on, so the card never reads a bystander's
   * balance back as "you". */
  totalPoints?: number;
  myName: string;
  oppName: string;
  iWantRematch: boolean;
  oppWantsRematch: boolean;
  onRematch: () => void;
  onExit: () => void;
}

// Warm, varied end-of-game messages. Winner gets a celebration; the loser is
// always encouraged and pointed at a rematch — never told they were "defeated".
const WIN_LINES: Array<(me: string, opp: string) => string> = [
  () => `You sank every ship.`,
  () => `You sank the whole fleet.`,
  (_, opp) => `You beat ${opp}. Well played.`,
  () => `Direct hits all round. The crowd is cheering.`,
];

const LOSS_LINES: Array<(me: string, opp: string) => string> = [
  (_, opp) => `${opp} got you this time. Go again?`,
  () => `Your ships put up a real fight.`,
  () => `So close. One more game could turn it.`,
  (_, opp) => `${opp} won this time. The crowd wants a rematch.`,
];

export function Result({
  won,
  pointsEarned,
  totalPoints,
  myName,
  oppName,
  iWantRematch,
  oppWantsRematch,
  onRematch,
  onExit,
}: ResultProps) {
  // Pick one flavour line per game (stable across re-renders).
  const [idx] = useState(() => Math.floor(Math.random() * WIN_LINES.length));
  const captain = myName || 'Captain';
  const rival = oppName || 'your rival';
  const flavor = (won ? WIN_LINES : LOSS_LINES)[idx](captain, rival);

  return (
    <div className="stack">
      <div className={`panel result-panel ${won ? 'won' : 'lost'}`}>
        {won && <VictoryFX />}
        <div className="result-hero">
          {won && (
            <div className="burst" aria-hidden="true">
              {Array.from({ length: 18 }).map((_, i) => (
                <span
                  key={i}
                  style={{
                    ['--a' as string]: `${(360 / 18) * i}deg`,
                    ['--delay' as string]: `${(i % 6) * 35}ms`,
                  }}
                />
              ))}
            </div>
          )}
          <div className={`result-emblem ${won ? 'win' : 'loss'}`} aria-hidden="true">
            {won ? <TrophyIcon size={78} /> : <BrokenShipIcon size={78} />}
          </div>
          <div className={`big reveal ${won ? 'win' : 'loss'}`}>{won ? 'You win' : 'Good game'}</div>
          <p className="result-flavor reveal">{flavor}</p>
          <div className="earned reveal">
            +{pointsEarned} points
          </div>
          {totalPoints !== undefined && (
            <div className="subtle reveal" style={{ marginTop: 6 }}>
              You have {totalPoints} points. Spend them on new fleets.
            </div>
          )}
        </div>
      </div>

      <div className="panel stack">
        {oppWantsRematch && !iWantRematch && (
          <p className="subtle center">{rival} wants a rematch!</p>
        )}
        {iWantRematch && !oppWantsRematch && (
          <p className="subtle center">Waiting for {rival} to say yes…</p>
        )}
        <button className="btn btn-primary btn-lg btn-block" onClick={onRematch} disabled={iWantRematch} data-testid="rematch">
          {iWantRematch ? 'Rematch requested' : 'Play again'}
        </button>
        <button className="btn btn-block" onClick={onExit} data-testid="exit">
          ← Back to menu
        </button>
      </div>
    </div>
  );
}
