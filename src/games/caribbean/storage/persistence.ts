import type { CampaignJournal } from '../domain/events';
import { validateJournal } from '../domain/replay';
import type { ValidationIssue } from '../domain/types';
import { canonicalJson, checksumPayload } from './checksum';
import {
  parseSaveEnvelope,
  type SaveEnvelopeV1,
  type UnreadableCode,
} from './schema';

export const CURRENT_SAVE_KEY = 'caribbean:campaign:current';
export const PREVIOUS_SAVE_KEY = 'caribbean:campaign:previous';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface UnreadableSlot {
  slot: 'current' | 'previous';
  raw: string;
  code: UnreadableCode;
}

export interface ActiveSaveRevision {
  currentRaw: string | null;
  previousRaw: string | null;
}

export type StorageOperation =
  | 'read-current'
  | 'read-previous'
  | 'write-previous'
  | 'write-current';

export type LoadResult =
  | { kind: 'empty'; revision: ActiveSaveRevision }
  | {
      kind: 'loaded';
      journal: CampaignJournal;
      savedAt: number;
      build: string;
      recovered: boolean;
      unreadableSlots: UnreadableSlot[];
      revision: ActiveSaveRevision;
    }
  | {
      kind: 'unreadable';
      unreadableSlots: UnreadableSlot[];
      revision: ActiveSaveRevision;
    }
  | { kind: 'storage-unavailable'; operation: StorageOperation };

export type SaveResult =
  | {
      ok: true;
      journal: CampaignJournal;
      checksum: string;
      revision: ActiveSaveRevision;
    }
  | { ok: false; reason: 'invalid-journal'; issues: ValidationIssue[] }
  | {
      ok: false;
      reason: 'unreadable-active-save';
      unreadableSlots: UnreadableSlot[];
      revision: ActiveSaveRevision;
    }
  | {
      ok: false;
      reason: 'save-conflict';
      expected: ActiveSaveRevision;
      actual: ActiveSaveRevision;
    }
  | {
      ok: false;
      reason: 'storage-unavailable';
      operation: StorageOperation;
    };

type RevisionReadResult =
  | { ok: true; revision: ActiveSaveRevision }
  | { ok: false; operation: 'read-current' | 'read-previous' };

function readRevision(storage: StorageLike): RevisionReadResult {
  let currentRaw: string | null;
  try {
    currentRaw = storage.getItem(CURRENT_SAVE_KEY);
  } catch {
    return { ok: false, operation: 'read-current' };
  }

  let previousRaw: string | null;
  try {
    previousRaw = storage.getItem(PREVIOUS_SAVE_KEY);
  } catch {
    return { ok: false, operation: 'read-previous' };
  }
  return { ok: true, revision: { currentRaw, previousRaw } };
}

function parseSlot(
  slot: UnreadableSlot['slot'],
  raw: string | null,
):
  | { kind: 'empty' }
  | { kind: 'valid'; envelope: SaveEnvelopeV1 }
  | { kind: 'unreadable'; unreadable: UnreadableSlot } {
  if (raw === null) return { kind: 'empty' };
  const parsed = parseSaveEnvelope(raw);
  return parsed.ok
    ? { kind: 'valid', envelope: parsed.envelope }
    : { kind: 'unreadable', unreadable: { slot, raw, code: parsed.code } };
}

function sameRevision(left: ActiveSaveRevision, right: ActiveSaveRevision): boolean {
  return left.currentRaw === right.currentRaw
    && left.previousRaw === right.previousRaw;
}

export function loadCampaign(storage: StorageLike): LoadResult {
  const read = readRevision(storage);
  if (!read.ok) return { kind: 'storage-unavailable', operation: read.operation };
  const revision = read.revision;
  const current = parseSlot('current', revision.currentRaw);
  const previous = parseSlot('previous', revision.previousRaw);
  const unreadableSlots = [current, previous]
    .filter((slot): slot is Extract<typeof slot, { kind: 'unreadable' }> => slot.kind === 'unreadable')
    .map(({ unreadable }) => unreadable);

  if (current.kind === 'valid') {
    return {
      kind: 'loaded',
      journal: current.envelope.payload,
      savedAt: current.envelope.savedAt,
      build: current.envelope.build,
      recovered: false,
      unreadableSlots,
      revision,
    };
  }
  if (previous.kind === 'valid') {
    return {
      kind: 'loaded',
      journal: previous.envelope.payload,
      savedAt: previous.envelope.savedAt,
      build: previous.envelope.build,
      recovered: true,
      unreadableSlots,
      revision,
    };
  }
  if (current.kind === 'empty' && previous.kind === 'empty') {
    return { kind: 'empty', revision };
  }
  return { kind: 'unreadable', unreadableSlots, revision };
}

export function saveCampaign(
  storage: StorageLike,
  inputJournal: CampaignJournal,
  options: {
    build: string;
    savedAt: number;
    expectedRevision: ActiveSaveRevision;
  },
): SaveResult {
  const journal = validateJournal(inputJournal);
  if (!journal.ok) {
    return { ok: false, reason: 'invalid-journal', issues: journal.issues };
  }

  const checksum = checksumPayload(journal.value);
  let proposedRaw: string;
  try {
    proposedRaw = canonicalJson({
      version: 1,
      build: options.build,
      savedAt: options.savedAt,
      checksum,
      payload: journal.value,
    } satisfies SaveEnvelopeV1);
  } catch {
    throw new Error('Invalid proposed save envelope: invalid-envelope');
  }
  const proposed = parseSaveEnvelope(proposedRaw);
  if (!proposed.ok) {
    throw new Error(`Invalid proposed save envelope: ${proposed.code}`);
  }

  const read = readRevision(storage);
  if (!read.ok) {
    return { ok: false, reason: 'storage-unavailable', operation: read.operation };
  }
  const actual = read.revision;
  if (!sameRevision(actual, options.expectedRevision)) {
    return {
      ok: false,
      reason: 'save-conflict',
      expected: { ...options.expectedRevision },
      actual,
    };
  }

  const current = parseSlot('current', actual.currentRaw);
  const previous = parseSlot('previous', actual.previousRaw);
  const unreadableSlots = [current, previous]
    .filter((slot): slot is Extract<typeof slot, { kind: 'unreadable' }> => slot.kind === 'unreadable')
    .map(({ unreadable }) => unreadable);
  if (unreadableSlots.length > 0) {
    return {
      ok: false,
      reason: 'unreadable-active-save',
      unreadableSlots,
      revision: actual,
    };
  }

  let nextPreviousRaw = actual.previousRaw;
  if (current.kind === 'valid' && actual.currentRaw !== null) {
    try {
      storage.setItem(PREVIOUS_SAVE_KEY, actual.currentRaw);
    } catch {
      return { ok: false, reason: 'storage-unavailable', operation: 'write-previous' };
    }
    nextPreviousRaw = actual.currentRaw;
  }

  try {
    storage.setItem(CURRENT_SAVE_KEY, proposedRaw);
  } catch {
    return { ok: false, reason: 'storage-unavailable', operation: 'write-current' };
  }

  return {
    ok: true,
    journal: proposed.envelope.payload,
    checksum: proposed.envelope.checksum,
    revision: {
      currentRaw: proposedRaw,
      previousRaw: nextPreviousRaw,
    },
  };
}
