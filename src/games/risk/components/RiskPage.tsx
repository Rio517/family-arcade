import '../styles/risk.css';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RiskBoard } from './RiskBoard';
import { FullscreenButton } from '@shared/ui/FullscreenButton';
import { mapById, MAPS } from '../maps/registry';
import type { RiskMap } from '../maps/types';
import {
  canAttack,
  canFortify,
  connectedOwned,
  currentPlayer,
  endAttack,
  endReinforce,
  endTurn,
  fortify,
  newGame,
  hasUnclaimed,
  placeArmy,
  resolveAttack,
  territoriesOf,
  type NewPlayer,
} from '../domain/rules';
import type { BattleResult, GameState } from '../domain/types';

// Heraldic tinctures — a general's banner. Kept bright enough that the dark
// border lines read against them, and the six stay easy to tell apart.
const PLAYER_COLORS = ['#cf3a30', '#3f78bd', '#4f9c60', '#d69a34', '#9b5aa6', '#2fa199'];
const PLAYER_NAMES = ['Crimson', 'Cobalt', 'Forest', 'Amber', 'Plum', 'Teal'];

export function RiskPage() {
  const navigate = useNavigate();
  const [count, setCount] = useState(3);
  const [names, setNames] = useState<string[]>(PLAYER_NAMES.slice());
  const [mapId, setMapId] = useState(MAPS[0].id);

  const [map, setMap] = useState<RiskMap | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [dest, setDest] = useState<string | null>(null);
  const [moveCount, setMoveCount] = useState(1);
  const [battle, setBattle] = useState<BattleResult | null>(null);

  const targets = useMemo(() => {
    const set = new Set<string>();
    if (!state || !map || sel === null) return set;
    if (state.phase === 'attack') {
      for (const n of map.topology.adjacency[sel] ?? []) {
        if (canAttack(state, map.topology, sel, n)) set.add(n);
      }
    } else if (state.phase === 'fortify') {
      for (const d of connectedOwned(state, map.topology, sel)) set.add(d);
    }
    return set;
  }, [state, map, sel]);

  function start() {
    const rendered = mapById(mapId).build();
    const players: NewPlayer[] = Array.from({ length: count }, (_, i) => ({
      name: names[i]?.trim() || PLAYER_NAMES[i],
      color: PLAYER_COLORS[i],
    }));
    setMap(rendered);
    setState(newGame(rendered.topology, players));
    resetSelection();
  }

  function resetSelection() {
    setSel(null);
    setDest(null);
    setBattle(null);
    setMoveCount(1);
  }

  function onPick(id: string) {
    if (!state || !map) return;
    const topo = map.topology;
    const t = state.territories[id];

    if (state.phase === 'reinforce' || state.phase === 'setup') {
      // The engine knows the rules for each stage (claiming an empty land vs
      // reinforcing your own); invalid taps are simply no-ops.
      setState(placeArmy(state, id, map.topology));
      return;
    }

    if (state.phase === 'attack') {
      if (sel === null) {
        if (t.owner === state.current && t.armies >= 2) setSel(id);
      } else if (id === sel) {
        setSel(null);
      } else if (canAttack(state, topo, sel, id)) {
        const { state: ns, result } = resolveAttack(state, topo, sel, id);
        setState(ns);
        setBattle(result);
        if (ns.territories[sel].armies < 2 || ns.phase === 'over') setSel(null);
      } else if (t.owner === state.current && t.armies >= 2) {
        setSel(id);
      }
      return;
    }

    if (state.phase === 'fortify') {
      if (sel === null) {
        if (t.owner === state.current && t.armies >= 2) setSel(id);
      } else if (id === sel) {
        resetSelection();
      } else if (canFortify(state, topo, sel, id)) {
        setDest(id);
        setMoveCount(Math.max(1, state.territories[sel].armies - 1));
      } else if (t.owner === state.current && t.armies >= 2) {
        setSel(id);
        setDest(null);
      }
    }
  }

  const goMenu = () => navigate('/');

  // ── Setup: muster the generals ────────────────────────────────────────────
  if (!state || !map) {
    return (
      <Shell onMenu={goMenu}>
        <div className="narrow-col stack">
          <div className="panel">
            <div className="risk-eyebrow">The war council</div>
            <h2>Muster your generals</h2>
            <div className="risk-count">
              {[2, 3, 4, 5, 6].map((n) => (
                <button key={n} className={`risk-choice ${count === n ? 'on' : ''}`} onClick={() => setCount(n)} data-testid={`count-${n}`}>
                  {n}
                </button>
              ))}
            </div>
            <div className="stack" style={{ marginTop: 14 }}>
              {Array.from({ length: count }, (_, i) => (
                <div className="risk-player-row" key={i}>
                  <span className="risk-seal" style={{ ['--pc' as string]: PLAYER_COLORS[i] }} />
                  <input
                    value={names[i] ?? ''}
                    maxLength={16}
                    placeholder={PLAYER_NAMES[i]}
                    onChange={(e) => {
                      const next = names.slice();
                      next[i] = e.target.value;
                      setNames(next);
                    }}
                    data-testid={`name-${i}`}
                  />
                </div>
              ))}
            </div>
          </div>

          {MAPS.length > 1 && (
            <div className="panel">
              <div className="risk-eyebrow">Theatre</div>
              <div className="risk-count">
                {MAPS.map((m) => (
                  <button key={m.id} className={`risk-choice ${mapId === m.id ? 'on' : ''}`} onClick={() => setMapId(m.id)}>{m.name}</button>
                ))}
              </div>
            </div>
          )}

          <button className="risk-btn primary block lg" onClick={start} data-testid="risk-start">Take the field</button>
        </div>
      </Shell>
    );
  }

  // ── Victory ───────────────────────────────────────────────────────────────
  if (state.phase === 'over' && state.winner !== null) {
    const w = state.players[state.winner];
    return (
      <Shell onMenu={goMenu}>
        <div className="narrow-col stack">
          <div className="risk-victory">
            <WinEmblem color={w.color} />
            <div className="risk-eyebrow">Dispatch from the front</div>
            <h2 className="risk-victory-title">{w.name} holds the world</h2>
            <p className="risk-victory-sub">Every banner on the map is theirs. A decisive campaign, General.</p>
          </div>
          <button className="risk-btn primary block lg" onClick={() => { setState(null); setMap(null); }} data-testid="risk-again">New campaign</button>
          <button className="risk-btn block" onClick={goMenu}>← Back to menu</button>
        </div>
      </Shell>
    );
  }

  // ── The campaign ──────────────────────────────────────────────────────────
  const me = currentPlayer(state);
  const owned = territoriesOf(state, state.current).length;
  const claiming = state.phase === 'setup' && hasUnclaimed(state);
  const freeLands = claiming
    ? Object.values(state.territories).filter((t) => t.owner === -1).length
    : 0;
  const phaseLabel =
    claiming ? `Claim — ${freeLands} lands free` :
    state.phase === 'setup' ? `Deploy — place ${state.toPlace}` :
    state.phase === 'reinforce' ? `Reinforce — place ${state.toPlace}` :
    state.phase === 'attack' ? 'Attack' : 'Fortify';
  const turnKicker = claiming ? 'Now claiming' : state.phase === 'setup' ? 'Now deploying' : 'Now playing';

  return (
    <Shell onMenu={goMenu}>
      {/* The map IS the screen: it fills the stage and everything else floats
          over it. The stage wears the active general's colour as a glowing
          ring, and the banner re-pops on every hand-off so whose turn it is
          can't be missed — especially during the alternating deploy. */}
      <div className="risk-stage" style={{ ['--pc' as string]: me.color }} data-testid="risk-stage">
        <RiskBoard map={map} state={state} selected={sel} targets={targets} onPick={onPick} accent={me.color} />

        <div className="risk-banner" key={`${state.current}-${state.phase === 'setup' ? 's' : 'p'}`}>
          <span className="risk-general" data-testid="risk-turn">
            <span className="risk-seal lg" style={{ ['--pc' as string]: me.color }} />
            <span className="risk-general-text">
              <span className="risk-eyebrow">{turnKicker}</span>
              <strong>{me.name}</strong>
            </span>
          </span>
          <span className="risk-phase" data-testid="risk-phase">{phaseLabel}</span>
          <span className="risk-owned"><strong>{owned}</strong> territories</span>
        </div>

        <div className="risk-dock">
        {state.phase === 'setup' && (
          <p className="risk-note">
            <strong style={{ color: me.color }}>{me.name}</strong>,{' '}
            {claiming
              ? 'tap any parchment (unclaimed) land to claim it — one army raises your flag.'
              : `tap one of your lands — ${state.toPlace} arm${state.toPlace === 1 ? 'y' : 'ies'} left.`}{' '}
            Play passes on automatically.
          </p>
        )}

        {state.phase === 'reinforce' && (
          <>
            <p className="risk-note">Tap your lands to muster {state.toPlace} arm{state.toPlace === 1 ? 'y' : 'ies'}.</p>
            <button className="risk-btn primary block" disabled={state.toPlace > 0} onClick={() => setState(endReinforce(state))} data-testid="end-reinforce">
              {state.toPlace > 0 ? `Place ${state.toPlace} more` : 'Begin the assault →'}
            </button>
          </>
        )}

        {state.phase === 'attack' && (
          <>
            {battle ? <DiceRow battle={battle} /> : <p className="risk-note">Choose one of your lands (2+ armies), then an adjacent rival to strike.</p>}
            <button className="risk-btn block" onClick={() => { setState(endAttack(state)); resetSelection(); }} data-testid="end-attack">Hold the line →</button>
          </>
        )}

        {state.phase === 'fortify' && (
          <>
            {sel && dest ? (
              <div className="risk-fortify">
                <p className="risk-note">March your reserves, then confirm.</p>
                <input type="range" min={1} max={state.territories[sel].armies - 1} value={moveCount} onChange={(e) => setMoveCount(Number(e.target.value))} data-testid="fortify-range" />
                <div className="risk-fortify-actions">
                  <button className="risk-btn primary" onClick={() => { setState(fortify(state, map.topology, sel, dest, moveCount)); resetSelection(); }} data-testid="fortify-confirm">March {moveCount} →</button>
                  <button className="risk-btn" onClick={resetSelection}>Cancel</button>
                </div>
              </div>
            ) : (
              <p className="risk-note">Optional: tap a land, then a connected land of yours to move armies.</p>
            )}
            <button className="risk-btn block" onClick={() => { setState(endTurn(state, map.topology)); resetSelection(); }} data-testid="end-turn">End turn →</button>
          </>
        )}
          <ContinentLegend map={map} state={state} />
        </div>
      </div>
    </Shell>
  );
}

