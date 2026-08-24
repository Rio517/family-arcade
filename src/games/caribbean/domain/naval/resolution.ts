import { decisiveFactForOutcome, decisiveFactMatches } from './outcomes';
import { validateNavalState } from './validation';
import type {
  NavalBattleInput,
  NavalDecisiveFact,
  NavalOutcome,
  NavalResolution,
  NavalShipId,
  NavalState,
} from './types';

export type NavalResolutionValidation =
  | { ok: true; value: NavalResolution }
  | { ok: false; issues: string[] };

type FinalSystems = NavalResolution['player'];

const SYSTEMS: readonly (keyof FinalSystems)[] = ['hull', 'sails', 'crew', 'cannon'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

function isShipId(value: unknown): value is NavalShipId {
  return value === 'player' || value === 'opponent';
}

function isOutcome(value: unknown): value is NavalOutcome {
  if (!isRecord(value)) return false;
  if (value.kind === 'surrender' || value.kind === 'sunk' || value.kind === 'boarding-ready') {
    return hasExactKeys(value, ['kind', 'victorShipId']) && isShipId(value.victorShipId);
  }
  if (value.kind === 'escaped' || value.kind === 'separated') {
    return hasExactKeys(value, ['kind', 'shipId']) && isShipId(value.shipId);
  }
  return false;
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value);
}

function parseFinalSystems(value: unknown, label: string, input: NavalBattleInput, issues: string[]): FinalSystems | null {
  if (!isRecord(value) || !hasExactKeys(value, SYSTEMS)) {
    issues.push(`${label}:invalid-keys`);
    return null;
  }
  const result = {} as FinalSystems;
  for (const system of SYSTEMS) {
    const current = value[system];
    if (!isFiniteInteger(current) || current < 0 || current > input[label as NavalShipId][system]) {
      issues.push(`${label}.${system}:outside-input-bounds`);
    } else {
      result[system] = current;
    }
  }
  return issues.some((issue) => issue.startsWith(`${label}.`)) ? null : result;
}

function parseDecisive(value: unknown, issues: string[]): NavalDecisiveFact | null {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    issues.push('decisive:invalid');
    return null;
  }

  const numeric = (key: string): boolean => typeof value[key] === 'number' && Number.isFinite(value[key]);
  if (value.kind === 'surrender' && hasExactKeys(value, ['kind', 'victorShipId', 'surrenderedShipId', 'threshold', 'value', 'thresholdValue'])
    && isShipId(value.victorShipId) && isShipId(value.surrenderedShipId)
    && (value.threshold === 'hull' || value.threshold === 'crew') && numeric('value') && numeric('thresholdValue')) {
    return value as NavalDecisiveFact;
  }
  if (value.kind === 'sunk' && hasExactKeys(value, ['kind', 'victorShipId', 'sunkShipId', 'hull'])
    && isShipId(value.victorShipId) && isShipId(value.sunkShipId) && numeric('hull')) {
    return value as NavalDecisiveFact;
  }
  if (value.kind === 'boarding-ready' && hasExactKeys(value, ['kind', 'victorShipId', 'range', 'relativeSpeed', 'targetSails', 'targetCrew', 'playerCrew'])
    && value.victorShipId === 'player'
    && ['range', 'relativeSpeed', 'targetSails', 'targetCrew', 'playerCrew'].every(numeric)) {
    return value as NavalDecisiveFact;
  }
  if (value.kind === 'escaped' && hasExactKeys(value, ['kind', 'shipId', 'distance', 'arenaRadius', 'outwardSpeed'])
    && isShipId(value.shipId) && ['distance', 'arenaRadius', 'outwardSpeed'].every(numeric)) {
    return value as NavalDecisiveFact;
  }
  if (value.kind === 'separated' && hasExactKeys(value, ['kind', 'shipId', 'timeLimitTicks'])
    && isShipId(value.shipId) && isFiniteInteger(value.timeLimitTicks)) {
    return value as NavalDecisiveFact;
  }
  issues.push('decisive:invalid');
  return null;
}

export function summarizeNavalResolution(state: NavalState): NavalResolution {
  const validation = validateNavalState(state);
  if (!validation.ok) throw new Error(`Cannot summarize invalid naval state: ${validation.issues.join(', ')}`);
  if (!state.outcome) throw new Error('Cannot summarize a nonterminal naval state');

  return {
    battleId: state.input.battleId,
    outcome: structuredClone(state.outcome),
    atTick: state.tick,
    seedAfter: state.seed,
    player: pickSystems(state.ships.player),
    opponent: pickSystems(state.ships.opponent),
    decisive: decisiveFactForOutcome(state, state.outcome),
  };
}

function pickSystems(ship: NavalState['ships']['player']): FinalSystems {
  return { hull: ship.hull, sails: ship.sails, crew: ship.crew, cannon: ship.cannon };
}

export function validateNavalResolution(input: NavalBattleInput, value: unknown): NavalResolutionValidation {
  const issues: string[] = [];
  if (!isRecord(value) || !hasExactKeys(value, ['battleId', 'outcome', 'atTick', 'seedAfter', 'player', 'opponent', 'decisive'])) {
    return { ok: false, issues: ['resolution:invalid-keys'] };
  }
  if (typeof value.battleId !== 'string' || value.battleId !== input.battleId) issues.push('battleId:mismatch');
  if (!isOutcome(value.outcome)) issues.push('outcome:invalid');
  if (!isFiniteInteger(value.atTick) || value.atTick < 0 || value.atTick > input.timeLimitTicks) issues.push('atTick:outside-input-bounds');
  if (!isFiniteInteger(value.seedAfter) || value.seedAfter < 0 || value.seedAfter > 0xffff_ffff) issues.push('seedAfter:not-uint32');

  const player = parseFinalSystems(value.player, 'player', input, issues);
  const opponent = parseFinalSystems(value.opponent, 'opponent', input, issues);
  const decisive = parseDecisive(value.decisive, issues);

  if (isOutcome(value.outcome) && player && opponent && decisive && isFiniteInteger(value.atTick)
    && !decisiveFactMatches(input, value.outcome, decisive, { player, opponent }, value.atTick)) {
    issues.push('decisive:mismatch');
  }

  return issues.length === 0 ? { ok: true, value: value as unknown as NavalResolution } : { ok: false, issues };
}
