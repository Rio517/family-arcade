import { Link } from 'react-router-dom';
import { useProfile } from '@shared/profile/useProfile';
import { GridIcon } from '@shared/ui/icons';
import { GAMES } from './registry';

/**
 * The landing page — the Kny-Flores Family Arcade, staged as a real arcade
 * at night: a neon marquee with chasing bulbs, then every game as its own
 * ARCADE CABINET (mini marquee, scanlined CRT screen, control deck with a
 * joystick in that cabinet's colour) standing on a glowing floor, and the
 * family record as a CRT high-score board.
 *
 * The cabinets are generated from the registry, so this component never
 * mentions a specific game by name — add or remove one in registry.ts and
 * the arcade grows a machine. The Yahtzee logger is the one exception: a
 * static HTML page rather than a registered React game, linked directly.
 */

/** One arcade cabinet: marquee strip, CRT screen, control deck. */
function Cabinet({ title, sub, tag, children }: {
  title: string;
  sub: string;
  tag?: string;
  children: React.ReactNode; // the game glyph
}) {
  return (
    <>
      <span className="cab-shell">
        <span className="cab-marquee">{title}</span>
        <span className="cab-screen">
          <span className="cab-glyph">{children}</span>
          <span className="cab-sub">{sub}</span>
        </span>
        <span className="cab-deck">
          <span className="cab-stick" aria-hidden="true"><i /></span>
          <span className="cab-btns" aria-hidden="true"><i /><i /></span>
          {tag && <span className="cab-tag">{tag}</span>}
        </span>
      </span>
      <span className="cab-floor-glow" aria-hidden="true" />
    </>
  );
}

export function Menu() {
  const { profile } = useProfile();

  return (
    <div className="app arcade">
      <div className="arcade-sky" aria-hidden="true" />
      <div className="arcade-floor" aria-hidden="true" />

      <header className="marquee">
        <div className="bulbs" aria-hidden="true" />
        <div className="marquee-inner">
          <div className="kicker">★ Welcome to the ★</div>
          <h1>
            Kny-Flores
            <span className="line2">Family Arcade</span>
          </h1>
          <p className="coin-line">insert coin · pick a machine</p>
        </div>
        <div className="bulbs bottom" aria-hidden="true" />
      </header>

      <nav className="cab-row" aria-label="Games">
        <a className="cab game-yahtzee" href={`${import.meta.env.BASE_URL}calculator.html`}>
          <Cabinet title="Yahtzee" sub="Roll real dice — log the scorecard" tag="Solo+">
            <GridIcon size={44} />
          </Cabinet>
        </a>

        {GAMES.map((game) => (
          <Link key={game.id} className={`cab game-${game.id}`} to={game.path}>
            <Cabinet title={game.title} sub={game.description} tag={game.tag}>
              <game.Icon size={44} />
            </Cabinet>
          </Link>
        ))}
      </nav>

      <section className="hiscore" aria-label="Family records">
        <div className="hs-title">✦ High Scores ✦</div>
        <div className="hs-row points">
          <span className="hs-k">1UP · Points</span>
          <span className="hs-dots" aria-hidden="true" />
          <span className="hs-v">{profile.points}</span>
        </div>
        <div className="hs-row">
          <span className="hs-k">Wins</span>
          <span className="hs-dots" aria-hidden="true" />
          <span className="hs-v">{profile.wins}</span>
        </div>
        <div className="hs-row">
          <span className="hs-k">Losses</span>
          <span className="hs-dots" aria-hidden="true" />
          <span className="hs-v">{profile.losses}</span>
        </div>
        <div className="hs-press">press start to play<span className="hs-cursor" aria-hidden="true">▮</span></div>
      </section>

      <div className="footer">
        <p>Free &amp; open source — built with love for family game night.</p>
        <p>
          <a href="https://github.com/Rio517/yahtzee-calculator">View the source on GitHub ›</a>
        </p>
      </div>
    </div>
  );
}