const HELP_SEEN_KEY = 'risk-help-seen-v1';

function Shell({ children, onMenu }: { children: React.ReactNode; onMenu: () => void }) {
  const [showHelp, setShowHelp] = useState(false);

  // Pop the rules open the very first time someone opens Risk, so a new player
  // (or a kid) learns the game before staring at a map they don't understand.
  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(HELP_SEEN_KEY) === '1';
    } catch {
      /* private mode / storage blocked — just don't auto-open */
      seen = true;
    }
    if (!seen) {
      setShowHelp(true);
      try {
        localStorage.setItem(HELP_SEEN_KEY, '1');
      } catch { /* ignore */ }
    }
  }, []);

  return (
    <div className="app risk-theme">
      <div className="topbar risk-topbar">
        <button className="risk-btn ghost" onClick={onMenu} data-testid="risk-back">‹ Menu</button>
        <h1>Risk</h1>
        <span className="risk-topbar-rule" aria-hidden="true" />
        <button className="risk-btn ghost" onClick={() => setShowHelp(true)} data-testid="risk-help-open">
          How to play
        </button>
        <FullscreenButton />
      </div>
      {children}
      <div className="footer"><Link to="/">Family game console</Link></div>
      {showHelp && <RiskHelp onClose={() => setShowHelp(false)} />}
    </div>
  );
}

