import { isCargoId, isPortId } from '../content/campaign';
import type { CargoId, LeadId, PortId } from '../content/types';
import type {
  CampaignStateV1,
  SailingCheckpoint,
  ValidationIssue,
  ValidationResult,
} from './types';
import type { NavalBattleInput, NavalResolution } from './naval/types';
import { validateNavalInput as validateBattleInput } from './naval/createBattle';

export type CampaignEvent =
  | {
      id: number;
      type: 'lead-accepted';
      atDay: number;
      payload: { leadId: 'red-jackdaw' };
    }
  | {
      id: number;
      type: 'market-traded';
      atDay: number;
      payload: {
        portId: PortId;
        shipId: string;
        cargoId: CargoId;
        delta: number;
        unitPrice: number;
      };
    }
  | { id: number; type: 'voyage-started'; atDay: number; payload: { voyageId: string } }
  | {
      id: number; type: 'sea-leg-completed'; atDay: number;
      payload: { voyageId: string; encounterId: string; checkpoint: SailingCheckpoint; navigationRng: { before: number; after: number } };
    }
  | { id: number; type: 'encounter-avoided'; atDay: number; payload: { voyageId: string; encounterId: string } }
  | {
      id: number; type: 'naval-engaged'; atDay: number;
      payload: { voyageId: string; encounterId: string; battleId: string; navalRng: { before: number; after: number }; input: NavalBattleInput };
    }
  | { id: number; type: 'battle-withdrawn'; atDay: number; payload: { voyageId: string; battleId: string } }
  | { id: number; type: 'naval-resolved'; atDay: number; payload: { voyageId: string; battleId: string; resolution: NavalResolution } };

type DraftOf<Event> = Event extends CampaignEvent ? Omit<Event, 'id' | 'atDay'> : never;
export type CampaignEventDraft = DraftOf<CampaignEvent>;
export type CampaignEventDraftFor<Type extends CampaignEvent['type']> = Extract<CampaignEventDraft, { type: Type }>;

export interface CampaignJournal {
  initial: CampaignStateV1;
  events: CampaignEvent[];
  state: CampaignStateV1;
}

type PlainRecord = Record<string, unknown>;
const INVALID = Symbol('invalid');

function isPlainRecord(value: unknown): value is PlainRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function issue(issues: ValidationIssue[], path: string, code: ValidationIssue['code']): void {
  issues.push({ path, code });
}

function snapshotRecord(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): PlainRecord | null {
  try {
    if (!isPlainRecord(value)) {
      issue(
        issues,
        path,
        value !== null && typeof value === 'object' && !Array.isArray(value)
          ? 'non-json'
          : 'wrong-type',
      );
      return null;
    }
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key === 'symbol')) {
      issue(issues, path, 'non-json');
      return null;
    }
    const snapshot: PlainRecord = Object.create(null);
    for (const key of keys.filter((candidate): candidate is string => typeof candidate === 'string')) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true) {
        snapshot[key] = undefined;
        continue;
      }
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    issue(issues, path, 'non-json');
    return null;
  }
}

function snapshotJson(value: unknown, path: string, issues: ValidationIssue[]): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value;
    issue(issues, path, 'non-json');
    return INVALID;
  }
  if (typeof value !== 'object' || value === null) {
    issue(issues, path, 'non-json');
    return INVALID;
  }
  try {
    if (!Array.isArray(value) && !isPlainRecord(value)) {
      issue(issues, path, 'non-json');
      return INVALID;
    }
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key === 'symbol')) {
      issue(issues, path, 'non-json');
      return INVALID;
    }
    if (Array.isArray(value)) {
      const result: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        const itemPath = `${path}.${index}`;
        if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true) {
          issue(issues, itemPath, 'non-json');
          result[index] = INVALID;
        } else result[index] = snapshotJson(descriptor.value, itemPath, issues);
      }
      for (const key of keys.filter((candidate): candidate is string => typeof candidate === 'string' && !/^(0|[1-9]\d*)$/.test(candidate) && candidate !== 'length')) {
        issue(issues, `${path}.${key}`, 'unknown-key');
      }
      return result;
    }
    const result: PlainRecord = Object.create(null);
    for (const key of keys.filter((candidate): candidate is string => typeof candidate === 'string')) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      const child = `${path}.${key}`;
      if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true) {
        issue(issues, child, 'non-json');
        result[key] = INVALID;
      } else result[key] = snapshotJson(descriptor.value, child, issues);
    }
    return result;
  } catch {
    issue(issues, path, 'non-json');
    return INVALID;
  }
}

