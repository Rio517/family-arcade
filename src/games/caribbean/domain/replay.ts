import {
  type CampaignEvent,
  type CampaignEventDraft,
  type CampaignJournal,
  validateCampaignEvent,
} from './events';
import { reduceCampaign } from './reduceCampaign';
import type {
  CampaignStateV1,
  ValidationIssue,
  ValidationResult,
} from './types';
import { validateCampaign } from './validateCampaign';

function formatIssues(issues: readonly ValidationIssue[]): string {
  return issues.map(({ path, code }) => `${path}:${code}`).join(', ');
}

function prefixIssues(
  prefix: string,
  issues: readonly ValidationIssue[],
): ValidationIssue[] {
  return issues.map(({ path, code }) => ({
    path: path === '$' ? prefix : `${prefix}.${path}`,
    code,
  }));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

// Task 3 needs key-order-independent replay comparison before persistence
// exists. This stays private; Task 4 introduces the one public canonical
// serializer used by save checksums and will replace this local comparator.
function canonicalReplayValue(value: unknown, ancestors: Set<object>): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-json');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') throw new Error('non-json');
  if (ancestors.has(value)) throw new Error('non-json');
  if (!Array.isArray(value) && !isPlainRecord(value)) throw new Error('non-json');

  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key === 'symbol')) throw new Error('non-json');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
      if (!lengthDescriptor || !('value' in lengthDescriptor) || !Number.isInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) {
        throw new Error('non-json');
      }
      const length = lengthDescriptor.value;
      const allowedKeys = new Set(['length', ...Array.from({ length }, (_, index) => String(index))]);
      if (keys.some((key) => typeof key === 'string' && !allowedKeys.has(key))) throw new Error('non-json');
      const items: string[] = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true) throw new Error('non-json');
        items.push(canonicalReplayValue(descriptor.value, ancestors));
      }
      return `[${items.join(',')}]`;
    }

    const entries: string[] = [];
    for (const key of keys.filter((candidate): candidate is string => typeof candidate === 'string').sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true) throw new Error('non-json');
      entries.push(`${JSON.stringify(key)}:${canonicalReplayValue(descriptor.value, ancestors)}`);
    }
    return `{${entries.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

function canonicalReplayJson(value: unknown): string {
  return canonicalReplayValue(value, new Set());
}

function cloneUntrustedJournal(value: unknown): unknown {
  return JSON.parse(canonicalReplayJson(value)) as unknown;
}

function requiredJournalField(
  journal: Record<string, unknown>,
  key: 'initial' | 'events' | 'state',
  issues: ValidationIssue[],
): unknown {
  if (!Object.prototype.hasOwnProperty.call(journal, key)) {
    issues.push({ path: key, code: 'missing' });
    return undefined;
  }
  return journal[key];
}

export function replayCampaign(
  initial: CampaignStateV1,
  events: readonly CampaignEvent[],
): CampaignStateV1 {
  const validation = validateCampaign(initial);
  if (!validation.ok) {
    throw new Error(`Invalid replay initial state: ${formatIssues(validation.issues)}`);
  }
  return events.reduce(
    (state, event) => reduceCampaign(state, event),
    structuredClone(initial),
  );
}

export function createJournal(initial: CampaignStateV1): CampaignJournal {
  const validation = validateCampaign(initial);
  if (!validation.ok) {
    throw new Error(`Invalid campaign journal initial state: ${formatIssues(validation.issues)}`);
  }
  return {
    initial: structuredClone(initial),
    events: [],
    state: structuredClone(initial),
  };
}

export function validateJournal(input: unknown): ValidationResult<CampaignJournal> {
  let journal: unknown;
  try {
    journal = cloneUntrustedJournal(input);
  } catch {
    return { ok: false, issues: [{ path: '$', code: 'non-json' }] };
  }
  if (!isPlainRecord(journal)) {
    return { ok: false, issues: [{ path: '$', code: 'wrong-type' }] };
  }

  const issues: ValidationIssue[] = [];
  const allowedKeys = new Set(['initial', 'events', 'state']);
  for (const key of Object.keys(journal).filter((candidate) => !allowedKeys.has(candidate)).sort()) {
    issues.push({ path: key, code: 'unknown-key' });
  }

  const initialInput = requiredJournalField(journal, 'initial', issues);
  const initial = initialInput === undefined
    ? null
    : validateCampaign(initialInput);
  if (initial && !initial.ok) issues.push(...prefixIssues('initial', initial.issues));

  const eventsInput = requiredJournalField(journal, 'events', issues);
  let events: CampaignEvent[] | null = null;
  let eventShapesValid = true;
  if (eventsInput !== undefined) {
    if (!Array.isArray(eventsInput)) {
      issues.push({ path: 'events', code: 'wrong-type' });
    } else {
      events = eventsInput as CampaignEvent[];
      events.forEach((event, index) => {
        const validation = validateCampaignEvent(event);
        if (!validation.ok) {
          eventShapesValid = false;
          issues.push(...prefixIssues(`events.${index}`, validation.issues));
        }
      });
    }
  }

  const stateInput = requiredJournalField(journal, 'state', issues);
  const state = stateInput === undefined
    ? null
    : validateCampaign(stateInput);
  if (state && !state.ok) issues.push(...prefixIssues('state', state.issues));

  if (initial?.ok && events && eventShapesValid) {
    let semanticsValid = true;
    events.forEach((event, index) => {
      const expectedId = initial.value.lastEventId + index + 1;
      if (expectedId > 0xffff_ffff || event.id !== expectedId) {
        issues.push({ path: `events.${index}.id`, code: 'invariant' });
        semanticsValid = false;
      }
      if (event.atDay !== initial.value.calendar.elapsedDays) {
        issues.push({ path: `events.${index}.atDay`, code: 'invariant' });
        semanticsValid = false;
      }
    });

    if (semanticsValid) {
      try {
        const replayed = replayCampaign(initial.value, events);
        if (state?.ok && canonicalReplayJson(replayed) !== canonicalReplayJson(state.value)) {
          issues.push({ path: 'state', code: 'replay-mismatch' });
        }
      } catch {
        issues.push({ path: 'events', code: 'invariant' });
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  if (!initial?.ok || !state?.ok || events === null) {
    return { ok: false, issues: [{ path: '$', code: 'invariant' }] };
  }
  return {
    ok: true,
    value: {
      initial: initial.value,
      events,
      state: state.value,
    },
  };
}

export function appendJournal(
  inputJournal: CampaignJournal,
  draft: CampaignEventDraft,
): CampaignJournal {
  const validation = validateJournal(inputJournal);
  if (!validation.ok) {
    throw new Error(`Invalid campaign journal: ${formatIssues(validation.issues)}`);
  }
  const journal = validation.value;
  if (journal.state.lastEventId === 0xffff_ffff) {
    throw new Error('Campaign event ID space exhausted');
  }

  let clonedDraft: CampaignEventDraft;
  try {
    clonedDraft = structuredClone(draft);
  } catch {
    throw new Error('Invalid campaign event: $:non-json');
  }
  const draftKeys = Object.keys(clonedDraft);
  const allowedDraftKeys = new Set(['type', 'payload']);
  const extraDraftKey = draftKeys.filter((key) => !allowedDraftKeys.has(key)).sort()[0];
  if (extraDraftKey !== undefined) {
    throw new Error(`Invalid campaign event: ${extraDraftKey}:unknown-key`);
  }
  const event = {
    ...clonedDraft,
    id: journal.state.lastEventId + 1,
    atDay: journal.state.calendar.elapsedDays,
  } as CampaignEvent;
  const eventValidation = validateCampaignEvent(event);
  if (!eventValidation.ok) {
    throw new Error(`Invalid campaign event: ${formatIssues(eventValidation.issues)}`);
  }
  const nextState = reduceCampaign(journal.state, eventValidation.value);
  return {
    initial: structuredClone(journal.initial),
    events: [...structuredClone(journal.events), eventValidation.value],
    state: nextState,
  };
}