/** A friendly, kid-readable rules card, themed as a field manual. */
function RiskHelp({ onClose }: { onClose: () => void }) {
  const steps: { n: number; name: string; body: string }[] = [
    { n: 1, name: 'Reinforce', body: 'You get fresh armies at the start of your turn — more if you hold whole continents. Tap your own lands to place them.' },
    { n: 2, name: 'Attack', body: 'Tap one of your lands that has 2 or more armies, then tap a touching enemy land. Dice decide the battle — the defender wins ties. Win, and the land becomes yours. Attack as often as you like, or not at all.' },
    { n: 3, name: 'Fortify', body: 'Once per turn you may slide armies between two of your connected lands. Then tap “End turn” to pass to the next general.' },
  ];
  return (
    <div className="risk-help-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="risk-help" role="dialog" aria-label="How to play Risk" aria-modal="true">
        <div className="risk-eyebrow">The field manual</div>
        <h2 className="risk-help-title">How to play Risk</h2>
        <p className="risk-help-goal">
          <strong>Goal:</strong> conquer the world. Be the last general with any lands left on the map.
        </p>
        <p className="risk-help-sub">
          <strong>To start,</strong> you take turns <em>claiming</em> free lands — one army raises
          your flag — until the whole map is taken. Then you take turns placing the rest of your
          starting armies on your own lands. After that, play begins — every turn has three steps,
          in order:
        </p>
        <ol className="risk-help-steps">
          {steps.map((s) => (
            <li key={s.n} className="risk-help-step">
              <span className="risk-help-num">{s.n}</span>
              <span>
                <strong>{s.name}</strong>
                <span className="risk-help-body">{s.body}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="risk-help-tip">
          Your lands are the ones washed in <strong>your banner’s colour</strong>. The plaque at the top
          always shows whose turn it is and which step they’re on.
        </p>
        <button className="risk-btn primary block lg" onClick={onClose} data-testid="risk-help-close">
          Got it — take the field
        </button>
      </div>
    </div>
  );
}

const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

function Die({ v, side }: { v: number; side: 'att' | 'def' }) {
  return (
    <span className={`risk-die ${side}`}>
      <svg viewBox="0 0 30 30" aria-hidden="true">
        {(PIPS[v] ?? []).map(([c, r], i) => <circle key={i} cx={7 + c * 8} cy={7 + r * 8} r={2.7} />)}
      </svg>
    </span>
  );
}

function DiceRow({ battle }: { battle: BattleResult }) {
  return (
    <div className="risk-dice" data-testid="dice-row">
      <div className="risk-dice-side">
        <span className="risk-eyebrow">Attack</span>
        <span className="risk-dice-row">{battle.attackerDice.map((d, i) => <Die key={i} v={d} side="att" />)}</span>
      </div>
      <div className="risk-dice-side">
        <span className="risk-eyebrow">Defend</span>
        <span className="risk-dice-row">{battle.defenderDice.map((d, i) => <Die key={i} v={d} side="def" />)}</span>
      </div>
      <div className="risk-dice-outcome">
        {battle.captured ? 'Territory taken' : `−${battle.attackerLosses} yours · −${battle.defenderLosses} theirs`}
      </div>
    </div>
  );
}

function ContinentLegend({ map, state }: { map: RiskMap; state: GameState }) {
  return (
    <div className="risk-legend">
      <span className="risk-legend-title">Continents</span>
      {map.continents.map((c) => {
        const terrs = map.topology.continents.find((x) => x.id === c.id)?.territoryIds ?? [];
        const owners = new Set(terrs.map((t) => state.territories[t]?.owner));
        const held = owners.size === 1 ? state.players[[...owners][0]] : null;
        return (
          <span key={c.id} className="risk-legend-item">
            <span className="risk-legend-chip" style={{ background: c.color }} />
            {c.name} <strong>+{c.bonus}</strong>
            {held && <em className="risk-legend-held" style={{ color: held.color }}>{held.name}</em>}
          </span>
        );
      })}
    </div>
  );
}

/** A laurel-crowned wax seal in the victor's colour. */
function WinEmblem({ color }: { color: string }) {
  return (
    <svg className="risk-win-emblem" viewBox="0 0 120 120" aria-hidden="true" style={{ ['--pc' as string]: color }}>
      {/* Two laurel branches sweeping up the left and right of the seal (open at
          the top for the crown). Angle 180° is the bottom; each branch climbs
          one side. Leaves are tilted along the branch so they read as foliage. */}
      <g className="rw-laurel">
        {Array.from({ length: 7 }, (_, i) => {
          const a = 178 + i * 11; // bottom → up the left side
          return <ellipse key={`l${i}`} cx={60} cy={18} rx={5.5} ry={2.6} transform={`rotate(${a} 60 60) rotate(35 60 18)`} />;
        })}
        {Array.from({ length: 7 }, (_, i) => {
          const a = 182 - i * 11; // bottom → up the right side
          return <ellipse key={`r${i}`} cx={60} cy={18} rx={5.5} ry={2.6} transform={`rotate(${a} 60 60) rotate(-35 60 18)`} />;
        })}
      </g>
      <circle cx={60} cy={62} r={30} className="rw-ring-outer" />
      <circle cx={60} cy={62} r={25} className="rw-seal" />
      {/* crown */}
      <path className="rw-crown" d="M44 44 L48 30 L54 40 L60 26 L66 40 L72 30 L76 44 Z" />
    </svg>
  );
}
