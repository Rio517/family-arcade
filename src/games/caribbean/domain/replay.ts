import { canonicalJson } from '../canonicalJson';
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

function cloneUntrustedJournal(value: unknown): unknown {
  return JSON.parse(canonicalJson(value)) as unknown;
}

function snapshotEventDraft(input: unknown): ValidationResult<CampaignEventDraft> {
  try {
    if (!isPlainRecord(input)) {
      return {
        ok: false,
        issues: [{
          path: '$',
          code: input !== null && typeof input === 'object' && !Array.isArray(input)
            ? 'non-json'
            : 'wrong-type',
        }],
      };
    }

    const ownKeys = Reflect.ownKeys(input);
    if (ownKeys.some((key) => typeof key === 'symbol')) {
      return { ok: false, issues: [{ path: '$', code: 'non-json' }] };
    }

    const allowed = new Set(['type', 'payload']);
    const snapshot: Record<string, unknown> = {};
    const issues: ValidationIssue[] = [];
    for (const key of ownKeys.filter((candidate): candidate is string => typeof candidate === 'string').sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!allowed.has(key)) {
        issues.push({ path: key, code: 'unknown-key' });
      } else if (!descriptor || !('value' in descriptor) || descriptor.enumerable !== true) {
        issues.push({ path: key, code: 'non-json' });
      } else {
        Object.defineProperty(snapshot, key, {
          configurable: true,
          enumerable: true,
          value: descriptor.value,
          writable: true,
        });
      }
    }
    if (issues.length > 0) return { ok: false, issues };
    return { ok: true, value: snapshot as unknown as CampaignEventDraft };
  } catch {
    return { ok: false, issues: [{ path: '$', code: 'non-json' }] };
  }
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
    validation.value,
  );
}

export function createJournal(initial: CampaignStateV1): CampaignJournal {
  const validation = validateCampaign(initial);
  if (!validation.ok) {
    throw new Error(`Invalid campaign journal initial state: ${formatIssues(validation.issues)}`);
  }
  return {
    initial: structuredClone(validation.value),
    events: [],
    state: structuredClone(validation.value),
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
    let current = initial.value;
    for (const [index, event] of events.entries()) {
      const expectedId = current.lastEventId + 1;
      if (expectedId > 0xffff_ffff || event.id !== expectedId) {
        issues.push({ path: `events.${index}.id`, code: 'invariant' });
        semanticsValid = false;
        break;
      }
      try {
        current = reduceCampaign(current, event);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        issues.push({
          path: message.startsWith('Invalid campaign event: expected day') ? `events.${index}.atDay` : `events.${index}`,
          code: 'invariant',
        });
        semanticsValid = false;
        break;
      }
    }

    if (semanticsValid) {
      if (state?.ok && canonicalJson(current) !== canonicalJson(state.value)) {
        issues.push({ path: 'state', code: 'replay-mismatch' });
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

  const draftSnapshot = snapshotEventDraft(draft);
  if (!draftSnapshot.ok) {
    throw new Error(`Invalid campaign event: ${formatIssues(draftSnapshot.issues)}`);
  }
  const event = {
    ...draftSnapshot.value,
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
