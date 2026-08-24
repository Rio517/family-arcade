import { useCallback, useEffect, useRef, useState } from 'react';

import { canonicalJson } from '../canonicalJson';
import { createCampaign } from '../domain/createCampaign';
import type { CampaignEventDraft, CampaignJournal } from '../domain/events';
import { appendJournal, createJournal } from '../domain/replay';
import type { CreateCampaignOptions, PortActivity } from '../domain/types';
import {
  abandonCampaign,
  continueRecovery as continueStoredRecovery,
  recoverCampaign,
  type RecoveryResult,
} from '../storage/recovery';
import {
  loadCampaign,
  saveCampaign,
  type ActiveSaveRevision,
  type LoadResult,
  type SaveResult,
} from '../storage/persistence';
import type { WriterRunResult } from '../storage/writer';
import type { CaribbeanRuntime } from './runtime';

export type SaveCapabilityFailure =
  | { kind: 'writer-unavailable' }
  | { kind: 'writer-denied'; error?: unknown }
  | {
      kind: 'storage-unavailable';
      detail:
        | { kind: 'runtime-access'; error: unknown }
        | {
            kind: 'operation';
            result:
              | Extract<SaveResult, { ok: false; reason: 'storage-unavailable' }>
              | Extract<LoadResult, { kind: 'storage-unavailable' }>;
          };
    }
  | {
      kind: 'operation-uncertain';
      writer: Extract<WriterRunResult<unknown>, {
        kind: 'operation-threw' | 'writer-protocol-failure';
      }>;
    };

export type MemoryOnlyReason = SaveCapabilityFailure['kind'] | 'save-conflict';

export type ContinuationRequiredRecoveryResult = Extract<RecoveryResult, {
  ok: false;
  reason: 'continuation-required';
}>;

export type CaribbeanPersistencePhase =
  | { kind: 'persisted' }
  | {
      kind: 'consent-required';
      failure: SaveCapabilityFailure;
      intent: 'start' | 'resume' | 'event';
    }
  | {
      kind: 'memory-only';
      reason: MemoryOnlyReason;
      canRetrySaving: boolean;
    }
  | {
      kind: 'save-conflict';
      expected: ActiveSaveRevision;
      actual: ActiveSaveRevision;
    }
  | { kind: 'reconciling' }
  | { kind: 'recovery-required' }
  | {
      kind: 'recovery-continuation';
      result: ContinuationRequiredRecoveryResult;
    }
  | {
      kind: 'recovery-blocked';
      result: Exclude<Extract<RecoveryResult, { ok: false }>, {
        reason: 'continuation-required';
      }>;
    };

export interface CaribbeanController {
  load: LoadResult;
  journal: CampaignJournal | null;
  activity: PortActivity;
  busy: boolean;
  persistence: CaribbeanPersistencePhase;
  start(options: Omit<CreateCampaignOptions, 'seed'>): Promise<void>;
  resume(): Promise<void>;
  continueWithoutSaving(): void;
  dispatch(draft: CampaignEventDraft): Promise<void>;
  retrySaving(): Promise<void>;
  reloadExternalSave(): Promise<void>;
  exportInMemoryJournal(): string | null;
  recover(): Promise<void>;
  continueRecovery(decision: 'continue' | 'abandon'): Promise<void>;
  abandon(): Promise<void>;
  selectActivity(activity: PortActivity): void;
  closeActivity(): void;
}

type StartOptions = Omit<CreateCampaignOptions, 'seed'>;

type PendingIntent =
  | {
      kind: 'start';
      options: StartOptions;
      candidate: CampaignJournal | null;
      predecessor: null;
      expectedRevision: ActiveSaveRevision;
    }
  | {
      kind: 'resume';
      candidate: CampaignJournal;
      predecessor: CampaignJournal;
      expectedRevision: ActiveSaveRevision;
    }
  | {
      kind: 'event';
      candidate: CampaignJournal;
      predecessor: CampaignJournal;
      expectedRevision: ActiveSaveRevision;
    }
  | {
      kind: 'memory-save';
      candidate: CampaignJournal;
      predecessor: CampaignJournal | null;
      expectedRevision: ActiveSaveRevision;
    };

