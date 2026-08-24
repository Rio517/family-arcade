import { describe, expect, it } from 'vitest';

import { createCampaign } from '../domain/createCampaign';
import { marketTradeDraft, quoteTrade } from '../domain/economy';
import type { CampaignJournal } from '../domain/events';
import { appendJournal, createJournal } from '../domain/replay';
import { canonicalJson, checksumPayload } from './checksum';
import {
  CURRENT_SAVE_KEY,
  loadCampaign,
  PREVIOUS_SAVE_KEY,
  type ActiveSaveRevision,
  type LoadResult,
  type StorageLike,
} from './persistence';
import {
  abandonCampaign,
  continueRecovery,
  QUARANTINE_KEY_PREFIX,
  recoverCampaign,
  serializeRecoveryExport,
  type RecoveryContinuation,
  type RecoveryResult,
} from './recovery';
import { parseSaveEnvelope, type SaveEnvelopeV1 } from './schema';

type OperationLabel =
  | 'get:current'
  | 'get:previous'
  | 'get:quarantine'
  | 'set:current'
  | 'set:previous'
  | 'set:quarantine'
  | 'remove:current'
  | 'remove:previous';

interface Fault {
  label: OperationLabel;
  occurrence: number;
  timing: 'before' | 'after';
}

interface Hook {
  label: OperationLabel;
  occurrence: number;
  timing: 'before' | 'after';
  run(storage: ScriptedStorage): void;
}

const EMPTY_REVISION: ActiveSaveRevision = {
  currentRaw: null,
  previousRaw: null,
};
const RECOVERY_OPTIONS = {
  build: 'recovery-build',
  savedAt: 300,
  quarantinedAt: 250,
  quarantineId: 'repair-1',
} as const;
const ABANDON_OPTIONS = {
  quarantinedAt: 250,
  quarantineId: 'abandon-1',
} as const;

function initialJournal(seed = 1702): CampaignJournal {
  return createJournal(createCampaign({
    seed,
    name: 'Morgan',
    pronouns: 'they/them',
    talent: 'navigation',
    length: 'adventure',
  }));
}

function acceptedJournal(seed = 1702): CampaignJournal {
  return appendJournal(initialJournal(seed), {
    type: 'lead-accepted',
    payload: { leadId: 'red-jackdaw' },
  });
}

function oversizedJournal(): CampaignJournal {
  let journal = initialJournal(2718);
  for (let index = 0; index < 257; index += 1) {
    const quote = quoteTrade(journal.state, {
      portId: 'bridgetown',
      shipId: 'mistral',
      cargoId: 'provisions',
      delta: index % 2 === 0 ? 1 : -1,
    });
    if (!quote.ok) throw new Error('fixture must quote');
    journal = appendJournal(journal, marketTradeDraft(quote));
  }
  return journal;
}

function envelopeRaw(
  journal: CampaignJournal,
  savedAt = 100,
  build = 'fixture-build',
): string {
  return canonicalJson({
    version: 1,
    build,
    savedAt,
    checksum: checksumPayload(journal),
    payload: journal,
  } satisfies SaveEnvelopeV1);
}

class ScriptedStorage implements StorageLike {
  operations: OperationLabel[] = [];
  private readonly values = new Map<string, string>();
  private readonly counts = new Map<OperationLabel, number>();
  private faults: Fault[] = [];
  private hooks: Hook[] = [];

  constructor(initial: ActiveSaveRevision = EMPTY_REVISION) {
    this.installRevision(initial);
  }

  getItem(key: string): string | null {
    const label = this.label('get', key);
    const occurrence = this.record(label);
    this.runHooks(label, occurrence, 'before');
    this.maybeThrow(label, occurrence, 'before');
    const value = this.values.get(key) ?? null;
    this.runHooks(label, occurrence, 'after');
    this.maybeThrow(label, occurrence, 'after');
    return value;
  }

  setItem(key: string, value: string): void {
    const label = this.label('set', key);
    const occurrence = this.record(label);
    this.runHooks(label, occurrence, 'before');
    this.maybeThrow(label, occurrence, 'before');
    this.values.set(key, value);
    this.runHooks(label, occurrence, 'after');
    this.maybeThrow(label, occurrence, 'after');
  }

  removeItem(key: string): void {
    const label = this.label('remove', key);
    const occurrence = this.record(label);
    this.runHooks(label, occurrence, 'before');
    this.maybeThrow(label, occurrence, 'before');
    this.values.delete(key);
    this.runHooks(label, occurrence, 'after');
    this.maybeThrow(label, occurrence, 'after');
  }

  revision(): ActiveSaveRevision {
    return {
      currentRaw: this.values.get(CURRENT_SAVE_KEY) ?? null,
      previousRaw: this.values.get(PREVIOUS_SAVE_KEY) ?? null,
    };
  }