function snapshotNestedRecord(value: unknown, path: string, issues: ValidationIssue[]): PlainRecord | null {
  if (value === undefined) return null;
  const snapshot = snapshotJson(value, path, issues);
  if (!isPlainRecord(snapshot)) {
    if (snapshot !== INVALID) issue(issues, path, 'wrong-type');
    return null;
  }
  return snapshot;
}

function validateKeys(
  record: PlainRecord,
  allowed: readonly string[],
  path: string,
  issues: ValidationIssue[],
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(record).filter((candidate) => !allowedKeys.has(candidate)).sort()) {
    const value = record[key];
    const keyPath = path === '$' ? key : `${path}.${key}`;
    if (
      value === undefined
      || typeof value === 'function'
      || typeof value === 'symbol'
      || typeof value === 'bigint'
      || typeof value === 'number' && !Number.isFinite(value)
    ) {
      issue(issues, keyPath, 'non-json');
    } else {
      issue(issues, keyPath, 'unknown-key');
    }
  }
}

function required(
  record: PlainRecord,
  key: string,
  path: string,
  issues: ValidationIssue[],
): unknown {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    issue(issues, path === '$' ? key : `${path}.${key}`, 'missing');
    return undefined;
  }
  const value = record[key];
  if (
    value === undefined
    || typeof value === 'function'
    || typeof value === 'symbol'
    || typeof value === 'bigint'
    || typeof value === 'number' && !Number.isFinite(value)
  ) {
    issue(issues, path === '$' ? key : `${path}.${key}`, 'non-json');
    return undefined;
  }
  return value;
}

function validateUint32(value: unknown, path: string, issues: ValidationIssue[]): value is number {
  if (value === undefined) return false;
  if (typeof value !== 'number') {
    issue(issues, path, 'wrong-type');
    return false;
  }
  if (!Number.isInteger(value)) {
    issue(issues, path, 'not-integer');
    return false;
  }
  if (!Number.isSafeInteger(value) || value < 1 || value > 0xffff_ffff) {
    issue(issues, path, 'out-of-range');
    return false;
  }
  return true;
}

function validateRngUint32(value: unknown, path: string, issues: ValidationIssue[]): value is number {
  if (value === undefined) return false;
  if (typeof value !== 'number') {
    issue(issues, path, 'wrong-type');
    return false;
  }
  if (!Number.isInteger(value)) {
    issue(issues, path, 'not-integer');
    return false;
  }
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    issue(issues, path, 'out-of-range');
    return false;
  }
  return true;
}

function validateDay(value: unknown, path: string, issues: ValidationIssue[]): value is number {
  if (value === undefined) return false;
  if (typeof value !== 'number') {
    issue(issues, path, 'wrong-type');
    return false;
  }
  if (!Number.isInteger(value)) {
    issue(issues, path, 'not-integer');
    return false;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    issue(issues, path, 'out-of-range');
    return false;
  }
  return true;
}

function validateStableId(value: unknown, path: string, issues: ValidationIssue[]): value is string {
  if (value === undefined) return false;
  if (typeof value !== 'string') {
    issue(issues, path, 'wrong-type');
    return false;
  }
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(value)) {
    issue(issues, path, 'out-of-range');
    return false;
  }
  return true;
}

