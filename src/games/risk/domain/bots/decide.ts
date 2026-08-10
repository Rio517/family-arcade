/**
 * The Risk policy: one BotStep per call, chosen by scoring every candidate
 * and sampling with the persona's temperature (ADR 0009). Pure and seeded —
 * the same state, persona and rng always produce the same step.
 */
import { canAttack, canFortify, connectedOwned, hasUnclaimed } from '../rules';
import type { GameState, MapTopology } from '../types';
import type { RiskPersona } from './personas';

export type BotStep =
  | { kind: 'place'; territoryId: string }
  | { kind: 'doneReinforce' }
  | { kind: 'attack'; from: string; to: string }
  | { kind: 'doneAttack' }
  | { kind: 'fortify'; from: string; to: string; count: number }
  | { kind: 'doneTurn' };

interface Scored<T> {
  value: T;
  score: number;
}

/** Sample by softmax over scores: low temperature ≈ argmax, high ≈ wobble. */
function softmaxPick<T>(scored: Scored<T>[], temperature: number, rng: () => number): T {
  const max = Math.max(...scored.map((s) => s.score));
  const weights = scored.map((s) => Math.exp((s.score - max) / Math.max(temperature, 0.01)));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < scored.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return scored[i].value;
  }
  return scored[scored.length - 1].value;
}

/** Armies on enemy territories bordering `id`, minus our own garrison there. */
function frontierPressure(state: GameState, topo: MapTopology, id: string): number {
  const me = state.current;
  let enemies = 0;
  for (const n of topo.adjacency[id] ?? []) {
    const t = state.territories[n];
    if (t.owner !== -1 && t.owner !== me) enemies += t.armies;
  }
  return enemies - state.territories[id].armies;
}

/** How many territories of `continentId` the current player does NOT own. */
function missingFromContinent(state: GameState, topo: MapTopology, continentId: string): number {
  const c = topo.continents.find((x) => x.id === continentId);
  if (!c) return Infinity;
  return c.territoryIds.filter((t) => state.territories[t].owner !== state.current).length;
}

function continentOf(topo: MapTopology, id: string): string | null {
  return topo.continents.find((c) => c.territoryIds.includes(id))?.id ?? null;
}

/** +3 when placing here pushes a nearly-held continent toward its bonus. */
function completionBonus(state: GameState, topo: MapTopology, id: string): number {
  const cid = continentOf(topo, id);
  if (!cid) return 0;
  const missing = missingFromContinent(state, topo, cid);
  return missing >= 1 && missing <= 2 ? 3 : 0;
}

/** True when every territory of the continent belongs to one (enemy) owner. */
function breaksHeldContinent(state: GameState, topo: MapTopology, id: string): boolean {
  const cid = continentOf(topo, id);
  if (!cid) return false;
  const c = topo.continents.find((x) => x.id === cid)!;
  const owners = new Set(c.territoryIds.map((t) => state.territories[t].owner));
  return owners.size === 1 && !owners.has(state.current) && !owners.has(-1);
}

function decideClaim(state: GameState, topo: MapTopology, persona: RiskPersona, rng: () => number): BotStep {
  const me = state.current;
  const candidates: Scored<string>[] = [];
  for (const id of topo.territoryIds) {
    if (state.territories[id].owner !== -1) continue;
    const neighbours = topo.adjacency[id] ?? [];
    const ownedNeighbours = neighbours.filter((n) => state.territories[n].owner === me).length;
    const cid = continentOf(topo, id);
    const c = cid ? topo.continents.find((x) => x.id === cid)! : null;
    const density = c ? c.bonus / c.territoryIds.length : 0;
    candidates.push({ value: id, score: 2 * ownedNeighbours + density - 0.5 * neighbours.length });
  }
  return { kind: 'place', territoryId: softmaxPick(candidates, persona.temperature, rng) };
}

function decidePlacement(state: GameState, topo: MapTopology, persona: RiskPersona, rng: () => number): BotStep {
  const me = state.current;
  const candidates: Scored<string>[] = [];
  for (const id of topo.territoryIds) {
    if (state.territories[id].owner !== me) continue;
    candidates.push({
      value: id,
      score: frontierPressure(state, topo, id) + completionBonus(state, topo, id),
    });
  }
  return { kind: 'place', territoryId: softmaxPick(candidates, persona.temperature, rng) };
}

function decideAttack(state: GameState, topo: MapTopology, persona: RiskPersona, rng: () => number): BotStep {
  const me = state.current;
  const candidates: Scored<{ from: string; to: string }>[] = [];
  for (const from of topo.territoryIds) {
    const f = state.territories[from];
    if (f.owner !== me || f.armies < 2) continue;
    for (const to of topo.adjacency[from] ?? []) {
      if (!canAttack(state, topo, from, to)) continue;
      const advantage = f.armies - 1 - state.territories[to].armies;
      if (advantage < persona.attackEdge) continue;
      const score =
        advantage +
        (missingFromContinent(state, topo, continentOf(topo, to) ?? '') === 1 ? 3 : 0) +
        (breaksHeldContinent(state, topo, to) ? 2 : 0);
      candidates.push({ value: { from, to }, score });
    }
  }
  if (candidates.length === 0) return { kind: 'doneAttack' };
  const pickTarget = softmaxPick(candidates, persona.temperature, rng);
  return { kind: 'attack', from: pickTarget.from, to: pickTarget.to };
}

function decideFortify(state: GameState, topo: MapTopology, persona: RiskPersona, rng: () => number): BotStep {
  if (rng() >= persona.fortifyChance) return { kind: 'doneTurn' };
  const me = state.current;
  // The best spare pile: an interior territory (no enemy contact) with the
  // most armies beyond its garrison of one.
  let from: string | null = null;
  let spare = 0;
  for (const id of topo.territoryIds) {
    const t = state.territories[id];
    if (t.owner !== me || t.armies < 2) continue;
    const touchesEnemy = (topo.adjacency[id] ?? []).some((n) => {
      const nt = state.territories[n];
      return nt.owner !== -1 && nt.owner !== me;
    });
    if (touchesEnemy) continue;
    if (t.armies - 1 > spare) {
      spare = t.armies - 1;
      from = id;
    }
  }
  if (!from) return { kind: 'doneTurn' };
  // March it to the connected territory feeling the most enemy pressure.
  let to: string | null = null;
  let worst = -Infinity;
  for (const id of connectedOwned(state, topo, from)) {
    if (id === from || !canFortify(state, topo, from, id)) continue;
    const pressure = frontierPressure(state, topo, id);
    const touchesEnemy = pressure > -state.territories[id].armies;
    if (touchesEnemy && pressure > worst) {
      worst = pressure;
      to = id;
    }
  }
  if (!to) return { kind: 'doneTurn' };
  return { kind: 'fortify', from, to, count: spare };
}

export function decide(state: GameState, topo: MapTopology, persona: RiskPersona, rng: () => number): BotStep {
  if (state.phase === 'setup') {
    return hasUnclaimed(state)
      ? decideClaim(state, topo, persona, rng)
      : decidePlacement(state, topo, persona, rng);
  }
  if (state.phase === 'reinforce') {
    return state.toPlace > 0 ? decidePlacement(state, topo, persona, rng) : { kind: 'doneReinforce' };
  }
  if (state.phase === 'attack') return decideAttack(state, topo, persona, rng);
  if (state.phase === 'fortify') return decideFortify(state, topo, persona, rng);
  return { kind: 'doneTurn' };
}
