import type { CampaignJournal } from '../domain/events';
import { canonicalJson } from './checksum';
import {
  CURRENT_SAVE_KEY,
  PREVIOUS_SAVE_KEY,
  saveCampaign,
  sameRevision,
  type ActiveSaveRevision,
  type LoadResult,
  type SaveResult,
  type StorageLike,
  type UnreadableSlot,
} from './persistence';

export const QUARANTINE_KEY_PREFIX = 'caribbean:campaign:quarantine:';

export interface RecoveryExportV1 {
  version: 1;
  game: 'caribbean';
  revision: ActiveSaveRevision;
  unreadableSlots: UnreadableSlot[];
}

interface QuarantineEnvelopeV1 {
  version: 1;
  game: 'caribbean';
  quarantinedAt: number;
  sourceRevision: ActiveSaveRevision;
  unreadableSlots: UnreadableSlot[];
}

export function serializeRecoveryExport(
  revision: ActiveSaveRevision,
  unreadableSlots: readonly UnreadableSlot[],
): string {
  return canonicalJson({
    version: 1,
    game: 'caribbean',
    revision,
    unreadableSlots: [...unreadableSlots],
  } satisfies RecoveryExportV1);
}

export type RecoveryStorageOperation =
  | 'read-current'
  | 'read-previous'
  | 'read-quarantine'
  | 'write-quarantine'
  | 'verify-quarantine'
  | 'remove-current'
  | 'remove-previous';

export type RecoveryStage =
  | 'quarantine-verified'
  | 'cleanup'
  | 'republish';

export type OperationReachableRevision =
  | { kind: 'known'; revision: ActiveSaveRevision }
  | {
      kind: 'remove-outcome-unknown';
      failedOperation: 'remove-current' | 'remove-previous';
      acceptableRevisions: readonly ActiveSaveRevision[];
    };

export interface RecoveryContinuation {
  action: 'recover' | 'abandon';
  stage: RecoveryStage;
  quarantineKey: string;
  quarantineRaw: string;
  sourceRevision: ActiveSaveRevision;
  remaining: OperationReachableRevision;
  republish: null | {
    journal: CampaignJournal;
    build: string;
    savedAt: number;
  };
}

export type RecoveryResult =
  | {
      ok: true;
      kind: 'recovered';
      quarantineKey: string;
      revision: ActiveSaveRevision;
      journal: CampaignJournal;
    }
  | {
      ok: true;
      kind: 'abandoned';
      quarantineKey: string;
      revision: ActiveSaveRevision;
    }
  | {
      ok: false;
      reason: 'active-revision-conflict';
      expected: ActiveSaveRevision;
      actual: ActiveSaveRevision;
    }
  | {
      ok: false;
      reason: 'quarantine-collision';
      quarantineKey: string;
      expectedRaw: string;
      actualRaw: string;
    }
  | {
      ok: false;
      reason: 'storage-unavailable';
      stage: 'before-quarantine';
      operation: RecoveryStorageOperation;
    }
  | ({
      ok: false;
      reason: 'continuation-required';
      quarantineKey: string;
      continuation: RecoveryContinuation;
    } & (
      | {
          cause: 'storage-unavailable';
          failedOperation: RecoveryStorageOperation;
        }
      | {
          cause: 'partial-cleanup';
          failedOperation: 'remove-current' | 'remove-previous';
        }
      | {
          cause: 'republish-failed';
          saveFailure: Exclude<SaveResult, { ok: true }>;
        }
    ))
  | {
      ok: false;
      reason: 'external-revision-conflict';
      cause: 'active-revision-conflict';
      quarantineKey: string;
      quarantineRaw: string;
      stage: RecoveryStage;
      sourceRevision: ActiveSaveRevision;
      actualRevision: ActiveSaveRevision;
    }
  | {
      ok: false;
      reason: 'quarantine-invalidated';
      cause: 'quarantine-missing' | 'quarantine-changed';
      quarantineKey: string;
      expectedRaw: string;
      actualRaw: string | null;
      stage: RecoveryStage;
      sourceRevision: ActiveSaveRevision;
    }
  | { ok: false; reason: 'invalid-recovery-source' };

type RecoveryFailure = Extract<RecoveryResult, { ok: false }>;

interface RevisionReadSuccess {
  ok: true;
  revision: ActiveSaveRevision;
}

interface RevisionReadFailure {
  ok: false;
  operation: 'read-current' | 'read-previous';
}

