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
import { createRedJackdawBattleInput } from '../content/naval';
import { RED_JACKDAW_VOYAGE } from '../content/voyage';
import { SLOOP_CLASS } from '../content/naval';
import { canonicalJson } from '../canonicalJson';
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
const INVALID_JSON = Symbol('invalid-json');
const SNAPSHOT_ARRAY_EXTRA_KEYS = Symbol('snapshot-array-extra-keys');

type JsonProblems = Map<string, ValidationIssue>;
type PlainRecord = Record<string, unknown>;

interface JsonSnapshot {
  value: unknown;
  problems: JsonProblems;
  nonEnumerable: Set<string>;
}

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

function setJsonProblem(problems: JsonProblems, path: string): void {
  problems.set(path, { path, code: 'non-json' });
}

function dataDescriptor(
  value: object,
  key: PropertyKey,
  path: string,
  problems: JsonProblems,
): PropertyDescriptor | null {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !('value' in descriptor)) {
    setJsonProblem(problems, path);
    return null;
  }
  return descriptor;
}

function defineSnapshotValue(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function snapshotJsonValue(
  value: unknown,
  path: string,
  ancestors: Set<object>,
  problems: JsonProblems,
  nonEnumerable: Set<string>,
): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      setJsonProblem(problems, path);
      return INVALID_JSON;
    }
    return value;
  }
  if (typeof value === 'undefined' || typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') {
    setJsonProblem(problems, path);
    return INVALID_JSON;
  }

  if (ancestors.has(value)) {
    setJsonProblem(problems, path);
    return INVALID_JSON;
  }
  if (!Array.isArray(value) && !isPlainRecord(value)) {
    setJsonProblem(problems, path);
    return INVALID_JSON;
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key === 'symbol')) {
    setJsonProblem(problems, path);
    return INVALID_JSON;
  }

  ancestors.add(value);
  if (Array.isArray(value)) {
    const lengthDescriptor = dataDescriptor(value, 'length', path, problems);
    if (!lengthDescriptor || typeof lengthDescriptor.value !== 'number' || !Number.isInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) {
      setJsonProblem(problems, path);
      ancestors.delete(value);
      return INVALID_JSON;
    }
    const length = lengthDescriptor.value;
    const snapshot: unknown[] = new Array(length);
    for (let index = 0; index < length; index += 1) {
      const itemPath = childPath(path, index);
      const descriptor = dataDescriptor(value, String(index), itemPath, problems);
      if (!descriptor || descriptor.enumerable !== true) {
        setJsonProblem(problems, itemPath);
        snapshot[index] = INVALID_JSON;
      } else {
        snapshot[index] = snapshotJsonValue(descriptor.value, itemPath, ancestors, problems, nonEnumerable);
      }
    }
    const retainedExtraKeys: string[] = [];
    for (const key of ownKeys.filter((candidate): candidate is string => typeof candidate === 'string').sort()) {
      if (key === 'length' || /^(0|[1-9]\d*)$/.test(key) && Number(key) < length) continue;
      const keyPath = childPath(path, key);
      const descriptor = dataDescriptor(value, key, keyPath, problems);
      const snapshottedValue = descriptor
        ? snapshotJsonValue(descriptor.value, keyPath, ancestors, problems, nonEnumerable)
        : INVALID_JSON;
      if (/^(0|[1-9]\d*)$/.test(key)) {
        retainedExtraKeys.push(key);
        continue;
      }
      defineSnapshotValue(
        snapshot,
        key,
        snapshottedValue,
      );
    }
    if (retainedExtraKeys.length > 0) {
      Object.defineProperty(snapshot, SNAPSHOT_ARRAY_EXTRA_KEYS, { value: retainedExtraKeys });
    }
    ancestors.delete(value);
    return snapshot;
  } else {
    const snapshot: PlainRecord = Object.create(null);
    for (const key of ownKeys.filter((candidate): candidate is string => typeof candidate === 'string').sort()) {
      const keyPath = childPath(path, key);
      const descriptor = dataDescriptor(value, key, keyPath, problems);
      if (descriptor?.enumerable === false) nonEnumerable.add(keyPath);
      defineSnapshotValue(
        snapshot,
        key,
        descriptor ? snapshotJsonValue(descriptor.value, keyPath, ancestors, problems, nonEnumerable) : INVALID_JSON,
      );
    }
    ancestors.delete(value);
    return snapshot;
  }
}

