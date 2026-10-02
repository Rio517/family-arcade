/**
 * A linked friend has started a game: a big green card above the play
 * buttons, "Mina is starting a game!" with one button to join. While the join
 * is on its way the button says so; if it fails, why shows under it.
 */
import '../../styles/together.css';
import { SKINS } from '../skins';
import { Hole } from './parts';

export function JoinCard({
  name,
  onJoin,
  busy = false,
  error = null,
}: {
  name: string;
  onJoin(): void;
  busy?: boolean;
  error?: string | null;
}) {
  return (
    <div className="gulp-tg gulp-tg-invite" data-testid="gulp-join-card">
      <span className="hw">
        <Hole colour={SKINS[2].css} />
      </span>
      <p className="tx" role="status">
        {name} is starting a game!
      </p>
      {/* aria-disabled, not disabled, while busy: the button keeps keyboard focus. */}
      <button
        type="button"
        className="gulp-tg-ab g join"
        aria-disabled={busy || undefined}
        onClick={() => {
          if (!busy) onJoin();
        }}
        data-testid="gulp-join"
      >
        {busy ? 'Joining…' : `Join ${name}`}
      </button>
      {error && (
        <p className="gulp-tg-err" role="alert" data-testid="gulp-join-error">
          {error}
        </p>
      )}
    </div>
  );
}