function validateCheckpoint(value: unknown, path: string, issues: ValidationIssue[]): SailingCheckpoint | null {
  const before = issues.length;
  const checkpoint = snapshotNestedRecord(value, path, issues);
  if (!checkpoint) return null;
  validateKeys(checkpoint, ['tick', 'position', 'heading', 'elapsedDays', 'provisionsUsed'], path, issues);
  for (const key of ['tick', 'heading', 'elapsedDays', 'provisionsUsed'] as const) {
    const field = required(checkpoint, key, path, issues);
    if (field === undefined) continue;
    if (typeof field !== 'number') issue(issues, `${path}.${key}`, 'wrong-type');
    else if (!Number.isFinite(field)) issue(issues, `${path}.${key}`, 'not-finite');
    else if (!Number.isSafeInteger(field) && key !== 'heading') issue(issues, `${path}.${key}`, 'out-of-range');
  }
  const positionValue = required(checkpoint, 'position', path, issues);
  if (positionValue === undefined) return null;
  const position = snapshotNestedRecord(positionValue, `${path}.position`, issues);
  if (!position) return null;
  validateKeys(position, ['x', 'z'], `${path}.position`, issues);
  for (const key of ['x', 'z'] as const) {
    const field = required(position, key, `${path}.position`, issues);
    if (field === undefined) continue;
    if (typeof field !== 'number') issue(issues, `${path}.position.${key}`, 'wrong-type');
    else if (!Number.isFinite(field)) issue(issues, `${path}.position.${key}`, 'not-finite');
  }
  if (issues.length !== before) return null;
  return checkpoint as unknown as SailingCheckpoint;
}

function validateRngPair(value: unknown, path: string, issues: ValidationIssue[]): { before: number; after: number } | null {
  const beforeIssues = issues.length;
  const pair = snapshotNestedRecord(value, path, issues);
  if (!pair) return null;
  validateKeys(pair, ['before', 'after'], path, issues);
  validateRngUint32(required(pair, 'before', path, issues), `${path}.before`, issues);
  validateRngUint32(required(pair, 'after', path, issues), `${path}.after`, issues);
  if (issues.length !== beforeIssues) return null;
  return pair as unknown as { before: number; after: number };
}

function validateFiniteNumber(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) return;
  if (typeof value !== 'number') issue(issues, path, 'wrong-type');
  else if (!Number.isFinite(value)) issue(issues, path, 'not-finite');
}

function validateNavalShipId(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (value === undefined) return;
  if (typeof value !== 'string') issue(issues, path, 'wrong-type');
  else if (value !== 'player' && value !== 'opponent') issue(issues, path, 'unknown-id');
}

function validateNavalShipInput(value: unknown, path: string, issues: ValidationIssue[]): PlainRecord | null {
  const before = issues.length;
  const ship = snapshotNestedRecord(value, path, issues);
  if (!ship) return null;
  validateKeys(ship, ['id', 'stableShipId', 'name', 'classId', 'position', 'heading', 'hull', 'sails', 'crew', 'cannon'], path, issues);
  for (const key of ['id', 'stableShipId', 'name', 'classId'] as const) {
    const field = required(ship, key, path, issues);
    if (field !== undefined && typeof field !== 'string') issue(issues, `${path}.${key}`, 'wrong-type');
  }
  const positionValue = required(ship, 'position', path, issues);
  const position = positionValue === undefined ? null : snapshotNestedRecord(positionValue, `${path}.position`, issues);
  if (position) {
    validateKeys(position, ['x', 'z'], `${path}.position`, issues);
    validateFiniteNumber(required(position, 'x', `${path}.position`, issues), `${path}.position.x`, issues);
    validateFiniteNumber(required(position, 'z', `${path}.position`, issues), `${path}.position.z`, issues);
  }
  for (const key of ['heading', 'hull', 'sails', 'crew', 'cannon'] as const) {
    validateFiniteNumber(required(ship, key, path, issues), `${path}.${key}`, issues);
  }
  return issues.length === before ? ship : null;
}

function validateNavalInput(value: unknown, path: string, issues: ValidationIssue[]): NavalBattleInput | null {
  const before = issues.length;
  const input = snapshotNestedRecord(value, path, issues);
  if (!input) return null;
  validateKeys(input, ['battleId', 'seed', 'windFrom', 'windStrength', 'arenaRadius', 'timeLimitTicks', 'objective', 'player', 'opponent'], path, issues);
  for (const key of ['battleId', 'objective'] as const) {
    const field = required(input, key, path, issues);
    if (field !== undefined && typeof field !== 'string') issue(issues, `${path}.${key}`, 'wrong-type');
  }
  validateRngUint32(required(input, 'seed', path, issues), `${path}.seed`, issues);
  for (const key of ['windFrom', 'windStrength', 'arenaRadius', 'timeLimitTicks'] as const) {
    validateFiniteNumber(required(input, key, path, issues), `${path}.${key}`, issues);
  }
  const player = required(input, 'player', path, issues);
  if (player !== undefined) validateNavalShipInput(player, `${path}.player`, issues);
  const opponent = required(input, 'opponent', path, issues);
  if (opponent !== undefined) validateNavalShipInput(opponent, `${path}.opponent`, issues);
  if (issues.length !== before) return null;
  const parsed = input as unknown as NavalBattleInput;
  if (!validateBattleInput(parsed).ok) {
    issue(issues, path, 'invariant');
    return null;
  }
  return parsed;
}

