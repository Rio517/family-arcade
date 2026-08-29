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
    let g = newGame(MAP, players, 'balanced');
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
    const g = newGame(MAP, players, 'balanced');
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

  it('carries each seated ticket id through a save and back', () => {
    const g = newGame(MAP, [
      { name: 'Rio', color: '#f00', userId: 'u1' },
      { name: 'Cadet Pip', color: '#00f', bot: 'cadet' },
    ]);
    saveRiskGame(g);
    expect(loadRiskGame()!.state.players.map((p) => p.userId ?? null)).toEqual(['u1', null]);
  });

  it('loads a save from before tickets rode along — nobody is credited, nothing breaks', () => {
    saveRiskGame(newGame(MAP, players)); // no userIds, like every pre-ticket campaign
    const stored = loadRiskGame();
    expect(stored).not.toBeNull();
    expect(stored!.state.players.every((p) => p.userId === undefined)).toBe(true);
  });

  it('drops a junk ticket id from a hand-edited save rather than trusting it', () => {
    const g = newGame(MAP, players);
    const tampered = { ...g, players: g.players.map((p, i) => (i === 0 ? { ...p, userId: 42 } : p)) };
    localStorage.setItem('risk-campaign-v1', JSON.stringify({ v: 1, savedAt: 1, state: tampered }));
    const stored = loadRiskGame();
    expect(stored).not.toBeNull();
    expect(stored!.state.players[0].userId).toBeUndefined();
  });

  it('keeps the campaign id through a save and back', () => {
    const g = newGame(MAP, players);
    expect(g.id).toMatch(/\S/);
    saveRiskGame(g);
    expect(loadRiskGame()!.state.id).toBe(g.id);
  });

  it('gives a save from before campaigns had ids a fresh one on load', () => {
    // The id arrived with everyone's history; an older campaign still resumes,
    // and gets an id so its finish can be credited like any other.
    const legacyState: Record<string, unknown> = { ...newGame(MAP, players) };
    delete legacyState.id;
    localStorage.setItem('risk-campaign-v1', JSON.stringify({ v: 1, savedAt: 1, state: legacyState }));
    const stored = loadRiskGame();
    expect(stored).not.toBeNull();
    expect(stored!.state.id).toMatch(/\S/);
  });

  it('replaces a junk campaign id from a hand-edited save rather than trusting it', () => {
    for (const junk of [42, '', null, { nested: true }]) {
      localStorage.setItem(
        'risk-campaign-v1',
        JSON.stringify({ v: 1, savedAt: 1, state: { ...newGame(MAP, players), id: junk } }),
      );
      const stored = loadRiskGame();
      expect(stored).not.toBeNull();
      expect(stored!.state.id).toMatch(/\S/);
    }
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
