import '../styles/risk.css';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RiskBoard } from './RiskBoard';
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
  placeArmy,
  resolveAttack,
  territoriesOf,
  type NewPlayer,
} from '../domain/rules';
import type { BattleResult, GameState } from '../domain/types';

const PLAYER_COLORS = ['#dc2626', '#2563eb', '#16a34a', '#ca8a04', '#9333ea', '#0d9488'];
const PLAYER_NAMES = ['Red', 'Blue', 'Green', 'Gold', 'Purple', 'Teal'];

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
    const mod = mapById(mapId);
    const rendered = mod.build();
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

    if (state.phase === 'reinforce') {
      if (t.owner === state.current && state.toPlace > 0) setState(placeArmy(state, id));
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
        // Keep attacking from the same territory while it can still push.
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

  // ── Setup screen ──────────────────────────────────────────────────────────
  if (!state || !map) {
    return (
      <Shell onMenu={goMenu}>
        <div className="narrow-col stack">
          <div className="panel">
            <h2>Players</h2>
            <div className="risk-count">
              {[2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  className={`btn ${count === n ? 'btn-primary' : ''}`}
                  onClick={() => setCount(n)}
                  data-testid={`count-${n}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="stack" style={{ marginTop: 12 }}>
              {Array.from({ length: count }, (_, i) => (
                <div className="risk-player-row" key={i}>
                  <span className="risk-swatch" style={{ background: PLAYER_COLORS[i] }} />
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
              <h2>Map</h2>
              <div className="risk-count">
                {MAPS.map((m) => (
                  <button key={m.id} className={`btn ${mapId === m.id ? 'btn-primary' : ''}`} onClick={() => setMapId(m.id)}>
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button className="btn btn-primary btn-lg btn-block" onClick={start} data-testid="risk-start">
            Start conquest
          </button>
        </div>
      </Shell>
    );
  }

  // ── Result ────────────────────────────────────────────────────────────────
  if (state.phase === 'over' && state.winner !== null) {
    const w = state.players[state.winner];
    return (
      <Shell onMenu={goMenu}>
        <div className="narrow-col stack">
          <div className="panel result-panel won">
            <div className="result-hero">
              <div className="result-emblem win"><span className="risk-crown" style={{ background: w.color }} /></div>
              <div className="big win reveal">{w.name} conquers the world!</div>
              <p className="result-flavor reveal">Every territory flies one banner. Well played, general.</p>
            </div>
          </div>
          <button className="btn btn-primary btn-lg btn-block" onClick={() => { setState(null); setMap(null); }} data-testid="risk-again">
            New game
          </button>
          <button className="btn btn-block" onClick={goMenu}>← Back to menu</button>
        </div>
      </Shell>
    );
  }

  // ── Play ──────────────────────────────────────────────────────────────────
  const me = currentPlayer(state);
  const owned = territoriesOf(state, state.current).length;

  return (
    <Shell onMenu={goMenu}>
      <div className="risk-hud">
        <span className="risk-turn" style={{ ['--pc' as string]: me.color }} data-testid="risk-turn">
          <span className="risk-dot" /> {me.name}
        </span>
        <span className="risk-phase" data-testid="risk-phase">
          {state.phase === 'reinforce' && `Reinforce — place ${state.toPlace}`}
          {state.phase === 'attack' && 'Attack'}
          {state.phase === 'fortify' && 'Fortify'}
        </span>
        <span className="risk-owned">{owned} territories</span>
      </div>

      <RiskBoard map={map} state={state} selected={sel} targets={targets} onPick={onPick} />

      <div className="risk-controls">
        {state.phase === 'reinforce' && (
          <>
            <p className="subtle">Tap your territories to place {state.toPlace} arm{state.toPlace === 1 ? 'y' : 'ies'}.</p>
            <button className="btn btn-primary btn-block" disabled={state.toPlace > 0} onClick={() => setState(endReinforce(state))} data-testid="end-reinforce">
              {state.toPlace > 0 ? `Place ${state.toPlace} more` : 'Begin attacks →'}
            </button>
          </>
        )}

        {state.phase === 'attack' && (
          <>
            {battle ? (
              <DiceRow battle={battle} state={state} />
            ) : (
              <p className="subtle">Tap one of your territories (2+ armies), then an adjacent enemy to attack.</p>
            )}
            <button className="btn btn-block" onClick={() => { setState(endAttack(state)); resetSelection(); }} data-testid="end-attack">
              End attacks →
            </button>
          </>
        )}

        {state.phase === 'fortify' && (
          <>
            {sel && dest ? (
              <div className="risk-fortify">
                <p className="subtle">Move armies, then confirm.</p>
                <input
                  type="range"
                  min={1}
                  max={state.territories[sel].armies - 1}
                  value={moveCount}
                  onChange={(e) => setMoveCount(Number(e.target.value))}
                  data-testid="fortify-range"
                />
                <div className="risk-fortify-actions">
                  <button className="btn btn-primary" onClick={() => { setState(fortify(state, map.topology, sel, dest, moveCount)); resetSelection(); }} data-testid="fortify-confirm">
                    Move {moveCount} →
                  </button>
                  <button className="btn" onClick={resetSelection}>Cancel</button>
                </div>
              </div>
            ) : (
              <p className="subtle">Optional: tap a territory, then a connected one of yours to move armies.</p>
            )}
            <button className="btn btn-block" onClick={() => { setState(endTurn(state, map.topology)); resetSelection(); }} data-testid="end-turn">
              End turn →
            </button>
          </>
        )}

        <ContinentLegend map={map} state={state} />
      </div>
    </Shell>
  );
}

function Shell({ children, onMenu }: { children: React.ReactNode; onMenu: () => void }) {
  return (
    <div className="app">
      <div className="topbar">
        <button className="back-link" onClick={onMenu} data-testid="risk-back">‹ Menu</button>
        <h1>Risk</h1>
        <span className="spacer" />
      </div>
      {children}
      <div className="footer"><Link to="/">Family game console</Link></div>
    </div>
  );
}

function DiceRow({ battle, state }: { battle: BattleResult; state: GameState }) {
  return (
    <div className="risk-dice" data-testid="dice-row">
      <div className="dice-side att">
        {battle.attackerDice.map((d, i) => <span key={i} className="die">{d}</span>)}
        <span className="dice-lbl">attack</span>
      </div>
      <div className="dice-side def">
        {battle.defenderDice.map((d, i) => <span key={i} className="die">{d}</span>)}
        <span className="dice-lbl">defend</span>
      </div>
      <div className="dice-outcome">
        {battle.captured ? 'Captured!' : `−${battle.attackerLosses} you · −${battle.defenderLosses} them`}
        {state.phase === 'over' && ' · game over'}
      </div>
    </div>
  );
}

function ContinentLegend({ map, state }: { map: RiskMap; state: GameState }) {
  return (
    <div className="risk-legend">
      {map.continents.map((c) => {
        const terrs = map.topology.continents.find((x) => x.id === c.id)?.territoryIds ?? [];
        const owners = new Set(terrs.map((t) => state.territories[t]?.owner));
        const holder = owners.size === 1 ? [...owners][0] : -1;
        const held = holder >= 0 ? state.players[holder] : null;
        return (
          <span key={c.id} className="risk-legend-item">
            <span className="risk-legend-chip" style={{ background: c.color }} />
            {c.name} <strong>+{c.bonus}</strong>
            {held && <span className="risk-legend-held" style={{ color: held.color }}>· {held.name}</span>}
          </span>
        );
      })}
    </div>
  );
}
