/**
 * The title screen, over the live city with computer holes roaming it. The
 * card asks two things, which map and how long, then PLAY. Everything else
 * (the hole's colour and the three switches) sits behind Options.
 */
import { useState } from 'react';
import { CloseIcon } from '@shared/ui/icons';
import { useDismissOnEscape } from '@shared/ui/useDismissOnEscape';
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

const SWITCHES: Array<{ key: 'powerups' | 'fightBack' | 'regrow'; title: string; blurb: string }> = [
  { key: 'powerups', title: 'Power-ups', blurb: 'Speed boosts and double points' },
  { key: 'regrow', title: 'The city rebuilds', blurb: 'Eaten buildings come back, bigger each time' },
  { key: 'fightBack', title: 'The city fights back', blurb: 'Fuel trucks, planes and a gassy factory' },
];

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
  const [options, setOptions] = useState(false);
  useDismissOnEscape(options, () => setOptions(false));
  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });
  const minutes = MAPS[settings.map].minutes;
  const skin = SKINS[settings.skin % SKINS.length];

  return (
    <div className="gulp-menu" data-testid="gulp-menu">
      <div className="gulp-logo" aria-label="Gulp Universe">
        <span className="gulp-logo-gulp">GULP</span>
        <span className="gulp-logo-city">UNIVERSE</span>
        <span className="gulp-tag">Swallow the city, bite by bite!</span>
      </div>

      <div className="gulp-card">
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

        <div className="gulp-play-row">
          <button type="button" className="gulp-options-btn" onClick={() => setOptions(true)} data-testid="gulp-options">
            <span className="gulp-skin mini" style={{ '--hole': skin.css } as React.CSSProperties} aria-hidden="true">
              <span className="gulp-skin-eyes" />
            </span>
            Options
          </button>
          <button type="button" className="gulp-play" onClick={onPlay} data-testid="gulp-play">
            PLAY
          </button>
        </div>
        {best > 0 && (
          <p className="gulp-foot">
            Best on {MAPS[settings.map].label}: <b data-testid="gulp-best">{best.toLocaleString()}</b>
          </p>
        )}
      </div>

      {options && (
        /* Backdrop click is a mouse convenience; Escape and Done are the
           keyboard path. */
        /* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
        <div
          className="gulp-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOptions(false);
          }}
        >
          <div className="gulp-modal options" role="dialog" aria-modal="true" aria-label="Options" data-testid="gulp-options-dialog">
            <div className="gulp-modal-head">
              <h2>Options</h2>
              <button
                type="button"
                className="gulp-round"
                onClick={() => setOptions(false)}
                aria-label="Close"
                data-testid="gulp-options-close"
              >
                <CloseIcon size={20} />
              </button>
            </div>

            <div className="gulp-row">
              <span className="gulp-label" id="gulp-skin-label">
                Your hole
              </span>
              <div className="gulp-skins" role="radiogroup" aria-labelledby="gulp-skin-label">
                {SKINS.map((s, i) => (
                  <button
                    key={s.name}
                    type="button"
                    role="radio"
                    aria-checked={settings.skin === i}
                    aria-label={s.name}
                    title={s.name}
                    className={`gulp-skin ${settings.skin === i ? 'on' : ''}`}
                    style={{ '--hole': s.css } as React.CSSProperties}
                    onClick={() => set({ skin: i })}
                    data-testid={`gulp-skin-${i}`}
                  >
                    <span className="gulp-skin-eyes" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>

            <div className="gulp-row gulp-toggles">
              {SWITCHES.map((sw) => (
                <button
                  key={sw.key}
                  type="button"
                  className={`gulp-toggle ${settings[sw.key] ? 'on' : ''}`}
                  aria-pressed={settings[sw.key]}
                  onClick={() => set({ [sw.key]: !settings[sw.key] })}
                  data-testid={`gulp-${sw.key.toLowerCase()}`}
                >
                  <span className="gulp-switch" aria-hidden="true" />
                  <span>
                    <b>{sw.title}</b>
                    <small>{sw.blurb}</small>
                  </span>
                </button>
              ))}
            </div>

            <button type="button" className="gulp-play small" onClick={() => setOptions(false)} data-testid="gulp-options-done">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