function snapshotJson(input: unknown): JsonSnapshot {
  const problems: JsonProblems = new Map();
  const nonEnumerable = new Set<string>();
  try {
    return {
      value: snapshotJsonValue(input, '$', new Set(), problems, nonEnumerable),
      problems,
      nonEnumerable,
    };
  } catch {
    setJsonProblem(problems, '$');
    return { value: INVALID_JSON, problems, nonEnumerable };
  }
}

function discardAtOrBelow(path: string, problems: JsonProblems, nonEnumerable: Set<string>): void {
  const prefix = path === '$' ? '' : `${path}.`;
  for (const problemPath of problems.keys()) {
    if (problemPath === path || problemPath.startsWith(prefix)) problems.delete(problemPath);
  }
  for (const descriptorPath of nonEnumerable) {
    if (descriptorPath === path || descriptorPath.startsWith(prefix)) nonEnumerable.delete(descriptorPath);
  }
}

function emitJsonProblem(
  path: string,
  problems: JsonProblems,
  nonEnumerable: Set<string>,
  issues: ValidationIssue[],
): boolean {
  const problem = problems.get(path);
  if (!problem) return false;
  issues.push(problem);
  discardAtOrBelow(path, problems, nonEnumerable);
  return true;
}

function required(
  record: PlainRecord,
  key: string,
  parentPath: string,
  problems: JsonProblems,
  nonEnumerable: Set<string>,
  issues: ValidationIssue[],
): unknown | typeof MISSING {
  const path = childPath(parentPath, key);
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    issue(issues, path, 'missing');
    return MISSING;
  }
  if (nonEnumerable.has(path)) {
    issue(issues, path, 'non-json');
    discardAtOrBelow(path, problems, nonEnumerable);
    return MISSING;
  }
  if (emitJsonProblem(path, problems, nonEnumerable, issues)) return MISSING;
  return record[key];
}

function validateKeys(
  record: PlainRecord,
  allowed: readonly string[],
  path: string,
  problems: JsonProblems,
  nonEnumerable: Set<string>,
  issues: ValidationIssue[],
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Reflect.ownKeys(record).filter((candidate): candidate is string => typeof candidate === 'string' && !allowedKeys.has(candidate)).sort()) {
    const keyPath = childPath(path, key);
    if (!emitJsonProblem(keyPath, problems, nonEnumerable, issues)) {
      issue(issues, keyPath, 'unknown-key');
      discardAtOrBelow(keyPath, problems, nonEnumerable);
    }
  }
}

function recordValue(
  value: unknown,
  path: string,
  allowed: readonly string[],
  problems: JsonProblems,
  nonEnumerable: Set<string>,
  issues: ValidationIssue[],
): PlainRecord | null {
  if (value === MISSING) return null;
  if (!isPlainRecord(value)) {
    issue(issues, path, 'wrong-type');
    discardAtOrBelow(path, problems, nonEnumerable);
    return null;
  }
  validateKeys(value, allowed, path, problems, nonEnumerable, issues);
  return value;
}

