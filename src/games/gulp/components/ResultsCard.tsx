/**
 * The card at the end of a round: what ended it, how the child did, this
 * round's standings, their own numbers and the family board it was played
 * for. A shared round's notes ("Mina wants to play again!") come in as
 * children, under the body.
 */
import { useRef, type ReactNode } from 'react';
import { TrophyIcon } from '@shared/ui/icons';
import { MAPS } from '../domain/city';
import { levelOf, standings, type World } from '../domain/world';
import { DIFFICULTY_TITLE } from './round';
import { FamilyBoard } from './ScoresDialog';
import { SKINS } from './skins';
import { useDialogFocus } from './useDialogFocus';
import { BOARD_SIZE, type ScoreRound } from '../storage/scores';

export interface RoundResult {
  rank: number;
  score: number;
  level: number;
  kills: number;
  wonders: number;
  newBest: boolean;
  /** The best before this round (0 if none), shown beside a new best. */
  prevBest: number;
  gulped: number;
  /** What the biggest thing swallowed was, in words. */
  biggest: string | null;
  /** This round as kept in the scores, and the family board it was played for. */
  entry: ScoreRound;
  board: ScoreRound[];
  /** Its place on that board, 0 when it did not make it. */
  place: number;
}

/** What the results card says about the family board. */
function familyLine(place: number, score: number, board: ScoreRound[]): string {
  if (place === 1) return 'New family record!';
  if (place > 1) return `You're ${ordinal(place)} in the family.`;
  if (score <= 0) return 'Gulp something to join the board!';
  const need = board[board.length - 1].score - score + 1;
  return `${need.toLocaleString()} more to join the board!`;
}

/** 2 → "2nd": early readers say a place, not a hash sign. */
function ordinal(rank: number): string {
  return `${rank}${rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th'}`;
}

/** The results card's big line: how the round went for the child. */
function headline(rank: number, endedBy: World['endedBy']): string {
  if (endedBy === 'out') return rank === 1 ? 'Still the biggest hole!' : `You came ${ordinal(rank)}`;
  return rank === 1 ? 'You are the biggest hole!' : `You came ${ordinal(rank)}. Great gulping!`;
}

/** What the results card says ended the round. */
const KICKER: Record<NonNullable<World['endedBy']>, string> = {
  time: "Time's up!",
  ended: 'Round over',
  out: 'Out of lives!',
  last: 'Last hole standing!',
};

export function ResultsCard({
  world,
  follow,
  result,
  onAgain,
  onMenu,
  children,
}: {
  world: World;
  /** The child's own hole. */
  follow: number;
  result: RoundResult;
  onAgain: () => void;
  onMenu: () => void;
  children?: ReactNode;
}) {
  // The card keeps keyboard focus while it is open.
  const ref = useRef<HTMLDivElement | null>(null);
  useDialogFocus(true, ref);
  return (
    <div className="gulp-modal-backdrop">
      <div ref={ref} className="gulp-modal results" role="dialog" aria-modal="true" aria-label="Results" data-testid="gulp-results">
        <span className="gulp-kicker">{KICKER[world.endedBy ?? 'ended']}</span>
        <h2>{headline(result.rank, world.endedBy)}</h2>
        <div className="gulp-results-body">
          <section className="gulp-results-round" aria-label="This round">
            <ol className="gulp-results-list">
              {standings(world).map((h, i) => (
                <li key={h.id} className={h.id === follow ? 'me' : ''}>
                  <span className="gulp-rank">{i + 1}</span>
                  <span className="gulp-dot" style={{ background: SKINS[h.skin % SKINS.length].css }} aria-hidden="true" />
                  <span className="gulp-name">{h.name}</span>
                  <small>LV {levelOf(h.r)}</small>
                  <b>{h.score.toLocaleString()}</b>
                </li>
              ))}
            </ol>
          </section>
          <div className="gulp-results-side">
            <section className="gulp-results-me" aria-label="Your round" data-testid="gulp-results-me">
              {result.newBest && (
                <p className="gulp-newbest" data-testid="gulp-newbest">
                  <b>New best!</b>
                  {result.prevBest > 0 && <span>was {result.prevBest.toLocaleString()}</span>}
                </p>
              )}
              <ul className="gulp-tiles">
                <li>
                  <b>{result.level}</b>
                  <span>Level</span>
                </li>
                <li>
                  <b>{result.gulped.toLocaleString()}</b>
                  <span>{result.gulped === 1 ? 'Thing gulped' : 'Things gulped'}</span>
                </li>
                <li>
                  <b>{result.kills}</b>
                  <span>{result.kills === 1 ? 'Hole swallowed' : 'Holes swallowed'}</span>
                </li>
                <li>
                  <b>{result.wonders}</b>
                  <span>{result.wonders === 1 ? 'Wonder' : 'Wonders'}</span>
                </li>
              </ul>
              {result.biggest && (
                <p className="gulp-bite">
                  Biggest bite: <b>{result.biggest}</b>
                </p>
              )}
            </section>
            <section className="gulp-results-family" aria-labelledby="gulp-family-title" data-testid="gulp-results-family">
              <h3 className="gulp-family-head" id="gulp-family-title">
                <TrophyIcon size={20} />
                Family top {BOARD_SIZE}
                <small>
                  {MAPS[result.entry.map].label} · {DIFFICULTY_TITLE[result.entry.difficulty]}
                </small>
              </h3>
              <p className={`gulp-family-place${result.place > 0 ? ' made' : ''}`} data-testid="gulp-family-place">
                {familyLine(result.place, result.score, result.board)}
              </p>
              {result.board.length > 0 && <FamilyBoard rows={result.board} highlight={result.entry} testId="gulp-results-board" />}
            </section>
          </div>
        </div>
        {children}
        <div className="gulp-modal-row">
          <button type="button" className="gulp-play small" onClick={onAgain} data-testid="gulp-again">
            Play again
          </button>
          <button type="button" className="gulp-button ghost" onClick={onMenu} data-testid="gulp-results-menu">
            Menu
          </button>
        </div>
      </div>
    </div>
  );
}
