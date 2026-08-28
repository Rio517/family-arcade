import { useCallback, useEffect, useRef, useState } from 'react';

import { canonicalJson } from '../canonicalJson';
import { createCampaign } from '../domain/createCampaign';
import type { CampaignEvent, CampaignEventDraft, CampaignJournal } from '../domain/events';
import type { NavalResolution } from '../domain/naval/types';
import { appendJournal, createJournal } from '../domain/replay';
import type { CampaignStateV1, CreateCampaignOptions, PortActivity } from '../domain/types';
import {
  battleWithdrawnDraft,
  encounterAvoidedDraft,
  navalEngagedDraft,
  navalResolvedDraft,
  seaLegCompletedDraft,
  voyageStartedDraft,
  VoyageTransitionError,
} from '../domain/voyage';
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
import { NamedActionGate } from './namedActionGate';
import type { CaribbeanRuntime } from './runtime';
import { toMemorySaveIntent } from './toMemorySaveIntent';

type WriterOperationUncertainFailure = {
  kind: 'operation-uncertain';
  writer: Extract<WriterRunResult<unknown>, {
    kind: 'operation-threw' | 'writer-protocol-failure';
  }>;
};

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
  | WriterOperationUncertainFailure
  | {
      kind: 'operation-uncertain';
      writeFailure: Extract<SaveResult, { ok: false; reason: 'storage-unavailable' }> & {
        operation: 'write-current' | 'write-previous';
      };
      outcomeReadFailure: Extract<LoadResult, { kind: 'storage-unavailable' }>;
    };

type WriteStorageFailure = Extract<SaveResult, {
  ok: false;
  reason: 'storage-unavailable';
}> & { operation: 'write-current' | 'write-previous' };

export type MemoryOnlyReason = SaveCapabilityFailure['kind'] | 'save-conflict';

export type ContinuationRequiredRecoveryResult = Extract<RecoveryResult, {
  ok: false;
  reason: 'continuation-required';
}>;

export type RecoveryAction =
  | 'recover'
  | 'continue-recovery'
  | 'abandon-from-quarantine'
  | 'abandon';

export type RecoveryWriterFailure =
  | Extract<SaveCapabilityFailure, { kind: 'writer-unavailable' | 'writer-denied' }>
  | WriterOperationUncertainFailure;

export type RecoveryActionFailure =
  | {
      kind: 'writer';
      action: RecoveryAction;
      failure: RecoveryWriterFailure;
    }
  | {
      kind: 'post-result-load';
      action: RecoveryAction;
      result: Extract<RecoveryResult, { ok: true }>;
      loadFailure: Extract<LoadResult, { kind: 'storage-unavailable' }>;
    };

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

export type CampaignDispatchOutcome =
  | { kind: 'applied'; eventId: number }
  | { kind: 'not-applied' };

