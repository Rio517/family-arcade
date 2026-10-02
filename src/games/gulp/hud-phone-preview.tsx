/**
 * Harness: the round's HUD on a phone with the longest likely names and
 * scores, in today's layout and in the three options of the phone HUD pitch
 * (docs/mockups/20261003-gulp-phone-hud/). The round is a real one on the
 * real stage, held still, with its names, scores, lives and power-ups set.
 *
 *   /preview-gulp-hud.html         today
 *   /preview-gulp-hud.html?o=a     option A (b, c likewise)
 *
 * Dev-only: built solely when BUILD_HARNESS is set, so it never ships.
 */
import { createRoot } from 'react-dom/client';
import '@shared/styles/tokens.css';
import './styles/gulp.css';
import './styles/phone-hud-options.css';
import type { World } from './domain/world';
import { LiveRound } from './together-round-preview';

const OPTIONS = ['a', 'b', 'c'];

/** Klara follows hole 0 and is fourth, so the tray shows the top three, the gap and her row. */
function dress(w: World) {
  const set: Array<[name: string, score: number, lives: number]> = [
    ['Klara', 3480, 3],
    ['Rio', 4832, 5],
    ['Captain Crumbs', 9999, 5],
    ['Hungry Hattie', 5120, 4],
    ['Sir Slurps', 2210, 5],
    ['Nom Nom', 866, 2],
  ];
  set.forEach(([name, score, lives], i) => {
    const h = w.holes[i];
    if (!h) return;
    h.name = name;
    h.score = score;
    h.lives = lives;
  });
  // Both power-ups running: the most the top of the screen ever holds.
  w.holes[0].speedTime = 6;
  w.holes[0].doubleTime = 9;
}

export function Preview() {
  const o = new URLSearchParams(location.search).get('o');
  const option = o && OPTIONS.includes(o) ? o : undefined;
  return (
    <div className="app gulp-root" data-phone-hud={option} data-testid="gulp-hud-preview" style={{ maxWidth: 'none', padding: 0 }}>
      <LiveRound seats={2} follow={0} frozen dress={dress} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Preview />);
