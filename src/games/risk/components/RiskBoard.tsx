import type { GameState } from '../domain/types';
import type { RiskMap } from '../maps/types';
import type { MapZoom } from './useMapZoom';
import { paperGrainDataUrl } from './paperGrain';

interface RiskBoardProps {
  map: RiskMap;
  state: GameState;
  /** The territory currently picked as the source of an attack/fortify. */
  selected: string | null;
  /** Territories that are valid targets right now (highlighted). */
  targets: Set<string>;
  onPick: (territoryId: string) => void;
  /** Pinch/scroll zoom and drag panning. Omitted, the map sits at full extent. */
  zoom?: MapZoom;
}

/**
 * Faint engraved continent names at the centroid of their territories, each
 * with its army bonus inked underneath — the income is ON the map, where the
 * decision gets made, not in a legend at the screen's edge. A wholly-held
 * continent shows its bonus in the holder's colour: someone is being paid.
 */
function continentLabels(map: RiskMap, state: GameState) {
  return map.continents.map((c) => {
    const ids = map.topology.continents.find((x) => x.id === c.id)?.territoryIds ?? [];
    const pts = ids.map((id) => map.territories.find((t) => t.id === id)).filter(Boolean) as RiskMap['territories'];
    const x = pts.reduce((s, p) => s + p.labelX, 0) / (pts.length || 1);
    const y = pts.reduce((s, p) => s + p.labelY, 0) / (pts.length || 1);
    const owners = new Set(ids.map((id) => state.territories[id]?.owner));
    const sole = owners.size === 1 ? [...owners][0] : -1;
    const heldBy = sole >= 0 ? state.players[sole]?.color ?? null : null;
    return { id: c.id, name: c.name, bonus: c.bonus, x, y, heldBy };
  });
}

/**
 * The board, drawn as a hand-tinted antique map: parchment sea with a faint
 * graticule, engraved continent names, territories washed in their owner's
 * heraldic colour, and brass army tokens. A compass rose and a brass rule frame
 * the theatre. Scales to its container via the SVG viewBox.
 */