type RevisionRead = RevisionReadSuccess | RevisionReadFailure;

const QUARANTINE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,47}$/;

function isTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isBuild(value: string): boolean {
  if (typeof value !== 'string') return false;
  const characters = [...value];
  return characters.length >= 1
    && characters.length <= 128
    && !characters.some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || codePoint >= 0x7f && codePoint <= 0x9f;
    });
}

function cloneRevision(revision: ActiveSaveRevision): ActiveSaveRevision {
  return {
    currentRaw: revision.currentRaw,
    previousRaw: revision.previousRaw,
  };
}

function readRevision(storage: StorageLike): RevisionRead {
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

function rawForSlot(
  revision: ActiveSaveRevision,
  slot: UnreadableSlot['slot'],
): string | null {
  return slot === 'current' ? revision.currentRaw : revision.previousRaw;
}

function unreadableSlotsMatchRevision(
  unreadableSlots: readonly UnreadableSlot[],
  revision: ActiveSaveRevision,
): boolean {
  const seen = new Set<UnreadableSlot['slot']>();
  return unreadableSlots.every((unreadable) => {
    if (seen.has(unreadable.slot)) return false;
    seen.add(unreadable.slot);
    return rawForSlot(revision, unreadable.slot) === unreadable.raw
      && unreadable.raw !== null;
  });
}

function isValidRecoveryLoad(
  loaded: Extract<LoadResult, { kind: 'loaded' }>,
): boolean {
  if (
    loaded.unreadableSlots.length !== 1
    || !unreadableSlotsMatchRevision(loaded.unreadableSlots, loaded.revision)
  ) {
    return false;
  }
  const unreadable = loaded.unreadableSlots[0];
  if (loaded.recovered) {
    return unreadable.slot === 'current'
      && loaded.revision.previousRaw !== null;
  }
  return unreadable.slot === 'previous'
    && loaded.revision.currentRaw !== null;
}

function isValidAbandonLoad(
  load: Exclude<LoadResult, { kind: 'storage-unavailable' | 'empty' }>,
): boolean {
  if (!unreadableSlotsMatchRevision(load.unreadableSlots, load.revision)) {
    return false;
  }
  if (load.kind === 'unreadable') {
    const occupied = [
      load.revision.currentRaw === null ? null : 'current',
      load.revision.previousRaw === null ? null : 'previous',
    ].filter((slot): slot is UnreadableSlot['slot'] => slot !== null);
    return occupied.length > 0
      && occupied.length === load.unreadableSlots.length
      && occupied.every((slot) => load.unreadableSlots.some((entry) => entry.slot === slot));
  }
  return load.revision.currentRaw !== null || load.revision.previousRaw !== null;
}

function quarantineRaw(
  sourceRevision: ActiveSaveRevision,
  unreadableSlots: readonly UnreadableSlot[],
  quarantinedAt: number,
): string {
  return canonicalJson({
    version: 1,
    game: 'caribbean',
    quarantinedAt,
    sourceRevision,
    unreadableSlots: [...unreadableSlots],
  } satisfies QuarantineEnvelopeV1);
}

function continuationFailure(
  continuation: RecoveryContinuation,
  failedOperation: RecoveryStorageOperation,
): RecoveryFailure {
  return {
    ok: false,
    reason: 'continuation-required',
    cause: 'storage-unavailable',
    failedOperation,
    quarantineKey: continuation.quarantineKey,
    continuation,
  };
}

function externalConflict(
  continuation: RecoveryContinuation,
  actualRevision: ActiveSaveRevision,
): RecoveryFailure {
  return {
    ok: false,
    reason: 'external-revision-conflict',
    cause: 'active-revision-conflict',
    quarantineKey: continuation.quarantineKey,
    quarantineRaw: continuation.quarantineRaw,
    stage: continuation.stage,
    sourceRevision: continuation.sourceRevision,
    actualRevision,
  };
}

function quarantineInvalidated(
  continuation: RecoveryContinuation,
  actualRaw: string | null,
): RecoveryFailure {
  return {
    ok: false,
    reason: 'quarantine-invalidated',
    cause: actualRaw === null ? 'quarantine-missing' : 'quarantine-changed',
    quarantineKey: continuation.quarantineKey,
    expectedRaw: continuation.quarantineRaw,
    actualRaw,
    stage: continuation.stage,
    sourceRevision: continuation.sourceRevision,
  };
}

function acceptableRevision(
  remaining: OperationReachableRevision,
  actual: ActiveSaveRevision,
): boolean {
  if (remaining.kind === 'known') return sameRevision(remaining.revision, actual);
  return remaining.acceptableRevisions.some((candidate) => sameRevision(candidate, actual));
}

function knownContinuation(
  continuation: RecoveryContinuation,
  revision: ActiveSaveRevision,
  stage = continuation.stage,
): RecoveryContinuation {
  return {
    ...continuation,
    stage,
    remaining: { kind: 'known', revision: cloneRevision(revision) },
  };
}

function readAndValidateRevision(
  storage: StorageLike,
  continuation: RecoveryContinuation,
): RevisionReadSuccess | RecoveryFailure {
  const read = readRevision(storage);
  if (!read.ok) return continuationFailure(continuation, read.operation);
  if (!acceptableRevision(continuation.remaining, read.revision)) {
    return externalConflict(continuation, read.revision);
  }
  return read;
}

function verifyContinuationQuarantine(
  storage: StorageLike,
  continuation: RecoveryContinuation,
): { ok: true } | { ok: false; result: RecoveryResult } {
  let actualRaw: string | null;
  try {
    actualRaw = storage.getItem(continuation.quarantineKey);
  } catch {
    return {
      ok: false,
      result: continuationFailure(continuation, 'read-quarantine'),
    };
  }
  if (actualRaw !== continuation.quarantineRaw) {
    return {
      ok: false,
      result: quarantineInvalidated(continuation, actualRaw),
    };
  }
  return { ok: true };
}

function afterRemoval(
  revision: ActiveSaveRevision,
  slot: UnreadableSlot['slot'],
): ActiveSaveRevision {
  return slot === 'current'
    ? { currentRaw: null, previousRaw: revision.previousRaw }
    : { currentRaw: revision.currentRaw, previousRaw: null };
}

function uniqueRevisions(
  revisions: readonly ActiveSaveRevision[],
): ActiveSaveRevision[] {
  const unique: ActiveSaveRevision[] = [];
  for (const revision of revisions) {
    if (!unique.some((candidate) => sameRevision(candidate, revision))) {
      unique.push(cloneRevision(revision));
    }
  }
  return unique;
}

function removeFailure(
  storage: StorageLike,
  continuation: RecoveryContinuation,
  failedOperation: 'remove-current' | 'remove-previous',
  before: ActiveSaveRevision,
  after: ActiveSaveRevision,
): RecoveryResult {
  const read = readRevision(storage);
  if (read.ok) {
    if (!sameRevision(read.revision, before) && !sameRevision(read.revision, after)) {
      return externalConflict(continuation, read.revision);
    }
    return {
      ok: false,
      reason: 'continuation-required',
      cause: 'partial-cleanup',
      failedOperation,
      quarantineKey: continuation.quarantineKey,
      continuation: knownContinuation(continuation, read.revision),
    };
  }
  return {
    ok: false,
    reason: 'continuation-required',
    cause: 'partial-cleanup',
    failedOperation,
    quarantineKey: continuation.quarantineKey,
    continuation: {
      ...continuation,
      remaining: {
        kind: 'remove-outcome-unknown',
        failedOperation,
        acceptableRevisions: uniqueRevisions([before, after]),
      },
    },
  };
}

interface RemovalTarget {
  slot: UnreadableSlot['slot'];
  sourceRaw: string | null;
}

function recoveryTargets(
  continuation: RecoveryContinuation,
): RemovalTarget[] {
  if (continuation.action === 'abandon') {
    return [
      { slot: 'previous', sourceRaw: null },
      { slot: 'current', sourceRaw: null },
    ];
  }
  const parsed = JSON.parse(continuation.quarantineRaw) as QuarantineEnvelopeV1;
  return parsed.unreadableSlots.map(({ slot, raw }) => ({ slot, sourceRaw: raw }));
}

function expectedAfterSaveFailure(
  before: ActiveSaveRevision,
  failure: Exclude<SaveResult, { ok: true }>,
): ActiveSaveRevision {
  if (
    failure.reason === 'storage-unavailable'
    && failure.operation === 'write-current'
    && before.currentRaw !== null
  ) {
    return { currentRaw: before.currentRaw, previousRaw: before.currentRaw };
  }
  return cloneRevision(before);
}

function performRecoveryAction(
  storage: StorageLike,
  inputContinuation: RecoveryContinuation,
  resumed: boolean,
  initialRevision?: ActiveSaveRevision,
): RecoveryResult {
  let continuation = inputContinuation;
  let revision = initialRevision;
  if (revision === undefined) {
    const read = readAndValidateRevision(storage, continuation);
    if (!read.ok) return read;
    revision = read.revision;
  }

  const targets = recoveryTargets(continuation);
  let completedRemove = continuation.stage === 'cleanup';
  for (const target of targets) {
    const { slot } = target;
    const activeRaw = rawForSlot(revision, slot);
    if (activeRaw === null) continue;
    if (continuation.action === 'recover' && activeRaw !== target.sourceRaw) continue;

    if (resumed) {
      const quarantine = verifyContinuationQuarantine(storage, continuation);
      if (!quarantine.ok) return quarantine.result;
    }

    const before = cloneRevision(revision);
    const after = afterRemoval(before, slot);
    const failedOperation = slot === 'current' ? 'remove-current' : 'remove-previous';
    try {
      storage.removeItem(slot === 'current' ? CURRENT_SAVE_KEY : PREVIOUS_SAVE_KEY);
    } catch {
      const failureStage = completedRemove || continuation.stage === 'republish'
        ? 'cleanup'
        : continuation.stage;
      return removeFailure(
        storage,
        { ...continuation, stage: failureStage },
        failedOperation,
        before,
        after,
      );
    }
    completedRemove = true;
    revision = after;
    continuation = knownContinuation(continuation, revision, 'cleanup');

    if (resumed) {
      const read = readAndValidateRevision(storage, continuation);
      if (!read.ok) return read;
      revision = read.revision;
    }
  }

  if (continuation.action === 'abandon') {
    return {
      ok: true,
      kind: 'abandoned',
      quarantineKey: continuation.quarantineKey,
      revision,
    };
  }

  if (continuation.republish === null) {
    return { ok: false, reason: 'invalid-recovery-source' };
  }
  continuation = knownContinuation(continuation, revision, 'republish');
  const republish = continuation.republish;
  if (republish === null) {
    return { ok: false, reason: 'invalid-recovery-source' };
  }

  if (resumed) {
    const quarantine = verifyContinuationQuarantine(storage, continuation);
    if (!quarantine.ok) return quarantine.result;
  }

  const saveResult = saveCampaign(storage, republish.journal, {
    build: republish.build,
    savedAt: republish.savedAt,
    expectedRevision: revision,
  });
  if (saveResult.ok) {
    return {
      ok: true,
      kind: 'recovered',
      quarantineKey: continuation.quarantineKey,
      revision: saveResult.revision,
      journal: saveResult.journal,
    };
  }
  if (saveResult.reason === 'save-conflict') {
    return externalConflict(continuation, saveResult.actual);
  }

  const expected = expectedAfterSaveFailure(revision, saveResult);
  const actual = readRevision(storage);
  if (actual.ok && !sameRevision(actual.revision, expected)) {
    return externalConflict(continuation, actual.revision);
  }
  const remaining = actual.ok ? actual.revision : expected;
  const resumable = knownContinuation(continuation, remaining, 'republish');
  return {
    ok: false,
    reason: 'continuation-required',
    cause: 'republish-failed',
    saveFailure: saveResult,
    quarantineKey: continuation.quarantineKey,
    continuation: resumable,
  };
}

function acquireQuarantine(
  storage: StorageLike,
  sourceRevision: ActiveSaveRevision,
  unreadableSlots: readonly UnreadableSlot[],
  action: RecoveryContinuation['action'],
  options: {
    quarantinedAt: number;
    quarantineId: string;
    republish: RecoveryContinuation['republish'];
  },
): RecoveryFailure | {
  ok: true;
  continuation: RecoveryContinuation;
  revision: ActiveSaveRevision;
} {
  const firstRead = readRevision(storage);
  if (!firstRead.ok) {
    return {
      ok: false,
      reason: 'storage-unavailable',
      stage: 'before-quarantine',
      operation: firstRead.operation,
    };
  }
  if (!sameRevision(firstRead.revision, sourceRevision)) {
    return {
      ok: false,
      reason: 'active-revision-conflict',
      expected: cloneRevision(sourceRevision),
      actual: firstRead.revision,
    };
  }

  const key = `${QUARANTINE_KEY_PREFIX}${options.quarantineId}`;
  const raw = quarantineRaw(sourceRevision, unreadableSlots, options.quarantinedAt);
  let existing: string | null;
  try {
    existing = storage.getItem(key);
  } catch {
    return {
      ok: false,
      reason: 'storage-unavailable',
      stage: 'before-quarantine',
      operation: 'read-quarantine',
    };
  }
  if (existing !== null && existing !== raw) {
    return {
      ok: false,
      reason: 'quarantine-collision',
      quarantineKey: key,
      expectedRaw: raw,
      actualRaw: existing,
    };
  }
  if (existing === null) {
    try {
      storage.setItem(key, raw);
    } catch {
      return {
        ok: false,
        reason: 'storage-unavailable',
        stage: 'before-quarantine',
        operation: 'write-quarantine',
      };
    }
    try {
      existing = storage.getItem(key);
    } catch {
      return {
        ok: false,
        reason: 'storage-unavailable',
        stage: 'before-quarantine',
        operation: 'verify-quarantine',
      };
    }
    if (existing === null) {
      return {
        ok: false,
        reason: 'storage-unavailable',
        stage: 'before-quarantine',
        operation: 'verify-quarantine',
      };
    }
    if (existing !== raw) {
      return {
        ok: false,
        reason: 'quarantine-collision',
        quarantineKey: key,
        expectedRaw: raw,
        actualRaw: existing,
      };
    }
  }

  const continuation: RecoveryContinuation = {
    action,
    stage: 'quarantine-verified',
    quarantineKey: key,
    quarantineRaw: raw,
    sourceRevision: cloneRevision(sourceRevision),
    remaining: { kind: 'known', revision: cloneRevision(sourceRevision) },
    republish: options.republish,
  };
  const secondRead = readRevision(storage);
  if (!secondRead.ok) return continuationFailure(continuation, secondRead.operation);
  if (!sameRevision(secondRead.revision, sourceRevision)) {
    return externalConflict(continuation, secondRead.revision);
  }
  return { ok: true, continuation, revision: secondRead.revision };
}

export function recoverCampaign(
  storage: StorageLike,
  loaded: Extract<LoadResult, { kind: 'loaded' }>,
  options: {
    build: string;
    savedAt: number;
    quarantinedAt: number;
    quarantineId: string;
  },
): RecoveryResult {
  if (
    !isValidRecoveryLoad(loaded)
    || !QUARANTINE_ID_PATTERN.test(options.quarantineId)
    || !isTimestamp(options.savedAt)
    || !isTimestamp(options.quarantinedAt)
    || !isBuild(options.build)
  ) {
    return { ok: false, reason: 'invalid-recovery-source' };
  }

  const acquired = acquireQuarantine(
    storage,
    loaded.revision,
    loaded.unreadableSlots,
    'recover',
    {
      quarantinedAt: options.quarantinedAt,
      quarantineId: options.quarantineId,
      republish: {
        journal: loaded.journal,
        build: options.build,
        savedAt: options.savedAt,
      },
    },
  );
  if (!acquired.ok || !('revision' in acquired)) return acquired;
  return performRecoveryAction(
    storage,
    acquired.continuation,
    false,
    acquired.revision,
  );
}

export function abandonCampaign(
  storage: StorageLike,
  load: Exclude<LoadResult, { kind: 'storage-unavailable' | 'empty' }>,
  options: {
    quarantinedAt: number;
    quarantineId: string;
  },
): RecoveryResult {
  if (
    !isValidAbandonLoad(load)
    || !QUARANTINE_ID_PATTERN.test(options.quarantineId)
    || !isTimestamp(options.quarantinedAt)
  ) {
    return { ok: false, reason: 'invalid-recovery-source' };
  }

  const acquired = acquireQuarantine(
    storage,
    load.revision,
    load.unreadableSlots,
    'abandon',
    {
      quarantinedAt: options.quarantinedAt,
      quarantineId: options.quarantineId,
      republish: null,
    },
  );
  if (!acquired.ok || !('revision' in acquired)) return acquired;
  return performRecoveryAction(
    storage,
    acquired.continuation,
    false,
    acquired.revision,
  );
}

export function continueRecovery(
  storage: StorageLike,
  continuation: RecoveryContinuation,
  decision: 'continue' | 'abandon',
): RecoveryResult {
  const quarantine = verifyContinuationQuarantine(storage, continuation);
  if (!quarantine.ok) return quarantine.result;

  const read = readAndValidateRevision(storage, continuation);
  if (!read.ok) return read;

  const executable = decision === 'abandon'
    ? {
        ...continuation,
        action: 'abandon' as const,
        republish: null,
      }
    : continuation;
  return performRecoveryAction(storage, executable, true, read.revision);
}
