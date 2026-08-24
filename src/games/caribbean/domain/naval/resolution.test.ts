import { describe, expect, it } from 'vitest';

import { BATTLE_LAB_INPUT } from '../../content/naval';
import { createNavalBattle } from './createBattle';
import { summarizeNavalResolution, validateNavalResolution } from './resolution';
import { validateNavalState } from './validation';
import type { NavalOutcome, NavalShipState, NavalState } from './types';

function terminalState(
  outcome: NavalOutcome,
  overrides: { player?: Partial<NavalShipState>; opponent?: Partial<NavalShipState>; tick?: number; seed?: number } = {},
): NavalState {
  const state = createNavalBattle(BATTLE_LAB_INPUT);
  state.tick = overrides.tick ?? 47;
  state.seed = overrides.seed ?? 0x7654_3210;
  if (overrides.player) state.ships.player = { ...state.ships.player, ...overrides.player };
  if (overrides.opponent) state.ships.opponent = { ...state.ships.opponent, ...overrides.opponent };
  state.outcome = outcome;
  state.events = [{ id: 1, kind: 'outcome', atTick: state.tick, outcome }];
  state.nextEventId = 2;
  expect(validateNavalState(state)).toEqual({ ok: true });
  return state;
}

describe('naval terminal resolution', () => {
  it('projects a boarding-ready state into the exact semantic campaign fact', () => {
    const boardingReadyState = terminalState(
      { kind: 'boarding-ready', victorShipId: 'player' },
      {
        player: { position: { x: 0, z: 0 }, heading: Math.PI / 2, speed: 1, hull: 100, sails: 100, crew: 50, cannon: 8 },
        opponent: { position: { x: 6, z: 0 }, heading: 0, speed: 0, hull: 64, sails: 24, crew: 16, cannon: 6 },
      },
    );

    const summary = summarizeNavalResolution(boardingReadyState);
    expect(summary).toEqual({
      battleId: 'battle-lab-red-jackdaw',
      outcome: { kind: 'boarding-ready', victorShipId: 'player' },
      atTick: 47,
      seedAfter: 0x7654_3210,
      player: { hull: 100, sails: 100, crew: 50, cannon: 8 },
      opponent: { hull: 64, sails: 24, crew: 16, cannon: 6 },
      decisive: {
        kind: 'boarding-ready', victorShipId: 'player',
        range: 6, relativeSpeed: 1, targetSails: 24,
        targetCrew: 16, playerCrew: 50,
      },
    });
    expect(validateNavalResolution(boardingReadyState.input, summary)).toEqual({ ok: true, value: summary });
    expect(validateNavalResolution(boardingReadyState.input, {
      ...summary,
      decisive: { ...summary.decisive, range: 8 },
    })).toMatchObject({ ok: false });
  });

  it.each([
    [
      'player surrender',
      terminalState({ kind: 'surrender', victorShipId: 'opponent' }, { player: { hull: 20 } }),
      {
        kind: 'surrender', victorShipId: 'opponent', surrenderedShipId: 'player',
        threshold: 'hull', value: 20, thresholdValue: 20,
      },
    ],
    [
      'opponent surrender',
      terminalState({ kind: 'surrender', victorShipId: 'player' }, { opponent: { crew: 8 } }),
      {
        kind: 'surrender', victorShipId: 'player', surrenderedShipId: 'opponent',
        threshold: 'crew', value: 8, thresholdValue: 8,
      },
    ],
    [
      'player sink',
      terminalState({ kind: 'sunk', victorShipId: 'opponent' }, { player: { hull: 0 } }),
      { kind: 'sunk', victorShipId: 'opponent', sunkShipId: 'player', hull: 0 },
    ],
    [
      'opponent sink',
      terminalState({ kind: 'sunk', victorShipId: 'player' }, { opponent: { hull: 0 } }),
      { kind: 'sunk', victorShipId: 'player', sunkShipId: 'opponent', hull: 0 },
    ],
    [
      'player escape',
      terminalState(
        { kind: 'escaped', shipId: 'player' },
        { player: { position: { x: 93, z: 0 }, heading: Math.PI / 2, speed: 2 } },
      ),
      { kind: 'escaped', shipId: 'player', distance: 93, arenaRadius: 92, outwardSpeed: 2 },
    ],
    [
      'opponent escape',
      terminalState(
        { kind: 'escaped', shipId: 'opponent' },
        { opponent: { position: { x: 0, z: 94 }, heading: 0, speed: 3 } },
      ),
      { kind: 'escaped', shipId: 'opponent', distance: 94, arenaRadius: 92, outwardSpeed: 3 },
    ],
    [
      'separation',
      terminalState({ kind: 'separated', shipId: 'player' }, { tick: 14_400 }),
      { kind: 'separated', shipId: 'player', timeLimitTicks: 14_400 },
    ],
  ] as const)('projects the exact decisive fact for %s', (_label, state, decisive) => {
    const summary = summarizeNavalResolution(state);
    expect(summary).toEqual({
      battleId: 'battle-lab-red-jackdaw',
      outcome: state.outcome,
      atTick: state.tick,
      seedAfter: state.seed,
      player: {
        hull: state.ships.player.hull, sails: state.ships.player.sails,
        crew: state.ships.player.crew, cannon: state.ships.player.cannon,
      },
      opponent: {
        hull: state.ships.opponent.hull, sails: state.ships.opponent.sails,
        crew: state.ships.opponent.crew, cannon: state.ships.opponent.cannon,
      },
      decisive,
    });
    expect(validateNavalResolution(state.input, summary)).toEqual({ ok: true, value: summary });
  });

  it('rejects unknown keys, malformed numeric facts, a mismatched battle, and a post-limit tick', () => {
    const state = terminalState({ kind: 'separated', shipId: 'player' }, { tick: 14_400 });
    const summary = summarizeNavalResolution(state);

    expect(Object.keys(summary).sort()).toEqual([
      'atTick', 'battleId', 'decisive', 'opponent', 'outcome', 'player', 'seedAfter',
    ]);
    expect(validateNavalResolution(state.input, { ...summary, extra: true })).toMatchObject({ ok: false });
    expect(validateNavalResolution(state.input, { ...summary, seedAfter: Number.NaN })).toMatchObject({ ok: false });
    expect(validateNavalResolution(state.input, { ...summary, atTick: 2.5 })).toMatchObject({ ok: false });
    expect(validateNavalResolution(state.input, { ...summary, battleId: 'another-battle' })).toMatchObject({ ok: false });
    expect(validateNavalResolution(state.input, { ...summary, atTick: state.input.timeLimitTicks + 1 })).toMatchObject({ ok: false });
  });

  it('rejects healed or enlarged final systems even when each value is below the sloop maximum', () => {
    const input = structuredClone(BATTLE_LAB_INPUT);
    input.player = { ...input.player, hull: 90, sails: 90, crew: 50, cannon: 8 };
    input.opponent = { ...input.opponent, hull: 90, sails: 90, crew: 47, cannon: 7 };
    const state = createNavalBattle(input);
    state.tick = 14_400;
    state.outcome = { kind: 'separated', shipId: 'player' };
    state.events = [{ id: 1, kind: 'outcome', atTick: 14_400, outcome: state.outcome }];
    state.nextEventId = 2;
    expect(validateNavalState(state)).toEqual({ ok: true });
    const summary = summarizeNavalResolution(state);

    for (const ship of ['player', 'opponent'] as const) {
      for (const system of ['hull', 'sails', 'crew', 'cannon'] as const) {
        expect(validateNavalResolution(input, {
          ...summary,
          [ship]: { ...summary[ship], [system]: input[ship][system] + 1 },
        })).toMatchObject({ ok: false });
      }
    }
  });

  it('rejects a nonterminal state and does not mutate input while summarizing or validating', () => {
    const nonterminal = createNavalBattle(BATTLE_LAB_INPUT);
    const before = structuredClone(nonterminal.input);
    expect(validateNavalState(nonterminal)).toEqual({ ok: true });
    expect(() => summarizeNavalResolution(nonterminal)).toThrow(/terminal/i);

    const terminal = terminalState({ kind: 'sunk', victorShipId: 'player' }, { opponent: { hull: 0 } });
    const summary = summarizeNavalResolution(terminal);
    expect(validateNavalResolution(terminal.input, summary)).toEqual({ ok: true, value: summary });
    expect(nonterminal.input).toEqual(before);
    expect(terminal.input).toEqual(BATTLE_LAB_INPUT);
  });
});
