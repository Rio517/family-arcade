/**
 * The campaign's turn logic, extracted from RiskPage so both humans (via the
 * board's pick events) and computer generals (via the bot effect, ADR 0009)
 * drive the same dispatchers. Pure rules stay in domain/; this hook owns the
 * React state, selection flow, and autosave.
 */
import { useEffect, useMemo, useState } from 'react';
import { mapById } from '../maps/registry';
import type { RiskMap } from '../maps/types';
import {
  canAttack,
  canFortify,
  connectedOwned,
  endAttack,
  endReinforce,
  endTurn,
  fortify,
  newGame,
  placeArmy,
  resolveAttack,
  type NewPlayer,
} from '../domain/rules';
import { clearRiskGame, saveRiskGame, type StoredRisk } from '../storage/riskPersistence';
import type { BattleResult, DiceMode, GameState } from '../domain/types';

export interface StartConfig {
  mapId: string;
  players: NewPlayer[];
  diceMode: DiceMode;
}

export interface UseRiskResult {
  map: RiskMap | null;
  state: GameState | null;
  sel: string | null;
  dest: string | null;
  moveCount: number;
  battle: BattleResult | null;
  targets: Set<string>;
  start(cfg: StartConfig): void;
  /** False when the stored map no longer exists (app update) — save dropped. */
  resume(saved: StoredRisk): boolean;
  pick(id: string): void;
  setMoveCount(n: number): void;
  doneReinforce(): void;
  doneAttack(): void;
  doneTurn(): void;
  confirmFortify(): void;
  cancelSelection(): void;
  newCampaign(): void;
}

export function useRisk(): UseRiskResult {
  const [map, setMap] = useState<RiskMap | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [dest, setDest] = useState<string | null>(null);
  const [moveCount, setMoveCount] = useState(1);
  const [battle, setBattle] = useState<BattleResult | null>(null);

  // The campaign auto-saves after every action; a finished war clears itself.
  useEffect(() => {
    if (!state) return;
    if (state.phase === 'over') clearRiskGame();
    else saveRiskGame(state);
  }, [state]);

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

  function cancelSelection() {
    setSel(null);
    setDest(null);
    setBattle(null);
    setMoveCount(1);
  }

  function start(cfg: StartConfig) {
    const rendered = mapById(cfg.mapId).build();
    setMap(rendered);
    setState(newGame(rendered.topology, cfg.players, Math.random, cfg.diceMode));
    cancelSelection();
  }

  function resume(saved: StoredRisk): boolean {
    try {
      const rendered = mapById(saved.state.mapId).build();
      setMap(rendered);
      setState(saved.state);
      cancelSelection();
      return true;
    } catch {
      // The saved map no longer exists (app update) — drop the stale save.
      clearRiskGame();
      return false;
    }
  }

  function newCampaign() {
    setState(null);
    setMap(null);
    cancelSelection();
  }

  function pick(id: string) {
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
        cancelSelection();
      } else if (canFortify(state, topo, sel, id)) {
        setDest(id);
        setMoveCount(Math.max(1, state.territories[sel].armies - 1));
      } else if (t.owner === state.current && t.armies >= 2) {
        setSel(id);
        setDest(null);
      }
    }
  }

  function doneReinforce() {
    if (state) setState(endReinforce(state));
  }

  function doneAttack() {
    if (!state) return;
    setState(endAttack(state));
    cancelSelection();
  }

  function doneTurn() {
    if (!state || !map) return;
    setState(endTurn(state, map.topology));
    cancelSelection();
  }

  function confirmFortify() {
    if (!state || !map || sel === null || dest === null) return;
    setState(fortify(state, map.topology, sel, dest, moveCount));
    cancelSelection();
  }

  return {
    map,
    state,
    sel,
    dest,
    moveCount,
    battle,
    targets,
    start,
    resume,
    pick,
    setMoveCount,
    doneReinforce,
    doneAttack,
    doneTurn,
    confirmFortify,
    cancelSelection,
    newCampaign,
  };
}
