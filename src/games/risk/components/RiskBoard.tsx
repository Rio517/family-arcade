import type { GameState } from '../domain/types';
import type { RiskMap } from '../maps/types';

interface RiskBoardProps {
  map: RiskMap;
  state: GameState;
  /** The territory currently picked as the source of an attack/fortify. */
  selected: string | null;
  /** Territories that are valid targets right now (highlighted). */
  targets: Set<string>;
  onPick: (territoryId: string) => void;
}

const continentColor = (map: RiskMap, id: string) =>
  map.continents.find((c) => c.id === id)?.color ?? '#64748b';

/**
 * The world board. Territories are filled with their owner's colour and
 * outlined in their continent's colour; a badge shows the army count. The whole
 * thing scales to its container via the SVG viewBox.
 */
export function RiskBoard({ map, state, selected, targets, onPick }: RiskBoardProps) {
  return (
    <div className="risk-board">
      <svg viewBox={`0 0 ${map.width} ${map.height}`} className="risk-svg" role="img" aria-label="World map">
        <rect x={0} y={0} width={map.width} height={map.height} className="risk-sea" />
        {map.territories.map((t) => {
          const owner = state.territories[t.id]?.owner ?? -1;
          const fill = owner >= 0 ? state.players[owner].color : '#334155';
          const cls = [
            'risk-terr',
            selected === t.id ? 'sel' : '',
            targets.has(t.id) ? 'target' : '',
          ].filter(Boolean).join(' ');
          return (
            <path
              key={t.id}
              d={t.path}
              className={cls}
              fill={fill}
              stroke={continentColor(map, t.continentId)}
              onClick={() => onPick(t.id)}
              data-testid={`terr-${t.id}`}
            >
              <title>{t.name}</title>
            </path>
          );
        })}
        {map.territories.map((t) => {
          const st = state.territories[t.id];
          if (!st) return null;
          return (
            <g key={`b-${t.id}`} className="risk-badge" transform={`translate(${t.labelX},${t.labelY})`}>
              <circle r={9} className="risk-badge-bg" />
              <text className="risk-badge-num" dy="3.2">{st.armies}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
