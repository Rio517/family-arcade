import { BATTLE_LAB_INPUT } from '../../content/naval';
import { createNavalBattle } from './createBattle';
import { bearingSide, normalizeAngle } from './geometry';
import { advanceOpponentController, initialOpponentController } from './opponent';
import { stepBattle } from './stepBattle';
import type {
  Ammunition,
  NavalBattleInput,
  NavalCommand,
  NavalShipState,
  NavalState,
  Rudder,
} from './types';

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

export type TestCaptain = (state: NavalState) => NavalCommand;
export type OpponentCommandObserver = (state: NavalState, command: NavalCommand) => void;

function headingTo(dx: number, dz: number): number {
  return normalizeAngle(Math.atan2(dx, dz));
}

function rudderToward(current: number, desired: number): Rudder {
  const error = normalizeAngle(desired - current);
  if (Math.abs(error) < 0.025) return 0;
  return error > 0 ? -1 : 1;
}

function broadsideHeading(current: number, targetHeading: number): number {
  const candidates = [
    normalizeAngle(targetHeading + Math.PI / 2),
    normalizeAngle(targetHeading - Math.PI / 2),
  ];
  return candidates.reduce((nearest, candidate) => (
    Math.abs(normalizeAngle(candidate - current))
      < Math.abs(normalizeAngle(nearest - current))
      ? candidate
      : nearest
  ));
}

function fightingCommand(state: NavalState, ammunition: Ammunition): NavalCommand {
  const player = state.ships.player;
  const target = state.ships.opponent;
  const dx = target.position.x - player.position.x;
  const dz = target.position.z - player.position.z;
  const range = Math.hypot(dx, dz);
  const side = range <= 42 ? bearingSide(player.position, player.heading, target.position) : null;
  const arenaDistance = Math.hypot(player.position.x, player.position.z);
  let desiredHeading = broadsideHeading(player.heading, headingTo(dx, dz));
  if (range > 40) desiredHeading = headingTo(dx, dz);
  if (arenaDistance > state.input.arenaRadius * 0.78) {
    desiredHeading = headingTo(-player.position.x, -player.position.z);
  }

  return command({
    rudder: rudderToward(player.heading, desiredHeading),
    sail: range < 24 ? 'reefed' : 'full',
    ammunition,
    fire: side && player.reload[side].loaded ? side : null,
  });
}

export function pressureCaptain(state: NavalState): NavalCommand {
  return fightingCommand(state, 'round');
}

export function captureCaptain(state: NavalState): NavalCommand {
  const player = state.ships.player;
  const target = state.ships.opponent;
  const dx = target.position.x - player.position.x;
  const dz = target.position.z - player.position.z;
  const range = Math.hypot(dx, dz);

  if (target.sails <= 30 && target.crew <= 18) {
    const arenaDistance = Math.hypot(player.position.x, player.position.z);
    let desiredHeading = range > 6.5 ? headingTo(dx, dz) : target.heading;
    if (arenaDistance > state.input.arenaRadius * 0.78) {
      desiredHeading = headingTo(-player.position.x, -player.position.z);
    }
    return command({
      rudder: rudderToward(player.heading, desiredHeading),
      sail: 'reefed',
      ammunition: 'round',
    });
  }

  return fightingCommand(state, target.sails > 30 ? 'chain' : 'grape');
}

export function simulateCaptain(
  input: NavalBattleInput,
  captain: TestCaptain,
  observeOpponentCommand?: OpponentCommandObserver,
): NavalState {
  let state = createNavalBattle(input);
  let opponentController = initialOpponentController();

  while (!state.outcome) {
    const opponent = advanceOpponentController(state, opponentController);
    opponentController = opponent.controller;
    observeOpponentCommand?.(state, opponent.command);
    state = stepBattle(state, { player: captain(state), opponent: opponent.command });
  }

  return state;
}
