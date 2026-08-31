import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GamePreview } from '@shared/game';
import { BotIcon, GridIcon, PersonIcon } from '@shared/ui/icons';
import { useDismissOnEscape } from '@shared/ui/useDismissOnEscape';
import { GAMES } from './registry';
import { PlayerBooth } from './PlayerBooth';
import yahtzeePreview from './assets/yahtzee-preview.webp';

/**
 * The landing page — the Kny-Flores Family Arcade as a midnight carnival:
 * a striped awning at the top, a string of multicolour bulbs, and the family
 * name HANGING from chains as a retro neon sign (hollow tube letters, warm
 * orange glow, the occasional flicker). Every game is an ADMIT-ONE ticket
 * stub under its own awning. On a wide screen the tickets run down the RIGHT;
 * the sign, the game you left mid-play, the Ticket Booth and the camera door
 * hold the LEFT.
 *
 * Everything is registry-driven: tickets print per registry entry, and the
 * "Continue …" rows come from each game's `savedGames` hook on its
 * descriptor — a returning player's game comes before the whole catalogue.
 * The one exception is the Yahtzee logger, a static HTML page linked directly.
 */

const BULBS = ['b1', 'b2', 'b3', 'b4'];

/** A draped string of multicolour carnival bulbs. */
function BulbString({ count }: { count: number }) {
  return (
    <div className="bulb-string" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          className={`bulb ${BULBS[i % 4]}`}
          style={{ left: `${4 + (i * 92) / (count - 1)}%` }}
        />
      ))}
    </div>
  );
}

/** What a ticket's face says: the same for a registry game and for Yahtzee. */
interface TicketFace {
  title: string;
  sub: string;
  tag?: string;
  releaseStatus?: 'under-construction';
  players: { min: number; max: number };
  /** Chairs on one device — when fewer than the players, say so. */
  seats: { min: number; max: number };
  computer?: boolean;
  children: React.ReactNode;
}

/** One game ticket's face: awning strip, glyph, name, blurb. */
function Ticket({ title, sub, tag, releaseStatus, players, seats, computer, children }: TicketFace) {
  const count = players.min === players.max ? String(players.min) : `${players.min}–${players.max}`;
  const playersLabel =
    players.min === players.max
      ? `For ${players.min} player${players.min === 1 ? '' : 's'}`
      : `For ${players.min}–${players.max} players`;
  return (
    <>
      <span className="tk-awning" aria-hidden="true" />
      <span className="tk-main">
        <span className="tk-glyph">{children}</span>
        <span className="tk-body">
          <span className="tk-name">
            {title} {tag && <small>{tag}</small>}
            <span className="tk-badge" role="img" title={playersLabel} aria-label={playersLabel}>
              <PersonIcon size={12} /> {count}
            </span>
            {computer && (
              <span
                className="tk-badge"
                role="img"
                title="Plays against the computer too — nobody else needed."
                aria-label="Has computer players"
              >
                <BotIcon size={13} />
              </span>
            )}
          </span>
          <span className="tk-desc">{sub}</span>
          {seats.max < players.max && (
            <span className="tk-devices">One player per device — a second iPad joins in</span>
          )}
          {releaseStatus === 'under-construction' && (
            <span className="tk-status">Under construction · playable</span>
          )}
        </span>
      </span>
      <span className="tk-go" aria-hidden="true">›</span>
    </>
  );
}

/**
 * A ticket with a poster behind it. Tap the face and the ticket opens in
 * place — a picture of the game, three facts, two lines that say what it's
 * like, and Play — so anyone can look at a game before playing it. One
 * ticket is open at a time; tap it again (or Escape) to fold it.
 */
