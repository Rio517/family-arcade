import { describe, expect, it } from 'vitest';
import { BATTLE_LAB_INPUT } from '../../content/naval';
import { createNavalBattle, validateNavalInput } from './createBattle';
import { command, fixture } from './testFixtures';

describe('createNavalBattle', () => {
  it('constructs the Battle Lab state without retaining mutable input aliases', () => {
    expect(validateNavalInput(BATTLE_LAB_INPUT)).toEqual({ ok: true });
    const state = createNavalBattle(BATTLE_LAB_INPUT);
    expect(state.tick).toBe(0);
    expect(state.seed).toBe(1702);
    expect(state.ships.player.position).toEqual({ x: 0, z: -36 });
    expect(state.ships.opponent.position).toEqual({ x: 0, z: 36 });
    state.ships.player.hull = 1;
    expect(BATTLE_LAB_INPUT.player.hull).toBe(100);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('rejects invalid external input with all boundary issues', () => {
    const invalid = structuredClone(BATTLE_LAB_INPUT);
    invalid.seed = -1;
    invalid.windStrength = 0;
    invalid.player.position.x = Number.NaN;
    invalid.opponent.heading = Number.POSITIVE_INFINITY;
    invalid.opponent.stableShipId = invalid.player.stableShipId;
    invalid.player.crew = 76;

    expect(validateNavalInput(invalid)).toEqual({
      ok: false,
      issues: expect.arrayContaining([
        'seed:not-uint32',
        'windStrength:not-positive',
        'player.position.x:not-finite',
        'opponent.heading:not-finite',
        'stableShipId:duplicate',
        'player.crew:outside-sloop-maximum',
      ]),
    });
    expect(() => createNavalBattle(invalid)).toThrow(/^Invalid naval input: /);
  });

  it.each([
    ['player', 'opponent', 'player.id:mismatch'],
    ['opponent', 'player', 'opponent.id:mismatch'],
  ] as const)('rejects an external %s key with ship id %s', (key, id, issue) => {
    const invalid = structuredClone(BATTLE_LAB_INPUT);
    invalid[key].id = id;

    expect(validateNavalInput(invalid)).toEqual({ ok: false, issues: [issue] });
    expect(() => createNavalBattle(invalid)).toThrow(`Invalid naval input: ${issue}`);
  });

  it('creates fresh test fixtures with named shallow overrides and default commands', () => {
    const state = fixture({ player: { hull: 43 }, input: { windStrength: 2 }, tick: 12 });
    expect(state.ships.player.hull).toBe(43);
    expect(state.input.windStrength).toBe(2);
    expect(state.tick).toBe(12);
    expect(command()).toEqual({ rudder: 0, sail: 'full', ammunition: 'round', fire: null });
    expect(command({ fire: 'port' })).toEqual({ rudder: 0, sail: 'full', ammunition: 'round', fire: 'port' });
    expect(fixture().ships.player.hull).toBe(100);
  });
});
