/**
 * What the child sees over a round: the leaderboard, the clock, the level
 * meter with what comes next, power-ups running, and banners for level-ups,
 * warnings and being swallowed. It renders a snapshot the page copies out
 * of the live world a few times a second.
 */
import { BoltIcon, ClockIcon, PauseIcon, SpeakerIcon, SpeakerOffIcon, StarIcon, WarningIcon } from '@shared/ui/icons';
import type { Banner, Hud, HudRow } from './round';

const short = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n.toLocaleString());

export function GulpHud({
  hud,
  banners,
  muted,
  onMute,
  onPause,
  touch,
}: {
  hud: Hud;
  banners: Banner[];
  muted: boolean;
  onMute: () => void;
  onPause: () => void;
  touch: boolean;
}) {
  const row = (r: HudRow) => (
    <li key={r.id} className={r.me ? 'me' : ''}>
      <span className="gulp-rank">{r.rank}</span>
      <span className="gulp-dot" style={{ background: r.css }} aria-hidden="true" />
      <span className="gulp-name">{r.name}</span>
      <b>{short(r.score)}</b>
    </li>
  );
  const news = banners.filter((b) => b.kind === 'news').pop();
  const top = banners.filter((b) => b.kind !== 'news').pop();
  return (
    <div className="gulp-hud" data-testid="gulp-hud">
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
            <small>LV</small>
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
        <span className="gulp-wonders" title="Wonders swallowed" data-testid="gulp-wonders">
          <StarIcon size={18} />
          {hud.wonders}/{hud.wondersTotal}
        </span>
        <span className="gulp-kills" title="Holes swallowed" data-testid="gulp-kills">
          <span className="gulp-kills-icon" aria-hidden="true" />
          {hud.kills}
        </span>
        <button type="button" className="gulp-round" onClick={onMute} aria-label={muted ? 'Sound on' : 'Sound off'} data-testid="gulp-mute">
          {muted ? <SpeakerOffIcon size={22} /> : <SpeakerIcon size={22} />}
        </button>
        <button type="button" className="gulp-round" onClick={onPause} aria-label="Pause" data-testid="gulp-pause">
          <PauseIcon size={22} />
        </button>
      </div>

      {hud.streak >= 3 && (
        <div key={hud.combo} className={`gulp-combo c${hud.combo}`} data-testid="gulp-combo">
          {hud.combo > 1 && (
            <>
              <b>x{hud.combo}</b>
              <em>COMBO</em>
            </>
          )}
          <span>{hud.streak} gulps!</span>
        </div>
      )}

      {news && (
        <div key={news.id} className="gulp-news" aria-live="polite" data-testid="gulp-news">
          <span className="gulp-news-tag">Breaking news</span>
          <span className="gulp-news-text">{news.text}</span>
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
        </div>
      )}

      {top && hud.alive && (
        <div key={top.id} className={`gulp-banner ${top.kind}`} aria-live="polite" data-testid="gulp-banner">
          {top.kind === 'warn' && <WarningIcon size={22} />}
          <strong>{top.text}</strong>
          {top.sub && <span>{top.sub}</span>}
        </div>
      )}

      {hud.elapsed < 5 && hud.countdown === 0 && (
        <div className="gulp-hint">{touch ? 'Drag anywhere to move' : 'Point with the mouse, or use the arrow keys'}</div>
      )}
    </div>
  );
}
