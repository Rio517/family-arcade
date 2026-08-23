import {
  CARGO_IDS,
  FACTION_IDS,
  FITTINGS,
  isFittingId,
  isLeadId,
  isPortId,
  isShipClassId,
  PORT_IDS,
} from '../content/campaign';
import { SLOOP_CLASS } from '../content/naval';
import type { CampaignStateV1, ValidationIssue, ValidationResult } from './types';

const ROOT_KEYS = [
  'schemaVersion',
  'contentVersion',
  'campaignId',
  'seed',
  'career',
  'calendar',
  'mode',
  'captain',
  'wealth',
  'crew',
  'fleet',
  'standings',
  'world',
  'leads',
  'relationships',
  'legacy',
  'rng',
  'lastEventId',
] as const;
const CAMPAIGN_LENGTHS = ['adventure', 'voyage', 'legend'] as const;
const TALENTS = ['fencing', 'gunnery', 'navigation', 'charm', 'medicine'] as const;
const MORALES = ['very-happy', 'happy', 'content', 'unhappy', 'mutinous'] as const;
const LEAD_STATUSES = ['active', 'completed', 'expired'] as const;
const STABLE_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
const MISSING = Symbol('missing');

type JsonProblems = Map<string, ValidationIssue>;
type PlainRecord = Record<string, unknown>;

function issue(issues: ValidationIssue[], path: string, code: ValidationIssue['code']): void {
  issues.push({ path, code });
}

function isPlainRecord(value: unknown): value is PlainRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function childPath(parent: string, child: string | number): string {
  return parent === '$' ? String(child) : `${parent}.${child}`;
}

function scanJson(
  value: unknown,
  path: string,
  ancestors: Set<object>,
  problems: JsonProblems,
): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) problems.set(path, { path, code: 'non-json' });
    return;
  }
  if (typeof value === 'undefined' || typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') {
    problems.set(path, { path, code: 'non-json' });
    return;
  }

  if (ancestors.has(value)) {
    problems.set(path, { path, code: 'non-json' });
    return;
  }
  if (!Array.isArray(value) && !isPlainRecord(value)) {
    problems.set(path, { path, code: 'non-json' });
    return;
  }
  if (!Array.isArray(value) && Object.getOwnPropertySymbols(value).length > 0) {
    problems.set(path, { path, code: 'non-json' });
    return;
  }

  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const itemPath = childPath(path, index);
      if (!(index in value)) problems.set(itemPath, { path: itemPath, code: 'non-json' });
      else scanJson(value[index], itemPath, ancestors, problems);
    }
  } else {
    for (const key of Object.keys(value).sort()) {
      scanJson(value[key], childPath(path, key), ancestors, problems);
    }
  }
  ancestors.delete(value);
}

function jsonProblems(input: unknown): JsonProblems {
  const problems: JsonProblems = new Map();
  try {
    scanJson(input, '$', new Set(), problems);
  } catch {
    problems.set('$', { path: '$', code: 'non-json' });
  }
  return problems;
}

function emitJsonProblem(path: string, problems: JsonProblems, issues: ValidationIssue[]): boolean {
  const problem = problems.get(path);
  if (!problem) return false;
  issues.push(problem);
  problems.delete(path);
  return true;
}

function required(
  record: PlainRecord,
  key: string,
  parentPath: string,
  problems: JsonProblems,
  issues: ValidationIssue[],
): unknown | typeof MISSING {
  const path = childPath(parentPath, key);
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    issue(issues, path, 'missing');
    return MISSING;
  }
  if (emitJsonProblem(path, problems, issues)) return MISSING;
  return record[key];
}

function validateKeys(
  record: PlainRecord,
  allowed: readonly string[],
  path: string,
  problems: JsonProblems,
  issues: ValidationIssue[],
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(record).filter((candidate) => !allowedKeys.has(candidate)).sort()) {
    const keyPath = childPath(path, key);
    if (!emitJsonProblem(keyPath, problems, issues)) issue(issues, keyPath, 'unknown-key');
  }
}

function recordValue(
  value: unknown,
  path: string,
  allowed: readonly string[],
  problems: JsonProblems,
  issues: ValidationIssue[],
): PlainRecord | null {
  if (value === MISSING) return null;
  if (!isPlainRecord(value)) {
    issue(issues, path, 'wrong-type');
    return null;
  }
  validateKeys(value, allowed, path, problems, issues);
  return value;
}

function arrayValue(value: unknown, path: string, issues: ValidationIssue[]): unknown[] | null {
  if (value === MISSING) return null;
  if (!Array.isArray(value)) {
    issue(issues, path, 'wrong-type');
    return null;
  }
  return value;
}