type LockedSaveOutcome =
  | {
      kind: 'saved';
      journal: CampaignJournal;
      revision: ActiveSaveRevision;
      savedAt: number;
    }
  | {
      kind: 'pending';
      failure: SaveCapabilityFailure;
      expectedRevision: ActiveSaveRevision;
    }
  | {
      kind: 'conflict';
      expected: ActiveSaveRevision;
      actual: ActiveSaveRevision;
    }
  | { kind: 'recovery'; load: Exclude<LoadResult, { kind: 'storage-unavailable' }> };

function cloneRevision(revision: ActiveSaveRevision): ActiveSaveRevision {
  return { currentRaw: revision.currentRaw, previousRaw: revision.previousRaw };
}

function revisionOf(load: LoadResult): ActiveSaveRevision | null {
  return load.kind === 'storage-unavailable' ? null : load.revision;
}

function needsRecovery(load: LoadResult): boolean {
  return load.kind === 'unreadable'
    || load.kind === 'loaded' && (load.recovered || load.unreadableSlots.length > 0);
}

function cleanLoaded(load: LoadResult): load is Extract<LoadResult, { kind: 'loaded' }> {
  return load.kind === 'loaded' && !load.recovered && load.unreadableSlots.length === 0;
}

function journalsEqual(left: CampaignJournal, right: CampaignJournal): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function storageFailure(
  result:
    | Extract<SaveResult, { ok: false; reason: 'storage-unavailable' }>
    | Extract<LoadResult, { kind: 'storage-unavailable' }>,
): SaveCapabilityFailure {
  return { kind: 'storage-unavailable', detail: { kind: 'operation', result } };
}

function syntheticLoaded(
  journal: CampaignJournal,
  revision: ActiveSaveRevision,
  savedAt: number,
  build: string,
): Extract<LoadResult, { kind: 'loaded' }> {
  return {
    kind: 'loaded',
    journal,
    savedAt,
    build,
    recovered: false,
    unreadableSlots: [],
    revision: cloneRevision(revision),
  };
}

function reconcileSaveInsideLock(
  runtime: CaribbeanRuntime,
  candidate: CampaignJournal,
  predecessor: CampaignJournal | null,
  expectedRevision: ActiveSaveRevision,
  savedAt: number,
): LockedSaveOutcome {
  const result = saveCampaign(runtime.storage, candidate, {
    build: runtime.build,
    savedAt,
    expectedRevision,
  });
  if (result.ok) {
    return {
      kind: 'saved',
      journal: result.journal,
      revision: result.revision,
      savedAt,
    };
  }
  if (result.reason === 'save-conflict') {
    return { kind: 'conflict', expected: result.expected, actual: result.actual };
  }
  if (result.reason === 'invalid-journal') {
    throw new Error('Controller attempted to save an invalid campaign journal');
  }
  if (result.reason === 'unreadable-active-save') {
    const loaded = loadCampaign(runtime.storage);
    return loaded.kind === 'storage-unavailable'
      ? { kind: 'pending', failure: storageFailure(loaded), expectedRevision }
      : { kind: 'recovery', load: loaded };
  }

  if (result.operation !== 'write-current' && result.operation !== 'write-previous') {
    return { kind: 'pending', failure: storageFailure(result), expectedRevision };
  }

  const loaded = loadCampaign(runtime.storage);
  if (loaded.kind === 'storage-unavailable') {
    return { kind: 'pending', failure: storageFailure(loaded), expectedRevision };
  }
  if (cleanLoaded(loaded) && journalsEqual(loaded.journal, candidate)) {
    return {
      kind: 'saved',
      journal: loaded.journal,
      revision: loaded.revision,
      savedAt: loaded.savedAt,
    };
  }
  const predecessorStillActive = predecessor === null
    ? loaded.kind === 'empty'
    : cleanLoaded(loaded) && journalsEqual(loaded.journal, predecessor);
  if (predecessorStillActive) {
    return {
      kind: 'pending',
      failure: storageFailure(result),
      expectedRevision: cloneRevision(loaded.revision),
    };
  }
  if (needsRecovery(loaded)) return { kind: 'recovery', load: loaded };
  return {
    kind: 'conflict',
    expected: cloneRevision(expectedRevision),
    actual: cloneRevision(loaded.revision),
  };
}

