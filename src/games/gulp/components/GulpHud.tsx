/**
 * What the child sees over a round: the leaderboard, the clock, the level
 * meter with what comes next, power-ups running, and banners for level-ups,
 * warnings and being swallowed. It renders a snapshot the page copies out
 * of the live world a few times a second.
 */
import { BoltIcon, ClockIcon, HeartIcon, JoystickIcon, PauseIcon, SpeakerIcon, SpeakerOffIcon, WarningIcon } from '@shared/ui/icons';
import type { Banner, Hud, HudRow } from './round';

const short = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n.toLocaleString());

export function GulpHud({
  over = false,
  hud,
  banners,
  muted,
  onMute,
  onPause,
  touch,
  notice = null,
}: {
  /** The round is over: the results card is up, so the combo and danger arrows go. */
  over?: boolean;
  hud: Hud;
  banners: Banner[];
  muted: boolean;
  onMute: () => void;
  onPause: () => void;
  touch: boolean;
  /** A shared round's link is down: "Waiting for Klara…", over everything else at the bottom. */
  notice?: string | null;
}) {
  // A friend's device has dropped out and their hole waits for them.
  const shown = notice ?? (hud.waiting.length ? `Waiting for ${hud.waiting.join(' and ')}…` : null);
  const row = (r: HudRow) => (
    <li key={r.id} className={`${r.me ? 'me' : ''}${r.out ? ' out' : ''}`}>
      <span className={r.rank <= 3 ? `gulp-rank coin-${r.rank}` : 'gulp-rank'}>{r.rank}</span>
      <span className="gulp-dot" style={{ background: r.css }} aria-hidden="true" />
      <span className="gulp-name">{r.name}</span>
      {r.out ? (
        <span className="gulp-lives out">Out</span>
      ) : (
        r.lives !== null && (
          <span className="gulp-lives" aria-label={`${r.lives} ${r.lives === 1 ? 'life' : 'lives'} left`}>
            <HeartIcon size={14} />
            {r.lives}
          </span>
        )
      )}
      <b key={r.me ? r.score : undefined} className={r.me ? 'gulp-score-punch' : undefined}>
        {short(r.score)}
      </b>
    </li>
  );
  const news = banners.filter((b) => b.kind === 'news').pop();
  // A warning always wins the banner spot: a police or level-up message
  // arriving on top of "Fuel truck!" must not hide it. Swallowing a hole beats
  // the level-up it often brings: the level badge shows the new level anyway.
  const top = banners
    .filter((b) => b.kind !== 'news')
    .reduce<Banner | undefined>((best, b) => (!best || rankOf(b) >= rankOf(best) ? b : best), undefined);
  return (
    <div className="gulp-hud" data-testid="gulp-hud">
      {(hud.speed > 0 || hud.double > 0) && (
        <div
          className={`gulp-powerglow ${hud.speed > 0 ? 'speed' : 'double'} ${Math.min(hud.speed || 99, hud.double || 99) <= 3 ? 'ending' : ''}`}
          aria-hidden="true"
        />
      )}
      <ol className="gulp-board" aria-label="Leaderboard" data-testid="gulp-board">
        {hud.rows.map(row)}
        {hud.mine && (
          <>
            <li className="gulp-gap" aria-hidden="true">
              ···
            </li>
            {row(hud.mine)}
          </>
        )}
      </ol>

      <div className="gulp-center">
        <div className="gulp-clock" data-testid="gulp-clock">
          <ClockIcon size={20} />
          <span>{hud.clock}</span>
        </div>
        <div className="gulp-level" data-testid="gulp-level">
          <span className="gulp-lv">
            <small>
              <span className="gulp-lv-long">Level</span>
              <span className="gulp-lv-short">Lv</span>
            </small>
            <b>{hud.level}</b>
          </span>
          <span className="gulp-meter">
            <span className="gulp-meter-fill" style={{ width: `${Math.round(hud.progress * 100)}%` }} />
          </span>
          <span className="gulp-next">{hud.next ? <>Next: <b>{hud.next}</b></> : <b>Everything!</b>}</span>
        </div>
        {(hud.speed > 0 || hud.double > 0) && (
          <div className="gulp-powers" data-testid="gulp-powers">
            {hud.speed > 0 && (
              <span className="gulp-power speed" aria-label={`Speed boost, ${hud.speed} seconds left`}>
                <span className="gulp-power-top">
                  <BoltIcon size={18} /> Speed <b>{hud.speed}s</b>
                </span>
                <span className="gulp-power-bar">
                  <span style={{ width: `${Math.round(hud.speedLeft * 100)}%` }} />
                </span>
              </span>
            )}
            {hud.double > 0 && (
              <span className="gulp-power double" aria-label={`Double points, ${hud.double} seconds left`}>
                <span className="gulp-power-top">
                  x2 Points <b>{hud.double}s</b>
                </span>
                <span className="gulp-power-bar">
                  <span style={{ width: `${Math.round(hud.doubleLeft * 100)}%` }} />
                </span>
              </span>
            )}
          </div>
        )}

      </div>

      <div className="gulp-right">
        <div className="gulp-buttons">
          <button type="button" className="gulp-round" onClick={onMute} aria-label={muted ? 'Sound on' : 'Sound off'} data-testid="gulp-mute">
            {muted ? <SpeakerOffIcon size={22} /> : <SpeakerIcon size={22} />}
          </button>
          <button type="button" className="gulp-round gulp-pause-btn" onClick={onPause} aria-label="Pause" title="Pause (space)" data-testid="gulp-pause">
            <PauseIcon size={22} />
            <span className="gulp-pause-label">Pause</span>
          </button>
        </div>
      </div>

      {!over && hud.streak >= 3 && (
        <div key={hud.combo} className={`gulp-combo c${hud.combo}`} data-testid="gulp-combo">
          {hud.combo > 1 && (
            <>
              <em>POINTS</em>
              <b>x{hud.combo}</b>
            </>
          )}
          <span>{hud.streak} gulps in a row</span>
        </div>
      )}

      {!over && hud.pointers.map((p) => (
        <div
          key={p.key}
          className={`gulp-pointer ${p.kind === 'hole' ? 'danger' : 'attack'}`}
          // Kept clear of the screen's sides, so the label is never cut off.
          style={{ left: `clamp(96px, ${50 + Math.sin(p.angle) * 42}%, calc(100% - 96px))`, top: `${50 - Math.cos(p.angle) * 36}%` }}
          data-testid="gulp-pointer"
        >
          <span className="gulp-pointer-arrow" style={{ transform: `rotate(${p.angle}rad)` }} aria-hidden="true" />
          <span className="gulp-pointer-label">{p.label}</span>
        </div>
      ))}

      {hud.nearEdge && (
        <div className="gulp-edge" role="status" data-testid="gulp-edge">
          <WarningIcon size={20} />
          <span>That's the edge of the world! Turn back</span>
        </div>
      )}

      {hud.countdown > 0 && (
        <div className="gulp-countdown" aria-live="assertive" data-testid="gulp-countdown">
          {hud.countdown}
        </div>
      )}
      {hud.countdown === 0 && hud.elapsed < 0.8 && <div className="gulp-countdown go">GO!</div>}

      {!hud.alive && (
        <div className="gulp-eaten" aria-live="assertive" data-testid="gulp-eaten">
          <span className="gulp-eaten-kicker">Swallowed by</span>
          <strong>{hud.eatenBy}</strong>
          <span>Back in {hud.respawnIn}</span>
          {hud.lives !== null && (
            <span className="gulp-eaten-lives">
              <HeartIcon size={18} /> {hud.lives} {hud.lives === 1 ? 'life' : 'lives'} left
            </span>
          )}
        </div>
      )}

      {/* Messages stack at the bottom, one above the other, so they never overlap. */}
      <div className="gulp-messages">
        {shown && (
          <div className="gulp-notice" role="status" data-testid="gulp-notice">
            {shown}
          </div>
        )}
        {top && hud.alive && (
          <div key={top.id} className={`gulp-banner ${top.kind}${top.points !== undefined ? ' prize' : ''}`} aria-live="polite" data-testid="gulp-banner">
            {top.kind === 'warn' && <WarningIcon size={22} />}
            <strong>{top.text}</strong>
            {top.sub && <span>{top.sub}</span>}
            {top.points !== undefined && <span className="gulp-prize">+{top.points.toLocaleString()} points</span>}
          </div>
        )}
        {news && (
          <div key={news.id} className="gulp-news" aria-live="polite" data-testid="gulp-news">
            <span className="gulp-news-tag">Breaking news</span>
            <span className="gulp-news-text">{news.text}</span>
          </div>
        )}
        {hud.elapsed < 5 && hud.countdown === 0 && (
          <div className="gulp-hint">
            <span className="gulp-joy">
              <JoystickIcon size={24} />
            </span>
            {touch ? 'Drag anywhere to move' : 'Point with the mouse, or use the arrow keys'}
          </div>
        )}
      </div>
    </div>
  );
}

const BANNER_RANK: Record<Banner['kind'], number> = { warn: 3, hurt: 3, level: 2, good: 1, news: 0 };
const rankOf = (b: Banner) => (b.points !== undefined ? 2.5 : BANNER_RANK[b.kind]);