function validateString(value: unknown, path: string, issues: ValidationIssue[]): value is string {
  if (value === MISSING) return false;
  if (typeof value !== 'string') {
    issue(issues, path, 'wrong-type');
    return false;
  }
  return true;
}

function validateText(value: unknown, path: string, maximum: number, issues: ValidationIssue[]): value is string {
  if (!validateString(value, path, issues)) return false;
  const length = [...value.trim()].length;
  if (length < 1 || length > maximum) {
    issue(issues, path, 'out-of-range');
    return false;
  }
  return true;
}

function validateStableId(value: unknown, path: string, issues: ValidationIssue[]): value is string {
  if (!validateString(value, path, issues)) return false;
  if (!STABLE_ID.test(value)) {
    issue(issues, path, 'out-of-range');
    return false;
  }
  return true;
}

function validateKnownString(
  value: unknown,
  path: string,
  known: readonly string[],
  issues: ValidationIssue[],
): value is string {
  if (!validateString(value, path, issues)) return false;
  if (!known.some((candidate) => candidate === value)) {
    issue(issues, path, 'unknown-id');
    return false;
  }
  return true;
}

function validateInteger(
  value: unknown,
  path: string,
  minimum: number,
  maximum: number,
  issues: ValidationIssue[],
): value is number {
  if (value === MISSING) return false;
  if (typeof value !== 'number') {
    issue(issues, path, 'wrong-type');
    return false;
  }
  if (!Number.isFinite(value)) {
    issue(issues, path, 'not-finite');
    return false;
  }
  if (!Number.isInteger(value)) {
    issue(issues, path, 'not-integer');
    return false;
  }
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    issue(issues, path, 'out-of-range');
    return false;
  }
  return true;
}

function validateLiteralNumber(value: unknown, path: string, expected: number, issues: ValidationIssue[]): boolean {
  if (!validateInteger(value, path, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, issues)) return false;
  if (value !== expected) {
    issue(issues, path, 'invariant');
    return false;
  }
  return true;
}

function validateBoolean(value: unknown, path: string, issues: ValidationIssue[]): value is boolean {
  if (value === MISSING) return false;
  if (typeof value !== 'boolean') {
    issue(issues, path, 'wrong-type');
    return false;
  }
  return true;
}

function validateCareer(root: PlainRecord, problems: JsonProblems, issues: ValidationIssue[]): void {
  const path = 'career';
  const career = recordValue(required(root, 'career', '$', problems, issues), path, ['length'], problems, issues);
  if (!career) return;
  validateKnownString(required(career, 'length', path, problems, issues), `${path}.length`, CAMPAIGN_LENGTHS, issues);
}

function validateCalendar(root: PlainRecord, problems: JsonProblems, issues: ValidationIssue[]): void {
  const path = 'calendar';
  const calendar = recordValue(required(root, 'calendar', '$', problems, issues), path, ['startYear', 'elapsedDays'], problems, issues);
  if (!calendar) return;
  validateLiteralNumber(required(calendar, 'startYear', path, problems, issues), `${path}.startYear`, 1675, issues);
  validateInteger(required(calendar, 'elapsedDays', path, problems, issues), `${path}.elapsedDays`, 0, Number.MAX_SAFE_INTEGER, issues);
}

function validateMode(root: PlainRecord, problems: JsonProblems, issues: ValidationIssue[]): void {
  const path = 'mode';
  const rawMode = required(root, 'mode', '$', problems, issues);
  if (rawMode === MISSING) return;
  if (!isPlainRecord(rawMode)) {
    issue(issues, path, 'wrong-type');
    return;
  }
  const kind = required(rawMode, 'kind', path, problems, issues);
  if (!validateString(kind, `${path}.kind`, issues)) return;
  if (kind !== 'port') {
    issue(issues, `${path}.kind`, 'unknown-id');
    return;
  }
  validateKeys(rawMode, ['kind', 'portId'], path, problems, issues);
  const portId = required(rawMode, 'portId', path, problems, issues);
  if (validateString(portId, `${path}.portId`, issues) && !isPortId(portId)) {
    issue(issues, `${path}.portId`, 'unknown-id');
  }
}

