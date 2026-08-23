import type { LeadId } from '../content/types';
import type {
  CampaignStateV1,
  ValidationIssue,
  ValidationResult,
} from './types';

export type CampaignEvent = {
  id: number;
  type: 'lead-accepted';
  atDay: number;
  payload: { leadId: 'red-jackdaw' };
};

export type CampaignEventDraft = Omit<CampaignEvent, 'id' | 'atDay'>;

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
        issue(issues, path === '$' ? key : `${path}.${key}`, 'non-json');
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

export function validateCampaignEvent(input: unknown): ValidationResult<CampaignEvent> {
  const issues: ValidationIssue[] = [];
  const event = snapshotRecord(input, '$', issues);
  if (!event) return { ok: false, issues };

  validateKeys(event, ['id', 'type', 'atDay', 'payload'], '$', issues);
  validateUint32(required(event, 'id', '$', issues), 'id', issues);

  const type = required(event, 'type', '$', issues);
  if (type !== undefined) {
    if (typeof type !== 'string') issue(issues, 'type', 'wrong-type');
    else if (type !== 'lead-accepted') issue(issues, 'type', 'unknown-id');
  }

  validateDay(required(event, 'atDay', '$', issues), 'atDay', issues);

  const payloadValue = required(event, 'payload', '$', issues);
  const payload = payloadValue === undefined
    ? null
    : snapshotRecord(payloadValue, 'payload', issues);
  if (payload) {
    validateKeys(payload, ['leadId'], 'payload', issues);
    const leadId = required(payload, 'leadId', 'payload', issues);
    if (leadId !== undefined) {
      if (typeof leadId !== 'string') issue(issues, 'payload.leadId', 'wrong-type');
      else if (leadId !== ('red-jackdaw' satisfies LeadId)) issue(issues, 'payload.leadId', 'unknown-id');
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: {
      id: event.id as number,
      type: 'lead-accepted',
      atDay: event.atDay as number,
      payload: { leadId: 'red-jackdaw' },
    },
  };
}
