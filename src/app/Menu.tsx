import { Link } from 'react-router-dom';
import { useProfile } from '@shared/profile/useProfile';
import { GridIcon, ResumeIcon } from '@shared/ui/icons';
import { GAMES } from './registry';

/**
 * The landing page: pick a game, see your record, resume an interrupted duel.
 *
 * The game cards and resume prompts are generated from the game registry, so
 * this component never mentions a specific game by name — add or remove one in
 * registry.ts and the menu follows. The Yahtzee logger is the one exception: a
 * static HTML page rather than a registered React game, linked directly.
 */
export function Menu() {
  const { profile } = useProfile();

  return (
    <div className="app">
      <div className="brand">
        <div className="kicker">Family Arcade</div>
        <h1>Game Console</h1>
        <p>Pick a game to play.</p>
      </div>

      <nav className="menu">
        {GAMES.map((game) => {
          const resume = game.loadResumable?.();
          return resume ? (
            <Link key={`resume-${game.id}`} className="card violet" to={`${game.path}?resume=${resume.code}`}>
              <div className="icon"><ResumeIcon size={30} /></div>
              <div className="body">
                <div className="title">Resume {game.title}</div>
                <div className="sub">
                  Game <strong>{resume.code}</strong> {resume.label} is still in progress.
                </div>
              </div>
              <div className="chev" aria-hidden="true">›</div>
            </Link>
          ) : null;
        })}

        <a className="card" href={`${import.meta.env.BASE_URL}calculator.html`}>
          <div className="icon"><GridIcon size={30} /></div>
          <div className="body">
            <div className="title">Yahtzee Logger</div>
            <div className="sub">Roll real dice — tap to log your scorecard. Works offline.</div>
          </div>
          <div className="chev" aria-hidden="true">›</div>
        </a>

        {GAMES.map((game) => (
          <Link key={game.id} className="card violet" to={game.path}>
            <div className="icon"><game.Icon size={30} /></div>
            <div className="body">
              <div className="title">
                {game.title} {game.tag && <span className="tag">{game.tag}</span>}
              </div>
              <div className="sub">{game.description}</div>
            </div>
            <div className="chev" aria-hidden="true">›</div>
          </Link>
        ))}
      </nav>

      <div className="menu" style={{ marginTop: 16 }}>
        <div className="stats">
          <div className="stat points">
            <span className="k">Points</span>
            <span className="v">{profile.points}</span>
          </div>
          <div className="stat">
            <span className="k">Wins</span>
            <span className="v">{profile.wins}</span>
          </div>
          <div className="stat">
            <span className="k">Losses</span>
            <span className="v">{profile.losses}</span>
          </div>
        </div>
      </div>

      <div className="footer">
        <p>Free &amp; open source — built for family game night.</p>
        <p>
          <a href="https://github.com/Rio517/yahtzee-calculator">View the source on GitHub ›</a>
        </p>
      </div>
    </div>
  );
}