function validateSystems(value: unknown, path: string, issues: ValidationIssue[]): PlainRecord | null {
  const before = issues.length;
  const systems = snapshotNestedRecord(value, path, issues);
  if (!systems) return null;
  validateKeys(systems, ['hull', 'sails', 'crew', 'cannon'], path, issues);
  for (const key of ['hull', 'sails', 'crew', 'cannon'] as const) {
    validateFiniteNumber(required(systems, key, path, issues), `${path}.${key}`, issues);
  }
  return issues.length === before ? systems : null;
}

function validateOutcome(value: unknown, path: string, issues: ValidationIssue[]): PlainRecord | null {
  const before = issues.length;
  const outcome = snapshotNestedRecord(value, path, issues);
  if (!outcome) return null;
  const kind = required(outcome, 'kind', path, issues);
  if (kind === undefined) return null;
  if (typeof kind !== 'string') issue(issues, `${path}.kind`, 'wrong-type');
  else if (kind === 'surrender' || kind === 'sunk' || kind === 'boarding-ready') {
    validateKeys(outcome, ['kind', 'victorShipId'], path, issues);
    const victor = required(outcome, 'victorShipId', path, issues);
    if (victor !== undefined && victor !== 'player' && victor !== 'opponent') issue(issues, `${path}.victorShipId`, 'unknown-id');
  } else if (kind === 'escaped' || kind === 'separated') {
    validateKeys(outcome, ['kind', 'shipId'], path, issues);
    const shipId = required(outcome, 'shipId', path, issues);
    if (shipId !== undefined && shipId !== 'player' && shipId !== 'opponent') issue(issues, `${path}.shipId`, 'unknown-id');
  } else issue(issues, `${path}.kind`, 'unknown-id');
  return issues.length === before ? outcome : null;
}