  raw(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  forceSet(key: string, value: string): void {
    this.values.set(key, value);
  }

  forceRemove(key: string): void {
    this.values.delete(key);
  }

  installRevision(revision: ActiveSaveRevision): void {
    if (revision.currentRaw === null) this.values.delete(CURRENT_SAVE_KEY);
    else this.values.set(CURRENT_SAVE_KEY, revision.currentRaw);
    if (revision.previousRaw === null) this.values.delete(PREVIOUS_SAVE_KEY);
    else this.values.set(PREVIOUS_SAVE_KEY, revision.previousRaw);
  }

  failAt(
    label: OperationLabel,
    occurrence = 1,
    timing: Fault['timing'] = 'before',
  ): void {
    this.faults.push({ label, occurrence, timing });
  }

  failNext(label: OperationLabel, timing: Fault['timing'] = 'before'): void {
    this.failAt(label, (this.counts.get(label) ?? 0) + 1, timing);
  }

  hookAt(label: OperationLabel, occurrence: number, run: Hook['run']): void {
    this.hooks.push({ label, occurrence, timing: 'before', run });
  }

  hookAfterAt(label: OperationLabel, occurrence: number, run: Hook['run']): void {
    this.hooks.push({ label, occurrence, timing: 'after', run });
  }

  resetObservations(): void {
    this.operations = [];
    this.counts.clear();
  }

  clearFaultsAndHooks(): void {
    this.faults = [];
    this.hooks = [];
  }

  private record(label: OperationLabel): number {
    this.operations.push(label);
    const occurrence = (this.counts.get(label) ?? 0) + 1;
    this.counts.set(label, occurrence);
    return occurrence;
  }

  private runHooks(
    label: OperationLabel,
    occurrence: number,
    timing: Hook['timing'],
  ): void {
    for (const hook of this.hooks) {
      if (
        hook.label === label
        && hook.occurrence === occurrence
        && hook.timing === timing
      ) {
        hook.run(this);
      }
    }
  }

  private maybeThrow(
    label: OperationLabel,
    occurrence: number,
    timing: Fault['timing'],
  ): void {
    if (this.faults.some((fault) => (
      fault.label === label
      && fault.occurrence === occurrence
      && fault.timing === timing
    ))) {
      throw new Error(`blocked ${timing} ${label} ${occurrence}`);
    }
  }

  private label(
    verb: 'get' | 'set' | 'remove',
    key: string,
  ): OperationLabel {
    if (key === CURRENT_SAVE_KEY) return `${verb}:current` as OperationLabel;
    if (key === PREVIOUS_SAVE_KEY) return `${verb}:previous` as OperationLabel;
    if (key.startsWith(QUARANTINE_KEY_PREFIX)) {
      if (verb === 'remove') throw new Error('quarantine must never be removed');
      return `${verb}:quarantine` as OperationLabel;
    }
    throw new Error(`Unexpected storage key ${key}`);
  }
}

function loadedFrom(storage: ScriptedStorage): Extract<LoadResult, { kind: 'loaded' }> {
  const result = loadCampaign(storage);
  if (result.kind !== 'loaded') throw new Error(`Expected loaded, received ${result.kind}`);
  storage.resetObservations();
  return result;
}

function nonEmptyFrom(
  storage: ScriptedStorage,
): Exclude<LoadResult, { kind: 'storage-unavailable' | 'empty' }> {
  const result = loadCampaign(storage);
  if (result.kind === 'storage-unavailable' || result.kind === 'empty') {
    throw new Error(`Expected non-empty load, received ${result.kind}`);
  }
  storage.resetObservations();
  return result;
}

function requireContinuation(result: RecoveryResult): RecoveryContinuation {
  if (result.ok || result.reason !== 'continuation-required') {
    throw new Error('Expected continuation-required result');
  }
  return result.continuation;
}

function quarantineKey(id: string = RECOVERY_OPTIONS.quarantineId): string {
  return `${QUARANTINE_KEY_PREFIX}${id}`;
}

function corruptCurrentRevision(journal = initialJournal()): ActiveSaveRevision {
  return {
    currentRaw: '{broken-current-ålesund',
    previousRaw: envelopeRaw(journal, 100, 'previous-build'),
  };
}

function corruptPreviousRevision(journal = acceptedJournal()): ActiveSaveRevision {
  return {
    currentRaw: envelopeRaw(journal, 200, 'current-build'),
    previousRaw: '{broken-previous-東京',
  };
}

type DegradedSourceKind = 'corrupt-current' | 'corrupt-previous';

function degradedSource(
  kind: DegradedSourceKind,
  journal: CampaignJournal,
): ActiveSaveRevision {
  return kind === 'corrupt-current'
    ? corruptCurrentRevision(journal)
    : corruptPreviousRevision(journal);
}

function knownGoodRaw(
  kind: DegradedSourceKind,
  source: ActiveSaveRevision,
): string {
  const raw = kind === 'corrupt-current' ? source.previousRaw : source.currentRaw;
  if (raw === null) throw new Error('Fixture must retain one known-good save');
  return raw;
}

describe('serializeRecoveryExport', () => {
  it('canonicalizes the exact revision and unreadable bytes without reparsing Unicode or malformed JSON', () => {
    const revision = {
      currentRaw: '{"captain":"Zoë 🏴‍☠️",broken',
      previousRaw: null,
    };
    const unreadableSlots = [{
      slot: 'current' as const,
      raw: revision.currentRaw,
      code: 'malformed-json' as const,
    }];

    expect(serializeRecoveryExport(revision, unreadableSlots)).toBe(
      '{"game":"caribbean","revision":{"currentRaw":"{\\"captain\\":\\"Zoë 🏴‍☠️\\",broken","previousRaw":null},"unreadableSlots":[{"code":"malformed-json","raw":"{\\"captain\\":\\"Zoë 🏴‍☠️\\",broken","slot":"current"}],"version":1}',
    );
  });
});

describe('recoverCampaign safe acquisition and publication', () => {
  it('quarantines and verifies corrupt current before removal, then republishes valid previous', () => {
    const revision = corruptCurrentRevision();
    const storage = new ScriptedStorage(revision);
    const loaded = loadedFrom(storage);

    const result = recoverCampaign(storage, loaded, RECOVERY_OPTIONS);

    expect(result).toMatchObject({
      ok: true,
      kind: 'recovered',
      quarantineKey: quarantineKey(),
      journal: loaded.journal,
    });
    if (!result.ok || result.kind !== 'recovered') throw new Error('Expected recovery');
    expect(storage.operations).toEqual([
      'get:current', 'get:previous', 'get:quarantine',
      'set:quarantine', 'get:quarantine',
      'get:current', 'get:previous',
      'get:quarantine',
      'remove:current',
      'get:current', 'get:previous', 'get:quarantine',
      'get:current', 'get:previous',
      'set:current',
    ]);
    expect(storage.raw(quarantineKey())).toContain('{broken-current-ålesund');
    expect(storage.raw(quarantineKey())).toBe(canonicalJson({
      version: 1,
      game: 'caribbean',
      quarantinedAt: RECOVERY_OPTIONS.quarantinedAt,
      sourceRevision: revision,
      unreadableSlots: loaded.unreadableSlots,
    }));
    expect(storage.revision()).toEqual(result.revision);
    expect(result.revision.previousRaw).toBe(revision.previousRaw);
    const current = parseSaveEnvelope(result.revision.currentRaw ?? '');
    expect(current).toMatchObject({ ok: true, envelope: { payload: loaded.journal } });
  });

  it('repairs a corrupt previous by removing it, rotating valid current, and publishing canonical current', () => {
    const revision = corruptPreviousRevision();
    const storage = new ScriptedStorage(revision);
    const loaded = loadedFrom(storage);

    const result = recoverCampaign(storage, loaded, RECOVERY_OPTIONS);

    expect(result).toMatchObject({ ok: true, kind: 'recovered', journal: loaded.journal });
    if (!result.ok || result.kind !== 'recovered') throw new Error('Expected recovery');
    expect(storage.operations).toEqual([
      'get:current', 'get:previous', 'get:quarantine',
      'set:quarantine', 'get:quarantine',
      'get:current', 'get:previous',
      'get:quarantine',
      'remove:previous',
      'get:current', 'get:previous', 'get:quarantine',
      'get:current', 'get:previous',
      'set:previous', 'set:current',
    ]);
    expect(result.revision.previousRaw).toBe(revision.currentRaw);
    expect(storage.revision()).toEqual(result.revision);
  });

  it('stops initial recovery if quarantine disappears after cleanup before republish', () => {
    const source = corruptCurrentRevision();
    const afterCleanup = { currentRaw: null, previousRaw: source.previousRaw };
    const storage = new ScriptedStorage(source);
    const loaded = loadedFrom(storage);
    storage.hookAfterAt('remove:current', 1, (target) => {
      target.forceRemove(quarantineKey());
    });

    const result = recoverCampaign(storage, loaded, RECOVERY_OPTIONS);

    expect(result).toEqual({
      ok: false,
      reason: 'quarantine-invalidated',
      cause: 'quarantine-missing',
      quarantineKey: quarantineKey(),
      expectedRaw: canonicalJson({
        version: 1,
        game: 'caribbean',
        quarantinedAt: RECOVERY_OPTIONS.quarantinedAt,
        sourceRevision: source,
        unreadableSlots: loaded.unreadableSlots,
      }),
      actualRaw: null,
      stage: 'republish',
      sourceRevision: source,
    });
    expect(storage.revision()).toEqual(afterCleanup);
    expect(storage.operations).not.toContain('set:current');
  });

  it('adopts saveCampaign compacted journal and exact returned revision', () => {
    const journal = oversizedJournal();
    const storage = new ScriptedStorage(corruptCurrentRevision(journal));
    const loaded = loadedFrom(storage);

    const result = recoverCampaign(storage, loaded, RECOVERY_OPTIONS);

    expect(result).toMatchObject({ ok: true, kind: 'recovered' });
    if (!result.ok || result.kind !== 'recovered') throw new Error('Expected recovery');
    expect(result.journal.events).toEqual([]);
    expect(result.journal.initial).toEqual(journal.state);
    expect(storage.revision()).toEqual(result.revision);
    expect(loadCampaign(storage)).toMatchObject({
      kind: 'loaded',
      journal: result.journal,
      revision: result.revision,
    });
  });

  it('rejects an exact active revision conflict before reading or writing quarantine', () => {
    const source = corruptCurrentRevision();
    const storage = new ScriptedStorage(source);
    const loaded = loadedFrom(storage);
    const actual = { ...source, currentRaw: '{externally-replaced' };
    storage.installRevision(actual);

    expect(recoverCampaign(storage, loaded, RECOVERY_OPTIONS)).toEqual({
      ok: false,
      reason: 'active-revision-conflict',
      expected: source,
      actual,
    });
    expect(storage.operations).toEqual(['get:current', 'get:previous']);
    expect(storage.raw(quarantineKey())).toBeNull();
    expect(storage.revision()).toEqual(actual);
  });

  it('never overwrites a different-byte quarantine collision', () => {
    const source = corruptCurrentRevision();
    const storage = new ScriptedStorage(source);
    const loaded = loadedFrom(storage);
    storage.forceSet(quarantineKey(), 'existing-different-bytes');

    const result = recoverCampaign(storage, loaded, RECOVERY_OPTIONS);

    expect(result).toMatchObject({
      ok: false,
      reason: 'quarantine-collision',
      quarantineKey: quarantineKey(),
      actualRaw: 'existing-different-bytes',
    });
    expect(storage.operations).toEqual([
      'get:current', 'get:previous', 'get:quarantine',
    ]);
    expect(storage.raw(quarantineKey())).toBe('existing-different-bytes');
    expect(storage.revision()).toEqual(source);
  });

  it('treats an identical-byte quarantine as an idempotent verified acquisition', () => {
    const source = corruptCurrentRevision();
    const storage = new ScriptedStorage(source);
    const loaded = loadedFrom(storage);
    const firstStorage = new ScriptedStorage(source);
    const firstLoaded = loadedFrom(firstStorage);
    firstStorage.failAt('remove:current');
    const first = recoverCampaign(firstStorage, firstLoaded, RECOVERY_OPTIONS);
    const exactRaw = firstStorage.raw(quarantineKey());
    expect(exactRaw).not.toBeNull();
    storage.forceSet(quarantineKey(), exactRaw ?? '');

    const result = recoverCampaign(storage, loaded, RECOVERY_OPTIONS);

    expect(result).toMatchObject({ ok: true, kind: 'recovered' });
    expect(storage.operations.slice(0, 5)).toEqual([
      'get:current', 'get:previous', 'get:quarantine',
      'get:current', 'get:previous',
    ]);
    expect(storage.operations).not.toContain('set:quarantine');
    expect(first).toMatchObject({ ok: false, reason: 'continuation-required' });
  });

  it('refuses a healthy loaded token or a fabricated both-invalid loaded token as recovery sources', () => {
    const validRevision = {
      currentRaw: envelopeRaw(initialJournal()),
      previousRaw: null,
    };
    const validStorage = new ScriptedStorage(validRevision);
    const healthy = loadedFrom(validStorage);
    expect(recoverCampaign(validStorage, healthy, RECOVERY_OPTIONS)).toEqual({
      ok: false,
      reason: 'invalid-recovery-source',
    });
    expect(validStorage.operations).toEqual([]);

    const bothRevision = {
      currentRaw: '{bad-current',
      previousRaw: '{bad-previous',
    };
    const fabricated = {
      kind: 'loaded',
      journal: initialJournal(),
      savedAt: 10,
      build: 'fabricated',
      recovered: false,
      unreadableSlots: [
        { slot: 'current', raw: '{bad-current', code: 'malformed-json' },
        { slot: 'previous', raw: '{bad-previous', code: 'malformed-json' },
      ],
      revision: bothRevision,
    } satisfies Extract<LoadResult, { kind: 'loaded' }>;
    const bothStorage = new ScriptedStorage(bothRevision);
    expect(recoverCampaign(bothStorage, fabricated, RECOVERY_OPTIONS)).toEqual({
      ok: false,
      reason: 'invalid-recovery-source',
    });
    expect(bothStorage.operations).toEqual([]);
  });

  it.each([
    ['bad id', { ...RECOVERY_OPTIONS, quarantineId: '../escape' }],
    ['negative savedAt', { ...RECOVERY_OPTIONS, savedAt: -1 }],
    ['unsafe savedAt', { ...RECOVERY_OPTIONS, savedAt: Number.MAX_SAFE_INTEGER + 1 }],
    ['negative quarantinedAt', { ...RECOVERY_OPTIONS, quarantinedAt: -1 }],
  ])('rejects invalid recovery option: %s', (_label, options) => {
    const storage = new ScriptedStorage(corruptCurrentRevision());
    const loaded = loadedFrom(storage);

    expect(recoverCampaign(storage, loaded, options)).toEqual({
      ok: false,
      reason: 'invalid-recovery-source',
    });
    expect(storage.operations).toEqual([]);
  });
});

describe('abandonCampaign', () => {
  it('quarantines a valid campaign and removes previous before current', () => {
    const revision = {
      currentRaw: envelopeRaw(acceptedJournal(), 200),
      previousRaw: envelopeRaw(initialJournal(), 100),
    };
    const storage = new ScriptedStorage(revision);
    const load = nonEmptyFrom(storage);

    const result = abandonCampaign(storage, load, ABANDON_OPTIONS);

    expect(result).toEqual({
      ok: true,
      kind: 'abandoned',
      quarantineKey: quarantineKey(ABANDON_OPTIONS.quarantineId),
      revision: EMPTY_REVISION,
    });
    expect(storage.operations).toEqual([
      'get:current', 'get:previous', 'get:quarantine',
      'set:quarantine', 'get:quarantine',
      'get:current', 'get:previous',
      'get:quarantine', 'remove:previous',
      'get:current', 'get:previous',
      'get:quarantine', 'remove:current',
    ]);
    expect(storage.revision()).toEqual(EMPTY_REVISION);
  });

  it('stops initial abandonment before removing a replacement current installed after previous cleanup', () => {
    const source = {
      currentRaw: envelopeRaw(acceptedJournal(), 200, 'source-current'),
      previousRaw: envelopeRaw(initialJournal(), 100, 'source-previous'),
    };
    const external = {
      currentRaw: envelopeRaw(acceptedJournal(818), 900, 'replacement-current'),
      previousRaw: null,
    };
    const storage = new ScriptedStorage(source);
    const load = nonEmptyFrom(storage);
    storage.hookAfterAt('remove:previous', 1, (target) => {
      target.installRevision(external);
    });

    const result = abandonCampaign(storage, load, ABANDON_OPTIONS);

    expect(result).toMatchObject({
      ok: false,
      reason: 'external-revision-conflict',
      cause: 'active-revision-conflict',
      quarantineKey: quarantineKey(ABANDON_OPTIONS.quarantineId),
      stage: 'cleanup',
      sourceRevision: source,
      actualRevision: external,
    });
    expect(storage.revision()).toEqual(external);
    expect(storage.operations.filter((entry) => entry === 'remove:current')).toEqual([]);
  });

  it('quarantines and abandons both unreadable raw slots without parsing or normalizing them', () => {
    const revision = {
      currentRaw: '{bad-current-ñ',
      previousRaw: '{bad-previous-東京',
    };
    const storage = new ScriptedStorage(revision);
    const load = nonEmptyFrom(storage);

    const result = abandonCampaign(storage, load, ABANDON_OPTIONS);

    expect(result).toMatchObject({ ok: true, kind: 'abandoned' });
    const raw = storage.raw(quarantineKey(ABANDON_OPTIONS.quarantineId));
    expect(raw).toContain('{bad-current-ñ');
    expect(raw).toContain('{bad-previous-東京');
    expect(storage.operations.filter((entry) => entry.startsWith('remove:'))).toEqual([
      'remove:previous',
      'remove:current',
    ]);
  });
});

describe('recovery failures before and after verified quarantine', () => {
  it.each([
    ['get:current', 'read-current'],
    ['get:previous', 'read-previous'],
    ['get:quarantine', 'read-quarantine'],
    ['set:quarantine', 'write-quarantine'],
  ] as const)(
    'returns before-quarantine storage failure for %s without active mutation',
    (label, operation) => {
      const revision = corruptCurrentRevision();
      const storage = new ScriptedStorage(revision);
      const loaded = loadedFrom(storage);
      storage.failAt(label);

      expect(recoverCampaign(storage, loaded, RECOVERY_OPTIONS)).toEqual({
        ok: false,
        reason: 'storage-unavailable',
        stage: 'before-quarantine',
        operation,
      });
      expect(storage.revision()).toEqual(revision);
      expect(storage.operations.filter((entry) => entry.startsWith('remove:'))).toEqual([]);
    },
  );

  it.each([
    ['write-previous', 'set:previous', corruptPreviousRevision()],
  ] as const)(
    'continues safely when %s commits and then throws',
    (failedOperation, label, source) => {
      const storage = new ScriptedStorage(source);
      const loaded = loadedFrom(storage);
      storage.failAt(label, 1, 'after');

      const failed = recoverCampaign(storage, loaded, RECOVERY_OPTIONS);
      const continuation = requireContinuation(failed);
      const committed = storage.revision();

      expect(failed).toMatchObject({
        ok: false,
        reason: 'continuation-required',
        cause: 'republish-failed',
        saveFailure: {
          ok: false,
          reason: 'storage-unavailable',
          operation: failedOperation,
        },
        continuation: {
          stage: 'republish',
          remaining: { kind: 'known', revision: committed },
        },
      });
      storage.clearFaultsAndHooks();
      storage.resetObservations();
      expect(continueRecovery(storage, continuation, 'continue')).toMatchObject({
        ok: true,
        kind: 'recovered',
      });
    },
  );

  const sourceKinds: DegradedSourceKind[] = [
    'corrupt-current',
    'corrupt-previous',
  ];
  const outcomeRereads = [
    { label: 'successful outcome reread', fails: false },
    { label: 'failing outcome reread', fails: true },
  ] as const;

  it.each(sourceKinds.flatMap((sourceKind) => (
    outcomeRereads.map((outcomeReread) => ({ sourceKind, outcomeReread }))
  )))(
    'adopts an already committed current without duplicate writes for $sourceKind after a $outcomeReread.label',
    ({ sourceKind, outcomeReread }) => {
      const source = degradedSource(sourceKind, oversizedJournal());
      const preservedRaw = knownGoodRaw(sourceKind, source);
      const storage = new ScriptedStorage(source);
      const loaded = loadedFrom(storage);
      if (outcomeReread.fails) {
        storage.hookAfterAt('set:current', 1, (target) => {
          target.failNext('get:current');
        });
      }
      storage.failAt('set:current', 1, 'after');

      const failed = recoverCampaign(storage, loaded, RECOVERY_OPTIONS);
      const continuation = requireContinuation(failed);
      const committed = storage.revision();
      const installed = parseSaveEnvelope(committed.currentRaw ?? '');
      if (!installed.ok) throw new Error('Committed current must be canonical');
      const expectedJournal: CampaignJournal = {
        initial: loaded.journal.state,
        events: [],
        state: loaded.journal.state,
      };
      const expectedRevision = {
        currentRaw: envelopeRaw(
          expectedJournal,
          RECOVERY_OPTIONS.savedAt,
          RECOVERY_OPTIONS.build,
        ),
        previousRaw: preservedRaw,
      };

      expect(failed).toMatchObject({
        ok: false,
        reason: 'continuation-required',
        cause: 'republish-failed',
        saveFailure: {
          ok: false,
          reason: 'storage-unavailable',
          operation: 'write-current',
        },
      });
      expect(committed).toEqual(expectedRevision);
      expect(installed.envelope.payload).toEqual(expectedJournal);
      if (outcomeReread.fails) {
        expect(continuation.remaining).toMatchObject({
          kind: 'write-outcome-unknown',
          failedOperation: 'write-current',
          acceptableRevisions: expect.arrayContaining([committed]),
        });
      }

      storage.clearFaultsAndHooks();
      storage.resetObservations();
      const recovered = continueRecovery(storage, continuation, 'continue');

      expect(recovered).toEqual({
        ok: true,
        kind: 'recovered',
        quarantineKey: quarantineKey(),
        revision: expectedRevision,
        journal: expectedJournal,
      });
      expect(storage.revision()).toEqual(expectedRevision);
      expect(storage.operations.filter((entry) => (
        entry.startsWith('set:') || entry.startsWith('remove:')
      ))).toEqual([]);
    },
  );

  it.each(sourceKinds)(
    'retries publication from the exact before candidate for %s',
    (sourceKind) => {
      const source = degradedSource(sourceKind, acceptedJournal(808));
      const preservedRaw = knownGoodRaw(sourceKind, source);
      const storage = new ScriptedStorage(source);
      const loaded = loadedFrom(storage);
      storage.failAt('set:current');

      const continuation = requireContinuation(
        recoverCampaign(storage, loaded, RECOVERY_OPTIONS),
      );
      storage.clearFaultsAndHooks();
      storage.resetObservations();

      const recovered = continueRecovery(storage, continuation, 'continue');
      expect(recovered).toMatchObject({
        ok: true,
        kind: 'recovered',
        journal: loaded.journal,
      });
      if (!recovered.ok || recovered.kind !== 'recovered') {
        throw new Error('Expected recovered before-candidate retry');
      }
      expect(storage.revision()).toEqual(recovered.revision);
      expect(recovered.revision).toEqual({
        currentRaw: envelopeRaw(
          loaded.journal,
          RECOVERY_OPTIONS.savedAt,
          RECOVERY_OPTIONS.build,
        ),
        previousRaw: preservedRaw,
      });
      expect(storage.operations.filter((entry) => entry === 'set:current')).toEqual([
        'set:current',
      ]);
    },
  );

  it('keeps unrelated bytes terminal when write-current commits and then throws', () => {
    const source = corruptCurrentRevision();
    const external = {
      currentRaw: envelopeRaw(acceptedJournal(919), 901, 'unrelated-current'),
      previousRaw: source.previousRaw,
    };
    const storage = new ScriptedStorage(source);
    const loaded = loadedFrom(storage);
    storage.hookAfterAt('set:current', 1, (target) => target.installRevision(external));
    storage.failAt('set:current', 1, 'after');

    const result = recoverCampaign(storage, loaded, RECOVERY_OPTIONS);

    expect(result).toMatchObject({
      ok: false,
      reason: 'external-revision-conflict',
      actualRevision: external,
      stage: 'republish',
      sourceRevision: source,
    });
    expect('continuation' in result).toBe(false);
    expect(storage.revision()).toEqual(external);
  });

  it('returns verify-quarantine failure and removes nothing when verification read throws', () => {
    const revision = corruptCurrentRevision();
    const storage = new ScriptedStorage(revision);
    const loaded = loadedFrom(storage);
    storage.failAt('get:quarantine', 2);

    expect(recoverCampaign(storage, loaded, RECOVERY_OPTIONS)).toEqual({
      ok: false,
      reason: 'storage-unavailable',
      stage: 'before-quarantine',
      operation: 'verify-quarantine',
    });
    expect(storage.revision()).toEqual(revision);
    expect(storage.operations).not.toContain('remove:current');
  });

  it.each([
    ['missing after write', null, 'storage-unavailable'],
    ['different after write', 'replaced-quarantine', 'quarantine-collision'],
  ] as const)(
    'removes nothing when quarantine verification is %s',
    (_label, replacement, reason) => {
      const revision = corruptCurrentRevision();
      const storage = new ScriptedStorage(revision);
      const loaded = loadedFrom(storage);
      storage.hookAt('get:quarantine', 2, (target) => {
        if (replacement === null) target.forceRemove(quarantineKey());
        else target.forceSet(quarantineKey(), replacement);
      });

      expect(recoverCampaign(storage, loaded, RECOVERY_OPTIONS)).toMatchObject({
        ok: false,
        reason,
      });
      expect(storage.revision()).toEqual(revision);
      expect(storage.operations.filter((entry) => entry.startsWith('remove:'))).toEqual([]);
    },
  );

  it.each([
    ['get:current', 'read-current'],
    ['get:previous', 'read-previous'],
  ] as const)(
    'returns an executable quarantine-verified continuation when the second %s fails',
    (label, failedOperation) => {
      const revision = corruptCurrentRevision();
      const storage = new ScriptedStorage(revision);
      const loaded = loadedFrom(storage);
      storage.failAt(label, 2);

      const result = recoverCampaign(storage, loaded, RECOVERY_OPTIONS);

      expect(result).toMatchObject({
        ok: false,
        reason: 'continuation-required',
        cause: 'storage-unavailable',
        failedOperation,
        quarantineKey: quarantineKey(),
        continuation: {
          action: 'recover',
          stage: 'quarantine-verified',
          quarantineKey: quarantineKey(),
          sourceRevision: revision,
          remaining: { kind: 'known', revision },
          republish: {
            journal: loaded.journal,
            build: RECOVERY_OPTIONS.build,
            savedAt: RECOVERY_OPTIONS.savedAt,
          },
        },
      });
      expect(storage.revision()).toEqual(revision);
      expect(storage.operations).not.toContain('remove:current');
    },
  );

  it('detects an external revision after quarantine verification and preserves its diagnostics and bytes', () => {
    const source = corruptCurrentRevision();
    const external = {
      currentRaw: envelopeRaw(acceptedJournal(99), 900, 'external'),
      previousRaw: source.previousRaw,
    };
    const storage = new ScriptedStorage(source);
    const loaded = loadedFrom(storage);
    storage.hookAt('get:current', 2, (target) => target.installRevision(external));

    const result = recoverCampaign(storage, loaded, RECOVERY_OPTIONS);

    expect(result).toMatchObject({
      ok: false,
      reason: 'external-revision-conflict',
      cause: 'active-revision-conflict',
      quarantineKey: quarantineKey(),
      stage: 'quarantine-verified',
      sourceRevision: source,
      actualRevision: external,
    });
    expect(storage.revision()).toEqual(external);
    expect(storage.operations).not.toContain('remove:current');
  });

  it.each([
    ['remove:current', corruptCurrentRevision(), 'recover'],
    ['remove:previous', {
      currentRaw: '{bad-current',
      previousRaw: '{bad-previous',
    }, 'abandon'],
  ] as const)('returns partial-cleanup for a throwing %s', (label, revision, action) => {
    const storage = new ScriptedStorage(revision);
    const load = nonEmptyFrom(storage);
    storage.failAt(label);

    const result = action === 'recover'
      ? recoverCampaign(
        storage,
        load as Extract<LoadResult, { kind: 'loaded' }>,
        RECOVERY_OPTIONS,
      )
      : abandonCampaign(storage, load, ABANDON_OPTIONS);

    expect(result).toMatchObject({
      ok: false,
      reason: 'continuation-required',
      cause: 'partial-cleanup',
      failedOperation: label === 'remove:current' ? 'remove-current' : 'remove-previous',
      continuation: { action, stage: 'quarantine-verified' },
    });
  });

  it('returns partial-cleanup after a remove mutates then throws and resumes from the observed after revision', () => {
    const source = corruptCurrentRevision();
    const storage = new ScriptedStorage(source);
    const loaded = loadedFrom(storage);
    storage.failAt('remove:current', 1, 'after');

    const failed = recoverCampaign(storage, loaded, RECOVERY_OPTIONS);
    const continuation = requireContinuation(failed);

    expect(failed).toMatchObject({
      ok: false,
      reason: 'continuation-required',
      cause: 'partial-cleanup',
      failedOperation: 'remove-current',
      continuation: {
        remaining: {
          kind: 'known',
          revision: { currentRaw: null, previousRaw: source.previousRaw },
        },
      },
    });
    storage.clearFaultsAndHooks();
    storage.resetObservations();
    expect(continueRecovery(storage, continuation, 'continue')).toMatchObject({
      ok: true,
      kind: 'recovered',
    });
  });

  it('carries only exact remove before/after revisions when remove mutates then reread fails', () => {
    const source = corruptCurrentRevision();
    const after = { currentRaw: null, previousRaw: source.previousRaw };
    const storage = new ScriptedStorage(source);
    const loaded = loadedFrom(storage);
    storage.failAt('remove:current', 1, 'after');
    storage.failAt('get:current', 3);

    const failed = recoverCampaign(storage, loaded, RECOVERY_OPTIONS);
    const continuation = requireContinuation(failed);

    expect(failed).toMatchObject({
      ok: false,
      reason: 'continuation-required',
      cause: 'partial-cleanup',
      failedOperation: 'remove-current',
    });
    expect(continuation.remaining).toEqual({
      kind: 'remove-outcome-unknown',
      failedOperation: 'remove-current',
      acceptableRevisions: [source, after],
    });
    storage.clearFaultsAndHooks();
    storage.resetObservations();
    expect(continueRecovery(storage, continuation, 'continue')).toMatchObject({
      ok: true,
      kind: 'recovered',
    });
  });

  it.each([
    ['set:previous', corruptPreviousRevision()],
    ['set:current', corruptCurrentRevision()],
  ] as const)(
    'returns republish continuation for saveCampaign failure at %s and finishes safely',
    (label, revision) => {
      const storage = new ScriptedStorage(revision);
      const loaded = loadedFrom(storage);
      storage.failAt(label);

      const failed = recoverCampaign(storage, loaded, RECOVERY_OPTIONS);
      const continuation = requireContinuation(failed);

      expect(failed).toMatchObject({
        ok: false,
        reason: 'continuation-required',
        cause: 'republish-failed',
        saveFailure: { ok: false, reason: 'storage-unavailable' },
        continuation: {
          action: 'recover',
          stage: 'republish',
          republish: {
            journal: loaded.journal,
            build: RECOVERY_OPTIONS.build,
            savedAt: RECOVERY_OPTIONS.savedAt,
          },
        },
      });
      storage.clearFaultsAndHooks();
      storage.resetObservations();
      expect(continueRecovery(storage, continuation, 'continue')).toMatchObject({
        ok: true,
        kind: 'recovered',
      });
    },
  );

  it('does not delete the valid previous copy created before a write-current failure', () => {
    const source = corruptPreviousRevision();
    const storage = new ScriptedStorage(source);
    const loaded = loadedFrom(storage);
    storage.failAt('set:current');

    const continuation = requireContinuation(
      recoverCampaign(storage, loaded, RECOVERY_OPTIONS),
    );
    expect(storage.revision()).toEqual({
      currentRaw: source.currentRaw,
      previousRaw: source.currentRaw,
    });
    storage.clearFaultsAndHooks();
    storage.resetObservations();

    expect(continueRecovery(storage, continuation, 'continue')).toMatchObject({
      ok: true,
      kind: 'recovered',
    });
    expect(storage.operations).not.toContain('remove:previous');
    expect(storage.operations).not.toContain('remove:current');
  });

  it('can abandon safely from a republish-failed continuation', () => {
    const source = corruptCurrentRevision();
    const storage = new ScriptedStorage(source);
    const loaded = loadedFrom(storage);
    storage.failAt('set:current');
    const continuation = requireContinuation(
      recoverCampaign(storage, loaded, RECOVERY_OPTIONS),
    );
    storage.clearFaultsAndHooks();
    storage.resetObservations();

    expect(continueRecovery(storage, continuation, 'abandon')).toEqual({
      ok: true,
      kind: 'abandoned',
      quarantineKey: quarantineKey(),
      revision: EMPTY_REVISION,
    });
  });

  it('classifies a saveCampaign revision conflict as external and never resumes with its actual bytes', () => {
    const source = corruptCurrentRevision();
    const storage = new ScriptedStorage(source);
    const loaded = loadedFrom(storage);
    storage.failAt('set:current');
    const continuation = requireContinuation(
      recoverCampaign(storage, loaded, RECOVERY_OPTIONS),
    );
    const external = {
      currentRaw: envelopeRaw(acceptedJournal(606), 903, 'save-race'),
      previousRaw: source.previousRaw,
    };
    storage.clearFaultsAndHooks();
    storage.resetObservations();
    storage.hookAt('get:current', 2, (target) => target.installRevision(external));

    const result = continueRecovery(storage, continuation, 'continue');

    expect(result).toEqual({
      ok: false,
      reason: 'external-revision-conflict',
      cause: 'active-revision-conflict',
      quarantineKey: continuation.quarantineKey,
      quarantineRaw: continuation.quarantineRaw,
      stage: 'republish',
      sourceRevision: source,
      actualRevision: external,
    });
    expect('continuation' in result).toBe(false);
    expect(storage.revision()).toEqual(external);
  });
});

function continuationAtStage(stage: RecoveryContinuation['stage']): {
  storage: ScriptedStorage;
  continuation: RecoveryContinuation;
} {
  if (stage === 'quarantine-verified') {
    const storage = new ScriptedStorage(corruptCurrentRevision());
    const loaded = loadedFrom(storage);
    storage.failAt('remove:current');
    const continuation = requireContinuation(
      recoverCampaign(storage, loaded, RECOVERY_OPTIONS),
    );
    storage.clearFaultsAndHooks();
    storage.resetObservations();
    return { storage, continuation };
  }
  if (stage === 'cleanup') {
    const revision = {
      currentRaw: '{bad-current',
      previousRaw: '{bad-previous',
    };
    const storage = new ScriptedStorage(revision);
    const load = nonEmptyFrom(storage);
    storage.failAt('remove:current');
    const continuation = requireContinuation(
      abandonCampaign(storage, load, ABANDON_OPTIONS),
    );
    storage.clearFaultsAndHooks();
    storage.resetObservations();
    return { storage, continuation };
  }
  const storage = new ScriptedStorage(corruptCurrentRevision());
  const loaded = loadedFrom(storage);
  storage.failAt('set:current');
  const continuation = requireContinuation(
    recoverCampaign(storage, loaded, RECOVERY_OPTIONS),
  );
  storage.clearFaultsAndHooks();
  storage.resetObservations();
  return { storage, continuation };
}

describe('continueRecovery quarantine re-verification', () => {
  it.each([
    ['missing', null],
    ['changed', 'changed-before-invocation'],
  ] as const)('invalidates a %s quarantine before reading active slots', (_label, replacement) => {
    const { storage, continuation } = continuationAtStage('quarantine-verified');
    if (replacement === null) storage.forceRemove(continuation.quarantineKey);
    else storage.forceSet(continuation.quarantineKey, replacement);
    const before = storage.revision();

    const result = continueRecovery(storage, continuation, 'continue');

    expect(result).toEqual({
      ok: false,
      reason: 'quarantine-invalidated',
      cause: replacement === null ? 'quarantine-missing' : 'quarantine-changed',
      quarantineKey: continuation.quarantineKey,
      expectedRaw: continuation.quarantineRaw,
      actualRaw: replacement,
      stage: continuation.stage,
      sourceRevision: continuation.sourceRevision,
    });
    expect(storage.operations).toEqual(['get:quarantine']);
    expect(storage.revision()).toEqual(before);
  });

  it('keeps the same executable continuation when the first quarantine read throws', () => {
    const { storage, continuation } = continuationAtStage('quarantine-verified');
    storage.failAt('get:quarantine');
    const before = storage.revision();

    const result = continueRecovery(storage, continuation, 'continue');

    expect(result).toMatchObject({
      ok: false,
      reason: 'continuation-required',
      cause: 'storage-unavailable',
      failedOperation: 'read-quarantine',
      quarantineKey: continuation.quarantineKey,
      continuation,
    });
    expect(storage.revision()).toEqual(before);
    storage.clearFaultsAndHooks();
    storage.resetObservations();
    expect(continueRecovery(storage, continuation, 'continue')).toMatchObject({ ok: true });
  });

  const stages: RecoveryContinuation['stage'][] = [
    'quarantine-verified',
    'cleanup',
    'republish',
  ];
  const invalidations = ['missing', 'changed', 'throwing-read'] as const;

  it.each(stages.flatMap((stage) => invalidations.map((mode) => ({ stage, mode }))))(
    'blocks $stage mutation when the final quarantine check is $mode',
    ({ stage, mode }) => {
      const { storage, continuation } = continuationAtStage(stage);
      const before = storage.revision();
      if (mode === 'throwing-read') {
        storage.failAt('get:quarantine', 2);
      } else {
        storage.hookAt('get:quarantine', 2, (target) => {
          if (mode === 'missing') target.forceRemove(continuation.quarantineKey);
          else target.forceSet(continuation.quarantineKey, 'changed-before-mutation');
        });
      }

      const result = continueRecovery(storage, continuation, 'continue');

      if (mode === 'throwing-read') {
        expect(result).toMatchObject({
          ok: false,
          reason: 'continuation-required',
          cause: 'storage-unavailable',
          failedOperation: 'read-quarantine',
          quarantineKey: continuation.quarantineKey,
          continuation: {
            stage,
            sourceRevision: continuation.sourceRevision,
            quarantineRaw: continuation.quarantineRaw,
          },
        });
      } else {
        expect(result).toEqual({
          ok: false,
          reason: 'quarantine-invalidated',
          cause: mode === 'missing' ? 'quarantine-missing' : 'quarantine-changed',
          quarantineKey: continuation.quarantineKey,
          expectedRaw: continuation.quarantineRaw,
          actualRaw: mode === 'missing' ? null : 'changed-before-mutation',
          stage,
          sourceRevision: continuation.sourceRevision,
        });
      }
      expect(storage.operations.filter((entry) => (
        entry.startsWith('remove:') || entry.startsWith('set:')
      ))).toEqual([]);
      expect(storage.revision()).toEqual(before);
    },
  );
});

describe('continueRecovery external-writer isolation', () => {
  it('rejects old-token Continue and Abandon against V1/P0 without deleting or adopting it', () => {
    const source = corruptCurrentRevision();
    const storage = new ScriptedStorage(source);
    const loaded = loadedFrom(storage);
    storage.failAt('remove:current');
    const continuation = requireContinuation(
      recoverCampaign(storage, loaded, RECOVERY_OPTIONS),
    );
    const external = {
      currentRaw: envelopeRaw(acceptedJournal(404), 901, 'external-v1'),
      previousRaw: source.previousRaw,
    };
    storage.clearFaultsAndHooks();
    storage.resetObservations();
    storage.installRevision(external);

    for (const decision of ['continue', 'abandon'] as const) {
      storage.resetObservations();
      const result = continueRecovery(storage, continuation, decision);
      expect(result).toEqual({
        ok: false,
        reason: 'external-revision-conflict',
        cause: 'active-revision-conflict',
        quarantineKey: continuation.quarantineKey,
        quarantineRaw: continuation.quarantineRaw,
        stage: continuation.stage,
        sourceRevision: source,
        actualRevision: external,
      });
      expect('continuation' in result).toBe(false);
      expect(storage.revision()).toEqual(external);
      expect(storage.operations.filter((entry) => (
        entry.startsWith('remove:') || entry.startsWith('set:')
      ))).toEqual([]);
    }

    storage.resetObservations();
    expect(loadCampaign(storage)).toMatchObject({
      kind: 'loaded',
      revision: external,
      recovered: false,
      unreadableSlots: [],
    });
    expect(storage.operations.filter((entry) => (
      entry.startsWith('remove:') || entry.startsWith('set:')
    ))).toEqual([]);
  });

  it('requires a fresh distinct quarantine before repairing a newly loaded external degraded revision', () => {
    const source = corruptCurrentRevision();
    const storage = new ScriptedStorage(source);
    const loaded = loadedFrom(storage);
    storage.failAt('remove:current');
    const oldContinuation = requireContinuation(
      recoverCampaign(storage, loaded, RECOVERY_OPTIONS),
    );
    const external = {
      currentRaw: envelopeRaw(acceptedJournal(505), 902, 'external-v2'),
      previousRaw: '{external-corrupt-previous',
    };
    storage.clearFaultsAndHooks();
    storage.installRevision(external);
    storage.resetObservations();
    expect(continueRecovery(storage, oldContinuation, 'continue')).toMatchObject({
      ok: false,
      reason: 'external-revision-conflict',
    });

    storage.resetObservations();
    const freshLoad = loadedFrom(storage);
    const freshOptions = { ...RECOVERY_OPTIONS, quarantineId: 'repair-external-2' };
    const freshResult = recoverCampaign(storage, freshLoad, freshOptions);

    expect(freshResult).toMatchObject({ ok: true, kind: 'recovered' });
    expect(storage.operations.slice(0, 9)).toEqual([
      'get:current', 'get:previous', 'get:quarantine',
      'set:quarantine', 'get:quarantine',
      'get:current', 'get:previous',
      'get:quarantine', 'remove:previous',
    ]);
    expect(storage.raw(oldContinuation.quarantineKey)).toBe(oldContinuation.quarantineRaw);
    expect(storage.raw(quarantineKey(freshOptions.quarantineId))).not.toBeNull();
  });

  it('rejects an unlisted revision even when it resembles a remove outcome', () => {
    const source = corruptCurrentRevision();
    const storage = new ScriptedStorage(source);
    const loaded = loadedFrom(storage);
    storage.failAt('remove:current', 1, 'after');
    storage.failAt('get:current', 3);
    const continuation = requireContinuation(
      recoverCampaign(storage, loaded, RECOVERY_OPTIONS),
    );
    const unlisted = { currentRaw: null, previousRaw: '{not-source-previous' };
    storage.clearFaultsAndHooks();
    storage.installRevision(unlisted);
    storage.resetObservations();

    expect(continueRecovery(storage, continuation, 'continue')).toMatchObject({
      ok: false,
      reason: 'external-revision-conflict',
      actualRevision: unlisted,
      sourceRevision: source,
    });
    expect(storage.revision()).toEqual(unlisted);
    expect(storage.operations.filter((entry) => entry.startsWith('remove:'))).toEqual([]);
  });
});
