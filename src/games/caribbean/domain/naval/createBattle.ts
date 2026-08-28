import { SLOOP_CLASS } from '../../content/naval';
import { NAVAL_RELOAD_REQUIRED_WORK } from './balance';
import type {
  NavalBattleInput,
  NavalShipInput,
  NavalShipState,
  NavalState,
  ReloadState,
} from './types';

export type NavalInputValidation = { ok: true } | { ok: false; issues: string[] };

function finiteIssue(issues: string[], value: number, label: string): void {
  if (!Number.isFinite(value)) issues.push(`${label}:not-finite`);
}

function validateShip(ship: NavalShipInput, label: 'player' | 'opponent', issues: string[]): void {
  finiteIssue(issues, ship.position.x, `${label}.position.x`);
  finiteIssue(issues, ship.position.z, `${label}.position.z`);
  finiteIssue(issues, ship.heading, `${label}.heading`);

  if (ship.classId !== 'sloop') issues.push(`${label}.classId:unsupported`);

  const currentValues: ReadonlyArray<[keyof Pick<NavalShipInput, 'hull' | 'sails' | 'crew' | 'cannon'>, number]> = [
    ['hull', SLOOP_CLASS.hullMaximum],
    ['sails', SLOOP_CLASS.sailsMaximum],
    ['crew', SLOOP_CLASS.crew.maximum],
    ['cannon', SLOOP_CLASS.cannonMaximum],
  ];

  for (const [field, maximum] of currentValues) {
    const value = ship[field];
    if (!Number.isFinite(value) || value < 0 || value > maximum) {
      issues.push(`${label}.${field}:outside-sloop-maximum`);
    }
    if ((field === 'crew' || field === 'cannon') && !Number.isInteger(value)) {
      issues.push(`${label}.${field}:not-integer`);
    }
  }
}

export function validateNavalInput(input: NavalBattleInput): NavalInputValidation {
  const issues: string[] = [];

  if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 0xffff_ffff) {
    issues.push('seed:not-uint32');
  }
  finiteIssue(issues, input.windFrom, 'windFrom');
  if (!Number.isFinite(input.windStrength) || input.windStrength <= 0) issues.push('windStrength:not-positive');
  if (!Number.isFinite(input.arenaRadius) || input.arenaRadius <= 0) issues.push('arenaRadius:not-positive');
  if (!Number.isInteger(input.timeLimitTicks) || input.timeLimitTicks <= 0) issues.push('timeLimitTicks:not-positive');

  if (input.player.id !== 'player') issues.push('player.id:mismatch');
  if (input.opponent.id !== 'opponent') issues.push('opponent.id:mismatch');
  validateShip(input.player, 'player', issues);
  validateShip(input.opponent, 'opponent', issues);

  if (input.player.stableShipId === input.opponent.stableShipId) issues.push('stableShipId:duplicate');

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

function loadedReload(): ReloadState {
  return {
    progress: NAVAL_RELOAD_REQUIRED_WORK,
    required: NAVAL_RELOAD_REQUIRED_WORK,
    loaded: true,
  };
}

function createShipState(ship: NavalShipInput): NavalShipState {
  return {
    ...ship,
    position: { ...ship.position },
    speed: 0,
    rudder: 0,
    sail: 'full',
    ammunition: 'round',
    reload: { port: loadedReload(), starboard: loadedReload() },
  };
}

export function createNavalBattle(input: NavalBattleInput): NavalState {
  const validation = validateNavalInput(input);
  if (!validation.ok) throw new Error(`Invalid naval input: ${validation.issues.join(', ')}`);

  const clonedInput = structuredClone(input);
  return {
    input: clonedInput,
    seed: clonedInput.seed >>> 0,
    tick: 0,
    nextEventId: 1,
    nextVolleyId: 1,
    ships: {
      player: createShipState(clonedInput.player),
      opponent: createShipState(clonedInput.opponent),
    },
    events: [],
    outcome: null,
  };
}