function validateResolution(value: unknown, path: string, issues: ValidationIssue[]): NavalResolution | null {
  const before = issues.length;
  const resolution = snapshotNestedRecord(value, path, issues);
  if (!resolution) return null;
  validateKeys(resolution, ['battleId', 'outcome', 'atTick', 'seedAfter', 'player', 'opponent', 'decisive'], path, issues);
  const battleId = required(resolution, 'battleId', path, issues);
  if (battleId !== undefined && typeof battleId !== 'string') issue(issues, `${path}.battleId`, 'wrong-type');
  const outcome = required(resolution, 'outcome', path, issues);
  if (outcome !== undefined) validateOutcome(outcome, `${path}.outcome`, issues);
  validateFiniteNumber(required(resolution, 'atTick', path, issues), `${path}.atTick`, issues);
  validateRngUint32(required(resolution, 'seedAfter', path, issues), `${path}.seedAfter`, issues);
  const playerSystems = required(resolution, 'player', path, issues);
  if (playerSystems !== undefined) validateSystems(playerSystems, `${path}.player`, issues);
  const opponentSystems = required(resolution, 'opponent', path, issues);
  if (opponentSystems !== undefined) validateSystems(opponentSystems, `${path}.opponent`, issues);
  const decisiveValue = required(resolution, 'decisive', path, issues);
  const decisive = decisiveValue === undefined ? null : snapshotNestedRecord(decisiveValue, `${path}.decisive`, issues);
  if (decisive) {
    const kind = required(decisive, 'kind', `${path}.decisive`, issues);
    const decisivePath = `${path}.decisive`;
    if (kind === undefined) return null;
    if (typeof kind !== 'string') issue(issues, `${decisivePath}.kind`, 'wrong-type');
    else if (kind === 'surrender') {
      validateKeys(decisive, ['kind', 'victorShipId', 'surrenderedShipId', 'threshold', 'value', 'thresholdValue'], decisivePath, issues);
      validateNavalShipId(required(decisive, 'victorShipId', decisivePath, issues), `${decisivePath}.victorShipId`, issues);
      validateNavalShipId(required(decisive, 'surrenderedShipId', decisivePath, issues), `${decisivePath}.surrenderedShipId`, issues);
      const threshold = required(decisive, 'threshold', decisivePath, issues);
      if (threshold !== undefined && typeof threshold !== 'string') issue(issues, `${decisivePath}.threshold`, 'wrong-type');
      else if (threshold !== undefined && threshold !== 'hull' && threshold !== 'crew') issue(issues, `${decisivePath}.threshold`, 'unknown-id');
      validateFiniteNumber(required(decisive, 'value', decisivePath, issues), `${decisivePath}.value`, issues);
      validateFiniteNumber(required(decisive, 'thresholdValue', decisivePath, issues), `${decisivePath}.thresholdValue`, issues);
    } else if (kind === 'sunk') {
      validateKeys(decisive, ['kind', 'victorShipId', 'sunkShipId', 'hull'], decisivePath, issues);
      validateNavalShipId(required(decisive, 'victorShipId', decisivePath, issues), `${decisivePath}.victorShipId`, issues);
      validateNavalShipId(required(decisive, 'sunkShipId', decisivePath, issues), `${decisivePath}.sunkShipId`, issues);
      validateFiniteNumber(required(decisive, 'hull', decisivePath, issues), `${decisivePath}.hull`, issues);
    } else if (kind === 'boarding-ready') {
      validateKeys(decisive, ['kind', 'victorShipId', 'range', 'relativeSpeed', 'targetSails', 'targetCrew', 'playerCrew'], decisivePath, issues);
      const victor = required(decisive, 'victorShipId', decisivePath, issues);
      if (victor !== undefined && typeof victor !== 'string') issue(issues, `${decisivePath}.victorShipId`, 'wrong-type');
      else if (victor !== undefined && victor !== 'player') issue(issues, `${decisivePath}.victorShipId`, 'unknown-id');
      for (const key of ['range', 'relativeSpeed', 'targetSails', 'targetCrew', 'playerCrew'] as const) {
        validateFiniteNumber(required(decisive, key, decisivePath, issues), `${decisivePath}.${key}`, issues);
      }
    } else if (kind === 'escaped') {
      validateKeys(decisive, ['kind', 'shipId', 'distance', 'arenaRadius', 'outwardSpeed'], decisivePath, issues);
      validateNavalShipId(required(decisive, 'shipId', decisivePath, issues), `${decisivePath}.shipId`, issues);
      for (const key of ['distance', 'arenaRadius', 'outwardSpeed'] as const) {
        validateFiniteNumber(required(decisive, key, decisivePath, issues), `${decisivePath}.${key}`, issues);
      }
    } else if (kind === 'separated') {
      validateKeys(decisive, ['kind', 'shipId', 'timeLimitTicks'], decisivePath, issues);
      validateNavalShipId(required(decisive, 'shipId', decisivePath, issues), `${decisivePath}.shipId`, issues);
      validateFiniteNumber(required(decisive, 'timeLimitTicks', decisivePath, issues), `${decisivePath}.timeLimitTicks`, issues);
    } else issue(issues, `${decisivePath}.kind`, 'unknown-id');
  }
  return issues.length === before ? resolution as unknown as NavalResolution : null;
}

