import { Link } from 'react-router-dom';
import { useProfile } from '../state/useProfile';
import { loadResumableSession } from '../storage/persistence';
import { loadResumableChessGame } from '../storage/chessPersistence';
import { ChessIcon, GridIcon, ResumeIcon, ShipIcon } from './icons';

/** The landing page: pick a game, see your record, resume an interrupted duel. */
export function Menu() {
  const { profile } = useProfile();
  const resumable = loadResumableSession();
  const resumableChess = loadResumableChessGame();

  return (
    <div className="app">
      <div className="brand">
        <div className="kicker">Family Arcade</div>
        <h1>Game Console</h1>
        <p>Pick a game to play.</p>
      </div>

      <nav className="menu">
        {resumable && (
          <Link className="card violet" to={`/play?resume=${resumable.code}`}>
            <div className="icon"><ResumeIcon size={30} /></div>
            <div className="body">
              <div className="title">Resume Battle</div>
              <div className="sub">
                Game <strong>{resumable.code}</strong> vs {resumable.oppName ?? 'opponent'} is still in progress.
              </div>
            </div>
            <div className="chev" aria-hidden="true">›</div>
          </Link>
        )}

        {resumableChess && (
          <Link className="card violet" to={`/chess?resume=${resumableChess.code}`}>
            <div className="icon"><ResumeIcon size={30} /></div>
            <div className="body">
              <div className="title">Resume Chess</div>
              <div className="sub">
                Game <strong>{resumableChess.code}</strong> vs {resumableChess.oppName || 'opponent'} is still in progress.
              </div>
            </div>
            <div className="chev" aria-hidden="true">›</div>
          </Link>
        )}

        <a className="card" href={`${import.meta.env.BASE_URL}calculator.html`}>
          <div className="icon"><GridIcon size={30} /></div>
          <div className="body">
            <div className="title">Yahtzee Logger</div>
            <div className="sub">Roll real dice — tap to log your scorecard. Works offline.</div>
          </div>
          <div className="chev" aria-hidden="true">›</div>
        </a>

        <Link className="card violet" to="/play">
          <div className="icon"><ShipIcon size={30} /></div>
          <div className="body">
            <div className="title">
              Ship Battle <span className="tag">2-Player</span>
            </div>
            <div className="sub">Two devices, one code. Pick your fleet, place your ships, and duel.</div>
          </div>
          <div className="chev" aria-hidden="true">›</div>
        </Link>

        <Link className="card violet" to="/chess">
          <div className="icon"><ChessIcon size={30} /></div>
          <div className="body">
            <div className="title">
              Chess <span className="tag">2-Player</span>
            </div>
            <div className="sub">Drag-and-drop chess — same device or online with a code.</div>
          </div>
          <div className="chev" aria-hidden="true">›</div>
        </Link>
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