function validateCaptain(root: PlainRecord, problems: JsonProblems, issues: ValidationIssue[]): void {
  const path = 'captain';
  const captain = recordValue(required(root, 'captain', '$', problems, issues), path, ['name', 'pronouns', 'talent'], problems, issues);
  if (!captain) return;
  validateText(required(captain, 'name', path, problems, issues), `${path}.name`, 40, issues);
  validateText(required(captain, 'pronouns', path, problems, issues), `${path}.pronouns`, 24, issues);
  validateKnownString(required(captain, 'talent', path, problems, issues), `${path}.talent`, TALENTS, issues);
}

function validateWealth(root: PlainRecord, problems: JsonProblems, issues: ValidationIssue[]): void {
  const path = 'wealth';
  const wealth = recordValue(required(root, 'wealth', '$', problems, issues), path, ['gold', 'earned'], problems, issues);
  if (!wealth) return;
  validateInteger(required(wealth, 'gold', path, problems, issues), `${path}.gold`, 0, Number.MAX_SAFE_INTEGER, issues);
  validateInteger(required(wealth, 'earned', path, problems, issues), `${path}.earned`, 0, Number.MAX_SAFE_INTEGER, issues);
}

function validateCrew(root: PlainRecord, problems: JsonProblems, issues: ValidationIssue[]): void {
  const path = 'crew';
  const crew = recordValue(required(root, 'crew', '$', problems, issues), path, ['morale'], problems, issues);
  if (!crew) return;
  validateKnownString(required(crew, 'morale', path, problems, issues), `${path}.morale`, MORALES, issues);
}

function validateCargo(
  ship: PlainRecord,
  shipPath: string,
  problems: JsonProblems,
  issues: ValidationIssue[],
): { valid: boolean; units: number } {
  const path = `${shipPath}.cargo`;
  const cargo = recordValue(required(ship, 'cargo', shipPath, problems, issues), path, CARGO_IDS, problems, issues);
  if (!cargo) return { valid: false, units: 0 };
  let valid = true;
  let units = 0;
  for (const cargoId of CARGO_IDS) {
    const value = required(cargo, cargoId, path, problems, issues);
    if (validateInteger(value, `${path}.${cargoId}`, 0, Number.MAX_SAFE_INTEGER, issues)) units += value;
    else valid = false;
  }
  return { valid, units };
}

function validateFittings(
  ship: PlainRecord,
  shipPath: string,
  problems: JsonProblems,
  issues: ValidationIssue[],
): { valid: boolean; holdPenalty: number } {
  const path = `${shipPath}.fittings`;
  const fittings = arrayValue(required(ship, 'fittings', shipPath, problems, issues), path, issues);
  if (!fittings) return { valid: false, holdPenalty: 0 };
  let valid = true;
  let holdPenalty = 0;
  if (fittings.length > SLOOP_CLASS.fittingSlots) {
    issue(issues, path, 'out-of-range');
    valid = false;
  }
  const seen = new Set<string>();
  fittings.forEach((value, index) => {
    const itemPath = `${path}.${index}`;
    if (emitJsonProblem(itemPath, problems, issues)) {
      valid = false;
      return;
    }
    if (!validateString(value, itemPath, issues)) {
      valid = false;
      return;
    }
    if (!isFittingId(value)) {
      issue(issues, itemPath, 'unknown-id');
      valid = false;
      return;
    }
    if (seen.has(value)) {
      issue(issues, itemPath, 'duplicate');
      valid = false;
    }
    seen.add(value);
    holdPenalty += FITTINGS[value].holdPenalty;
  });
  return { valid, holdPenalty };
}

function validateShip(
  value: unknown,
  index: number,
  problems: JsonProblems,
  issues: ValidationIssue[],
  seenIds: Set<string>,
): string | null {
  const path = `fleet.ships.${index}`;
  if (emitJsonProblem(path, problems, issues)) return null;
  const ship = recordValue(
    value,
    path,
    ['id', 'classId', 'name', 'hull', 'sails', 'crew', 'cannon', 'cargo', 'fittings'],
    problems,
    issues,
  );
  if (!ship) return null;

  const id = required(ship, 'id', path, problems, issues);
  let shipId: string | null = null;
  if (validateStableId(id, `${path}.id`, issues)) {
    shipId = id;
    if (seenIds.has(id)) issue(issues, `${path}.id`, 'duplicate');
    seenIds.add(id);
  }

  const classId = required(ship, 'classId', path, problems, issues);
  if (validateString(classId, `${path}.classId`, issues) && !isShipClassId(classId)) {
    issue(issues, `${path}.classId`, 'unknown-id');
  }
  validateText(required(ship, 'name', path, problems, issues), `${path}.name`, 40, issues);
  validateInteger(required(ship, 'hull', path, problems, issues), `${path}.hull`, 0, SLOOP_CLASS.hullMaximum, issues);
  validateInteger(required(ship, 'sails', path, problems, issues), `${path}.sails`, 0, SLOOP_CLASS.sailsMaximum, issues);
  validateInteger(required(ship, 'crew', path, problems, issues), `${path}.crew`, 0, SLOOP_CLASS.crew.maximum, issues);
  const cannon = required(ship, 'cannon', path, problems, issues);
  const cannonValid = validateInteger(cannon, `${path}.cannon`, 0, SLOOP_CLASS.cannonMaximum, issues);
  const cargo = validateCargo(ship, path, problems, issues);
  const fittings = validateFittings(ship, path, problems, issues);
  if (cannonValid && cargo.valid && fittings.valid) {
    const holdUsed = cargo.units + cannon * 2 + fittings.holdPenalty;
    if (holdUsed > SLOOP_CLASS.hold) issue(issues, path, 'capacity-exceeded');
  }
  return shipId;
}