function arrayValue(
  value: unknown,
  path: string,
  problems: JsonProblems,
  nonEnumerable: Set<string>,
  issues: ValidationIssue[],
): unknown[] | null {
  if (value === MISSING) return null;
  if (!Array.isArray(value)) {
    issue(issues, path, 'wrong-type');
    discardAtOrBelow(path, problems, nonEnumerable);
    return null;
  }
  const extraKeys = Reflect.ownKeys(value)
    .filter((key): key is string => typeof key === 'string' && key !== 'length' && !(/^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length))
    .concat(Object.getOwnPropertyDescriptor(value, SNAPSHOT_ARRAY_EXTRA_KEYS)?.value ?? [])
    .sort();
  for (const key of extraKeys) {
    const keyPath = childPath(path, key);
    if (!emitJsonProblem(keyPath, problems, nonEnumerable, issues)) {
      issue(issues, keyPath, 'unknown-key');
      discardAtOrBelow(keyPath, problems, nonEnumerable);
    }
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

function validateCareer(root: PlainRecord, problems: JsonProblems, nonEnumerable: Set<string>, issues: ValidationIssue[]): void {
  const path = 'career';
  const career = recordValue(required(root, 'career', '$', problems, nonEnumerable, issues), path, ['length'], problems, nonEnumerable, issues);
  if (!career) return;
  validateKnownString(required(career, 'length', path, problems, nonEnumerable, issues), `${path}.length`, CAMPAIGN_LENGTHS, issues);
}

function validateCalendar(root: PlainRecord, problems: JsonProblems, nonEnumerable: Set<string>, issues: ValidationIssue[]): void {
  const path = 'calendar';
  const calendar = recordValue(required(root, 'calendar', '$', problems, nonEnumerable, issues), path, ['startYear', 'elapsedDays'], problems, nonEnumerable, issues);
  if (!calendar) return;
  validateLiteralNumber(required(calendar, 'startYear', path, problems, nonEnumerable, issues), `${path}.startYear`, 1675, issues);
  validateInteger(required(calendar, 'elapsedDays', path, problems, nonEnumerable, issues), `${path}.elapsedDays`, 0, Number.MAX_SAFE_INTEGER, issues);
}

function sameJson(left: unknown, right: unknown): boolean {
  try {
    return canonicalJson(left) === canonicalJson(right);
  } catch {
    return false;
  }
}

function activeRedJackdaw(root: PlainRecord): boolean {
  const leads = root.leads;
  return Array.isArray(leads) && leads.some((lead) => isPlainRecord(lead) && lead.id === 'red-jackdaw' && lead.status === 'active');
}

function flagship(root: PlainRecord): PlainRecord | null {
  const fleet = root.fleet;
  if (!isPlainRecord(fleet) || typeof fleet.flagshipId !== 'string' || !Array.isArray(fleet.ships)) return null;
  return fleet.ships.find((ship) => isPlainRecord(ship) && ship.id === fleet.flagshipId) as PlainRecord | undefined ?? null;
}

function voyageInvariant(
  path: string,
  valid: boolean,
  issues: ValidationIssue[],
): void {
  if (!valid) issue(issues, path, 'invariant');
}

function voyageEventId(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^voyage-([1-9]\d*)$/.exec(value);
  if (!match) return null;
  const eventId = Number(match[1]);
  return Number.isSafeInteger(eventId) ? eventId : null;
}

function hasAuthoredEventTail(
  startEventId: number | null,
  tailLength: number | null,
  lastEventId: unknown,
): boolean {
  if (
    startEventId === null
    || tailLength === null
    || typeof lastEventId !== 'number'
    || !Number.isSafeInteger(lastEventId)
    || startEventId > Number.MAX_SAFE_INTEGER - tailLength
  ) return false;
  return startEventId + tailLength <= lastEventId;
}

function validateMode(root: PlainRecord, problems: JsonProblems, nonEnumerable: Set<string>, issues: ValidationIssue[]): void {
  const path = 'mode';
  const rawMode = required(root, 'mode', '$', problems, nonEnumerable, issues);
  if (rawMode === MISSING) return;
  if (!isPlainRecord(rawMode)) {
    issue(issues, path, 'wrong-type');
    discardAtOrBelow(path, problems, nonEnumerable);
    return;
  }
  const kind = required(rawMode, 'kind', path, problems, nonEnumerable, issues);
  if (!validateString(kind, `${path}.kind`, issues)) return;
  if (kind === 'port') {
    validateKeys(rawMode, ['kind', 'portId'], path, problems, nonEnumerable, issues);
    const portId = required(rawMode, 'portId', path, problems, nonEnumerable, issues);
    if (validateString(portId, `${path}.portId`, issues) && !isPortId(portId)) {
      issue(issues, `${path}.portId`, 'unknown-id');
    }
    return;
  }
  if (kind !== 'sailing' && kind !== 'encounter' && kind !== 'naval') {
    issue(issues, `${path}.kind`, 'unknown-id');
    discardAtOrBelow(path, problems, nonEnumerable);
    return;
  }
  const lastEventId = root.lastEventId;
  const ship = flagship(root);
  const world = isPlainRecord(root.world) ? root.world : null;
  const common = activeRedJackdaw(root) && world?.targetDefeated === false && ship !== null;
  const provisions = ship && isPlainRecord(ship.cargo) ? ship.cargo.provisions : null;
  if (kind === 'sailing') {
    validateKeys(rawMode, ['kind', 'voyageId', 'checkpoint'], path, problems, nonEnumerable, issues);
    const voyageId = required(rawMode, 'voyageId', path, problems, nonEnumerable, issues);
    const checkpoint = required(rawMode, 'checkpoint', path, problems, nonEnumerable, issues);
    validateStableId(voyageId, `${path}.voyageId`, issues);
    voyageInvariant(`${path}.voyageId`, typeof lastEventId === 'number' && lastEventId >= 1 && voyageId === `voyage-${lastEventId}`, issues);
    voyageInvariant(`${path}.checkpoint`, sameJson(checkpoint, RED_JACKDAW_VOYAGE.start), issues);
    voyageInvariant(path, common && typeof provisions === 'number' && provisions >= 2, issues);
    return;
  }
  if (kind === 'encounter') {
    validateKeys(rawMode, ['kind', 'voyageId', 'encounterId', 'returnCheckpoint'], path, problems, nonEnumerable, issues);
    const voyageId = required(rawMode, 'voyageId', path, problems, nonEnumerable, issues);
    const encounterId = required(rawMode, 'encounterId', path, problems, nonEnumerable, issues);
    const checkpoint = required(rawMode, 'returnCheckpoint', path, problems, nonEnumerable, issues);
    validateStableId(voyageId, `${path}.voyageId`, issues);
    validateStableId(encounterId, `${path}.encounterId`, issues);
    voyageInvariant(`${path}.voyageId`, typeof lastEventId === 'number' && lastEventId >= 2 && voyageId === `voyage-${lastEventId - 1}`, issues);
    voyageInvariant(`${path}.encounterId`, typeof voyageId === 'string' && encounterId === `${voyageId}-contact`, issues);
    voyageInvariant(`${path}.returnCheckpoint`, sameJson(checkpoint, RED_JACKDAW_VOYAGE.contact), issues);
    voyageInvariant(path, common && typeof provisions === 'number' && provisions >= 1, issues);
    return;
  }
  validateKeys(rawMode, ['kind', 'voyageId', 'battleId', 'input', 'returnCheckpoint'], path, problems, nonEnumerable, issues);
  const voyageId = required(rawMode, 'voyageId', path, problems, nonEnumerable, issues);
  const battleId = required(rawMode, 'battleId', path, problems, nonEnumerable, issues);
  const input = required(rawMode, 'input', path, problems, nonEnumerable, issues);
  const checkpoint = required(rawMode, 'returnCheckpoint', path, problems, nonEnumerable, issues);
  validateStableId(voyageId, `${path}.voyageId`, issues);
  validateStableId(battleId, `${path}.battleId`, issues);
  voyageInvariant(`${path}.voyageId`, typeof lastEventId === 'number' && lastEventId >= 3 && voyageId === `voyage-${lastEventId - 2}`, issues);
  voyageInvariant(`${path}.battleId`, typeof voyageId === 'string' && battleId === `${voyageId}-battle`, issues);
  voyageInvariant(`${path}.returnCheckpoint`, sameJson(checkpoint, RED_JACKDAW_VOYAGE.contact), issues);
  const expected = ship && typeof battleId === 'string' && isPlainRecord(ship)
    ? createRedJackdawBattleInput({ battleId, seed: root.rng && isPlainRecord(root.rng) ? root.rng.naval as number : Number.NaN, player: { stableShipId: ship.id as string, name: ship.name as string, classId: ship.classId as 'sloop', hull: ship.hull as number, sails: ship.sails as number, crew: ship.crew as number, cannon: ship.cannon as number } })
    : null;
  voyageInvariant(`${path}.input`, expected !== null && sameJson(input, expected), issues);
  voyageInvariant(path, common && typeof provisions === 'number' && provisions >= 1, issues);
}

function validateCaptain(root: PlainRecord, problems: JsonProblems, nonEnumerable: Set<string>, issues: ValidationIssue[]): void {
  const path = 'captain';
  const captain = recordValue(required(root, 'captain', '$', problems, nonEnumerable, issues), path, ['name', 'pronouns', 'talent'], problems, nonEnumerable, issues);
  if (!captain) return;
  validateText(required(captain, 'name', path, problems, nonEnumerable, issues), `${path}.name`, 40, issues);
  validateText(required(captain, 'pronouns', path, problems, nonEnumerable, issues), `${path}.pronouns`, 24, issues);
  validateKnownString(required(captain, 'talent', path, problems, nonEnumerable, issues), `${path}.talent`, TALENTS, issues);
}

function validateWealth(root: PlainRecord, problems: JsonProblems, nonEnumerable: Set<string>, issues: ValidationIssue[]): void {
  const path = 'wealth';
  const wealth = recordValue(required(root, 'wealth', '$', problems, nonEnumerable, issues), path, ['gold', 'earned'], problems, nonEnumerable, issues);
  if (!wealth) return;
  validateInteger(required(wealth, 'gold', path, problems, nonEnumerable, issues), `${path}.gold`, 0, Number.MAX_SAFE_INTEGER, issues);
  validateInteger(required(wealth, 'earned', path, problems, nonEnumerable, issues), `${path}.earned`, 0, Number.MAX_SAFE_INTEGER, issues);
}

function validateCrew(root: PlainRecord, problems: JsonProblems, nonEnumerable: Set<string>, issues: ValidationIssue[]): void {
  const path = 'crew';
  const crew = recordValue(required(root, 'crew', '$', problems, nonEnumerable, issues), path, ['morale'], problems, nonEnumerable, issues);
  if (!crew) return;
  validateKnownString(required(crew, 'morale', path, problems, nonEnumerable, issues), `${path}.morale`, MORALES, issues);
}

function validateCargo(
  ship: PlainRecord,
  shipPath: string,
  problems: JsonProblems,
  nonEnumerable: Set<string>,
  issues: ValidationIssue[],
): { valid: boolean; units: number } {
  const path = `${shipPath}.cargo`;
  const cargo = recordValue(required(ship, 'cargo', shipPath, problems, nonEnumerable, issues), path, CARGO_IDS, problems, nonEnumerable, issues);
  if (!cargo) return { valid: false, units: 0 };
  let valid = true;
  let units = 0;
  for (const cargoId of CARGO_IDS) {
    const value = required(cargo, cargoId, path, problems, nonEnumerable, issues);
    if (validateInteger(value, `${path}.${cargoId}`, 0, Number.MAX_SAFE_INTEGER, issues)) units += value;
    else valid = false;
  }
  return { valid, units };
}

function validateFittings(
  ship: PlainRecord,
  shipPath: string,
  problems: JsonProblems,
  nonEnumerable: Set<string>,
  issues: ValidationIssue[],
): { valid: boolean; holdPenalty: number } {
  const path = `${shipPath}.fittings`;
  const fittings = arrayValue(
    required(ship, 'fittings', shipPath, problems, nonEnumerable, issues),
    path,
    problems,
    nonEnumerable,
    issues,
  );
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
    if (emitJsonProblem(itemPath, problems, nonEnumerable, issues)) {
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
  nonEnumerable: Set<string>,
  issues: ValidationIssue[],
  seenIds: Set<string>,
): string | null {
  const path = `fleet.ships.${index}`;
  if (emitJsonProblem(path, problems, nonEnumerable, issues)) return null;
  const ship = recordValue(
    value,
    path,
    ['id', 'classId', 'name', 'hull', 'sails', 'crew', 'cannon', 'cargo', 'fittings'],
    problems,
    nonEnumerable,
    issues,
  );
  if (!ship) return null;

  const id = required(ship, 'id', path, problems, nonEnumerable, issues);
  let shipId: string | null = null;
  if (validateStableId(id, `${path}.id`, issues)) {
    shipId = id;
    if (seenIds.has(id)) issue(issues, `${path}.id`, 'duplicate');
    seenIds.add(id);
  }

  const classId = required(ship, 'classId', path, problems, nonEnumerable, issues);
  if (validateString(classId, `${path}.classId`, issues) && !isShipClassId(classId)) {
    issue(issues, `${path}.classId`, 'unknown-id');
  }
  validateText(required(ship, 'name', path, problems, nonEnumerable, issues), `${path}.name`, 40, issues);
  validateInteger(required(ship, 'hull', path, problems, nonEnumerable, issues), `${path}.hull`, 0, SLOOP_CLASS.hullMaximum, issues);
  validateInteger(required(ship, 'sails', path, problems, nonEnumerable, issues), `${path}.sails`, 0, SLOOP_CLASS.sailsMaximum, issues);
  validateInteger(
    required(ship, 'crew', path, problems, nonEnumerable, issues),
    `${path}.crew`,
    SLOOP_CLASS.crew.minimum,
    SLOOP_CLASS.crew.maximum,
    issues,
  );
  const cannon = required(ship, 'cannon', path, problems, nonEnumerable, issues);
  const cannonValid = validateInteger(cannon, `${path}.cannon`, 0, SLOOP_CLASS.cannonMaximum, issues);
  const cargo = validateCargo(ship, path, problems, nonEnumerable, issues);
  const fittings = validateFittings(ship, path, problems, nonEnumerable, issues);
  if (cannonValid && cargo.valid && fittings.valid) {
    const holdUsed = cargo.units + cannon * 2 + fittings.holdPenalty;
    if (holdUsed > SLOOP_CLASS.hold) issue(issues, path, 'capacity-exceeded');
  }
  return shipId;
}

function validateFleet(root: PlainRecord, problems: JsonProblems, nonEnumerable: Set<string>, issues: ValidationIssue[]): void {
  const path = 'fleet';
  const fleet = recordValue(required(root, 'fleet', '$', problems, nonEnumerable, issues), path, ['flagshipId', 'ships'], problems, nonEnumerable, issues);
  if (!fleet) return;
  const flagship = required(fleet, 'flagshipId', path, problems, nonEnumerable, issues);
  const flagshipValid = validateStableId(flagship, `${path}.flagshipId`, issues);
  const ships = arrayValue(
    required(fleet, 'ships', path, problems, nonEnumerable, issues),
    `${path}.ships`,
    problems,
    nonEnumerable,
    issues,
  );
  if (!ships) return;
  if (ships.length < 1 || ships.length > 8) issue(issues, `${path}.ships`, 'out-of-range');
  const seenIds = new Set<string>();
  const ids: string[] = [];
  ships.forEach((ship, index) => {
    const id = validateShip(ship, index, problems, nonEnumerable, issues, seenIds);
    if (id !== null) ids.push(id);
  });
  if (flagshipValid && ids.filter((id) => id === flagship).length !== 1) {
    issue(issues, `${path}.flagshipId`, 'invariant');
  }
}

function validateStandings(root: PlainRecord, problems: JsonProblems, nonEnumerable: Set<string>, issues: ValidationIssue[]): void {
  const path = 'standings';
  const standings = recordValue(required(root, 'standings', '$', problems, nonEnumerable, issues), path, FACTION_IDS, problems, nonEnumerable, issues);
  if (!standings) return;
  for (const factionId of FACTION_IDS) {
    validateInteger(required(standings, factionId, path, problems, nonEnumerable, issues), `${path}.${factionId}`, -100, 100, issues);
  }
}

function validateWorld(root: PlainRecord, problems: JsonProblems, nonEnumerable: Set<string>, issues: ValidationIssue[]): void {
  const path = 'world';
  const world = recordValue(required(root, 'world', '$', problems, nonEnumerable, issues), path, ['ports', 'targetDefeated', 'lastVoyage'], problems, nonEnumerable, issues);
  if (!world) return;
  const portsPath = `${path}.ports`;
  const ports = recordValue(required(world, 'ports', path, problems, nonEnumerable, issues), portsPath, PORT_IDS, problems, nonEnumerable, issues);
  if (ports) {
    for (const portId of PORT_IDS) {
      const portPath = `${portsPath}.${portId}`;
      const port = recordValue(required(ports, portId, portsPath, problems, nonEnumerable, issues), portPath, ['prosperity', 'defense'], problems, nonEnumerable, issues);
      if (!port) continue;
      validateKnownString(required(port, 'prosperity', portPath, problems, nonEnumerable, issues), `${portPath}.prosperity`, ['modest'], issues);
      validateKnownString(required(port, 'defense', portPath, problems, nonEnumerable, issues), `${portPath}.defense`, ['guarded'], issues);
    }
  }
  validateBoolean(required(world, 'targetDefeated', path, problems, nonEnumerable, issues), `${path}.targetDefeated`, issues);
  if (Object.prototype.hasOwnProperty.call(world, 'lastVoyage')) {
    const summaryPath = `${path}.lastVoyage`;
    const summary = recordValue(world.lastVoyage, summaryPath, ['voyageId', 'battleId', 'result', 'outcome', 'returnedDay'], problems, nonEnumerable, issues);
    if (!summary) return;
    const voyageId = required(summary, 'voyageId', summaryPath, problems, nonEnumerable, issues);
    validateStableId(voyageId, `${summaryPath}.voyageId`, issues);
    const parsedVoyageEventId = voyageEventId(voyageId);
    const battleId = required(summary, 'battleId', summaryPath, problems, nonEnumerable, issues);
    if (battleId !== null) {
      validateStableId(battleId, `${summaryPath}.battleId`, issues);
      voyageInvariant(
        `${summaryPath}.battleId`,
        typeof voyageId === 'string' && battleId === `${voyageId}-battle`,
        issues,
      );
    }
    const result = required(summary, 'result', summaryPath, problems, nonEnumerable, issues);
    const results = ['avoided', 'withdrew', 'victory', 'defeat', 'unresolved'];
    if (validateString(result, `${summaryPath}.result`, issues) && !results.includes(result)) issue(issues, `${summaryPath}.result`, 'unknown-id');
    const authoredTailLength = result === 'avoided'
      ? 2
      : typeof result === 'string' && results.includes(result) ? 3 : null;
    voyageInvariant(
      `${summaryPath}.voyageId`,
      hasAuthoredEventTail(parsedVoyageEventId, authoredTailLength, root.lastEventId),
      issues,
    );
    const outcome = required(summary, 'outcome', summaryPath, problems, nonEnumerable, issues);
    const outcomeValid = outcome === null || (isPlainRecord(outcome) && (
      (['surrender', 'sunk', 'boarding-ready'].includes(outcome.kind as string) && Object.keys(outcome).length === 2 && (outcome.victorShipId === 'player' || outcome.victorShipId === 'opponent')) ||
      (['escaped', 'separated'].includes(outcome.kind as string) && Object.keys(outcome).length === 2 && (outcome.shipId === 'player' || outcome.shipId === 'opponent'))
    ));
    if (!outcomeValid) issue(issues, `${summaryPath}.outcome`, 'invariant');
    validateInteger(required(summary, 'returnedDay', summaryPath, problems, nonEnumerable, issues), `${summaryPath}.returnedDay`, 0, Number.MAX_SAFE_INTEGER, issues);
    const matches = result === 'avoided' || result === 'withdrew'
      ? outcome === null && (result === 'avoided' ? battleId === null : typeof battleId === 'string')
      : outcome !== null && typeof battleId === 'string' && (
        result === 'unresolved' ? isPlainRecord(outcome) && ['escaped', 'separated'].includes(outcome.kind as string)
          : result === 'victory' ? isPlainRecord(outcome) && outcome.victorShipId === 'player'
            : isPlainRecord(outcome) && outcome.victorShipId === 'opponent'
      );
    const lead = Array.isArray(root.leads)
      ? root.leads.find((entry) => isPlainRecord(entry) && entry.id === 'red-jackdaw')
      : undefined;
    const leadStatus = isPlainRecord(lead) ? lead.status : undefined;
    const modeKind = isPlainRecord(root.mode) ? root.mode.kind : undefined;
    const elapsedDays = isPlainRecord(root.calendar) ? root.calendar.elapsedDays : undefined;
    const returnDayMatches = typeof summary.returnedDay === 'number'
      && typeof elapsedDays === 'number'
      && (modeKind === 'port'
        ? summary.returnedDay === elapsedDays
        : (modeKind === 'sailing' || modeKind === 'encounter' || modeKind === 'naval')
          && summary.returnedDay <= elapsedDays);
    const leadStatusMatches = result === 'victory'
      ? leadStatus === 'completed'
      : leadStatus === 'active' || leadStatus === 'expired';
    voyageInvariant(
      summaryPath,
      matches
        && returnDayMatches
        && leadStatusMatches
        && (result === 'victory'
          ? world.targetDefeated === true
          : world.targetDefeated === false),
      issues,
    );
  }
}

function validateLeads(root: PlainRecord, problems: JsonProblems, nonEnumerable: Set<string>, issues: ValidationIssue[]): void {
  const path = 'leads';
  const leads = arrayValue(
    required(root, 'leads', '$', problems, nonEnumerable, issues),
    path,
    problems,
    nonEnumerable,
    issues,
  );
  if (!leads) return;
  if (leads.length > 1) issue(issues, path, 'out-of-range');
  const seen = new Set<string>();
  leads.forEach((value, index) => {
    const leadPath = `${path}.${index}`;
    if (emitJsonProblem(leadPath, problems, nonEnumerable, issues)) return;
    const lead = recordValue(value, leadPath, ['id', 'kind', 'status', 'acceptedDay', 'expiresDay'], problems, nonEnumerable, issues);
    if (!lead) return;
    const id = required(lead, 'id', leadPath, problems, nonEnumerable, issues);
    if (validateString(id, `${leadPath}.id`, issues)) {
      if (!isLeadId(id)) issue(issues, `${leadPath}.id`, 'unknown-id');
      if (seen.has(id)) issue(issues, `${leadPath}.id`, 'duplicate');
      seen.add(id);
    }
    validateKnownString(required(lead, 'kind', leadPath, problems, nonEnumerable, issues), `${leadPath}.kind`, ['rumour'], issues);
    validateKnownString(required(lead, 'status', leadPath, problems, nonEnumerable, issues), `${leadPath}.status`, LEAD_STATUSES, issues);
    validateInteger(required(lead, 'acceptedDay', leadPath, problems, nonEnumerable, issues), `${leadPath}.acceptedDay`, 0, Number.MAX_SAFE_INTEGER, issues);
    const expiresDay = required(lead, 'expiresDay', leadPath, problems, nonEnumerable, issues);
    if (expiresDay !== MISSING && expiresDay !== null) {
      validateInteger(expiresDay, `${leadPath}.expiresDay`, 0, Number.MAX_SAFE_INTEGER, issues);
    }
  });
}

function validateRelationships(root: PlainRecord, problems: JsonProblems, nonEnumerable: Set<string>, issues: ValidationIssue[]): void {
  const path = 'relationships';
  const value = required(root, 'relationships', '$', problems, nonEnumerable, issues);
  if (value === MISSING) return;
  if (!isPlainRecord(value)) {
    issue(issues, path, 'wrong-type');
    discardAtOrBelow(path, problems, nonEnumerable);
    return;
  }
  if (Reflect.ownKeys(value).length > 0) {
    issue(issues, path, 'invariant');
    discardAtOrBelow(path, problems, nonEnumerable);
  }
}

function validateLegacy(root: PlainRecord, problems: JsonProblems, nonEnumerable: Set<string>, issues: ValidationIssue[]): void {
  const path = 'legacy';
  const legacy = recordValue(required(root, 'legacy', '$', problems, nonEnumerable, issues), path, ['capturedShips', 'goldEarned'], problems, nonEnumerable, issues);
  if (!legacy) return;
  validateInteger(required(legacy, 'capturedShips', path, problems, nonEnumerable, issues), `${path}.capturedShips`, 0, Number.MAX_SAFE_INTEGER, issues);
  validateInteger(required(legacy, 'goldEarned', path, problems, nonEnumerable, issues), `${path}.goldEarned`, 0, Number.MAX_SAFE_INTEGER, issues);
}

function validateRng(root: PlainRecord, problems: JsonProblems, nonEnumerable: Set<string>, issues: ValidationIssue[]): void {
  const path = 'rng';
  const rng = recordValue(required(root, 'rng', '$', problems, nonEnumerable, issues), path, ['world', 'navigation', 'naval'], problems, nonEnumerable, issues);
  if (!rng) return;
  validateInteger(required(rng, 'world', path, problems, nonEnumerable, issues), `${path}.world`, 0, 0xffff_ffff, issues);
  validateInteger(required(rng, 'navigation', path, problems, nonEnumerable, issues), `${path}.navigation`, 0, 0xffff_ffff, issues);
  validateInteger(required(rng, 'naval', path, problems, nonEnumerable, issues), `${path}.naval`, 0, 0xffff_ffff, issues);
}

function validatedCampaignSnapshot(
  input: unknown,
  issues: ValidationIssue[],
): CampaignStateV1 | null {
  const snapshot = snapshotJson(input);
  const { problems, nonEnumerable } = snapshot;
  if (emitJsonProblem('$', problems, nonEnumerable, issues)) return null;
  if (!isPlainRecord(snapshot.value)) {
    issue(issues, '$', 'wrong-type');
    return null;
  }
  const root = snapshot.value;

  validateKeys(root, ROOT_KEYS, '$', problems, nonEnumerable, issues);
  validateLiteralNumber(required(root, 'schemaVersion', '$', problems, nonEnumerable, issues), 'schemaVersion', 1, issues);
  const contentVersion = required(root, 'contentVersion', '$', problems, nonEnumerable, issues);
  if (validateString(contentVersion, 'contentVersion', issues) && contentVersion !== 'caribbean-slice-1') {
    issue(issues, 'contentVersion', 'unknown-id');
  }
  validateStableId(required(root, 'campaignId', '$', problems, nonEnumerable, issues), 'campaignId', issues);
  validateInteger(required(root, 'seed', '$', problems, nonEnumerable, issues), 'seed', 0, 0xffff_ffff, issues);
  validateCareer(root, problems, nonEnumerable, issues);
  validateCalendar(root, problems, nonEnumerable, issues);
  validateMode(root, problems, nonEnumerable, issues);
  validateCaptain(root, problems, nonEnumerable, issues);
  validateWealth(root, problems, nonEnumerable, issues);
  validateCrew(root, problems, nonEnumerable, issues);
  validateFleet(root, problems, nonEnumerable, issues);
  validateStandings(root, problems, nonEnumerable, issues);
  validateWorld(root, problems, nonEnumerable, issues);
  validateLeads(root, problems, nonEnumerable, issues);
  validateRelationships(root, problems, nonEnumerable, issues);
  validateLegacy(root, problems, nonEnumerable, issues);
  validateRng(root, problems, nonEnumerable, issues);
  validateInteger(required(root, 'lastEventId', '$', problems, nonEnumerable, issues), 'lastEventId', 0, 0xffff_ffff, issues);

  return issues.length === 0
    ? root as unknown as CampaignStateV1
    : null;
}

export function validateCampaign(input: unknown): ValidationResult<CampaignStateV1> {
  const issues: ValidationIssue[] = [];
  const value = validatedCampaignSnapshot(input, issues);
  if (value) return { ok: true, value };
  return { ok: false, issues };
}
