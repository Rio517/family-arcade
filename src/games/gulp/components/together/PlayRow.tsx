/**
 * The menu's two big buttons, side by side: yellow PLAY for a round alone,
 * and purple PLAY WITH FRIENDS with three holes on it.
 */
import '../../styles/together.css';
import { SKINS } from '../skins';
import { Hole } from './parts';

export function PlayRow({ onPlay, onFriends }: { onPlay(): void; onFriends(): void }) {
  return (
    <div className="gulp-tg gulp-tg-playrow">
      <button type="button" className="gulp-tg-ab y bigbtn" onClick={onPlay} data-testid="gulp-play">
        <Hole colour={SKINS[0].css} />
        <span>PLAY</span>
      </button>
      <button type="button" className="gulp-tg-ab p bigbtn" onClick={onFriends} data-testid="gulp-friends">
        <span className="gulp-tg-trio">
          <Hole colour={SKINS[1].css} />
          <Hole colour={SKINS[2].css} />
          <Hole colour={SKINS[3].css} />
        </span>
        <span>PLAY WITH FRIENDS</span>
      </button>
    </div>
  );
}