function validateFleet(root: PlainRecord, problems: JsonProblems, issues: ValidationIssue[]): void {
  const path = 'fleet';
  const fleet = recordValue(required(root, 'fleet', '$', problems, issues), path, ['flagshipId', 'ships'], problems, issues);
  if (!fleet) return;
  const flagship = required(fleet, 'flagshipId', path, problems, issues);
  const flagshipValid = validateStableId(flagship, `${path}.flagshipId`, issues);
  const ships = arrayValue(required(fleet, 'ships', path, problems, issues), `${path}.ships`, issues);
  if (!ships) return;
  if (ships.length < 1 || ships.length > 8) issue(issues, `${path}.ships`, 'out-of-range');
  const seenIds = new Set<string>();
  const ids: string[] = [];
  ships.forEach((ship, index) => {
    const id = validateShip(ship, index, problems, issues, seenIds);
    if (id !== null) ids.push(id);
  });
  if (flagshipValid && ids.filter((id) => id === flagship).length !== 1) {
    issue(issues, `${path}.flagshipId`, 'invariant');
  }
}

function validateStandings(root: PlainRecord, problems: JsonProblems, issues: ValidationIssue[]): void {
  const path = 'standings';
  const standings = recordValue(required(root, 'standings', '$', problems, issues), path, FACTION_IDS, problems, issues);
  if (!standings) return;
  for (const factionId of FACTION_IDS) {
    validateInteger(required(standings, factionId, path, problems, issues), `${path}.${factionId}`, -100, 100, issues);
  }
}

function validateWorld(root: PlainRecord, problems: JsonProblems, issues: ValidationIssue[]): void {
  const path = 'world';
  const world = recordValue(required(root, 'world', '$', problems, issues), path, ['ports', 'targetDefeated'], problems, issues);
  if (!world) return;
  const portsPath = `${path}.ports`;
  const ports = recordValue(required(world, 'ports', path, problems, issues), portsPath, PORT_IDS, problems, issues);
  if (ports) {
    for (const portId of PORT_IDS) {
      const portPath = `${portsPath}.${portId}`;
      const port = recordValue(required(ports, portId, portsPath, problems, issues), portPath, ['prosperity', 'defense'], problems, issues);
      if (!port) continue;
      validateKnownString(required(port, 'prosperity', portPath, problems, issues), `${portPath}.prosperity`, ['modest'], issues);
      validateKnownString(required(port, 'defense', portPath, problems, issues), `${portPath}.defense`, ['guarded'], issues);
    }
  }
  validateBoolean(required(world, 'targetDefeated', path, problems, issues), `${path}.targetDefeated`, issues);
}

function validateLeads(root: PlainRecord, problems: JsonProblems, issues: ValidationIssue[]): void {
  const path = 'leads';
  const leads = arrayValue(required(root, 'leads', '$', problems, issues), path, issues);
  if (!leads) return;
  if (leads.length > 1) issue(issues, path, 'out-of-range');
  const seen = new Set<string>();
  leads.forEach((value, index) => {
    const leadPath = `${path}.${index}`;
    if (emitJsonProblem(leadPath, problems, issues)) return;
    const lead = recordValue(value, leadPath, ['id', 'kind', 'status', 'acceptedDay', 'expiresDay'], problems, issues);
    if (!lead) return;
    const id = required(lead, 'id', leadPath, problems, issues);
    if (validateString(id, `${leadPath}.id`, issues)) {
      if (!isLeadId(id)) issue(issues, `${leadPath}.id`, 'unknown-id');
      if (seen.has(id)) issue(issues, `${leadPath}.id`, 'duplicate');
      seen.add(id);
    }
    validateKnownString(required(lead, 'kind', leadPath, problems, issues), `${leadPath}.kind`, ['rumour'], issues);
    validateKnownString(required(lead, 'status', leadPath, problems, issues), `${leadPath}.status`, LEAD_STATUSES, issues);
    validateInteger(required(lead, 'acceptedDay', leadPath, problems, issues), `${leadPath}.acceptedDay`, 0, Number.MAX_SAFE_INTEGER, issues);
    const expiresDay = required(lead, 'expiresDay', leadPath, problems, issues);
    if (expiresDay !== MISSING && expiresDay !== null) {
      validateInteger(expiresDay, `${leadPath}.expiresDay`, 0, Number.MAX_SAFE_INTEGER, issues);
    }
  });
}