export interface CaribbeanController {
  load: LoadResult;
  journal: CampaignJournal | null;
  activity: PortActivity;
  busy: boolean;
  persistence: CaribbeanPersistencePhase;
  recoveryWriterCapability: CaribbeanRuntime['writer']['capability'];
  recoveryFailure: RecoveryActionFailure | null;
  start(options: Omit<CreateCampaignOptions, 'seed'>): Promise<void>;
  resume(): Promise<void>;
  continueWithoutSaving(): void;
  dispatch(draft: CampaignEventDraft): Promise<CampaignDispatchOutcome>;
  setSail(): Promise<CampaignDispatchOutcome>;
  completeSeaLeg(): Promise<CampaignDispatchOutcome>;
  avoidEncounter(): Promise<CampaignDispatchOutcome>;
  engageEncounter(): Promise<CampaignDispatchOutcome>;
  withdrawBattle(): Promise<CampaignDispatchOutcome>;
  resolveBattle(resolution: NavalResolution): Promise<CampaignDispatchOutcome>;
  portFocusTarget: 'last-voyage' | null;
  acknowledgePortFocus(): void;
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

export interface EventPublication {
  predecessor: CampaignJournal;
  publishedJournal: CampaignJournal;
  appendedEvent: CampaignEvent;
}

type PublishEventCandidate = (
  generation: number,
  publication: EventPublication,
) => void;

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
      appendedEvent: CampaignEvent;
      expectedRevision: ActiveSaveRevision;
    }
  | {
      kind: 'memory-save';
      candidate: CampaignJournal;
      predecessor: CampaignJournal | null;
      publicationPredecessor: CampaignJournal | null;
      appendedEvent: CampaignEvent | null;
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

type RecoveryOperationOutcome =
  | {
      kind: 'failed';
      result: Extract<RecoveryResult, { ok: false }>;
    }
  | {
      kind: 'completed';
      result: Extract<RecoveryResult, { ok: true }>;
      postResultLoad: LoadResult;
    };

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

function writeStorageFailure(
  result: Extract<SaveResult, { ok: false; reason: 'storage-unavailable' }>,
): WriteStorageFailure | null {
  return result.operation === 'write-current' || result.operation === 'write-previous'
    ? { ...result, operation: result.operation }
    : null;
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

  const writeFailure = writeStorageFailure(result);
  if (writeFailure === null) {
    return { kind: 'pending', failure: storageFailure(result), expectedRevision };
  }

  const loaded = loadCampaign(runtime.storage);
  if (loaded.kind === 'storage-unavailable') {
    return {
      kind: 'pending',
      failure: {
        kind: 'operation-uncertain',
        writeFailure,
        outcomeReadFailure: loaded,
      },
      expectedRevision,
    };
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
  return {
    kind: 'conflict',
    expected: cloneRevision(expectedRevision),
    actual: cloneRevision(loaded.revision),
  };
}

function writerFailure(result: WriterRunResult<unknown>): RecoveryWriterFailure | null {
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

function blocksRecoveryMutation(failure: RecoveryActionFailure | null): boolean {
  if (failure === null) return false;
  if (failure.kind === 'post-result-load') return true;
  return failure.failure.kind !== 'writer-denied';
}

function recoveryOperationOutcome(
  runtime: CaribbeanRuntime,
  result: RecoveryResult,
): RecoveryOperationOutcome {
  return result.ok
    ? { kind: 'completed', result, postResultLoad: loadCampaign(runtime.storage) }
    : { kind: 'failed', result };
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
  const [recoveryFailure, setRecoveryFailure] = useState<RecoveryActionFailure | null>(null);
  const [portFocusTarget, setPortFocusTarget] = useState<'last-voyage' | null>(null);

  const loadRef = useRef(load);
  const journalRef = useRef(journal);
  const persistenceRef = useRef(persistence);
  const recoveryFailureRef = useRef(recoveryFailure);
  const pendingRef = useRef<PendingIntent | null>(null);
  const busyRef = useRef(false);
  const generationRef = useRef(0);
  const namedActionGateRef = useRef(new NamedActionGate());
  const consumedEventTokensRef = useRef(new Set<string>());

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    namedActionGateRef.current.reset();
    consumedEventTokensRef.current.clear();
    const next = initialSnapshot(runtime);
    loadRef.current = next.load;
    journalRef.current = null;
    persistenceRef.current = next.persistence;
    recoveryFailureRef.current = null;
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
    setRecoveryFailure(null);
    setPortFocusTarget(null);
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

  const publishEventCandidate = useCallback<PublishEventCandidate>((
    generation,
    publication,
  ): void => {
    if (!current(generation)) return;
    updateJournal(generation, publication.publishedJournal);
    const token = [
      publication.predecessor.state.campaignId,
      publication.appendedEvent.id,
      publication.appendedEvent.type,
    ].join(':');
    if (consumedEventTokensRef.current.has(token)) return;
    consumedEventTokensRef.current.add(token);
    switch (publication.appendedEvent.type) {
      case 'voyage-started':
        setActivity('menu');
        break;
      case 'encounter-avoided':
      case 'battle-withdrawn':
      case 'naval-resolved':
        setPortFocusTarget('last-voyage');
        break;
    }
  }, [current, updateJournal]);

  const updatePersistence = useCallback((generation: number, next: CaribbeanPersistencePhase): void => {
    if (!current(generation)) return;
    persistenceRef.current = next;
    setPersistence(next);
  }, [current]);

  const updateRecoveryFailure = useCallback((
    generation: number,
    next: RecoveryActionFailure | null,
  ): void => {
    if (!current(generation)) return;
    recoveryFailureRef.current = next;
    setRecoveryFailure(next);
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
      if (intent.kind === 'event') {
        publishEventCandidate(generation, {
          predecessor: intent.predecessor,
          publishedJournal: outcome.journal,
          appendedEvent: intent.appendedEvent,
        });
      } else if (
        intent.kind === 'memory-save'
        && intent.publicationPredecessor !== null
        && intent.appendedEvent !== null
      ) {
        publishEventCandidate(generation, {
          predecessor: intent.publicationPredecessor,
          publishedJournal: outcome.journal,
          appendedEvent: intent.appendedEvent,
        });
      } else {
        updateJournal(generation, outcome.journal);
      }
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
  }, [current, holdForConsent, publishEventCandidate, runtime.build, updateJournal, updateLoad, updatePersistence]);

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
      if (loadRef.current.kind === 'storage-unavailable') {
        holdForConsent(generation, intent, storageFailure(loadRef.current));
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

    pendingRef.current = toMemorySaveIntent({ ...pending, candidate });
    if (pending.kind === 'event') {
      publishEventCandidate(generationRef.current, {
        predecessor: pending.predecessor,
        publishedJournal: candidate,
        appendedEvent: pending.appendedEvent,
      });
    } else {
      journalRef.current = candidate;
      setJournal(candidate);
    }
    const reason: MemoryOnlyReason = phase.kind === 'save-conflict'
      ? 'save-conflict'
      : phase.failure.kind;
    const canRetrySaving = phase.kind === 'save-conflict'
      ? false
      : canRetryFailure(phase.failure);
    const next: CaribbeanPersistencePhase = { kind: 'memory-only', reason, canRetrySaving };
    persistenceRef.current = next;
    setPersistence(next);
  }, [publishEventCandidate, runtime]);

  const dispatch = useCallback(async (draft: CampaignEventDraft): Promise<CampaignDispatchOutcome> => {
    const activeJournal = journalRef.current;
    const phase = persistenceRef.current;
    if (activeJournal === null || busyRef.current) return { kind: 'not-applied' };
    if (phase.kind === 'memory-only') {
      const candidate = appendJournal(activeJournal, draft);
      const appendedEvent = candidate.events.at(-1);
      if (appendedEvent === undefined) throw new Error('Dispatch candidate did not append an event');
      publishEventCandidate(generationRef.current, {
        predecessor: activeJournal,
        publishedJournal: candidate,
        appendedEvent,
      });
      const pending = pendingRef.current;
      if (pending?.kind === 'memory-save') {
        pendingRef.current = {
          ...pending,
          candidate,
          publicationPredecessor: activeJournal,
          appendedEvent,
        };
      }
      return { kind: 'applied', eventId: candidate.state.lastEventId };
    }
    if (phase.kind !== 'persisted') return { kind: 'not-applied' };
    const expectedRevision = revisionOf(loadRef.current);
    if (expectedRevision === null) return { kind: 'not-applied' };
    const candidate = appendJournal(activeJournal, draft);
    const appendedEvent = candidate.events.at(-1);
    if (appendedEvent === undefined) throw new Error('Dispatch candidate did not append an event');
    const intent: Extract<PendingIntent, { kind: 'event' }> = {
      kind: 'event',
      candidate,
      predecessor: activeJournal,
      appendedEvent,
      expectedRevision: cloneRevision(expectedRevision),
    };
    const generation = begin();
    if (generation === null) return { kind: 'not-applied' };
    try {
      const runResult = await runtime.writer.run(() => reconcileSaveInsideLock(
        runtime,
        candidate,
        activeJournal,
        expectedRevision,
        runtime.now(),
      ));
      if (!current(generation)) return { kind: 'not-applied' };
      if (runResult.kind === 'operation-result') {
        applyLockedSave(generation, intent, runResult.result);
        return runResult.result.kind === 'saved'
          ? { kind: 'applied', eventId: appendedEvent.id }
          : { kind: 'not-applied' };
      } else {
        holdForConsent(generation, intent, writerFailure(runResult)!);
        return { kind: 'not-applied' };
      }
    } finally {
      finish(generation);
    }
  }, [applyLockedSave, begin, current, finish, holdForConsent, publishEventCandidate, runtime]);

  const dispatchNamedAction = useCallback(async (
    createDraft: (state: CampaignStateV1) => CampaignEventDraft,
  ): Promise<CampaignDispatchOutcome> => {
    const owner = namedActionGateRef.current.acquire(generationRef.current);
    if (owner === null) return { kind: 'not-applied' };
    try {
      const active = journalRef.current;
      if (active === null || busyRef.current) return { kind: 'not-applied' };
      let draft: CampaignEventDraft;
      try {
        draft = createDraft(active.state);
      } catch (error) {
        if (error instanceof VoyageTransitionError) return { kind: 'not-applied' };
        throw error;
      }
      return await dispatch(draft);
    } finally {
      namedActionGateRef.current.release(owner);
    }
  }, [dispatch]);

  const setSail = useCallback(() => dispatchNamedAction(voyageStartedDraft), [dispatchNamedAction]);
  const completeSeaLeg = useCallback(() => dispatchNamedAction(seaLegCompletedDraft), [dispatchNamedAction]);
  const avoidEncounter = useCallback(() => dispatchNamedAction(encounterAvoidedDraft), [dispatchNamedAction]);
  const engageEncounter = useCallback(() => dispatchNamedAction(navalEngagedDraft), [dispatchNamedAction]);
  const withdrawBattle = useCallback(() => dispatchNamedAction(battleWithdrawnDraft), [dispatchNamedAction]);
  const resolveBattle = useCallback((resolution: NavalResolution) => dispatchNamedAction(
    (state) => navalResolvedDraft(state, structuredClone(resolution)),
  ), [dispatchNamedAction]);

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
      updateRecoveryFailure(generation, null);
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
  }, [begin, current, finish, runtime, updateJournal, updateLoad, updatePersistence, updateRecoveryFailure]);

  const exportInMemoryJournal = useCallback((): string | null => {
    const pending = pendingRef.current;
    const candidate = pending?.candidate ?? journalRef.current;
    return candidate === null ? null : canonicalJson(candidate);
  }, []);

  const applyRecoveryResult = useCallback((
    generation: number,
    action: RecoveryAction,
    outcome: RecoveryOperationOutcome,
  ): void => {
    if (!current(generation)) return;
    if (outcome.kind === 'completed') {
      const { result } = outcome;
      const refreshed = outcome.postResultLoad;
      if (refreshed.kind === 'storage-unavailable') {
        updateRecoveryFailure(generation, {
          kind: 'post-result-load',
          action,
          result,
          loadFailure: refreshed,
        });
        return;
      }
      pendingRef.current = null;
      updateRecoveryFailure(generation, null);
      updateLoad(generation, refreshed);
      updateJournal(generation, null);
      updatePersistence(generation, needsRecovery(refreshed)
        ? { kind: 'recovery-required' }
        : { kind: 'persisted' });
      return;
    }
    const { result } = outcome;
    updateRecoveryFailure(generation, null);
    if (result.reason === 'continuation-required') {
      updatePersistence(generation, { kind: 'recovery-continuation', result });
    } else {
      updatePersistence(generation, { kind: 'recovery-blocked', result });
    }
  }, [current, updateJournal, updateLoad, updatePersistence, updateRecoveryFailure]);

  const recover = useCallback(async (): Promise<void> => {
    const observed = loadRef.current;
    if (
      observed.kind !== 'loaded'
      || !needsRecovery(observed)
      || busyRef.current
      || blocksRecoveryMutation(recoveryFailureRef.current)
    ) return;
    const generation = begin();
    if (generation === null) return;
    try {
      if (runtime.writer.capability === 'unavailable') {
        updateRecoveryFailure(generation, {
          kind: 'writer',
          action: 'recover',
          failure: { kind: 'writer-unavailable' },
        });
        return;
      }
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
        return recoveryOperationOutcome(runtime, result);
      });
      if (!current(generation)) return;
      if (runResult.kind !== 'operation-result') {
        updateRecoveryFailure(generation, {
          kind: 'writer',
          action: 'recover',
          failure: writerFailure(runResult)!,
        });
        return;
      }
      applyRecoveryResult(generation, 'recover', runResult.result);
    } finally {
      finish(generation);
    }
  }, [applyRecoveryResult, begin, current, finish, runtime, updateRecoveryFailure]);

  const continueRecovery = useCallback(async (decision: 'continue' | 'abandon'): Promise<void> => {
    const phase = persistenceRef.current;
    if (
      phase.kind !== 'recovery-continuation'
      || busyRef.current
      || blocksRecoveryMutation(recoveryFailureRef.current)
    ) return;
    const generation = begin();
    if (generation === null) return;
    const action: RecoveryAction = decision === 'continue'
      ? 'continue-recovery'
      : 'abandon-from-quarantine';
    try {
      if (runtime.writer.capability === 'unavailable') {
        updateRecoveryFailure(generation, {
          kind: 'writer',
          action,
          failure: { kind: 'writer-unavailable' },
        });
        return;
      }
      const runResult = await runtime.writer.run(() => recoveryOperationOutcome(
        runtime,
        continueStoredRecovery(runtime.storage, phase.result.continuation, decision),
      ));
      if (!current(generation)) return;
      if (runResult.kind !== 'operation-result') {
        updateRecoveryFailure(generation, {
          kind: 'writer',
          action,
          failure: writerFailure(runResult)!,
        });
        return;
      }
      applyRecoveryResult(generation, action, runResult.result);
    } finally {
      finish(generation);
    }
  }, [applyRecoveryResult, begin, current, finish, runtime, updateRecoveryFailure]);

  const abandon = useCallback(async (): Promise<void> => {
    const observed = loadRef.current;
    if (
      observed.kind === 'empty'
      || observed.kind === 'storage-unavailable'
      || busyRef.current
      || blocksRecoveryMutation(recoveryFailureRef.current)
    ) return;
    const generation = begin();
    if (generation === null) return;
    try {
      if (runtime.writer.capability === 'unavailable') {
        updateRecoveryFailure(generation, {
          kind: 'writer',
          action: 'abandon',
          failure: { kind: 'writer-unavailable' },
        });
        return;
      }
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
        return recoveryOperationOutcome(runtime, result);
      });
      if (!current(generation)) return;
      if (runResult.kind !== 'operation-result') {
        updateRecoveryFailure(generation, {
          kind: 'writer',
          action: 'abandon',
          failure: writerFailure(runResult)!,
        });
        return;
      }
      applyRecoveryResult(generation, 'abandon', runResult.result);
    } finally {
      finish(generation);
    }
  }, [applyRecoveryResult, begin, current, finish, runtime, updateRecoveryFailure]);

  const selectActivity = useCallback((next: PortActivity): void => {
    setActivity(next);
  }, []);

  const closeActivity = useCallback((): void => setActivity('menu'), []);
  const acknowledgePortFocus = useCallback((): void => setPortFocusTarget(null), []);

  return {
    load,
    journal,
    activity,
    busy,
    persistence,
    recoveryWriterCapability: runtime.writer.capability,
    recoveryFailure,
    start,
    resume,
    continueWithoutSaving,
    dispatch,
    setSail,
    completeSeaLeg,
    avoidEncounter,
    engageEncounter,
    withdrawBattle,
    resolveBattle,
    portFocusTarget,
    acknowledgePortFocus,
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
