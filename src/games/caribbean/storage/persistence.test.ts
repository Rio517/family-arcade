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
  saveCampaign,
  type ActiveSaveRevision,
  type StorageLike,
  type StorageOperation,
} from './persistence';
import type { SaveEnvelopeV1 } from './schema';

const EMPTY_REVISION: ActiveSaveRevision = {
  currentRaw: null,
  previousRaw: null,
};

function initialJournal(): CampaignJournal {
  return createJournal(createCampaign({
    seed: 1702,
    name: 'Morgan',
    pronouns: 'they/them',
    talent: 'navigation',
    length: 'adventure',
  }));
}

function acceptedJournal(): CampaignJournal {
  return appendJournal(initialJournal(), {
    type: 'lead-accepted',
    payload: { leadId: 'red-jackdaw' },
  });
}

function journalWithLegalTrades(count: number): CampaignJournal {
  let journal = initialJournal();
  for (let index = 0; index < count; index += 1) {
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
  build = 'test-build',
): string {
  const envelope: SaveEnvelopeV1 = {
    version: 1,
    build,
    savedAt,
    checksum: checksumPayload(journal),
    payload: journal,
  };
  return canonicalJson(envelope);
}

class MemoryStorage implements StorageLike {
  readonly failures = new Set<StorageOperation>();
  readonly writes: StorageOperation[] = [];
  removeCalls = 0;
  private readonly values = new Map<string, string>();

  constructor(initial: ActiveSaveRevision = EMPTY_REVISION) {
    if (initial.currentRaw !== null) this.values.set(CURRENT_SAVE_KEY, initial.currentRaw);
    if (initial.previousRaw !== null) this.values.set(PREVIOUS_SAVE_KEY, initial.previousRaw);
  }

  getItem(key: string): string | null {
    const operation = this.readOperation(key);
    if (this.failures.has(operation)) throw new Error(`blocked ${operation}`);
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    const operation = this.writeOperation(key);
    if (this.failures.has(operation)) throw new Error(`blocked ${operation}`);
    this.values.set(key, value);
    this.writes.push(operation);
  }

  removeItem(key: string): void {
    this.removeCalls += 1;
    this.values.delete(key);
  }

  revision(): ActiveSaveRevision {
    return {
      currentRaw: this.values.get(CURRENT_SAVE_KEY) ?? null,
      previousRaw: this.values.get(PREVIOUS_SAVE_KEY) ?? null,
    };
  }

  resetWrites(): void {
    this.writes.length = 0;
  }

  private readOperation(key: string): StorageOperation {
    if (key === CURRENT_SAVE_KEY) return 'read-current';
    if (key === PREVIOUS_SAVE_KEY) return 'read-previous';
    throw new Error(`Unexpected read key ${key}`);
  }

  private writeOperation(key: string): StorageOperation {
    if (key === CURRENT_SAVE_KEY) return 'write-current';
    if (key === PREVIOUS_SAVE_KEY) return 'write-previous';
    throw new Error(`Unexpected write key ${key}`);
  }
}

function saveSuccessfully(
  storage: MemoryStorage,
  journal: CampaignJournal,
  expectedRevision: ActiveSaveRevision,
  savedAt: number,
) {
  const result = saveCampaign(storage, journal, {
    build: 'test-build',
    savedAt,
    expectedRevision,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`Expected save success, received ${result.reason}`);
  return result;
}

describe('loadCampaign', () => {
  it('loads an empty store without writing or deleting', () => {
    const storage = new MemoryStorage();

    expect(loadCampaign(storage)).toEqual({ kind: 'empty', revision: EMPTY_REVISION });
    expect(storage.revision()).toEqual(EMPTY_REVISION);
    expect(storage.writes).toEqual([]);
    expect(storage.removeCalls).toBe(0);
  });

  it('prefers a valid current save and leaves two valid snapshots byte-identical', () => {
    const currentJournal = acceptedJournal();
    const previousJournal = initialJournal();
    const revision = {
      currentRaw: envelopeRaw(currentJournal, 200, 'current'),
      previousRaw: envelopeRaw(previousJournal, 100, 'previous'),
    };
    const storage = new MemoryStorage(revision);

    expect(loadCampaign(storage)).toEqual({
      kind: 'loaded',
      journal: currentJournal,
      savedAt: 200,
      build: 'current',
      recovered: false,
      unreadableSlots: [],
      revision,
    });
    expect(storage.revision()).toEqual(revision);
    expect(storage.writes).toEqual([]);
    expect(storage.removeCalls).toBe(0);
  });

  it('recovers a valid previous snapshot while exposing corrupt current bytes', () => {
    const journal = initialJournal();
    const revision = {
      currentRaw: '{broken-current',
      previousRaw: envelopeRaw(journal, 100, 'previous'),
    };
    const storage = new MemoryStorage(revision);

    expect(loadCampaign(storage)).toEqual({
      kind: 'loaded',
      journal,
      savedAt: 100,
      build: 'previous',
      recovered: true,
      unreadableSlots: [{
        slot: 'current',
        raw: '{broken-current',
        code: 'malformed-json',
      }],
      revision,
    });
    expect(storage.revision()).toEqual(revision);
    expect(storage.writes).toEqual([]);
    expect(storage.removeCalls).toBe(0);
  });

  it('loads valid current while exposing a degraded corrupt previous backup', () => {
    const journal = acceptedJournal();
    const revision = {
      currentRaw: envelopeRaw(journal, 200, 'current'),
      previousRaw: '{broken-previous',
    };
    const storage = new MemoryStorage(revision);

    expect(loadCampaign(storage)).toEqual({
      kind: 'loaded',
      journal,
      savedAt: 200,
      build: 'current',
      recovered: false,
      unreadableSlots: [{
        slot: 'previous',
        raw: '{broken-previous',
        code: 'malformed-json',
      }],
      revision,
    });
    expect(storage.revision()).toEqual(revision);
    expect(storage.writes).toEqual([]);
  });

  it('loads an orphaned valid previous snapshot as recovered without rewriting it', () => {
    const journal = initialJournal();
    const revision = {
      currentRaw: null,
      previousRaw: envelopeRaw(journal, 90, 'previous'),
    };
    const storage = new MemoryStorage(revision);

    expect(loadCampaign(storage)).toMatchObject({
      kind: 'loaded',
      journal,
      savedAt: 90,
      recovered: true,
      unreadableSlots: [],
      revision,
    });
    expect(storage.revision()).toEqual(revision);
    expect(storage.writes).toEqual([]);
  });

  it('returns both unreadable slots in stable current/previous order without mutation', () => {
    const revision = {
      currentRaw: '{broken-current',
      previousRaw: '{broken-previous',
    };
    const storage = new MemoryStorage(revision);

    expect(loadCampaign(storage)).toEqual({
      kind: 'unreadable',
      unreadableSlots: [
        { slot: 'current', raw: '{broken-current', code: 'malformed-json' },
        { slot: 'previous', raw: '{broken-previous', code: 'malformed-json' },
      ],
      revision,
    });
    expect(storage.revision()).toEqual(revision);
    expect(storage.writes).toEqual([]);
  });

  it.each([
    ['malformed JSON', '{broken', 'malformed-json'],
    ['checksum mismatch', canonicalJson({
      ...JSON.parse(envelopeRaw(initialJournal())),
      checksum: '00000000',
    }), 'checksum-mismatch'],
    ['unsupported version', canonicalJson({
      ...JSON.parse(envelopeRaw(initialJournal())),
      version: 2,
      checksum: '00000000',
    }), 'unsupported-version'],
    ['replay divergence', (() => {
      const journal = acceptedJournal();
      journal.state.wealth.gold += 1;
      return envelopeRaw(journal);
    })(), 'replay-mismatch'],
  ] as const)('reports exact unreadable reason for %s and preserves raw bytes', (_label, raw, code) => {
    const revision = { currentRaw: raw, previousRaw: null };
    const storage = new MemoryStorage(revision);

    expect(loadCampaign(storage)).toEqual({
      kind: 'unreadable',
      unreadableSlots: [{ slot: 'current', raw, code }],
      revision,
    });
    expect(storage.revision()).toEqual(revision);
    expect(storage.writes).toEqual([]);
  });

  it.each([
    ['read-current', 'read-current'],
    ['read-previous', 'read-previous'],
  ] as const)('returns the exact %s storage failure without writes', (failure, operation) => {
    const storage = new MemoryStorage();
    storage.failures.add(failure);

    expect(loadCampaign(storage)).toEqual({ kind: 'storage-unavailable', operation });
    expect(storage.writes).toEqual([]);
    expect(storage.removeCalls).toBe(0);
  });
});

describe('saveCampaign', () => {
  it('compacts a validated oversized journal before checksumming and saving it', () => {
    const storage = new MemoryStorage();
    const journal = journalWithLegalTrades(257);

    const result = saveSuccessfully(storage, journal, EMPTY_REVISION, 100);

    expect(result.journal.events).toEqual([]);
    expect(result.journal.initial).toEqual(journal.state);
    expect(result.journal.state).toEqual(journal.state);
    expect(loadCampaign(storage)).toMatchObject({ kind: 'loaded', journal: result.journal });
  });

  it('publishes a verified first save to the exact current key', () => {
    const storage = new MemoryStorage();
    const journal = initialJournal();
    const before = structuredClone(journal);

    const result = saveSuccessfully(storage, journal, EMPTY_REVISION, 100);
    const expectedCurrent = envelopeRaw(journal, 100);

    expect(result).toEqual({
      ok: true,
      journal,
      checksum: checksumPayload(journal),
      revision: { currentRaw: expectedCurrent, previousRaw: null },
    });
    expect(storage.revision()).toEqual(result.revision);
    expect(storage.writes).toEqual(['write-current']);
    expect(storage.removeCalls).toBe(0);
    expect(journal).toEqual(before);
  });

  it('rotates only the verified current raw bytes before publishing a second save', () => {
    const storage = new MemoryStorage();
    const firstJournal = initialJournal();
    const first = saveSuccessfully(storage, firstJournal, EMPTY_REVISION, 100);
    storage.resetWrites();
    const secondJournal = acceptedJournal();

    const second = saveSuccessfully(storage, secondJournal, first.revision, 200);

    expect(second.revision).toEqual({
      currentRaw: envelopeRaw(secondJournal, 200),
      previousRaw: first.revision.currentRaw,
    });
    expect(storage.revision()).toEqual(second.revision);
    expect(storage.writes).toEqual(['write-previous', 'write-current']);
    expect(loadCampaign(storage)).toMatchObject({
      kind: 'loaded',
      journal: secondJournal,
      recovered: false,
    });
  });

  it('supports same-page sequential saves using each returned exact revision', () => {
    const storage = new MemoryStorage();
    const first = saveSuccessfully(storage, initialJournal(), EMPTY_REVISION, 100);
    const second = saveSuccessfully(storage, acceptedJournal(), first.revision, 200);
    const thirdJournal = acceptedJournal();

    const third = saveSuccessfully(storage, thirdJournal, second.revision, 300);

    expect(third.revision).toEqual({
      currentRaw: envelopeRaw(thirdJournal, 300),
      previousRaw: second.revision.currentRaw,
    });
    expect(storage.revision()).toEqual(third.revision);
  });

  it('rejects an invalid or replay-divergent journal before any storage read or write', () => {
    const storage = new MemoryStorage();
    storage.failures.add('read-current');
    const journal = acceptedJournal();
    journal.state.wealth.gold += 1;
    const before = structuredClone(journal);

    expect(saveCampaign(storage, journal, {
      build: 'test-build',
      savedAt: 100,
      expectedRevision: EMPTY_REVISION,
    })).toEqual({
      ok: false,
      reason: 'invalid-journal',
      issues: [{ path: 'state', code: 'replay-mismatch' }],
    });
    expect(journal).toEqual(before);
    expect(storage.writes).toEqual([]);
  });

  it.each([
    ['current', {
      currentRaw: '{broken-current',
      previousRaw: envelopeRaw(initialJournal(), 50, 'previous'),
    }],
    ['previous', {
      currentRaw: envelopeRaw(initialJournal(), 50, 'current'),
      previousRaw: '{broken-previous',
    }],
  ] as const)('refuses to autosave over an unreadable occupied %s slot', (_slot, revision) => {
    const storage = new MemoryStorage(revision);

    const result = saveCampaign(storage, acceptedJournal(), {
      build: 'test-build',
      savedAt: 200,
      expectedRevision: revision,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'unreadable-active-save',
      unreadableSlots: _slot === 'current'
        ? [{ slot: 'current', raw: revision.currentRaw, code: 'malformed-json' }]
        : [{ slot: 'previous', raw: revision.previousRaw, code: 'malformed-json' }],
      revision,
    });
    expect(storage.revision()).toEqual(revision);
    expect(storage.writes).toEqual([]);
    expect(storage.removeCalls).toBe(0);
  });

  it('preserves current when copying it to previous fails', () => {
    const storage = new MemoryStorage();
    const first = saveSuccessfully(storage, initialJournal(), EMPTY_REVISION, 100);
    storage.resetWrites();
    storage.failures.add('write-previous');
    const before = storage.revision();

    expect(saveCampaign(storage, acceptedJournal(), {
      build: 'test-build',
      savedAt: 200,
      expectedRevision: first.revision,
    })).toEqual({
      ok: false,
      reason: 'storage-unavailable',
      operation: 'write-previous',
    });
    expect(storage.revision()).toEqual(before);
    expect(storage.writes).toEqual([]);
  });

  it('keeps old current valid and leaves its verified copy in previous when current publish fails', () => {
    const storage = new MemoryStorage();
    const first = saveSuccessfully(storage, initialJournal(), EMPTY_REVISION, 100);
    const second = saveSuccessfully(storage, acceptedJournal(), first.revision, 200);
    storage.resetWrites();
    storage.failures.add('write-current');

    expect(saveCampaign(storage, acceptedJournal(), {
      build: 'test-build',
      savedAt: 300,
      expectedRevision: second.revision,
    })).toEqual({
      ok: false,
      reason: 'storage-unavailable',
      operation: 'write-current',
    });
    expect(storage.revision()).toEqual({
      currentRaw: second.revision.currentRaw,
      previousRaw: second.revision.currentRaw,
    });
    expect(storage.writes).toEqual(['write-previous']);
    expect(loadCampaign(storage)).toMatchObject({
      kind: 'loaded',
      journal: acceptedJournal(),
      recovered: false,
    });
  });

  it.each([
    ['read-current', 'read-current'],
    ['read-previous', 'read-previous'],
  ] as const)('returns exact %s failure during revision read without writing', (failure, operation) => {
    const storage = new MemoryStorage();
    storage.failures.add(failure);

    expect(saveCampaign(storage, initialJournal(), {
      build: 'test-build',
      savedAt: 100,
      expectedRevision: EMPTY_REVISION,
    })).toEqual({
      ok: false,
      reason: 'storage-unavailable',
      operation,
    });
    expect(storage.writes).toEqual([]);
  });

  it.each([
    ['stale current', (actual: ActiveSaveRevision) => ({
      currentRaw: null,
      previousRaw: actual.previousRaw,
    })],
    ['stale previous', (actual: ActiveSaveRevision) => ({
      currentRaw: actual.currentRaw,
      previousRaw: 'stale-previous',
    })],
  ] as const)('returns save-conflict for an exact %s revision mismatch without writes', (_label, staleRevision) => {
    const storage = new MemoryStorage();
    const first = saveSuccessfully(storage, initialJournal(), EMPTY_REVISION, 100);
    storage.resetWrites();
    const expected = staleRevision(first.revision);

    expect(saveCampaign(storage, acceptedJournal(), {
      build: 'test-build',
      savedAt: 200,
      expectedRevision: expected,
    })).toEqual({
      ok: false,
      reason: 'save-conflict',
      expected,
      actual: first.revision,
    });
    expect(storage.revision()).toEqual(first.revision);
    expect(storage.writes).toEqual([]);
  });

  it('checks exact revision before parsing an unreadable active slot', () => {
    const actual = { currentRaw: '{broken', previousRaw: null };
    const storage = new MemoryStorage(actual);

    expect(saveCampaign(storage, initialJournal(), {
      build: 'test-build',
      savedAt: 100,
      expectedRevision: EMPTY_REVISION,
    })).toEqual({
      ok: false,
      reason: 'save-conflict',
      expected: EMPTY_REVISION,
      actual,
    });
    expect(storage.revision()).toEqual(actual);
    expect(storage.writes).toEqual([]);
  });
});