function writerFailure(result: WriterRunResult<unknown>): SaveCapabilityFailure | null {
  if (result.kind === 'acquisition-failed') {
    return result.reason === 'unavailable'
      ? { kind: 'writer-unavailable' }
      : { kind: 'writer-denied', ...(result.error === undefined ? {} : { error: result.error }) };
  }
  if (result.kind === 'operation-threw' || result.kind === 'writer-protocol-failure') {
    return { kind: 'operation-uncertain', writer: result };
  }
  return null;
}

function canRetryFailure(failure: SaveCapabilityFailure): boolean {
  return failure.kind !== 'writer-unavailable'
    && !(failure.kind === 'storage-unavailable' && failure.detail.kind === 'runtime-access');
}

function initialSnapshot(runtime: CaribbeanRuntime): {
  load: LoadResult;
  persistence: CaribbeanPersistencePhase;
} {
  const load = loadCampaign(runtime.storage);
  return {
    load,
    persistence: needsRecovery(load) ? { kind: 'recovery-required' } : { kind: 'persisted' },
  };
}

export function useCaribbean(runtime: CaribbeanRuntime): CaribbeanController {
  const [initial] = useState(() => initialSnapshot(runtime));
  const [load, setLoad] = useState<LoadResult>(initial.load);
  const [journal, setJournal] = useState<CampaignJournal | null>(null);
  const [activity, setActivity] = useState<PortActivity>('menu');
  const [busy, setBusy] = useState(false);
  const [persistence, setPersistence] = useState<CaribbeanPersistencePhase>(initial.persistence);

  const loadRef = useRef(load);
  const journalRef = useRef(journal);
  const persistenceRef = useRef(persistence);
  const pendingRef = useRef<PendingIntent | null>(null);
  const busyRef = useRef(false);
  const generationRef = useRef(0);

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    const next = initialSnapshot(runtime);
    loadRef.current = next.load;
    journalRef.current = null;
    persistenceRef.current = next.persistence;
    pendingRef.current = null;
    busyRef.current = false;
    // A supplied runtime replacement is an explicit controller-generation
    // reset: discard the prior runtime's visible state before accepting work.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoad(next.load);
    setJournal(null);
    setActivity('menu');
    setBusy(false);
    setPersistence(next.persistence);
    return () => {
      if (generationRef.current === generation) generationRef.current += 1;
    };
  }, [runtime]);

  const begin = useCallback((): number | null => {
    if (busyRef.current) return null;
    busyRef.current = true;
    setBusy(true);
    return generationRef.current;
  }, []);

  const current = useCallback((generation: number): boolean => (
    generationRef.current === generation
  ), []);

  const finish = useCallback((generation: number): void => {
    if (!current(generation)) return;
    busyRef.current = false;
    setBusy(false);
  }, [current]);

  const updateLoad = useCallback((generation: number, next: LoadResult): void => {
    if (!current(generation)) return;
    loadRef.current = next;
    setLoad(next);
  }, [current]);

  const updateJournal = useCallback((generation: number, next: CampaignJournal | null): void => {
    if (!current(generation)) return;
    journalRef.current = next;
    setJournal(next);
  }, [current]);

  const updatePersistence = useCallback((generation: number, next: CaribbeanPersistencePhase): void => {
    if (!current(generation)) return;
    persistenceRef.current = next;
    setPersistence(next);
  }, [current]);

  const holdForConsent = useCallback((
    generation: number,
    intent: PendingIntent,
    failure: SaveCapabilityFailure,
  ): void => {
    if (!current(generation)) return;
    pendingRef.current = intent;
    updatePersistence(generation, {
      kind: 'consent-required',
      failure,
      intent: intent.kind === 'memory-save' ? 'event' : intent.kind,
    });
  }, [current, updatePersistence]);

  const applyLockedSave = useCallback((
    generation: number,
    intent: PendingIntent,
    outcome: LockedSaveOutcome,
  ): void => {
    if (!current(generation)) return;
    if (outcome.kind === 'saved') {
      pendingRef.current = null;
      updateJournal(generation, outcome.journal);
      updateLoad(generation, syntheticLoaded(
        outcome.journal,
        outcome.revision,
        outcome.savedAt,
        runtime.build,
      ));
      updatePersistence(generation, { kind: 'persisted' });
      return;
    }
    if (outcome.kind === 'pending') {
      holdForConsent(generation, {
        ...intent,
        expectedRevision: outcome.expectedRevision,
      }, outcome.failure);
      return;
    }
    if (outcome.kind === 'conflict') {
      pendingRef.current = intent;
      updatePersistence(generation, {
        kind: 'save-conflict',
        expected: cloneRevision(outcome.expected),
        actual: cloneRevision(outcome.actual),
      });
      return;
    }
    pendingRef.current = intent;
    updateLoad(generation, outcome.load);
    updateJournal(generation, null);
    updatePersistence(generation, { kind: 'recovery-required' });
  }, [current, holdForConsent, runtime.build, updateJournal, updateLoad, updatePersistence]);

  const start = useCallback(async (options: StartOptions): Promise<void> => {
    const generation = begin();
    if (generation === null) return;
    const revision = revisionOf(loadRef.current);
    const intent: Extract<PendingIntent, { kind: 'start' }> = {
      kind: 'start',
      options: structuredClone(options),
      candidate: null,
      predecessor: null,
      expectedRevision: cloneRevision(revision ?? { currentRaw: null, previousRaw: null }),
    };
    try {
      if (runtime.storageCapability.kind === 'unavailable') {
        holdForConsent(generation, intent, {
          kind: 'storage-unavailable',
          detail: { kind: 'runtime-access', error: runtime.storageCapability.error },
        });
        return;
      }
      if (loadRef.current.kind !== 'empty') return;
      if (runtime.writer.capability === 'unavailable') {
        holdForConsent(generation, intent, { kind: 'writer-unavailable' });
        return;
      }

      let candidate: CampaignJournal | null = null;
      const runResult = await runtime.writer.run(() => {
        candidate = createJournal(createCampaign({ seed: runtime.makeSeed(), ...intent.options }));
        intent.candidate = candidate;
        return reconcileSaveInsideLock(
          runtime,
          candidate,
          null,
          intent.expectedRevision,
          runtime.now(),
        );
      });
      if (!current(generation)) return;
      if (runResult.kind === 'operation-result') {
        applyLockedSave(generation, intent, runResult.result);
      } else {
        holdForConsent(generation, intent, writerFailure(runResult)!);
      }
    } finally {
      finish(generation);
    }
  }, [applyLockedSave, begin, current, finish, holdForConsent, runtime]);

  const resume = useCallback(async (): Promise<void> => {
    const generation = begin();
    if (generation === null) return;
    try {
      const observed = loadRef.current;
      if (!cleanLoaded(observed)) return;
      const intent: Extract<PendingIntent, { kind: 'resume' }> = {
        kind: 'resume',
        candidate: observed.journal,
        predecessor: observed.journal,
        expectedRevision: cloneRevision(observed.revision),
      };
      if (runtime.writer.capability === 'unavailable') {
        holdForConsent(generation, intent, { kind: 'writer-unavailable' });
        return;
      }
      const runResult = await runtime.writer.run(() => loadCampaign(runtime.storage));
      if (!current(generation)) return;
      if (runResult.kind !== 'operation-result') {
        holdForConsent(generation, intent, writerFailure(runResult)!);
        return;
      }
      const refreshed = runResult.result;
      if (refreshed.kind === 'storage-unavailable') {
        holdForConsent(generation, intent, storageFailure(refreshed));
      } else if (cleanLoaded(refreshed)) {
        pendingRef.current = null;
        updateLoad(generation, refreshed);
        updateJournal(generation, refreshed.journal);
        updatePersistence(generation, { kind: 'persisted' });
      } else {
        updateLoad(generation, refreshed);
        updateJournal(generation, null);
        updatePersistence(generation, needsRecovery(refreshed)
          ? { kind: 'recovery-required' }
          : { kind: 'persisted' });
      }
    } finally {
      finish(generation);
    }
  }, [begin, current, finish, holdForConsent, runtime, updateJournal, updateLoad, updatePersistence]);

  const continueWithoutSaving = useCallback((): void => {
    const pending = pendingRef.current;
    const phase = persistenceRef.current;
    if (
      pending === null
      || (phase.kind !== 'consent-required' && phase.kind !== 'save-conflict')
    ) return;

    let candidate = pending.candidate;
    if (pending.kind === 'start' && candidate === null) {
      candidate = createJournal(createCampaign({ seed: runtime.makeSeed(), ...pending.options }));
    }
    if (candidate === null) return;

    pendingRef.current = {
      kind: 'memory-save',
      candidate,
      predecessor: pending.predecessor,
      expectedRevision: pending.expectedRevision,
    };
    journalRef.current = candidate;
    setJournal(candidate);
    const reason: MemoryOnlyReason = phase.kind === 'save-conflict'
      ? 'save-conflict'
      : phase.failure.kind;
    const canRetrySaving = phase.kind === 'save-conflict'
      ? false
      : canRetryFailure(phase.failure);
    const next: CaribbeanPersistencePhase = { kind: 'memory-only', reason, canRetrySaving };
    persistenceRef.current = next;
    setPersistence(next);
  }, [runtime]);

  const dispatch = useCallback(async (draft: CampaignEventDraft): Promise<void> => {
    const activeJournal = journalRef.current;
    const phase = persistenceRef.current;
    if (activeJournal === null || busyRef.current) return;
    if (phase.kind === 'memory-only') {
      const candidate = appendJournal(activeJournal, draft);
      journalRef.current = candidate;
      setJournal(candidate);
      const pending = pendingRef.current;
      if (pending?.kind === 'memory-save') pendingRef.current = { ...pending, candidate };
      return;
    }
    if (phase.kind !== 'persisted') return;
    const expectedRevision = revisionOf(loadRef.current);
    if (expectedRevision === null) return;
    const candidate = appendJournal(activeJournal, draft);
    const intent: Extract<PendingIntent, { kind: 'event' }> = {
      kind: 'event',
      candidate,
      predecessor: activeJournal,
      expectedRevision: cloneRevision(expectedRevision),
    };
    const generation = begin();
    if (generation === null) return;
    try {
      const runResult = await runtime.writer.run(() => reconcileSaveInsideLock(
        runtime,
        candidate,
        activeJournal,
        expectedRevision,
        runtime.now(),
      ));
      if (!current(generation)) return;
      if (runResult.kind === 'operation-result') {
        applyLockedSave(generation, intent, runResult.result);
      } else {
        holdForConsent(generation, intent, writerFailure(runResult)!);
      }
    } finally {
      finish(generation);
    }
  }, [applyLockedSave, begin, current, finish, holdForConsent, runtime]);

  const retrySaving = useCallback(async (): Promise<void> => {
    const phase = persistenceRef.current;
    const pending = pendingRef.current;
    if (
      phase.kind !== 'memory-only'
      || !phase.canRetrySaving
      || pending?.kind !== 'memory-save'
      || busyRef.current
    ) return;
    const generation = begin();
    if (generation === null) return;
    try {
      const candidate = journalRef.current ?? pending.candidate;
      const retryIntent: PendingIntent = { ...pending, candidate };
      const runResult = await runtime.writer.run(() => reconcileSaveInsideLock(
        runtime,
        candidate,
        pending.predecessor,
        pending.expectedRevision,
        runtime.now(),
      ));
      if (!current(generation)) return;
      if (runResult.kind === 'operation-result') {
        applyLockedSave(generation, retryIntent, runResult.result);
      } else {
        const failure = writerFailure(runResult)!;
        pendingRef.current = retryIntent;
        updatePersistence(generation, {
          kind: 'memory-only',
          reason: failure.kind,
          canRetrySaving: canRetryFailure(failure),
        });
      }
    } finally {
      finish(generation);
    }
  }, [applyLockedSave, begin, current, finish, runtime, updatePersistence]);

  const reloadExternalSave = useCallback(async (): Promise<void> => {
    if (busyRef.current) return;
    const generation = begin();
    if (generation === null) return;
    try {
      const runResult = await runtime.writer.run(() => loadCampaign(runtime.storage));
      if (!current(generation) || runResult.kind !== 'operation-result') return;
      const refreshed = runResult.result;
      if (refreshed.kind === 'storage-unavailable') return;
      pendingRef.current = null;
      updateLoad(generation, refreshed);
      if (cleanLoaded(refreshed)) {
        updateJournal(generation, journalRef.current === null ? null : refreshed.journal);
        updatePersistence(generation, { kind: 'persisted' });
      } else {
        updateJournal(generation, null);
        updatePersistence(generation, needsRecovery(refreshed)
          ? { kind: 'recovery-required' }
          : { kind: 'persisted' });
      }
    } finally {
      finish(generation);
    }
  }, [begin, current, finish, runtime, updateJournal, updateLoad, updatePersistence]);

  const exportInMemoryJournal = useCallback((): string | null => {
    const pending = pendingRef.current;
    const candidate = pending?.candidate ?? journalRef.current;
    return candidate === null ? null : canonicalJson(candidate);
  }, []);

  const applyRecoveryResult = useCallback((generation: number, result: RecoveryResult): void => {
    if (!current(generation)) return;
    if (result.ok) {
      const refreshed = loadCampaign(runtime.storage);
      if (refreshed.kind === 'storage-unavailable') return;
      pendingRef.current = null;
      updateLoad(generation, refreshed);
      updateJournal(generation, null);
      updatePersistence(generation, needsRecovery(refreshed)
        ? { kind: 'recovery-required' }
        : { kind: 'persisted' });
      return;
    }
    if (result.reason === 'continuation-required') {
      updatePersistence(generation, { kind: 'recovery-continuation', result });
    } else {
      updatePersistence(generation, { kind: 'recovery-blocked', result });
    }
  }, [current, runtime.storage, updateJournal, updateLoad, updatePersistence]);

  const recover = useCallback(async (): Promise<void> => {
    const observed = loadRef.current;
    if (observed.kind !== 'loaded' || !needsRecovery(observed) || busyRef.current) return;
    const generation = begin();
    if (generation === null) return;
    try {
      const runResult = await runtime.writer.run(() => {
        const savedAt = runtime.now();
        const quarantinedAt = runtime.now();
        let result = recoverCampaign(runtime.storage, observed, {
          build: runtime.build,
          savedAt,
          quarantinedAt,
          quarantineId: runtime.makeQuarantineId(),
        });
        if (!result.ok && result.reason === 'quarantine-collision') {
          result = recoverCampaign(runtime.storage, observed, {
            build: runtime.build,
            savedAt,
            quarantinedAt,
            quarantineId: runtime.makeQuarantineId(),
          });
        }
        return result;
      });
      if (!current(generation) || runResult.kind !== 'operation-result') return;
      applyRecoveryResult(generation, runResult.result);
    } finally {
      finish(generation);
    }
  }, [applyRecoveryResult, begin, current, finish, runtime]);

  const continueRecovery = useCallback(async (decision: 'continue' | 'abandon'): Promise<void> => {
    const phase = persistenceRef.current;
    if (phase.kind !== 'recovery-continuation' || busyRef.current) return;
    const generation = begin();
    if (generation === null) return;
    try {
      const runResult = await runtime.writer.run(() => continueStoredRecovery(
        runtime.storage,
        phase.result.continuation,
        decision,
      ));
      if (!current(generation) || runResult.kind !== 'operation-result') return;
      applyRecoveryResult(generation, runResult.result);
    } finally {
      finish(generation);
    }
  }, [applyRecoveryResult, begin, current, finish, runtime]);

  const abandon = useCallback(async (): Promise<void> => {
    const observed = loadRef.current;
    if (observed.kind === 'empty' || observed.kind === 'storage-unavailable' || busyRef.current) return;
    const generation = begin();
    if (generation === null) return;
    try {
      const runResult = await runtime.writer.run(() => {
        const quarantinedAt = runtime.now();
        let result = abandonCampaign(runtime.storage, observed, {
          quarantinedAt,
          quarantineId: runtime.makeQuarantineId(),
        });
        if (!result.ok && result.reason === 'quarantine-collision') {
          result = abandonCampaign(runtime.storage, observed, {
            quarantinedAt,
            quarantineId: runtime.makeQuarantineId(),
          });
        }
        return result;
      });
      if (!current(generation) || runResult.kind !== 'operation-result') return;
      applyRecoveryResult(generation, runResult.result);
    } finally {
      finish(generation);
    }
  }, [applyRecoveryResult, begin, current, finish, runtime]);

  const selectActivity = useCallback((next: PortActivity): void => {
    setActivity(next);
  }, []);

  const closeActivity = useCallback((): void => setActivity('menu'), []);

  return {
    load,
    journal,
    activity,
    busy,
    persistence,
    start,
    resume,
    continueWithoutSaving,
    dispatch,
    retrySaving,
    reloadExternalSave,
    exportInMemoryJournal,
    recover,
    continueRecovery,
    abandon,
    selectActivity,
    closeActivity,
  };
}
