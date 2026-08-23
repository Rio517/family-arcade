import { BATTLE_LAB_INPUT } from '../../content/naval';
import { createNavalBattle } from './createBattle';
import type { NavalBattleInput, NavalCommand, NavalShipState, NavalState } from './types';

export interface FixtureOverrides {
  player?: Partial<NavalShipState>;
  opponent?: Partial<NavalShipState>;
  input?: Partial<Pick<NavalBattleInput, 'windFrom' | 'windStrength' | 'arenaRadius' | 'timeLimitTicks'>>;
  tick?: number;
}

export function fixture(overrides: FixtureOverrides = {}): NavalState {
  const state = createNavalBattle(BATTLE_LAB_INPUT);

  if (overrides.player) state.ships.player = { ...state.ships.player, ...overrides.player };
  if (overrides.opponent) state.ships.opponent = { ...state.ships.opponent, ...overrides.opponent };
  if (overrides.input) state.input = { ...state.input, ...overrides.input };
  if (overrides.tick !== undefined) state.tick = overrides.tick;

  return state;
}

export function command(overrides: Partial<NavalCommand> = {}): NavalCommand {
  return { rudder: 0, sail: 'full', ammunition: 'round', fire: null, ...overrides };
}
