/**
 * The title screen, over the live city with computer holes roaming it: pick a
 * colour, a map, how long to play, and the two extras, then PLAY.
 */
import { MAPS, type MapId } from '../domain/city';
import { SKINS } from './skins';
import type { Settings } from './round';

const MAP_ORDER: MapId[] = ['town', 'city', 'mega', 'region'];


const MAP_BLURB: Record<MapId, string> = {
  town: 'Houses, shops and a farm',
  city: 'Towers, a stadium and factories',
  mega: 'Skyscrapers and power plants',
  region: 'Farms, an airport and mountains',
};

export function GulpMenu({
  settings,
  onChange,
  onPlay,
  best,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onPlay: () => void;
  best: number;
}) {
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  const minutes = MAPS[settings.map].minutes;
  return (
    <div className="gulp-menu" data-testid="gulp-menu">
      <div className="gulp-logo" aria-label="Gulp Universe">
        <span className="gulp-logo-gulp">GULP</span>
        <span className="gulp-logo-city">UNIVERSE</span>
        <span className="gulp-tag">Swallow the city, bite by bite!</span>
      </div>

      <div className="gulp-card">
        <div className="gulp-row">
          <span className="gulp-label" id="gulp-skin-label">
            Your hole
          </span>
          <div className="gulp-skins" role="radiogroup" aria-labelledby="gulp-skin-label">
            {SKINS.map((skin, i) => (
              <button
                key={skin.name}
                type="button"
                role="radio"
                aria-checked={settings.skin === i}
                aria-label={skin.name}
                title={skin.name}
                className={`gulp-skin ${settings.skin === i ? 'on' : ''}`}
                style={{ '--hole': skin.css } as React.CSSProperties}
                onClick={() => set({ skin: i })}
                data-testid={`gulp-skin-${i}`}
              >
                <span className="gulp-skin-eyes" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>

        <div className="gulp-row">
          <span className="gulp-label" id="gulp-map-label">
            Map
          </span>
          <div className="gulp-maps" role="radiogroup" aria-labelledby="gulp-map-label">
            {MAP_ORDER.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={settings.map === m}
                className={`gulp-map ${settings.map === m ? 'on' : ''}`}
                onClick={() => set({ map: m })}
                data-testid={`gulp-map-${m}`}
              >
                <b>{MAPS[m].label}</b>
                <small>{MAP_BLURB[m]}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="gulp-row">
          <span className="gulp-label" id="gulp-time-label">
            Time
          </span>
          <div className="gulp-seg" role="radiogroup" aria-labelledby="gulp-time-label">
            {(
              [
                ['short', `${minutes} min`],
                ['long', `${minutes * 2} min`],
                ['endless', 'No limit'],
              ] as const
            ).map(([len, label]) => (
              <button
                key={len}
                type="button"
                role="radio"
                aria-checked={settings.length === len}
                className={settings.length === len ? 'on' : ''}
                onClick={() => set({ length: len })}
                data-testid={`gulp-time-${len}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="gulp-row gulp-toggles">
          <button
            type="button"
            className={`gulp-toggle ${settings.powerups ? 'on' : ''}`}
            aria-pressed={settings.powerups}
            onClick={() => set({ powerups: !settings.powerups })}
            data-testid="gulp-powerups"
          >
            <span className="gulp-switch" aria-hidden="true" />
            <span>
              <b>Power-ups</b>
              <small>Speed boosts and double points</small>
            </span>
          </button>
          <button
            type="button"
            className={`gulp-toggle ${settings.fightBack ? 'on' : ''}`}
            aria-pressed={settings.fightBack}
            onClick={() => set({ fightBack: !settings.fightBack })}
            data-testid="gulp-fightback"
          >
            <span className="gulp-switch" aria-hidden="true" />
            <span>
              <b>The city fights back</b>
              <small>Trucks, planes and a gassy factory</small>
            </span>
          </button>
        </div>

        <button type="button" className="gulp-play" onClick={onPlay} data-testid="gulp-play">
          PLAY
        </button>
        <p className="gulp-foot">
          {best > 0 ? (
            <>
              Best on {MAPS[settings.map].label}: <b data-testid="gulp-best">{best.toLocaleString()}</b> ·{' '}
            </>
          ) : null}
          Drag, point with the mouse, or use the arrow keys
        </p>
      </div>
    </div>
  );
}
