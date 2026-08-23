import type { CSSProperties } from 'react';

import type { NavalShipState, NavalState } from '../../domain/naval/types';

export interface HtmlTacticalChartProps {
  state: NavalState;
  unavailable?: boolean;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function chartPoint(state: NavalState, ship: NavalShipState): { x: number; y: number } {
  const scale = 44 / state.input.arenaRadius;
  return {
    x: clamp(50 + ship.position.x * scale, 4, 96),
    y: clamp(50 - ship.position.z * scale, 4, 96),
  };
}

function ShipMark({ state, ship, side }: { state: NavalState; ship: NavalShipState; side: 'player' | 'opponent' }) {
  const point = chartPoint(state, ship);
  const style = {
    '--ship-x': `${point.x}%`,
    '--ship-y': `${point.y}%`,
    '--ship-heading': `${ship.heading * 180 / Math.PI}deg`,
  } as CSSProperties;

  return (
    <div className={`naval-chart-ship naval-chart-ship--${side}`} style={style}>
      <svg viewBox="0 0 44 72" aria-hidden="true">
        <path className="naval-chart-ship__hull" d="M22 3 37 22l-4 38-11 9-11-9-4-38L22 3Z" />
        <path d="M22 13v43M12 29h20M15 48h14" />
      </svg>
      <span>{ship.name}</span>
    </div>
  );
}

export function HtmlTacticalChart({ state, unavailable = true }: HtmlTacticalChartProps) {
  const player = chartPoint(state, state.ships.player);
  const opponent = chartPoint(state, state.ships.opponent);
  const windDegrees = state.input.windFrom * 180 / Math.PI;
  const distance = Math.hypot(
    state.ships.opponent.position.x - state.ships.player.position.x,
    state.ships.opponent.position.z - state.ships.player.position.z,
  );

  return (
    <figure className="naval-chart" data-testid="naval-html-chart" aria-label="Live tactical chart">
      <div className="naval-chart__plot">
        <div className="naval-chart__grid" aria-hidden="true" />
        <svg className="naval-chart__instrument" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <circle cx="50" cy="50" r="44" />
          <path d="M50 4v7M50 89v7M4 50h7M89 50h7" />
          <line
            data-testid="naval-bearing-line"
            className="naval-chart__bearing"
            x1={player.x}
            y1={player.y}
            x2={opponent.x}
            y2={opponent.y}
          />
          <g
            data-testid="naval-wind-vector"
            className="naval-chart__wind"
            style={{ transform: `rotate(${windDegrees}deg)`, transformOrigin: '50px 50px' }}
          >
            <path d="M50 15v25" />
            <path d="m45 22 5-8 5 8" />
          </g>
        </svg>
        <div className="naval-chart__range" aria-label={`Range ${distance.toFixed(1)}`}>
          <span>Range</span>
          <strong>{distance.toFixed(1)}</strong>
        </div>
        <ShipMark state={state} ship={state.ships.player} side="player" />
        <ShipMark state={state} ship={state.ships.opponent} side="opponent" />
        <span className="naval-chart__north" aria-hidden="true">N</span>
      </div>
      {unavailable && (
        <figcaption>3D sea unavailable—battle rules continue</figcaption>
      )}
    </figure>
  );
}
