import { TargetIcon } from '@shared/ui/icons';

import type { Broadside, NavalShipState, NavalState } from '../../domain/naval/types';

export interface BattleHudProps {
  state: NavalState;
  paused: boolean;
  onTogglePause(): void;
}

function percent(value: number, maximum: number): number {
  if (maximum <= 0) return 0;
  return Math.round(Math.max(0, Math.min(1, value / maximum)) * 100);
}

function title(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function SystemValue({ label, value, maximum = 100 }: { label: string; value: number; maximum?: number }) {
  const amount = percent(value, maximum);
  return (
    <div className="naval-system-value">
      <span>{label}</span>
      <strong>{Math.round(value)}</strong>
      <i aria-hidden="true"><b style={{ width: `${amount}%` }} /></i>
    </div>
  );
}

function ReloadValue({ ship, side }: { ship: NavalShipState; side: Broadside }) {
  const reload = ship.reload[side];
  return (
    <div className="naval-reload-value">
      <span>{title(side)} reload</span>
      <strong>{reload.loaded ? 'Ready' : `${percent(reload.progress, reload.required)}%`}</strong>
    </div>
  );
}

function ShipSystems({ ship, enemy }: { ship: NavalShipState; enemy?: boolean }) {
  return (
    <section className={`naval-ship-systems${enemy ? ' naval-ship-systems--enemy' : ''}`} aria-label={`${ship.name} systems`}>
      <header>
        <span>{enemy ? 'Prize target' : 'Your sloop'}</span>
        <h2>{ship.name}</h2>
      </header>
      <div className="naval-system-grid">
        <SystemValue label="Hull" value={ship.hull} />
        <SystemValue label="Sails" value={ship.sails} />
        <SystemValue label="Crew" value={ship.crew} maximum={75} />
        <SystemValue label="Cannon" value={ship.cannon} maximum={12} />
      </div>
      <div className="naval-reload-grid">
        <ReloadValue ship={ship} side="port" />
        <ReloadValue ship={ship} side="starboard" />
      </div>
    </section>
  );
}

export function BattleHud({ state, paused, onTogglePause }: BattleHudProps) {
  const player = state.ships.player;
  const windBearing = Math.round(state.input.windFrom * 180 / Math.PI);

  return (
    <div className="naval-hud" data-testid="naval-battle-hud">
      <div className="naval-mission-line">
        <p><TargetIcon size={18} /> <span>Objective</span> <strong>Capture Red Jackdaw</strong></p>
        <p aria-label={`Trade wind ${windBearing}° / fresh`}><span>Trade wind</span> <strong>{windBearing}° / fresh</strong></p>
        <button
          type="button"
          className="naval-control naval-hit-target naval-pause-control"
          data-testid="naval-pause"
          onClick={onTogglePause}
        >
          <PauseIcon paused={paused} />
          <span>{paused ? 'Resume' : 'Pause'}</span>
          <kbd>Space / Esc</kbd>
        </button>
      </div>
      <div className="naval-opponent-rail">
        <ShipSystems ship={state.ships.opponent} enemy />
      </div>
      <div className="naval-player-rail">
        <ShipSystems ship={player} />
        <div className="naval-current-order" aria-label="Current sailing order">
          <span>Ammunition</span><strong>{title(player.ammunition)}</strong>
          <span>Sail</span><strong>{title(player.sail)} sail</strong>
        </div>
      </div>
    </div>
  );
}

function PauseIcon({ paused }: { paused: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paused ? <path d="m8 5 11 7-11 7V5Z" /> : <path d="M8 5v14M16 5v14" />}
    </svg>
  );
}
