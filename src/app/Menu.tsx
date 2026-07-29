import { Link } from 'react-router-dom';
import { useProfile } from '@shared/profile/useProfile';
import { ChessIcon, GlobeIcon, GridIcon, ResumeIcon, ShipIcon } from '@shared/ui/icons';
import { loadLocalChessGame, loadResumableChessGame } from '@games/chess/storage/chessPersistence';
import { loadRiskGame } from '@games/risk/storage/riskPersistence';
import { loadResumableSession } from '@games/battleship/storage/sessionStore';
import { GAMES } from './registry';

/**
 * The landing page — the Kny-Flores Family Arcade as a midnight carnival:
 * a striped awning at the top, a string of multicolour bulbs, and the family
 * name HANGING from chains as a retro neon sign (hollow tube letters, warm
 * orange glow, the occasional flicker). Every game is an ADMIT-ONE ticket
 * stub under its own awning. On a wide screen the tickets run down the RIGHT;
 * the sign, the Save Station (every saved game, one tap to resume), and the
 * prize counter hold the LEFT.
 *
 * Tickets are generated from the registry, so this component never mentions
 * a specific game by name — add one in registry.ts and the carnival prints
 * another ticket. The Yahtzee logger is the one exception: a static HTML
 * page rather than a registered React game, linked directly.
 */

const BULBS = ['b1', 'b2', 'b3', 'b4'];

/** A draped string of multicolour carnival bulbs. */
function BulbString({ count, offset = 0 }: { count: number; offset?: number }) {
  return (
    <div className="bulb-string" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          className={`bulb ${BULBS[(i + offset) % 4]}`}
          style={{ left: `${4 + (i * 92) / (count - 1)}%` }}
        />
      ))}
    </div>
  );
}

/** One ADMIT-ONE ticket: stub, awning, glyph, name, blurb. */
function Ticket({ title, sub, tag, children }: {
  title: string;
  sub: string;
  tag?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <span className="tk-awning" aria-hidden="true" />
      <span className="tk-stub"><span>Admit one</span></span>
      <span className="tk-main">
        <span className="tk-glyph">{children}</span>
        <span className="tk-body">
          <span className="tk-name">
            {title} {tag && <small>{tag}</small>}
          </span>
          <span className="tk-desc">{sub}</span>
        </span>
      </span>
      <span className="tk-go" aria-hidden="true">›</span>
    </>
  );
}

/** One saved game the family can jump back into. */
interface SavedGame {
  key: string;
  to: string;
  color: string;
  icon: React.ReactNode;
  title: string;
  meta: string;
}

/** Gather every resumable game across the whole arcade. */
function savedGames(): SavedGame[] {
  const out: SavedGame[] = [];
  const chessLocal = loadLocalChessGame();
  if (chessLocal) {
    const moves = Math.ceil(chessLocal.log.length / 2);
    out.push({
      key: 'chess-local',
      to: '/chess?resume=local',
      color: '#e8b64c',
      icon: <ChessIcon size={20} />,
      title: `Chess — ${chessLocal.whiteName} vs ${chessLocal.blackName}`,
      meta: `same device · ${moves === 0 ? 'fresh setup' : `${moves} move${moves === 1 ? '' : 's'} in`}${chessLocal.start ? ' · custom' : ''}`,
    });
  }
  const chessOnline = loadResumableChessGame();
  if (chessOnline) {
    out.push({
      key: 'chess-online',
      to: `/chess?resume=${chessOnline.code}`,
      color: '#e8b64c',
      icon: <ChessIcon size={20} />,
      title: `Chess — vs ${chessOnline.oppName || 'opponent'}`,
      meta: `online · code ${chessOnline.code}`,
    });
  }
  const risk = loadRiskGame();
  if (risk) {
    out.push({
      key: 'risk',
      to: '/risk',
      color: '#e0705a',
      icon: <GlobeIcon size={20} />,
      title: `Risk — ${risk.state.players.map((p) => p.name).join(', ')}`,
      meta: `campaign · ${risk.state.players.length} generals`,
    });
  }
  const ship = loadResumableSession();
  if (ship) {
    out.push({
      key: 'battleship',
      to: '/battleship',
      color: '#35c7e8',
      icon: <ShipIcon size={20} />,
      title: `Ship Battle — vs ${ship.oppName || 'opponent'}`,
      meta: `online · code ${ship.code}`,
    });
  }
  return out;
}

export function Menu() {
  const { profile } = useProfile();
  const saved = savedGames();

  return (
    <div className="app arcade">
      <div className="arcade-sky" aria-hidden="true" />
      <div className="arcade-floor" aria-hidden="true" />

      {/* The striped awning and its string of lights, edge to edge. */}
      <div className="awning" aria-hidden="true" />
      <BulbString count={18} />

      <div className="arcade-main">
        {/* The sign hangs from the awning on two chains, swaying gently. */}
        <header className="sign-hang">
          <div className="sign-swing">
            <span className="chain left" aria-hidden="true" />
            <span className="chain right" aria-hidden="true" />
            <div className="sign">
              <div className="kicker">★ Step right up to the ★</div>
              <h1 className="neon">Kny-Flores</h1>
              <div className="sign-line2">Family Arcade</div>
              <p className="coin-line">insert coin · pick a game</p>
            </div>
          </div>
        </header>

        <nav className="tix" aria-label="Games">
          <a className="tk game-yahtzee" href={`${import.meta.env.BASE_URL}calculator.html`}>
            <Ticket title="Yahtzee" sub="Roll real dice — tap to log the scorecard. Works offline." tag="Solo+">
              <GridIcon size={30} />
            </Ticket>
          </a>

          {GAMES.map((game) => (
            <Link key={game.id} className={`tk game-${game.id}`} to={game.path}>
              <Ticket title={game.title} sub={game.description} tag={game.tag}>
                <game.Icon size={30} />
              </Ticket>
            </Link>
          ))}
        </nav>

        {/* The Save Station: every game the family left mid-battle. */}
        {saved.length > 0 && (
          <section className="now-playing" aria-label="Saved games">
            <div className="np-in">
              <div className="np-h">✦ Save Station ✦</div>
              {saved.map((s) => (
                <Link key={s.key} className="np-row" to={s.to} style={{ '--np-c': s.color } as React.CSSProperties} data-testid={`resume-${s.key}`}>
                  <span className="np-icon">{s.icon}</span>
                  <span className="np-body">
                    <span className="np-title">{s.title}</span>
                    <span className="np-meta">{s.meta}</span>
                  </span>
                  <span className="np-go" aria-hidden="true"><ResumeIcon size={18} /></span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="prize" aria-label="Family records">
          <div className="prize-in">
            <div className="prize-h">✦ Prize Counter ✦</div>
            <div className="prize-rows">
              <div className="prize-row points">
                <span>Tickets · Points</span><span className="fill" aria-hidden="true" /><span className="num">{profile.points}</span>
              </div>
              <div className="prize-row wins">
                <span>Wins</span><span className="fill" aria-hidden="true" /><span className="num">{profile.wins}</span>
              </div>
              <div className="prize-row losses">
                <span>Losses</span><span className="fill" aria-hidden="true" /><span className="num">{profile.losses}</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="footer">
        <p>Free &amp; open source — built with love for family game night.</p>
        <p>
          <a href="https://github.com/Rio517/yahtzee-calculator">View the source on GitHub ›</a>
        </p>
      </div>
    </div>
  );
}
