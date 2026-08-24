import { isCargoId, isPortId } from '../content/campaign';
import type { CargoId, LeadId, PortId } from '../content/types';
import type {
  CampaignStateV1,
  SailingCheckpoint,
  ValidationIssue,
  ValidationResult,
} from './types';
import type { NavalBattleInput, NavalResolution } from './naval/types';

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

function validateCheckpoint(value: unknown, path: string, issues: ValidationIssue[]): void {
  const checkpoint = snapshotRecord(value, path, issues);
  if (!checkpoint) return;
  validateKeys(checkpoint, ['tick', 'position', 'heading', 'elapsedDays', 'provisionsUsed'], path, issues);
  for (const key of ['tick', 'heading', 'elapsedDays', 'provisionsUsed'] as const) {
    const field = required(checkpoint, key, path, issues);
    if (typeof field !== 'number') issue(issues, `${path}.${key}`, 'wrong-type');
    else if (!Number.isFinite(field)) issue(issues, `${path}.${key}`, 'not-finite');
    else if (!Number.isSafeInteger(field) && key !== 'heading') issue(issues, `${path}.${key}`, 'out-of-range');
  }
  const position = snapshotRecord(required(checkpoint, 'position', path, issues), `${path}.position`, issues);
  if (!position) return;
  validateKeys(position, ['x', 'z'], `${path}.position`, issues);
  for (const key of ['x', 'z'] as const) {
    const field = required(position, key, `${path}.position`, issues);
    if (typeof field !== 'number') issue(issues, `${path}.position.${key}`, 'wrong-type');
    else if (!Number.isFinite(field)) issue(issues, `${path}.position.${key}`, 'not-finite');
  }
}

function validateRngPair(value: unknown, path: string, issues: ValidationIssue[]): void {
  const pair = snapshotRecord(value, path, issues);
  if (!pair) return;
  validateKeys(pair, ['before', 'after'], path, issues);
  validateUint32(required(pair, 'before', path, issues), `${path}.before`, issues);
  validateUint32(required(pair, 'after', path, issues), `${path}.after`, issues);
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
    if (!snapshotRecord(required(payload, 'input', 'payload', issues), 'payload.input', issues)) return { ok: false, issues };
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
    if (!snapshotRecord(required(payload, 'resolution', 'payload', issues), 'payload.resolution', issues)) return { ok: false, issues };
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
  if (validType === 'sea-leg-completed') return { ok: true, value: { id: event.id as number, type: validType, atDay: event.atDay as number, payload: payload as unknown as Extract<CampaignEvent, { type: 'sea-leg-completed' }>['payload'] } };
  if (validType === 'encounter-avoided') return { ok: true, value: { id: event.id as number, type: validType, atDay: event.atDay as number, payload: payload as unknown as Extract<CampaignEvent, { type: 'encounter-avoided' }>['payload'] } };
  if (validType === 'naval-engaged') return { ok: true, value: { id: event.id as number, type: validType, atDay: event.atDay as number, payload: payload as unknown as Extract<CampaignEvent, { type: 'naval-engaged' }>['payload'] } };
  if (validType === 'battle-withdrawn') return { ok: true, value: { id: event.id as number, type: validType, atDay: event.atDay as number, payload: payload as unknown as Extract<CampaignEvent, { type: 'battle-withdrawn' }>['payload'] } };
  if (validType === 'naval-resolved') return { ok: true, value: { id: event.id as number, type: validType, atDay: event.atDay as number, payload: payload as unknown as Extract<CampaignEvent, { type: 'naval-resolved' }>['payload'] } };
  return { ok: false, issues: [{ path: '$', code: 'invariant' }] };
}
