import { beforeEach, describe, expect, it } from 'vitest';
import { clearRiskGame, loadRiskGame, saveRiskGame } from './riskPersistence';
import { newGame, placeArmy } from '../domain/rules';
import type { MapTopology } from '../domain/types';

const MAP: MapTopology = {
  id: 'test',
  name: 'Test',
  territoryIds: ['a', 'b', 'c', 'd'],
  continents: [{ id: 'X', name: 'X', bonus: 2, territoryIds: ['a', 'b', 'c', 'd'] }],
  adjacency: { a: ['b'], b: ['a', 'c'], c: ['b', 'd'], d: ['c'] },
};

const players = [
  { name: 'A', color: '#f00' },
  { name: 'B', color: '#00f' },
];

describe('risk persistence', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips a mid-campaign state exactly', () => {
    let g = newGame(MAP, players, () => 0.5, 'balanced');
    g = placeArmy(g, 'a', MAP); // one claim in
    saveRiskGame(g, 1234);

    const stored = loadRiskGame();
    expect(stored).not.toBeNull();
    expect(stored!.savedAt).toBe(1234);
    expect(stored!.state).toEqual(g); // territories, dice bag, phase — everything
  });

  it('accepts a pre-defenseBag save, defaulting the defender a fresh bag', () => {
    // Saves written before the defender got an independent dice bag have no
    // `defenseBag`. They must still load (same storage version) with the field
    // defaulted to an empty bag — drawDice treats empty as a fresh bag.
    const g = newGame(MAP, players, () => 0.5, 'balanced');
    const legacyState: Record<string, unknown> = { ...g };
    delete legacyState.defenseBag;
    localStorage.setItem(
      'risk-campaign-v1',
      JSON.stringify({ v: 1, savedAt: 99, state: legacyState }),
    );

    const stored = loadRiskGame();
    expect(stored).not.toBeNull();
    expect(stored!.state.defenseBag).toEqual([]);
    expect(stored!.state.players).toHaveLength(2);
  });

  it('never offers a finished war', () => {
    const g = newGame(MAP, players);
    saveRiskGame({ ...g, phase: 'over', winner: 0 });
    expect(loadRiskGame()).toBeNull();
  });

  it('shrugs off garbage in storage', () => {
    localStorage.setItem('risk-campaign-v1', 'not json at all {');
    expect(loadRiskGame()).toBeNull();
    localStorage.setItem('risk-campaign-v1', JSON.stringify({ v: 99 }));
    expect(loadRiskGame()).toBeNull();
  });

  it('clears the save', () => {
    saveRiskGame(newGame(MAP, players));
    expect(loadRiskGame()).not.toBeNull();
    clearRiskGame();
    expect(loadRiskGame()).toBeNull();
  });
});
