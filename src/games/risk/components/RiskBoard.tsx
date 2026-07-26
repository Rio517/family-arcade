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

/** Faint engraved continent names, placed at the centroid of their territories. */
function continentLabels(map: RiskMap) {
  return map.continents.map((c) => {
    const ids = map.topology.continents.find((x) => x.id === c.id)?.territoryIds ?? [];
    const pts = ids.map((id) => map.territories.find((t) => t.id === id)).filter(Boolean) as RiskMap['territories'];
    const x = pts.reduce((s, p) => s + p.labelX, 0) / (pts.length || 1);
    const y = pts.reduce((s, p) => s + p.labelY, 0) / (pts.length || 1);
    return { id: c.id, name: c.name, x, y };
  });
}

/**
 * The board, drawn as a hand-tinted antique map: parchment sea with a faint
 * graticule, engraved continent names, territories washed in their owner's
 * heraldic colour, and brass army tokens. A compass rose and a brass rule frame
 * the theatre. Scales to its container via the SVG viewBox.
 */
export function RiskBoard({ map, state, selected, targets, onPick }: RiskBoardProps) {
  return (
    <div className="risk-board">
      <svg viewBox={`0 0 ${map.width} ${map.height}`} className="risk-svg" role="img" aria-label="World map">
        <defs>
          <filter id="risk-paper">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} stitchTiles="stitch" result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.32  0 0 0 0 0.24  0 0 0 0 0.12  0 0 0 0.05 0" />
            <feComposite operator="over" in2="SourceGraphic" />
          </filter>
          <radialGradient id="risk-vignette" cx="50%" cy="48%" r="72%">
            <stop offset="60%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#3a2a12" stopOpacity="0.5" />
          </radialGradient>
          <radialGradient id="risk-brass" cx="38%" cy="32%" r="72%">
            <stop offset="0%" stopColor="#f0dca0" />
            <stop offset="55%" stopColor="#c9a860" />
            <stop offset="100%" stopColor="#8a6a34" />
          </radialGradient>
        </defs>

        <rect x={0} y={0} width={map.width} height={map.height} className="risk-sea" filter="url(#risk-paper)" />
        <path d={map.graticule} className="risk-graticule" />

        {continentLabels(map).map((c) => (
          <text key={c.id} className="risk-continent-label" x={c.x} y={c.y}>{c.name}</text>
        ))}

        {map.territories.map((t) => {
          const owner = state.territories[t.id]?.owner ?? -1;
          const fill = owner >= 0 ? state.players[owner].color : '#8a7a55';
          const cls = ['risk-terr', selected === t.id ? 'sel' : '', targets.has(t.id) ? 'target' : '']
            .filter(Boolean).join(' ');
          return (
            <g key={t.id}>
              {t.clip && (
                <clipPath id={`clip-${t.id}`}>
                  {t.clip.map((r, i) => <rect key={i} x={r[0]} y={r[1]} width={r[2]} height={r[3]} />)}
                </clipPath>
              )}
              <path
                d={t.path}
                className={cls}
                fill={fill}
                clipPath={t.clip ? `url(#clip-${t.id})` : undefined}
                onClick={() => onPick(t.id)}
                data-testid={`terr-${t.id}`}
              >
                <title>{t.name}</title>
              </path>
            </g>
          );
        })}

        {/* Internal Risk lines over the split countries. */}
        {map.dividers.map((dv, i) => (
          <g key={`dv-${i}`} className="risk-divider">
            <clipPath id={`dvclip-${i}`}><path d={dv.clip} /></clipPath>
            <g clipPath={`url(#dvclip-${i})`}>
              {dv.lines.map((l, j) => <line key={j} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} />)}
            </g>
          </g>
        ))}

        {/* Antique shipping lines for the across-water connections. */}
        <g className="risk-searoutes" aria-hidden="true">
          {map.seaRoutes.map((r, i) => (
            <g key={`sr-${i}`}>
              <path d={r.d} className="risk-searoute-shadow" />
              <path d={r.d} className="risk-searoute" />
              {r.ends.map(([x, y], j) => <circle key={j} cx={x} cy={y} r={2.4} className="risk-searoute-end" />)}
            </g>
          ))}
        </g>

        {map.territories.map((t) => {
          const st = state.territories[t.id];
          if (!st) return null;
          // The token is also a (larger) tap target for the territory — vital for
          // tiny lands like Cuba or New Zealand.
          return (
            <g
              key={`b-${t.id}`}
              className="risk-badge"
              transform={`translate(${t.labelX},${t.labelY})`}
              onClick={() => onPick(t.id)}
              data-testid={`token-${t.id}`}
            >
              <circle r={9.5} className="risk-token" />
              <circle r={9.5} className="risk-token-ring" />
              <text className="risk-token-num" dy="3.4">{st.armies}</text>
            </g>
          );
        })}

        <CompassRose x={70} y={map.height - 78} />
        <rect x={5} y={5} width={map.width - 10} height={map.height - 10} className="risk-frame-inner" />
        <rect x={0} y={0} width={map.width} height={map.height} fill="url(#risk-vignette)" pointerEvents="none" />
      </svg>
    </div>
  );
}

/** A small brass compass rose to sit over open ocean. */
function CompassRose({ x, y }: { x: number; y: number }) {
  return (
    <g className="risk-compass" transform={`translate(${x},${y})`} aria-hidden="true">
      <circle r={34} className="rc-ring" />
      <circle r={26} className="rc-ring2" />
      {/* Eight points — cardinals long, ordinals short. */}
      <path className="rc-star" d="M0 -32 L6 -6 L0 0 L-6 -6 Z" />
      <path className="rc-star" d="M0 32 L6 6 L0 0 L-6 6 Z" />
      <path className="rc-star" d="M-32 0 L-6 -6 L0 0 L-6 6 Z" />
      <path className="rc-star" d="M32 0 L6 -6 L0 0 L6 6 Z" />
      <path className="rc-star dim" d="M-20 -20 L-5 -5 L0 0 L-5 5 Z" transform="rotate(45)" />
      <path className="rc-star dim" d="M0 -22 L4 -4 L0 0 L-4 -4 Z" transform="rotate(45)" />
      <path className="rc-star dim" d="M0 -22 L4 -4 L0 0 L-4 -4 Z" transform="rotate(135)" />
      <path className="rc-star dim" d="M0 -22 L4 -4 L0 0 L-4 -4 Z" transform="rotate(225)" />
      <text className="rc-n" y={-38}>N</text>
    </g>
  );
}