export function validateCampaignEvent(input: unknown): ValidationResult<CampaignEvent> {
  const issues: ValidationIssue[] = [];
  const event = snapshotRecord(input, '$', issues);
  if (!event) return { ok: false, issues };

  validateKeys(event, ['id', 'type', 'atDay', 'payload'], '$', issues);
  validateUint32(required(event, 'id', '$', issues), 'id', issues);

  const type = required(event, 'type', '$', issues);
  let validType: CampaignEvent['type'] | null = null;
  if (type !== undefined) {
    if (typeof type !== 'string') issue(issues, 'type', 'wrong-type');
    else if (['lead-accepted', 'market-traded', 'voyage-started', 'sea-leg-completed', 'encounter-avoided', 'naval-engaged', 'battle-withdrawn', 'naval-resolved'].includes(type)) validType = type as CampaignEvent['type'];
    else issue(issues, 'type', 'unknown-id');
  }

  validateDay(required(event, 'atDay', '$', issues), 'atDay', issues);

  const payloadValue = required(event, 'payload', '$', issues);
  const payload = payloadValue === undefined
    ? null
    : snapshotRecord(payloadValue, 'payload', issues);
  if (payload && validType === 'lead-accepted') {
    validateKeys(payload, ['leadId'], 'payload', issues);
    const leadId = required(payload, 'leadId', 'payload', issues);
    if (leadId !== undefined) {
      if (typeof leadId !== 'string') issue(issues, 'payload.leadId', 'wrong-type');
      else if (leadId !== ('red-jackdaw' satisfies LeadId)) issue(issues, 'payload.leadId', 'unknown-id');
    }
  }
  if (payload && validType === 'market-traded') {
    validateKeys(payload, ['portId', 'shipId', 'cargoId', 'delta', 'unitPrice'], 'payload', issues);
    const portId = required(payload, 'portId', 'payload', issues);
    if (portId !== undefined) {
      if (typeof portId !== 'string') issue(issues, 'payload.portId', 'wrong-type');
      else if (!isPortId(portId)) issue(issues, 'payload.portId', 'unknown-id');
    }
    const shipId = required(payload, 'shipId', 'payload', issues);
    if (shipId !== undefined && typeof shipId !== 'string') issue(issues, 'payload.shipId', 'wrong-type');
    const cargoId = required(payload, 'cargoId', 'payload', issues);
    if (cargoId !== undefined) {
      if (typeof cargoId !== 'string') issue(issues, 'payload.cargoId', 'wrong-type');
      else if (!isCargoId(cargoId)) issue(issues, 'payload.cargoId', 'unknown-id');
    }
    const delta = required(payload, 'delta', 'payload', issues);
    if (delta !== undefined) {
      if (typeof delta !== 'number') issue(issues, 'payload.delta', 'wrong-type');
      else if (!Number.isInteger(delta)) issue(issues, 'payload.delta', 'not-integer');
      else if (!Number.isSafeInteger(delta) || delta === 0) issue(issues, 'payload.delta', 'out-of-range');
    }
    const unitPrice = required(payload, 'unitPrice', 'payload', issues);
    if (unitPrice !== undefined) {
      if (typeof unitPrice !== 'number') issue(issues, 'payload.unitPrice', 'wrong-type');
      else if (!Number.isInteger(unitPrice)) issue(issues, 'payload.unitPrice', 'not-integer');
      else if (!Number.isSafeInteger(unitPrice) || unitPrice < 0) issue(issues, 'payload.unitPrice', 'out-of-range');
    }
  }
  if (payload && validType === 'voyage-started') {
    validateKeys(payload, ['voyageId'], 'payload', issues);
    validateStableId(required(payload, 'voyageId', 'payload', issues), 'payload.voyageId', issues);
  }
  if (payload && validType === 'sea-leg-completed') {
    validateKeys(payload, ['voyageId', 'encounterId', 'checkpoint', 'navigationRng'], 'payload', issues);
    validateStableId(required(payload, 'voyageId', 'payload', issues), 'payload.voyageId', issues);
    validateStableId(required(payload, 'encounterId', 'payload', issues), 'payload.encounterId', issues);
    validateCheckpoint(required(payload, 'checkpoint', 'payload', issues), 'payload.checkpoint', issues);
    validateRngPair(required(payload, 'navigationRng', 'payload', issues), 'payload.navigationRng', issues);
  }
  if (payload && validType === 'encounter-avoided') {
    validateKeys(payload, ['voyageId', 'encounterId'], 'payload', issues);
    validateStableId(required(payload, 'voyageId', 'payload', issues), 'payload.voyageId', issues);
    validateStableId(required(payload, 'encounterId', 'payload', issues), 'payload.encounterId', issues);
  }
  if (payload && validType === 'naval-engaged') {
    validateKeys(payload, ['voyageId', 'encounterId', 'battleId', 'navalRng', 'input'], 'payload', issues);
    validateStableId(required(payload, 'voyageId', 'payload', issues), 'payload.voyageId', issues);
    validateStableId(required(payload, 'encounterId', 'payload', issues), 'payload.encounterId', issues);
    validateStableId(required(payload, 'battleId', 'payload', issues), 'payload.battleId', issues);
    validateRngPair(required(payload, 'navalRng', 'payload', issues), 'payload.navalRng', issues);
    validateNavalInput(required(payload, 'input', 'payload', issues), 'payload.input', issues);
  }
  if (payload && validType === 'battle-withdrawn') {
    validateKeys(payload, ['voyageId', 'battleId'], 'payload', issues);
    validateStableId(required(payload, 'voyageId', 'payload', issues), 'payload.voyageId', issues);
    validateStableId(required(payload, 'battleId', 'payload', issues), 'payload.battleId', issues);
  }
  if (payload && validType === 'naval-resolved') {
    validateKeys(payload, ['voyageId', 'battleId', 'resolution'], 'payload', issues);
    validateStableId(required(payload, 'voyageId', 'payload', issues), 'payload.voyageId', issues);
    validateStableId(required(payload, 'battleId', 'payload', issues), 'payload.battleId', issues);
    validateResolution(required(payload, 'resolution', 'payload', issues), 'payload.resolution', issues);
  }

  if (issues.length > 0) return { ok: false, issues };
  if (validType === 'lead-accepted') return {
    ok: true,
    value: { id: event.id as number, type: validType, atDay: event.atDay as number, payload: { leadId: 'red-jackdaw' } },
  };
  if (validType === 'market-traded') return {
    ok: true,
    value: {
      id: event.id as number,
      type: validType,
      atDay: event.atDay as number,
      payload: {
        portId: payload?.portId as PortId,
        shipId: payload?.shipId as string,
        cargoId: payload?.cargoId as CargoId,
        delta: payload?.delta as number,
        unitPrice: payload?.unitPrice as number,
      },
    },
  };
  if (validType === 'voyage-started') return { ok: true, value: { id: event.id as number, type: validType, atDay: event.atDay as number, payload: { voyageId: payload?.voyageId as string } } };
  if (validType === 'sea-leg-completed') {
    const cloneIssues: ValidationIssue[] = [];
    const checkpoint = validateCheckpoint(payload?.checkpoint, 'payload.checkpoint', cloneIssues);
    const navigationRng = validateRngPair(payload?.navigationRng, 'payload.navigationRng', cloneIssues);
    if (!checkpoint || !navigationRng) return { ok: false, issues: [{ path: '$', code: 'invariant' }] };
    return { ok: true, value: { id: event.id as number, type: validType, atDay: event.atDay as number, payload: { voyageId: payload?.voyageId as string, encounterId: payload?.encounterId as string, checkpoint, navigationRng } } };
  }
  if (validType === 'encounter-avoided') return { ok: true, value: { id: event.id as number, type: validType, atDay: event.atDay as number, payload: payload as unknown as Extract<CampaignEvent, { type: 'encounter-avoided' }>['payload'] } };
  if (validType === 'naval-engaged') {
    const cloneIssues: ValidationIssue[] = [];
    const navalRng = validateRngPair(payload?.navalRng, 'payload.navalRng', cloneIssues);
    const navalInput = validateNavalInput(payload?.input, 'payload.input', cloneIssues);
    if (!navalRng || !navalInput) return { ok: false, issues: [{ path: '$', code: 'invariant' }] };
    return { ok: true, value: { id: event.id as number, type: validType, atDay: event.atDay as number, payload: { voyageId: payload?.voyageId as string, encounterId: payload?.encounterId as string, battleId: payload?.battleId as string, navalRng, input: navalInput } } };
  }
  if (validType === 'battle-withdrawn') return { ok: true, value: { id: event.id as number, type: validType, atDay: event.atDay as number, payload: payload as unknown as Extract<CampaignEvent, { type: 'battle-withdrawn' }>['payload'] } };
  if (validType === 'naval-resolved') {
    const resolution = validateResolution(payload?.resolution, 'payload.resolution', []);
    if (!resolution) return { ok: false, issues: [{ path: '$', code: 'invariant' }] };
    return { ok: true, value: { id: event.id as number, type: validType, atDay: event.atDay as number, payload: { voyageId: payload?.voyageId as string, battleId: payload?.battleId as string, resolution } } };
  }
  return { ok: false, issues: [{ path: '$', code: 'invariant' }] };
}
