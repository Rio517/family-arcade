/**
 * Gulp Universe's scores on screen: the family board (on the results card and
 * in the Scores dialog) and the Scores dialog itself, with the family top 5
 * for any map and difficulty and the signed-in player's own recent rounds.
 */
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { CloseIcon, StarIcon, TrophyIcon } from '@shared/ui/icons';
import { useDismissOnEscape } from '@shared/ui/useDismissOnEscape';
import { MAPS, type MapId } from '../domain/city';
import type { Difficulty } from '../domain/rivals';
import { DIFFICULTY_TITLE, MAP_ORDER } from './round';
import { bestOf, familyTop, myRounds, sameRound, whenLabel, type ScoreRound } from '../storage/scores';

const LEVELS: Difficulty[] = ['easy', 'medium', 'hard'];

const ordinal = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

/** The family's best rounds, highest first, with one row picked out. */
export function FamilyBoard({
  rows,
  highlight,
  testId,
}: {
  rows: ScoreRound[];
  highlight?: Pick<ScoreRound, 'userId' | 'at'>;
  testId: string;
}) {
  return (
    <ol className="gulp-family-list" data-testid={testId}>
      {rows.map((r, i) => {
        const me = highlight !== undefined && sameRound(r, highlight);
        return (
          <li key={`${r.userId}:${r.at}:${i}`} className={`p${i + 1}${me ? ' me' : ''}`} aria-current={me ? 'true' : undefined}>
            <span className="gulp-rank">{i + 1}</span>
            <span className="gulp-name">{r.name}</span>
            {r.level > 0 && <small>LV {r.level}</small>}
            <b>{r.score.toLocaleString()}</b>
          </li>
        );
      })}
    </ol>
  );
}

const FOCUSABLE = 'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

type Tab = 'family' | 'mine';

export function ScoresDialog({
  rounds,
  userId,
  map: startMap,
  difficulty: startDifficulty,
  onClose,
}: {
  rounds: ScoreRound[];
  userId: string;
  map: MapId;
  difficulty: Difficulty;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('family');
  const [map, setMap] = useState(startMap);
  const [difficulty, setDifficulty] = useState(startDifficulty);
  const [now] = useState(() => Date.now());
  const dialogRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ family: null, mine: null });
  useDismissOnEscape(true, onClose);

  // Focus moves into the dialog, stays there while it is open, and goes back
  // to the button that opened it when it closes.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    tabRefs.current.family?.focus();
    const trap = (e: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (e.key !== 'Tab' || !dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', trap);
    return () => {
      window.removeEventListener('keydown', trap);
      opener?.focus();
    };
  }, []);

  // Left and right arrows move between the two tabs.
  const onTabKey = (e: ReactKeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next: Tab = tab === 'family' ? 'mine' : 'family';
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const board = familyTop(rounds, map, difficulty);
  const mine = myRounds(rounds, userId);

  return (
    /* Backdrop click is a mouse convenience; Escape and the close button are
       the keyboard path. */
    /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
    <div
      className="gulp-modal-backdrop gulp-scores-backdrop"
      data-testid="gulp-scores-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="gulp-modal scores"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gulp-scores-title"
        data-testid="gulp-scores"
      >
        <div className="gulp-modal-head">
          <h2 id="gulp-scores-title" className="gulp-scores-title">
            <span className="gulp-trophy" aria-hidden="true">
              <TrophyIcon size={26} />
            </span>
            Scores
          </h2>
          <button type="button" className="gulp-round" onClick={onClose} aria-label="Close" data-testid="gulp-scores-close">
            <CloseIcon size={20} />
          </button>
        </div>

        <div className="gulp-tabs" role="tablist" aria-label="Scores">
          {(
            [
              ['family', 'Family top 5'],
              ['mine', 'My rounds'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              ref={(el) => {
                tabRefs.current[id] = el;
              }}
              type="button"
              role="tab"
              id={`gulp-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`gulp-panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              className={tab === id ? 'on' : ''}
              onClick={() => setTab(id)}
              onKeyDown={onTabKey}
              data-testid={`gulp-scores-${id}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'family' ? (
          <div className="gulp-scores-panel" role="tabpanel" id="gulp-panel-family" aria-labelledby="gulp-tab-family">
            <div className="gulp-chips" role="radiogroup" aria-label="Map">
              {MAP_ORDER.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={map === m}
                  className={map === m ? 'on' : ''}
                  onClick={() => setMap(m)}
                  data-testid={`gulp-scores-map-${m}`}
                >
                  {MAPS[m].label}
                </button>
              ))}
            </div>
            <div className="gulp-chips levels" role="radiogroup" aria-label="Difficulty">
              {LEVELS.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={difficulty === d}
                  className={difficulty === d ? 'on' : ''}
                  onClick={() => setDifficulty(d)}
                  data-testid={`gulp-scores-level-${d}`}
                >
                  {DIFFICULTY_TITLE[d]}
                </button>
              ))}
            </div>
            {board.length > 0 ? (
              <FamilyBoard rows={board} testId="gulp-scores-board" />
            ) : (
              <p className="gulp-scores-empty" data-testid="gulp-scores-board-empty">
                Nobody has played {MAPS[map].label} on {DIFFICULTY_TITLE[difficulty]} yet. Be the first!
              </p>
            )}
          </div>
        ) : (
          <div className="gulp-scores-panel" role="tabpanel" id="gulp-panel-mine" aria-labelledby="gulp-tab-mine">
            {mine.length > 0 ? (
              <ol className="gulp-my-list" data-testid="gulp-scores-mine-list">
                {mine.map((r, i) => {
                  const best = r.score > 0 && r.score === bestOf(rounds, userId, r.map, r.difficulty);
                  return (
                    <li key={`${r.at}:${i}`}>
                      <span className="gulp-my-what">
                        <b>
                          {MAPS[r.map].label} · {DIFFICULTY_TITLE[r.difficulty]}
                        </b>
                        <small>
                          {whenLabel(r.at, now)}
                          {r.level > 0 && ` · Level ${r.level}`}
                          {r.rank > 0 && ` · ${ordinal(r.rank)}`}
                        </small>
                      </span>
                      {best && (
                        <span className="gulp-my-best" title="Your best">
                          <StarIcon size={16} />
                          Best
                        </span>
                      )}
                      <b className="gulp-my-score">{r.score.toLocaleString()}</b>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="gulp-scores-empty" data-testid="gulp-scores-mine-empty">
                Your rounds show up here after you play. Go gulp something!
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
