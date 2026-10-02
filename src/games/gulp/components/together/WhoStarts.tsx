/**
 * PLAY WITH FRIENDS with no friend linked asks one question, with two big
 * picture answers: a crown for starting the game, letter tiles for typing a
 * friend's code. Escape goes back to the menu.
 */
import '../../styles/together.css';
import { useDismissOnEscape } from '@shared/ui/useDismissOnEscape';
import { BackButton, CrownIcon, Tiles } from './parts';
import { useFocusOnOpen } from './useFocusOnOpen';

export function WhoStarts({ onMe, onFriend, onBack }: { onMe(): void; onFriend(): void; onBack(): void }) {
  const ref = useFocusOnOpen<HTMLElement>();
  useDismissOnEscape(true, onBack);
  return (
    <section ref={ref} tabIndex={-1} className="gulp-tg gulp-tg-screen" aria-label="Who’s starting the game?" data-testid="gulp-who">
      <BackButton onBack={onBack} className="corner" testId="gulp-who-back" />
      <div className="gulp-tg-col gulp-tg-q">
        <h2>Who’s starting the game?</h2>
        <div className="gulp-tg-answers">
          <button type="button" className="gulp-tg-ans gold" onClick={onMe} data-testid="gulp-who-me">
            <span className="pic">
              <span className="crown">
                <CrownIcon size={64} />
              </span>
            </span>
            <span>Me! Friends join me</span>
          </button>
          <button type="button" className="gulp-tg-ans sky" onClick={onFriend} data-testid="gulp-who-friend">
            <span className="pic">
              <Tiles code="KQZT" label={null} />
            </span>
            <span>A friend. I’ll type their code</span>
          </button>
        </div>
      </div>
    </section>
  );
}
