import { Link } from 'react-router-dom';
import { useProfile } from '@shared/profile/useProfile';
import { GridIcon } from '@shared/ui/icons';
import { GAMES } from './registry';

/**
 * The landing page — the Kny-Flores Family Arcade as a midnight carnival:
 * a striped awning at the top, strings of multicolour bulbs, and the family
 * name HANGING from chains as a retro neon sign (hollow tube letters, warm
 * orange glow, the occasional flicker). Every game is an ADMIT-ONE ticket
 * stub under its own awning; the family record lives at the prize counter.
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

export function Menu() {
  const { profile } = useProfile();

  return (
    <div className="app arcade">
      <div className="arcade-sky" aria-hidden="true" />
      <div className="arcade-floor" aria-hidden="true" />

      {/* The striped awning and its string of lights. */}
      <div className="awning" aria-hidden="true" />
      <BulbString count={12} />

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

      <div className="mid-lights"><BulbString count={9} offset={2} /></div>

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

      <div className="footer">
        <p>Free &amp; open source — built with love for family game night.</p>
        <p>
          <a href="https://github.com/Rio517/yahtzee-calculator">View the source on GitHub ›</a>
        </p>
      </div>
    </div>
  );
}
