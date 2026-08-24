import { describe, expect, it } from 'vitest';
import { BATTLE_LAB_INPUT, createRedJackdawBattleInput } from '../../content/naval';
import { NAVAL_RELOAD_REQUIRED_WORK } from './balance';
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
    expect(state.ships.player.reload.port).toEqual({
      progress: NAVAL_RELOAD_REQUIRED_WORK,
      required: NAVAL_RELOAD_REQUIRED_WORK,
      loaded: true,
    });
    expect(NAVAL_RELOAD_REQUIRED_WORK).toBe(1_500_000);
    state.ships.player.hull = 1;
    expect(BATTLE_LAB_INPUT.player.hull).toBe(100);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('accepts a damaged flagship through the shared Red Jackdaw input boundary', () => {
    const input = createRedJackdawBattleInput({
      battleId: 'voyage-3-battle',
      seed: 0x1234_5678,
      player: {
        stableShipId: 'mistral', name: 'Mistral', classId: 'sloop',
        hull: 91, sails: 82, crew: 50, cannon: 8,
      },
    });

    expect(validateNavalInput(input)).toEqual({ ok: true });
    expect(createNavalBattle(input).ships.player).toMatchObject({
      hull: 91, sails: 82, crew: 50, cannon: 8,
    });
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

  it.each([
    ['crew', 51.5, 'player.crew:not-integer'],
    ['cannon', 7.5, 'player.cannon:not-integer'],
  ] as const)('rejects fractional external %s counts', (field, value, issue) => {
    const invalid = structuredClone(BATTLE_LAB_INPUT);
    invalid.player[field] = value;

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