export function RiskBoard({ map, state, selected, targets, onPick, zoom }: RiskBoardProps) {
  // A pan that ends over a country must not also select it. Every pick goes
  // through here so the guard can't be forgotten on one of the two paths
  // (the territory path and its larger invisible token hit-circle).
  const pick = (id: string) => {
    if (zoom?.wasDragged()) return;
    onPick(id);
  };
  const grain = paperGrainDataUrl();
  const conts = continentLabels(map, state);
  return (
    <div className="risk-board">
      {/* No role="img" on the svg — that would hide every descendant from
          assistive tech; the territories inside are real interactive buttons. */}
      <svg
        viewBox={zoom ? zoom.viewBox : `0 0 ${map.width} ${map.height}`}
        className={`risk-svg ${zoom?.panning ? 'panning' : ''}`}
        aria-label="World map"
        data-testid="risk-map"
        {...zoom?.bind}
      >
        <defs>
          {/* The parchment grain is a baked bitmap tile, NOT a live filter.
              An feTurbulence here re-generated its noise at every new zoom
              scale — ~430ms a frame at tablet resolution — so pinch crawled. */}
          {grain && (
            <pattern id="risk-grain" patternUnits="userSpaceOnUse" width={256} height={256}>
              <image href={grain} width={256} height={256} />
            </pattern>
          )}
          <radialGradient id="risk-vignette" cx="50%" cy="48%" r="72%">
            <stop offset="60%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#3a2a12" stopOpacity="0.5" />
          </radialGradient>
          {/* Soft dark halo behind army counts so light digits read on any land colour. */}
          <radialGradient id="risk-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#140c04" stopOpacity="0.72" />
            <stop offset="58%" stopColor="#140c04" stopOpacity="0.48" />
            <stop offset="100%" stopColor="#140c04" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect x={0} y={0} width={map.width} height={map.height} className="risk-sea" />
        {grain && <rect x={0} y={0} width={map.width} height={map.height} className="risk-grain" fill="url(#risk-grain)" />}
        <path d={map.graticule} className="risk-graticule" />

        {conts.map((c) => (
          <text key={c.id} className="risk-continent-label" x={c.x} y={c.y}>{c.name}</text>
        ))}

        {map.territories.map((t) => {
          const st = state.territories[t.id];
          const owner = st?.owner ?? -1;
          const fill = owner >= 0 ? state.players[owner].color : '#8a7a55';
          const cls = ['risk-terr', selected === t.id ? 'sel' : '', targets.has(t.id) ? 'target' : '']
            .filter(Boolean).join(' ');
          const armies = st?.armies ?? 0;
          const label =
            owner >= 0
              ? `${t.name} — ${state.players[owner].name}, ${armies} ${armies === 1 ? 'army' : 'armies'}`
              : `${t.name} — unclaimed`;
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
                onClick={() => pick(t.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    pick(t.id);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={label}
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

        {/* The continents' army bonuses, stamped ON TOP of the colour washes —
            under them (with the engraved names) they ghosted to invisibility.
            aria-hidden: decorative duplicates of what the help card explains. */}
        <g aria-hidden="true">
          {conts.map((c) => (
            <g key={`bn-${c.id}`} className="risk-bonus" transform={`translate(${c.x},${c.y + 15})`} data-testid={`bonus-${c.id}`}>
              <rect
                className="risk-bonus-chip"
                x={-15}
                y={-8.5}
                width={30}
                height={17}
                rx={8.5}
                style={c.heldBy ? { stroke: c.heldBy } : undefined}
              />
              <text className="risk-bonus-num" dy="4">+{c.bonus}</text>
            </g>
          ))}
        </g>

        {map.territories.map((t) => {
          const st = state.territories[t.id];
          // The token doubles as a (much larger) tap target for the territory —
          // vital for tiny lands like Cuba or New Zealand on a phone. EVERY
          // territory gets the invisible hit circle, even unclaimed ones: the
          // claim phase is the tappiest of all. The army badge itself only
          // appears once someone owns the land. aria-hidden because the
          // territory path is the accessible control — this is a duplicate
          // pointer target and its army count is already in the path's label.
          return (
            <g
              key={`b-${t.id}`}
              className="risk-badge"
              transform={`translate(${t.labelX},${t.labelY})`}
              onClick={() => pick(t.id)}
              data-testid={`token-${t.id}`}
              aria-hidden="true"
            >
              <circle r={22} className="risk-token-hit" />
              {st && st.owner !== -1 && (
                <>
                  <circle r={10.5} className="risk-token-halo" fill="url(#risk-halo)" />
                  <text className="risk-token-num" dy="3.9">{st.armies}</text>
                </>
              )}
            </g>
          );
        })}

        <SeaShip x={533} y={430} />
        <CompassRose x={70} y={map.height - 78} />
        <rect x={5} y={5} width={map.width - 10} height={map.height - 10} className="risk-frame-inner" />
        <rect x={0} y={0} width={map.width} height={map.height} fill="url(#risk-vignette)" pointerEvents="none" />
      </svg>
    </div>
  );
}

/**
 * A decorative antique galleon under full sail, for the open ocean — the kind
 * of flourish an old cartographer would ink into empty water. Hand-drawn:
 * walnut hull, three masts of billowing parchment sails, a swallowtail pennant,
 * and a dotted wake. Purely ornamental (aria-hidden, no pointer events).
 */
function SeaShip({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y}) scale(0.66)`} aria-hidden="true">
      <g className="risk-ship">
      {/* Wake — dotted ripples trailing the hull. */}
      <g className="rs-wake">
        <path d="M-50,9 q-18,3 -34,0" />
        <path d="M-46,14 q-22,4 -42,1" />
        <path d="M-38,5 q-15,2 -28,0" />
      </g>
      {/* Standing rigging — stays from the mastheads down to bow and stern. */}
      <g className="rs-rigging">
        <line x1="2" y1="-76" x2="-46" y2="-7" />
        <line x1="2" y1="-76" x2="48" y2="-7" />
        <line x1="-24" y1="-58" x2="-46" y2="-7" />
        <line x1="26" y1="-52" x2="48" y2="-7" />
      </g>
      {/* Masts. */}
      <g className="rs-mast">
        <line x1="-24" y1="-9" x2="-24" y2="-58" />
        <line x1="2" y1="-9" x2="2" y2="-78" />
        <line x1="26" y1="-9" x2="26" y2="-52" />
      </g>
      {/* Sails — billowing parchment, bellying out to the right. */}
      <g className="rs-sails">
        <path className="rs-sail" d="M-38,-30 Q-24,-24 -12,-30 Q-7,-19 -13,-11 Q-24,-7 -35,-11 Q-40,-21 -38,-30 Z" />
        <path className="rs-sail" d="M-11,-73 Q2,-67 16,-73 Q21,-62 15,-53 Q2,-49 -8,-53 Q-13,-63 -11,-73 Z" />
        <path className="rs-sail" d="M-15,-47 Q2,-40 21,-47 Q28,-30 20,-13 Q2,-8 -11,-13 Q-19,-30 -15,-47 Z" />
        <path className="rs-sail" d="M13,-44 Q26,-39 38,-44 Q43,-30 37,-13 Q26,-9 16,-13 Q11,-28 13,-44 Z" />
      </g>
      {/* Yards (spars) across the masts. */}
      <g className="rs-mast">
        <line x1="-40" y1="-30" x2="-10" y2="-30" />
        <line x1="-13" y1="-73" x2="18" y2="-73" />
        <line x1="-17" y1="-47" x2="23" y2="-47" />
        <line x1="11" y1="-44" x2="40" y2="-44" />
      </g>
      {/* Swallowtail pennant at the mainmast head. */}
      <path className="rs-pennant" d="M2,-78 L30,-81 L23,-83 L31,-86 L2,-84 Z" />
      {/* Hull — a walnut carrack with a raised stern. */}
      <path className="rs-hull" d="M-46,-9 L48,-9 Q54,-3 45,5 Q27,16 -2,16 Q-30,16 -42,4 Q-51,-2 -46,-9 Z" />
      <path className="rs-hull-line" d="M-43,-3 Q1,7 47,-3" />
      </g>
    </g>
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