function validateRelationships(root: PlainRecord, problems: JsonProblems, issues: ValidationIssue[]): void {
  const path = 'relationships';
  const value = required(root, 'relationships', '$', problems, issues);
  if (value === MISSING) return;
  if (!isPlainRecord(value)) {
    issue(issues, path, 'wrong-type');
    return;
  }
  if (Object.keys(value).length > 0) issue(issues, path, 'invariant');
}

function validateLegacy(root: PlainRecord, problems: JsonProblems, issues: ValidationIssue[]): void {
  const path = 'legacy';
  const legacy = recordValue(required(root, 'legacy', '$', problems, issues), path, ['capturedShips', 'goldEarned'], problems, issues);
  if (!legacy) return;
  validateInteger(required(legacy, 'capturedShips', path, problems, issues), `${path}.capturedShips`, 0, Number.MAX_SAFE_INTEGER, issues);
  validateInteger(required(legacy, 'goldEarned', path, problems, issues), `${path}.goldEarned`, 0, Number.MAX_SAFE_INTEGER, issues);
}

function validateRng(root: PlainRecord, problems: JsonProblems, issues: ValidationIssue[]): void {
  const path = 'rng';
  const rng = recordValue(required(root, 'rng', '$', problems, issues), path, ['world', 'navigation', 'naval'], problems, issues);
  if (!rng) return;
  validateInteger(required(rng, 'world', path, problems, issues), `${path}.world`, 0, 0xffff_ffff, issues);
  validateInteger(required(rng, 'navigation', path, problems, issues), `${path}.navigation`, 0, 0xffff_ffff, issues);
  validateInteger(required(rng, 'naval', path, problems, issues), `${path}.naval`, 0, 0xffff_ffff, issues);
}

function collectCampaignIssues(input: unknown, issues: ValidationIssue[]): input is CampaignStateV1 {
  const problems = jsonProblems(input);
  if (emitJsonProblem('$', problems, issues)) return false;
  if (!isPlainRecord(input)) {
    issue(issues, '$', 'wrong-type');
    return false;
  }

  validateKeys(input, ROOT_KEYS, '$', problems, issues);
  validateLiteralNumber(required(input, 'schemaVersion', '$', problems, issues), 'schemaVersion', 1, issues);
  const contentVersion = required(input, 'contentVersion', '$', problems, issues);
  if (validateString(contentVersion, 'contentVersion', issues) && contentVersion !== 'caribbean-slice-1') {
    issue(issues, 'contentVersion', 'unknown-id');
  }
  validateStableId(required(input, 'campaignId', '$', problems, issues), 'campaignId', issues);
  validateInteger(required(input, 'seed', '$', problems, issues), 'seed', 0, 0xffff_ffff, issues);
  validateCareer(input, problems, issues);
  validateCalendar(input, problems, issues);
  validateMode(input, problems, issues);
  validateCaptain(input, problems, issues);
  validateWealth(input, problems, issues);
  validateCrew(input, problems, issues);
  validateFleet(input, problems, issues);
  validateStandings(input, problems, issues);
  validateWorld(input, problems, issues);
  validateLeads(input, problems, issues);
  validateRelationships(input, problems, issues);
  validateLegacy(input, problems, issues);
  validateRng(input, problems, issues);
  validateInteger(required(input, 'lastEventId', '$', problems, issues), 'lastEventId', 0, 0xffff_ffff, issues);

  for (const problem of problems.values()) issues.push(problem);
  return issues.length === 0;
}

export function validateCampaign(input: unknown): ValidationResult<CampaignStateV1> {
  const issues: ValidationIssue[] = [];
  if (collectCampaignIssues(input, issues)) return { ok: true, value: input };
  return { ok: false, issues };
}