function GameTicket({
  id,
  play,
  preview,
  open,
  onToggle,
  children,
  ...face
}: TicketFace & {
  id: string;
  /** Where Play goes: a route, or a plain page (Yahtzee's calculator). */
  play: { to: string } | { href: string };
  preview?: GamePreview;
  open: boolean;
  onToggle: (id: string) => void;
}) {
  const facts = preview?.facts ?? [];
  const blurb = preview?.blurb ?? face.sub;
  const posterId = `poster-${id}`;
  const posterRef = useRef<HTMLDivElement>(null);
  // A poster that opens below the fold comes to the player; `scroll-margin`
  // on .tk-poster keeps its Play clear of the floating Play-together control.
  useEffect(() => {
    const el = posterRef.current;
    if (!open || typeof el?.scrollIntoView !== 'function') return;
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'end' });
  }, [open]);
  return (
    <article
      className={`tk game-${id}${open ? ' open' : ''}`}
      data-testid={`game-ticket-${id}`}
      data-release-status={face.releaseStatus}
    >
      <button
        type="button"
        className="tk-face"
        aria-expanded={open}
        aria-controls={posterId}
        onClick={() => onToggle(id)}
        data-testid={`ticket-open-${id}`}
      >
        <Ticket {...face}>{children}</Ticket>
      </button>
      {open && (
        <div className="tk-poster" id={posterId} ref={posterRef} data-testid={`ticket-poster-${id}`}>
          {preview && (
            <img className="tk-strip" src={preview.image} alt={`${face.title} — a look at the game`} width={640} height={360} />
          )}
          {facts.length > 0 && (
            <ul className="tk-facts">
              {facts.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
          <p className="tk-blurb">{blurb}</p>
          {'to' in play ? (
            <Link className="tk-play" to={play.to} data-testid={`game-play-${id}`}>
              Play {face.title} ›
            </Link>
          ) : (
            <a className="tk-play" href={play.href} data-testid={`game-play-${id}`}>
              Play {face.title} ›
            </a>
          )}
        </div>
      )}
    </article>
  );
}

const YAHTZEE_PREVIEW: GamePreview = {
  image: yahtzeePreview,
  facts: ['1 player', 'Real dice, this iPad keeps score', 'About 10 min'],
  blurb: 'Roll real dice at the table and tap to log the scorecard — it adds up the bonuses for you. Works offline.',
};

export function Menu() {
  // Every resumable game across the arcade, in registry order — each game
  // reports its own saves through the `savedGames` hook on its descriptor.
  // The game's own title rides along, so a row can say which game to continue.
  const saved = GAMES.flatMap((game) =>
    (game.savedGames?.() ?? []).map((s) => ({ ...s, gameTitle: game.title })),
  );
  // The Magic Mirror, if the registry has it: the camera toy earns a second
  // door at the foot of the left column (the family asked for it in more
  // than one place). The registry stays the only list.
  const mirror = GAMES.find((g) => g.id === 'mirror') ?? null;
  // The one ticket open to its poster, if any.
  const [openId, setOpenId] = useState<string | null>(null);
  const toggle = (id: string) => setOpenId((cur) => (cur === id ? null : id));
  useDismissOnEscape(openId !== null, () => setOpenId(null));

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

        {/* What a returning player is most likely to want, before the whole
            catalogue: one unboxed row per save, from the registry's own data. */}
        {saved.length > 0 && (
          <nav className="cont" aria-label="Carry on">
            {saved.map((s) => (
              <Link
                key={s.key}
                className="cont-row"
                to={s.to}
                style={{ '--c': s.color } as React.CSSProperties}
                data-testid={`continue-${s.key}`}
              >
                <span className="cont-icon"><s.Icon size={24} /></span>
                <span className="cont-body">
                  <span className="cont-title">Continue {s.gameTitle} ›</span>
                  <span className="cont-meta">{s.meta}</span>
                </span>
              </Link>
            ))}
          </nav>
        )}

        <nav className="tix" aria-label="Games">
          <GameTicket
            id="yahtzee"
            title="Yahtzee"
            sub="Roll real dice — tap to log the scorecard. Works offline."
            tag="Solo+"
            players={{ min: 1, max: 1 }}
            seats={{ min: 1, max: 1 }}
            preview={YAHTZEE_PREVIEW}
            play={{ href: `${import.meta.env.BASE_URL}calculator.html` }}
            open={openId === 'yahtzee'}
            onToggle={toggle}
          >
            <GridIcon size={30} />
          </GameTicket>

          {GAMES.map((game) => (
            <GameTicket
              key={game.id}
              id={game.id}
              title={game.title}
              sub={game.description}
              tag={game.tag}
              releaseStatus={game.releaseStatus}
              players={game.players}
              seats={game.seats}
              computer={game.computer}
              preview={game.preview}
              play={{ to: game.path }}
              open={openId === game.id}
              onToggle={toggle}
              >
              <game.Icon size={30} />
            </GameTicket>
          ))}
        </nav>

        <PlayerBooth />

        {/* The camera toy has a second door here, at the foot of the column,
            so it is findable without scrolling the whole catalogue — the
            Play Online panel has the other one. */}
        {mirror && (
          <nav className="cont mirror-door" aria-label="Camera">
            <Link
              className="cont-row"
              to={mirror.path}
              style={{ '--c': '#7ae582' } as React.CSSProperties}
              data-testid="mirror-door"
            >
              <span className="cont-icon"><mirror.Icon size={24} /></span>
              <span className="cont-body">
                <span className="cont-title">{mirror.title} ›</span>
                <span className="cont-meta">Camera effects, just you</span>
              </span>
            </Link>
          </nav>
        )}
      </div>

      <div className="footer">
        <p>Free &amp; open source — built with love for family game night.</p>
        <p>
          <Link to="/privacy">Privacy &amp; safety</Link>
          {' · '}
          <a href="https://github.com/Rio517/yahtzee-calculator">View the source on GitHub ›</a>
        </p>
      </div>
    </div>
  );
}
