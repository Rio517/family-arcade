import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { canonicalJson } from '../canonicalJson';
import { createCampaign } from '../domain/createCampaign';
import type { CampaignJournal } from '../domain/events';
import { quoteTrade, marketTradeDraft } from '../domain/economy';
import { appendJournal, createJournal } from '../domain/replay';
import {
  CURRENT_SAVE_KEY,
  PREVIOUS_SAVE_KEY,
  loadCampaign,
  saveCampaign,
  type StorageLike,
} from '../storage/persistence';
import { QUARANTINE_KEY_PREFIX } from '../storage/recovery';
import {
  createCampaignWriter,
  type CampaignWriter,
  type LockManagerLike,
  type WriterRunResult,
} from '../storage/writer';
import type { CaribbeanRuntime } from './runtime';
import { useCaribbean, type CaribbeanController } from './useCaribbean';

type MemoryStorage = StorageLike & {
  getItem: ReturnType<typeof vi.fn<(key: string) => string | null>>;
  setItem: ReturnType<typeof vi.fn<(key: string, value: string) => void>>;
  removeItem: ReturnType<typeof vi.fn<(key: string) => void>>;
};

function memoryStorage(initial: Record<string, string> = {}): MemoryStorage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, value); }),
    removeItem: vi.fn((key: string) => { data.delete(key); }),
  };
}

function readFailureStorage(operation: 'read-current' | 'read-previous'): MemoryStorage {
  const storage = memoryStorage();
  const read = storage.getItem.getMockImplementation()!;
  storage.getItem.mockImplementation((key) => {
    if (
      operation === 'read-current' && key === CURRENT_SAVE_KEY
      || operation === 'read-previous' && key === PREVIOUS_SAVE_KEY
    ) throw new DOMException(operation, 'SecurityError');
    return read(key);
  });
  return storage;
}

const immediateLocks: LockManagerLike = {
  async request(_name, _options, callback) {
    return await callback({});
  },
};

function deniedLocks(error = new Error('denied')): LockManagerLike {
  return {
    async request() {
      throw error;
    },
  };
}

function denyAfterFirstLock(error = new Error('denied')): LockManagerLike {
  let requests = 0;
  return {
    async request(_name, _options, callback) {
      requests += 1;
      if (requests > 1) throw error;
      return await callback({});
    },
  };
}

function deferredLocks() {
  let callback: (() => unknown | PromiseLike<unknown>) | null = null;
  let resolveRequest: ((value: unknown) => void) | null = null;
  let rejectRequest: ((error: unknown) => void) | null = null;
  const request = vi.fn((_name: string, _options: { mode: 'exclusive' }, next: (lock: unknown) => unknown | PromiseLike<unknown>) => {
    callback = () => next({});
    return new Promise((resolve, reject) => {
      resolveRequest = resolve;
      rejectRequest = reject;
    });
  });
  return {
    locks: { request } as LockManagerLike,
    request,
    async acquire() {
      if (!callback || !resolveRequest) throw new Error('No pending lock request');
      try {
        resolveRequest(await callback());
      } catch (error) {
        rejectRequest?.(error);
      }
    },
  };
}

function runtime(options: {
  storage?: MemoryStorage;
  locks?: LockManagerLike | null;
  storageError?: unknown;
  seed?: number;
  now?: number[];
  quarantineIds?: string[];
} = {}): CaribbeanRuntime & { makeSeed: ReturnType<typeof vi.fn<() => number>> } {
  const storage = options.storage ?? memoryStorage();
  const times = [...(options.now ?? [100, 200, 300, 400, 500])];
  const ids = [...(options.quarantineIds ?? ['00000000-0000-4000-8000-000000000001'])];
  return {
    storage,
    storageCapability: options.storageError === undefined
      ? { kind: 'available' }
      : { kind: 'unavailable', error: options.storageError },
    writer: createCampaignWriter(options.locks === undefined ? immediateLocks : options.locks),
    build: 'test-build',
    now: vi.fn(() => times.shift() ?? 999),
    makeSeed: vi.fn(() => options.seed ?? 1702),
    makeQuarantineId: vi.fn(() => ids.shift() ?? '00000000-0000-4000-8000-000000000099'),
  };
}

type WriterFailureTag = 'unavailable' | 'denied' | 'operation-threw' | 'writer-protocol-failure';

function failedWriter(tag: WriterFailureTag, error: Error): CampaignWriter {
  return {
    capability: tag === 'unavailable' ? 'unavailable' : 'available',
    async run<T>(): Promise<WriterRunResult<T>> {
      if (tag === 'unavailable') return { kind: 'acquisition-failed', reason: 'unavailable' };
      if (tag === 'denied') return { kind: 'acquisition-failed', reason: 'denied', error };
      return { kind: tag, error };
    },
  };
}

function recoveryFailureOf(controller: CaribbeanController): unknown {
  return controller.recoveryFailure;
}

function persist(storage: MemoryStorage, journal: CampaignJournal, savedAt = 10): CampaignJournal {
  const result = saveCampaign(storage, journal, {
    build: 'fixture',
    savedAt,
    expectedRevision: loadCampaign(storage).kind === 'empty'
      ? { currentRaw: null, previousRaw: null }
      : (loadCampaign(storage) as Extract<ReturnType<typeof loadCampaign>, { kind: 'loaded' }>).revision,
  });
  if (!result.ok) throw new Error(`fixture save failed: ${result.reason}`);
  return result.journal;
}

const MORGAN = {
  name: 'Morgan',
  pronouns: 'they/them',
  talent: 'navigation' as const,
  length: 'adventure' as const,
};

describe('useCaribbean', () => {
  it('starts empty without constructing a campaign', () => {
    const injected = runtime();
    const { result } = renderHook(() => useCaribbean(injected));

    expect(result.current.load.kind).toBe('empty');
    expect(result.current.journal).toBeNull();
    expect(result.current.persistence).toEqual({ kind: 'persisted' });
    expect(result.current.activity).toBe('menu');
    expect(injected.makeSeed).not.toHaveBeenCalled();
  });

  it('sets busy synchronously, rejects a second same-page start, and saves one deterministic campaign', async () => {
    const deferred = deferredLocks();
    const storage = memoryStorage();
    const injected = runtime({ storage, locks: deferred.locks, seed: 1702 });
    const { result } = renderHook(() => useCaribbean(injected));

    let starting!: Promise<void>;
    act(() => {
      starting = result.current.start(MORGAN);
      void result.current.start({ ...MORGAN, name: 'Duplicate' });
    });
    expect(result.current.busy).toBe(true);
    await act(async () => { await Promise.resolve(); });
    expect(deferred.request).toHaveBeenCalledTimes(1);

    await act(async () => {
      await deferred.acquire();
      await starting;
    });

    expect(result.current.busy).toBe(false);
    expect(result.current.journal?.state.captain.name).toBe('Morgan');
    expect(result.current.journal?.state.seed).toBe(1702);
    expect(result.current.journal?.state.lastEventId).toBe(0);
    expect(injected.makeSeed).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
  });

  it('does not construct or publish a campaign before explicit memory-only consent when storage access failed', async () => {
    const denied = new DOMException('Storage denied', 'SecurityError');
    const storage = memoryStorage();
    const injected = runtime({ storage, storageError: denied });
    const { result } = renderHook(() => useCaribbean(injected));

    await act(() => result.current.start(MORGAN));

    expect(result.current.journal).toBeNull();
    expect(result.current.persistence).toMatchObject({
      kind: 'consent-required',
      intent: 'start',
      failure: { kind: 'storage-unavailable', detail: { kind: 'runtime-access', error: denied } },
    });
    expect(injected.makeSeed).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();

    act(() => result.current.continueWithoutSaving());

    expect(injected.makeSeed).toHaveBeenCalledTimes(1);
    expect(result.current.journal?.state.captain.name).toBe('Morgan');
    expect(result.current.persistence).toEqual({
      kind: 'memory-only',
      reason: 'storage-unavailable',
      canRetrySaving: false,
    });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it.each(['read-current', 'read-previous'] as const)(
    'retains an initial %s operation failure until explicit memory-only consent',
    async (operation) => {
      const storage = readFailureStorage(operation);
      const injected = runtime({ storage });
      const writerRun = vi.spyOn(injected.writer, 'run');
      const { result } = renderHook(() => useCaribbean(injected));

      expect(result.current.load).toEqual({ kind: 'storage-unavailable', operation });
      await act(() => result.current.start(MORGAN));

      expect(result.current.journal).toBeNull();
      expect(result.current.persistence).toMatchObject({
        kind: 'consent-required',
        intent: 'start',
        failure: {
          kind: 'storage-unavailable',
          detail: { kind: 'operation', result: { kind: 'storage-unavailable', operation } },
        },
      });
      expect(injected.makeSeed).not.toHaveBeenCalled();
      expect(writerRun).not.toHaveBeenCalled();
      expect(storage.setItem).not.toHaveBeenCalled();

      act(() => result.current.continueWithoutSaving());
      expect(injected.makeSeed).toHaveBeenCalledTimes(1);
      expect(result.current.journal?.state.captain.name).toBe('Morgan');
      expect(result.current.persistence).toEqual({
        kind: 'memory-only', reason: 'storage-unavailable', canRetrySaving: true,
      });
      expect(storage.setItem).not.toHaveBeenCalled();
    },
  );

  it('does not construct a campaign before explicit consent when safe writer ownership is unavailable', async () => {
    const storage = memoryStorage();
    const injected = runtime({ storage, locks: null });
    const { result } = renderHook(() => useCaribbean(injected));

    await act(() => result.current.start(MORGAN));

    expect(result.current.journal).toBeNull();
    expect(result.current.persistence).toMatchObject({
      kind: 'consent-required',
      intent: 'start',
      failure: { kind: 'writer-unavailable' },
    });
    expect(injected.makeSeed).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();

    act(() => result.current.continueWithoutSaving());
    expect(injected.makeSeed).toHaveBeenCalledTimes(1);
    expect(result.current.journal?.state.captain.name).toBe('Morgan');
    expect(result.current.persistence).toEqual({
      kind: 'memory-only', reason: 'writer-unavailable', canRetrySaving: false,
    });
  });

  it('retains an operation-uncertain writer failure until explicit memory-only consent', async () => {
    const storage = memoryStorage();
    const injected = runtime({ storage });
    const uncertain = new Error('lock callback outcome unknown');
    injected.writer = {
      capability: 'available',
      async run() { return { kind: 'operation-threw', error: uncertain }; },
    } as CaribbeanRuntime['writer'];
    const { result } = renderHook(() => useCaribbean(injected));

    await act(() => result.current.start(MORGAN));

    expect(result.current.journal).toBeNull();
    expect(result.current.persistence).toMatchObject({
      kind: 'consent-required',
      failure: { kind: 'operation-uncertain', writer: { kind: 'operation-threw', error: uncertain } },
    });
    expect(injected.makeSeed).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();

    act(() => result.current.continueWithoutSaving());
    expect(result.current.journal?.state.captain.name).toBe('Morgan');
    expect(result.current.persistence).toEqual({
      kind: 'memory-only', reason: 'operation-uncertain', canRetrySaving: true,
    });
  });

  it('requires writer consent before resume and performs no write', async () => {
    const storage = memoryStorage();
    const saved = persist(storage, createJournal(createCampaign({ seed: 11, name: 'Anne' })));
    storage.setItem.mockClear();
    const injected = runtime({ storage, locks: deniedLocks() });
    const { result } = renderHook(() => useCaribbean(injected));

    await act(() => result.current.resume());

    expect(result.current.journal).toBeNull();
    expect(result.current.persistence).toMatchObject({ kind: 'consent-required', intent: 'resume' });
    expect(storage.setItem).not.toHaveBeenCalled();

    act(() => result.current.continueWithoutSaving());
    expect(result.current.journal).toEqual(saved);
    expect(result.current.persistence).toMatchObject({ kind: 'memory-only' });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('holds degraded saves at recovery and never resumes them directly', async () => {
    const storage = memoryStorage();
    persist(storage, createJournal(createCampaign({ seed: 11 })));
    persist(storage, createJournal(createCampaign({ seed: 12 })));
    storage.setItem(CURRENT_SAVE_KEY, '{corrupt');
    storage.setItem.mockClear();
    const injected = runtime({ storage });
    const { result } = renderHook(() => useCaribbean(injected));

    expect(result.current.load).toMatchObject({ kind: 'loaded', recovered: true });
    expect(result.current.persistence).toEqual({ kind: 'recovery-required' });

    await act(() => result.current.resume());
    expect(result.current.journal).toBeNull();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('uses one writer call per mutation while port navigation remains transient', async () => {
    const storage = memoryStorage();
    const injected = runtime({ storage });
    const writerRun = vi.spyOn(injected.writer, 'run');
    const { result } = renderHook(() => useCaribbean(injected));
    await act(() => result.current.start(MORGAN));
    const writes = storage.setItem.mock.calls.length;

    act(() => result.current.selectActivity('market'));
    expect(result.current.activity).toBe('market');
    expect(result.current.journal?.state.lastEventId).toBe(0);
    expect(storage.setItem).toHaveBeenCalledTimes(writes);
    act(() => result.current.closeActivity());
    expect(result.current.activity).toBe('menu');

    let outcome!: Awaited<ReturnType<CaribbeanController['dispatch']>>;
    await act(async () => {
      outcome = await result.current.dispatch({
        type: 'lead-accepted',
        payload: { leadId: 'red-jackdaw' },
      });
    });
    expect(outcome).toEqual({ kind: 'applied', eventId: 1 });
    expect(result.current.journal?.state.lastEventId).toBe(1);
    expect(writerRun).toHaveBeenCalledTimes(2);
  });

  it('returns not-applied when an event cannot become the published journal', async () => {
    const storage = memoryStorage();
    persist(storage, createJournal(createCampaign({ seed: 11 })));
    const injected = runtime({ storage, locks: denyAfterFirstLock() });
    const { result } = renderHook(() => useCaribbean(injected));
    await act(() => result.current.resume());

    let outcome!: Awaited<ReturnType<CaribbeanController['dispatch']>>;
    await act(async () => {
      outcome = await result.current.dispatch({ type: 'lead-accepted', payload: { leadId: 'red-jackdaw' } });
    });

    expect(outcome).toEqual({ kind: 'not-applied' });
    expect(result.current.journal?.state.lastEventId).toBe(0);
    expect(result.current.persistence).toMatchObject({ kind: 'consent-required', intent: 'event' });
  });

  it('rejects a synchronous second dispatch before React can rerender', async () => {
    const storage = memoryStorage();
    persist(storage, createJournal(createCampaign({ seed: 11 })));
    const injected = runtime({ storage });
    const { result } = renderHook(() => useCaribbean(injected));
    await act(() => result.current.resume());
    const deferred = deferredLocks();
    injected.writer = createCampaignWriter(deferred.locks);

    let dispatching!: ReturnType<CaribbeanController['dispatch']>;
    act(() => {
      dispatching = result.current.dispatch({
        type: 'lead-accepted',
        payload: { leadId: 'red-jackdaw' },
      });
      void result.current.dispatch({
        type: 'lead-accepted',
        payload: { leadId: 'red-jackdaw' },
      });
    });
    await act(async () => { await Promise.resolve(); });

    expect(deferred.request).toHaveBeenCalledTimes(1);
    await act(async () => {
      await deferred.acquire();
      await dispatching;
    });
    expect(result.current.journal?.state.lastEventId).toBe(1);
    expect(result.current.journal?.events).toHaveLength(1);
  });

  it('holds a denied event candidate until explicit memory-only consent', async () => {
    const storage = memoryStorage();
    persist(storage, createJournal(createCampaign({ seed: 11 })));
    const injected = runtime({ storage, locks: denyAfterFirstLock() });
    const { result } = renderHook(() => useCaribbean(injected));
    await act(() => result.current.resume());

    await act(() => result.current.dispatch({ type: 'lead-accepted', payload: { leadId: 'red-jackdaw' } }));

    expect(result.current.journal?.state.lastEventId).toBe(0);
    expect(result.current.persistence).toMatchObject({ kind: 'consent-required', intent: 'event' });
    act(() => result.current.continueWithoutSaving());
    expect(result.current.journal?.state.lastEventId).toBe(1);
    expect(result.current.persistence).toMatchObject({ kind: 'memory-only' });
  });

  it('reconciles a write-current exception as success when the candidate is already active', async () => {
    const storage = memoryStorage();
    persist(storage, createJournal(createCampaign({ seed: 11 })));
    const injected = runtime({ storage });
    const { result } = renderHook(() => useCaribbean(injected));
    await act(() => result.current.resume());
    const realSet = storage.setItem.getMockImplementation()!;
    let reportFailure = true;
    storage.setItem.mockImplementation((key, value) => {
      realSet(key, value);
      if (key === CURRENT_SAVE_KEY && reportFailure) {
        reportFailure = false;
        throw new Error('write committed before failure was reported');
      }
    });

    await act(() => result.current.dispatch({
      type: 'lead-accepted', payload: { leadId: 'red-jackdaw' },
    }));

    expect(result.current.persistence).toEqual({ kind: 'persisted' });
    expect(result.current.journal?.state.lastEventId).toBe(1);
    expect(loadCampaign(storage)).toMatchObject({
      kind: 'loaded', journal: { state: { lastEventId: 1 } },
    });
  });

  it.each([
    ['write-previous', PREVIOUS_SAVE_KEY],
    ['write-current', CURRENT_SAVE_KEY],
  ] as const)(
    'retains typed %s uncertainty when the outcome reread fails',
    async (operation, failedKey) => {
      const storage = memoryStorage();
      persist(storage, createJournal(createCampaign({ seed: 11 })));
      const injected = runtime({ storage });
      const { result } = renderHook(() => useCaribbean(injected));
      await act(() => result.current.resume());
      const read = storage.getItem.getMockImplementation()!;
      const write = storage.setItem.getMockImplementation()!;
      let outcomeReadFails = false;
      storage.getItem.mockImplementation((key) => {
        if (outcomeReadFails) throw new DOMException('reread denied', 'SecurityError');
        return read(key);
      });
      storage.setItem.mockImplementation((key, value) => {
        if (key === failedKey) {
          outcomeReadFails = true;
          throw new Error(`${operation} reported failure`);
        }
        write(key, value);
      });

      await act(() => result.current.dispatch({
        type: 'lead-accepted', payload: { leadId: 'red-jackdaw' },
      }));

      expect(result.current.journal?.state.lastEventId).toBe(0);
      expect(result.current.persistence).toMatchObject({
        kind: 'consent-required',
        intent: 'event',
        failure: {
          kind: 'operation-uncertain',
          writeFailure: { ok: false, reason: 'storage-unavailable', operation },
          outcomeReadFailure: { kind: 'storage-unavailable', operation: 'read-current' },
        },
      });
      expect(result.current.exportInMemoryJournal()).toContain('lead-accepted');
    },
  );

  it.each([
    ['write-previous', PREVIOUS_SAVE_KEY],
    ['write-current', CURRENT_SAVE_KEY],
  ] as const)(
    'freezes a degraded active reread after %s as conflict and retains the local fork',
    async (operation, failedKey) => {
      const storage = memoryStorage();
      persist(storage, createJournal(createCampaign({ seed: 10, name: 'Previous' })));
      persist(storage, createJournal(createCampaign({ seed: 11, name: 'Active' })));
      const injected = runtime({ storage });
      const { result } = renderHook(() => useCaribbean(injected));
      await act(() => result.current.resume());
      const write = storage.setItem.getMockImplementation()!;
      storage.setItem.mockImplementation((key, value) => {
        if (key === failedKey) {
          write(CURRENT_SAVE_KEY, '{corrupt');
          throw new Error(`${operation} reported failure`);
        }
        write(key, value);
      });

      let outcome!: Awaited<ReturnType<CaribbeanController['dispatch']>>;
      await act(async () => {
        outcome = await result.current.dispatch({
          type: 'lead-accepted', payload: { leadId: 'red-jackdaw' },
        });
      });

      expect(outcome).toEqual({ kind: 'not-applied' });
      expect(result.current.persistence.kind).toBe('save-conflict');
      expect(result.current.journal?.state.captain.name).toBe('Active');
      const candidate = result.current.exportInMemoryJournal();
      expect(candidate).toContain('lead-accepted');
      await act(() => result.current.recover());
      expect(result.current.persistence.kind).toBe('save-conflict');
      expect(result.current.exportInMemoryJournal()).toBe(candidate);
    },
  );

  it.each([
    ['write-previous', PREVIOUS_SAVE_KEY],
    ['write-current', CURRENT_SAVE_KEY],
  ] as const)(
    'freezes a different readable active after %s as conflict without adopting it',
    async (operation, failedKey) => {
      const storage = memoryStorage();
      persist(storage, createJournal(createCampaign({ seed: 11, name: 'Original' })));
      const externalStorage = memoryStorage();
      persist(externalStorage, createJournal(createCampaign({ seed: 99, name: 'External' })));
      const external = loadCampaign(externalStorage);
      if (external.kind !== 'loaded' || external.revision.currentRaw === null) {
        throw new Error('external fixture save failed');
      }
      const injected = runtime({ storage });
      const { result } = renderHook(() => useCaribbean(injected));
      await act(() => result.current.resume());
      const write = storage.setItem.getMockImplementation()!;
      storage.setItem.mockImplementation((key, value) => {
        if (key === failedKey) {
          write(CURRENT_SAVE_KEY, external.revision.currentRaw!);
          throw new Error(`${operation} reported failure`);
        }
        write(key, value);
      });

      await act(() => result.current.dispatch({
        type: 'lead-accepted', payload: { leadId: 'red-jackdaw' },
      }));

      expect(result.current.persistence.kind).toBe('save-conflict');
      expect(result.current.journal?.state.captain.name).toBe('Original');
      expect(result.current.exportInMemoryJournal()).toContain('lead-accepted');
      expect(loadCampaign(storage)).toMatchObject({
        kind: 'loaded', journal: { state: { captain: { name: 'External' } } },
      });
    },
  );

  it('retries from the newly observed exact revision when the predecessor remains active', async () => {
    const storage = memoryStorage();
    persist(storage, createJournal(createCampaign({ seed: 11 })));
    const injected = runtime({ storage });
    const { result } = renderHook(() => useCaribbean(injected));
    await act(() => result.current.resume());
    const realSet = storage.setItem.getMockImplementation()!;
    let denyCurrent = true;
    storage.setItem.mockImplementation((key, value) => {
      if (key === CURRENT_SAVE_KEY && denyCurrent) throw new Error('write-current denied');
      realSet(key, value);
    });

    await act(() => result.current.dispatch({
      type: 'lead-accepted', payload: { leadId: 'red-jackdaw' },
    }));

    expect(result.current.journal?.state.lastEventId).toBe(0);
    expect(result.current.persistence).toMatchObject({
      kind: 'consent-required',
      intent: 'event',
      failure: {
        kind: 'storage-unavailable',
        detail: { kind: 'operation', result: { operation: 'write-current' } },
      },
    });
    act(() => result.current.continueWithoutSaving());
    expect(result.current.persistence).toEqual({
      kind: 'memory-only', reason: 'storage-unavailable', canRetrySaving: true,
    });
    denyCurrent = false;
    await act(() => result.current.retrySaving());

    expect(result.current.persistence).toEqual({ kind: 'persisted' });
    expect(result.current.journal?.state.lastEventId).toBe(1);
    expect(loadCampaign(storage)).toMatchObject({
      kind: 'loaded', journal: { state: { lastEventId: 1 } },
    });
  });

  it('treats a different active journal after an uncertain write as conflict without adopting it', async () => {
    const storage = memoryStorage();
    persist(storage, createJournal(createCampaign({ seed: 11, name: 'Original' })));
    const externalStorage = memoryStorage();
    persist(externalStorage, createJournal(createCampaign({ seed: 99, name: 'External' })));
    const external = loadCampaign(externalStorage);
    if (external.kind !== 'loaded' || external.revision.currentRaw === null) {
      throw new Error('external fixture save failed');
    }
    const injected = runtime({ storage });
    const { result } = renderHook(() => useCaribbean(injected));
    await act(() => result.current.resume());
    const realSet = storage.setItem.getMockImplementation()!;
    let interleaveExternal = true;
    storage.setItem.mockImplementation((key, value) => {
      if (key === CURRENT_SAVE_KEY && interleaveExternal) {
        interleaveExternal = false;
        realSet(key, external.revision.currentRaw!);
        throw new Error('write-current outcome replaced externally');
      }
      realSet(key, value);
    });

    await act(() => result.current.dispatch({
      type: 'lead-accepted', payload: { leadId: 'red-jackdaw' },
    }));

    expect(result.current.persistence.kind).toBe('save-conflict');
    expect(result.current.journal?.state.captain.name).toBe('Original');
    expect(result.current.exportInMemoryJournal()).toContain('lead-accepted');
    expect(loadCampaign(storage)).toMatchObject({
      kind: 'loaded', journal: { state: { captain: { name: 'External' } } },
    });
  });

  it('never adopts or overwrites conflict actual bytes and offers reload, export, or non-retryable memory-only ownership', async () => {
    const storage = memoryStorage();
    persist(storage, createJournal(createCampaign({ seed: 11 })));
    const runtimeA = runtime({ storage });
    const runtimeB = runtime({ storage });
    const a = renderHook(() => useCaribbean(runtimeA));
    const b = renderHook(() => useCaribbean(runtimeB));
    await act(() => a.result.current.resume());
    await act(() => b.result.current.resume());

    await act(() => a.result.current.dispatch({ type: 'lead-accepted', payload: { leadId: 'red-jackdaw' } }));
    const quote = quoteTrade(b.result.current.journal!.state, {
      portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta: 1,
    });
    if (!quote.ok) throw new Error('fixture quote failed');
    await act(() => b.result.current.dispatch(marketTradeDraft(quote)));

    expect(b.result.current.persistence.kind).toBe('save-conflict');
    expect(b.result.current.journal?.state.lastEventId).toBe(0);
    expect(loadCampaign(storage)).toMatchObject({
      kind: 'loaded',
      journal: { state: { lastEventId: 1, leads: [{ id: 'red-jackdaw' }] } },
    });
    expect(b.result.current.exportInMemoryJournal()).toContain('market-traded');

    const writes = storage.setItem.mock.calls.length;
    await act(() => b.result.current.retrySaving());
    expect(storage.setItem).toHaveBeenCalledTimes(writes);
    act(() => b.result.current.continueWithoutSaving());
    expect(b.result.current.journal?.events[0].type).toBe('market-traded');
    expect(b.result.current.persistence).toEqual({
      kind: 'memory-only', reason: 'save-conflict', canRetrySaving: false,
    });
    expect(loadCampaign(storage)).toMatchObject({
      kind: 'loaded', journal: { state: { leads: [{ id: 'red-jackdaw' }] } },
    });
  });

  it('reloads the external journal by choice after a conflict', async () => {
    const storage = memoryStorage();
    persist(storage, createJournal(createCampaign({ seed: 11 })));
    const runtimeA = runtime({ storage });
    const runtimeB = runtime({ storage });
    const a = renderHook(() => useCaribbean(runtimeA));
    const b = renderHook(() => useCaribbean(runtimeB));
    await act(() => a.result.current.resume());
    await act(() => b.result.current.resume());
    await act(() => a.result.current.dispatch({ type: 'lead-accepted', payload: { leadId: 'red-jackdaw' } }));
    const quote = quoteTrade(b.result.current.journal!.state, {
      portId: 'bridgetown', shipId: 'mistral', cargoId: 'tools', delta: -1,
    });
    if (!quote.ok) throw new Error('fixture quote failed');
    await act(() => b.result.current.dispatch(marketTradeDraft(quote)));

    await act(() => b.result.current.reloadExternalSave());
    expect(b.result.current.persistence).toEqual({ kind: 'persisted' });
    expect(b.result.current.journal?.events[0].type).toBe('lead-accepted');
    expect(b.result.current.exportInMemoryJournal()).toBe(canonicalJson(b.result.current.journal));
  });

  it('adopts the compacted journal returned by a successful mutation save', async () => {
    const storage = memoryStorage();
    let journal = createJournal(createCampaign({ seed: 11 }));
    for (let index = 0; index < 256; index += 1) {
      const delta = index % 2 === 0 ? 1 : -1;
      const quote = quoteTrade(journal.state, {
        portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta,
      });
      if (!quote.ok) throw new Error('fixture quote failed');
      journal = appendJournal(journal, marketTradeDraft(quote));
    }
    persist(storage, journal);
    const injected = runtime({ storage });
    const { result } = renderHook(() => useCaribbean(injected));
    await act(() => result.current.resume());
    const quote = quoteTrade(result.current.journal!.state, {
      portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta: 1,
    });
    if (!quote.ok) throw new Error('fixture quote failed');

    await act(() => result.current.dispatch(marketTradeDraft(quote)));

    expect(result.current.journal?.state.lastEventId).toBe(257);
    expect(result.current.journal?.events).toEqual([]);
  });

  it('retains a complete recovery continuation and finishes it under the writer', async () => {
    const storage = memoryStorage();
    persist(storage, createJournal(createCampaign({ seed: 11 })));
    persist(storage, createJournal(createCampaign({ seed: 12 })));
    storage.setItem(CURRENT_SAVE_KEY, '{corrupt');
    let throwRemove = true;
    const realRemove = storage.removeItem.getMockImplementation()!;
    storage.removeItem.mockImplementation((key) => {
      realRemove(key);
      if (throwRemove) throw new Error('remove reported failure');
    });
    const injected = runtime({ storage });
    const { result } = renderHook(() => useCaribbean(injected));

    await act(() => result.current.recover());
    expect(result.current.persistence).toMatchObject({
      kind: 'recovery-continuation',
      result: {
        reason: 'continuation-required',
        cause: 'partial-cleanup',
        failedOperation: 'remove-current',
        continuation: { stage: 'quarantine-verified' },
      },
    });

    throwRemove = false;
    await act(() => result.current.continueRecovery('continue'));
    expect(result.current.persistence).toEqual({ kind: 'persisted' });
    expect(result.current.load).toMatchObject({ kind: 'loaded', recovered: false, unreadableSlots: [] });
  });

  it.each([
    ['unavailable', { kind: 'writer-unavailable' }],
    ['denied', { kind: 'writer-denied' }],
    ['operation-threw', { kind: 'operation-uncertain', writer: { kind: 'operation-threw' } }],
    ['writer-protocol-failure', { kind: 'operation-uncertain', writer: { kind: 'writer-protocol-failure' } }],
  ] as const)('retains the %s writer tag when Recover cannot establish a result', async (tag, failure) => {
    const storage = memoryStorage();
    persist(storage, createJournal(createCampaign({ seed: 11 })));
    persist(storage, createJournal(createCampaign({ seed: 12 })));
    storage.setItem(CURRENT_SAVE_KEY, '{corrupt');
    const injected = runtime({ storage });
    const { result } = renderHook(() => useCaribbean(injected));
    const phaseBefore = result.current.persistence;
    injected.writer = failedWriter(tag, new Error(tag));

    await act(() => result.current.recover());

    expect(result.current.persistence).toEqual(phaseBefore);
    expect(recoveryFailureOf(result.current)).toMatchObject({
      kind: 'writer', action: 'recover', failure,
    });
  });

  it.each([
    ['recover', 'continue'] as const,
    ['continue-recovery', 'continue'] as const,
    ['abandon-from-quarantine', 'abandon'] as const,
    ['abandon', 'abandon'] as const,
  ])('retains denied ownership for the %s action family', async (action, decision) => {
    const storage = memoryStorage();
    if (action === 'abandon') {
      persist(storage, createJournal(createCampaign({ seed: 11 })));
    } else {
      persist(storage, createJournal(createCampaign({ seed: 11 })));
      persist(storage, createJournal(createCampaign({ seed: 12 })));
      storage.setItem(CURRENT_SAVE_KEY, '{corrupt');
    }
    const injected = runtime({ storage });
    const { result } = renderHook(() => useCaribbean(injected));

    if (action === 'continue-recovery' || action === 'abandon-from-quarantine') {
      const remove = storage.removeItem.getMockImplementation()!;
      let reportFailure = true;
      storage.removeItem.mockImplementation((key) => {
        remove(key);
        if (reportFailure) {
          reportFailure = false;
          throw new Error('remove reported failure');
        }
      });
      await act(() => result.current.recover());
      storage.removeItem.mockImplementation(remove);
      expect(result.current.persistence.kind).toBe('recovery-continuation');
    }

    const phaseBefore = result.current.persistence;
    injected.writer = failedWriter('denied', new Error(`${action} denied`));
    if (action === 'recover') await act(() => result.current.recover());
    else if (action === 'abandon') await act(() => result.current.abandon());
    else await act(() => result.current.continueRecovery(decision));

    expect(result.current.persistence).toEqual(phaseBefore);
    expect(recoveryFailureOf(result.current)).toMatchObject({
      kind: 'writer', action, failure: { kind: 'writer-denied' },
    });
  });

  it.each([
    ['recover', 'continue', 'write-current', 'recovered'] as const,
    ['continue-recovery', 'continue', 'write-current', 'recovered'] as const,
    ['abandon-from-quarantine', 'abandon', 'remove-current', 'abandoned'] as const,
    ['abandon', 'abandon', 'remove-current', 'abandoned'] as const,
  ])(
    'retains the successful %s result when its same-lock post-result read fails',
    async (action, decision, failAfter, resultKind) => {
      const storage = memoryStorage();
      if (action === 'abandon') {
        persist(storage, createJournal(createCampaign({ seed: 11 })));
      } else if (action === 'abandon-from-quarantine') {
        persist(storage, createJournal(createCampaign({ seed: 11 })));
        storage.setItem(PREVIOUS_SAVE_KEY, '{corrupt');
      } else {
        persist(storage, createJournal(createCampaign({ seed: 11 })));
        persist(storage, createJournal(createCampaign({ seed: 12 })));
        storage.setItem(CURRENT_SAVE_KEY, '{corrupt');
      }
      const injected = runtime({ storage });
      const { result } = renderHook(() => useCaribbean(injected));

      if (action === 'continue-recovery' || action === 'abandon-from-quarantine') {
        const remove = storage.removeItem.getMockImplementation()!;
        let reportFailure = true;
        storage.removeItem.mockImplementation((key) => {
          remove(key);
          if (reportFailure) {
            reportFailure = false;
            throw new Error('remove reported failure');
          }
        });
        await act(() => result.current.recover());
        storage.removeItem.mockImplementation(remove);
        expect(result.current.persistence.kind).toBe('recovery-continuation');
      }

      const read = storage.getItem.getMockImplementation()!;
      const write = storage.setItem.getMockImplementation()!;
      const remove = storage.removeItem.getMockImplementation()!;
      let postResultReadFails = false;
      storage.getItem.mockImplementation((key) => {
        if (postResultReadFails) throw new DOMException('post-result read denied', 'SecurityError');
        return read(key);
      });
      storage.setItem.mockImplementation((key, value) => {
        write(key, value);
        if (failAfter === 'write-current' && key === CURRENT_SAVE_KEY) postResultReadFails = true;
      });
      storage.removeItem.mockImplementation((key) => {
        remove(key);
        if (
          failAfter === 'remove-current' && key === CURRENT_SAVE_KEY
        ) postResultReadFails = true;
      });
      const phaseBefore = result.current.persistence;

      if (action === 'recover') await act(() => result.current.recover());
      else if (action === 'abandon') await act(() => result.current.abandon());
      else await act(() => result.current.continueRecovery(decision));

      expect(result.current.persistence).toEqual(phaseBefore);
      expect(recoveryFailureOf(result.current)).toMatchObject({
        kind: 'post-result-load',
        action,
        result: { ok: true, kind: resultKind },
        loadFailure: { kind: 'storage-unavailable', operation: 'read-current' },
      });
    },
  );

  it('retries one quarantine collision with one fresh injected id', async () => {
    const storage = memoryStorage();
    persist(storage, createJournal(createCampaign({ seed: 11 })));
    persist(storage, createJournal(createCampaign({ seed: 12 })));
    storage.setItem(CURRENT_SAVE_KEY, '{corrupt');
    const firstId = '00000000-0000-4000-8000-000000000001';
    const secondId = '00000000-0000-4000-8000-000000000002';
    storage.setItem(`${QUARANTINE_KEY_PREFIX}${firstId}`, '{foreign}');
    const injected = runtime({ storage, quarantineIds: [firstId, secondId] });
    const { result } = renderHook(() => useCaribbean(injected));

    await act(() => result.current.recover());

    expect(injected.makeQuarantineId).toHaveBeenCalledTimes(2);
    expect(storage.getItem(`${QUARANTINE_KEY_PREFIX}${firstId}`)).toBe('{foreign}');
    expect(storage.getItem(`${QUARANTINE_KEY_PREFIX}${secondId}`)).not.toBeNull();
    expect(result.current.persistence).toEqual({ kind: 'persisted' });
    expect(result.current.load).toMatchObject({ kind: 'loaded', recovered: false });
  });

  it('quarantines and abandons a campaign under one writer mutation', async () => {
    const storage = memoryStorage();
    persist(storage, createJournal(createCampaign({ seed: 11 })));
    const injected = runtime({ storage });
    const writerRun = vi.spyOn(injected.writer, 'run');
    const { result } = renderHook(() => useCaribbean(injected));

    await act(() => result.current.abandon());

    expect(writerRun).toHaveBeenCalledTimes(1);
    expect(result.current.load.kind).toBe('empty');
    expect(result.current.journal).toBeNull();
    expect(storage.getItem(CURRENT_SAVE_KEY)).toBeNull();
    expect(storage.getItem(PREVIOUS_SAVE_KEY)).toBeNull();
  });

  it('lets a late operation finish once after unmount while a new controller loads the committed storage', async () => {
    const storage = memoryStorage();
    persist(storage, createJournal(createCampaign({ seed: 11 })));
    const injected = runtime({ storage });
    const first = renderHook(() => useCaribbean(injected));
    await act(() => first.result.current.resume());
    const deferred = deferredLocks();
    injected.writer = createCampaignWriter(deferred.locks);
    let dispatching!: ReturnType<CaribbeanController['dispatch']>;
    act(() => {
      dispatching = first.result.current.dispatch({ type: 'lead-accepted', payload: { leadId: 'red-jackdaw' } });
    });
    await act(async () => { await Promise.resolve(); });
    first.unmount();

    await act(async () => {
      await deferred.acquire();
      await dispatching;
    });

    expect(deferred.request).toHaveBeenCalledTimes(1);
    expect(loadCampaign(storage)).toMatchObject({ kind: 'loaded', journal: { state: { lastEventId: 1 } } });
    const secondRuntime = runtime({ storage });
    const second = renderHook(() => useCaribbean(secondRuntime));
    await act(() => second.result.current.resume());
    expect(second.result.current.journal?.state.lastEventId).toBe(1);
  });

  it('ignores a late completion after the hook runtime generation is replaced', async () => {
    const firstStorage = memoryStorage();
    const secondStorage = memoryStorage();
    persist(secondStorage, createJournal(createCampaign({ seed: 22, name: 'Second' })));
    const deferred = deferredLocks();
    const firstRuntime = runtime({ storage: firstStorage, locks: deferred.locks, seed: 11 });
    const secondRuntime = runtime({ storage: secondStorage });
    const hook = renderHook(
      ({ active }: { active: CaribbeanRuntime }) => useCaribbean(active),
      { initialProps: { active: firstRuntime as CaribbeanRuntime } },
    );

    let starting!: Promise<void>;
    act(() => { starting = hook.result.current.start(MORGAN); });
    await act(async () => { await Promise.resolve(); });
    expect(deferred.request).toHaveBeenCalledTimes(1);

    hook.rerender({ active: secondRuntime });
    expect(hook.result.current.load).toMatchObject({
      kind: 'loaded',
      journal: { state: { captain: { name: 'Second' } } },
    });
    expect(hook.result.current.journal).toBeNull();

    await act(async () => {
      await deferred.acquire();
      await starting;
    });

    expect(loadCampaign(firstStorage)).toMatchObject({
      kind: 'loaded',
      journal: { state: { captain: { name: 'Morgan' } } },
    });
    expect(hook.result.current.load).toMatchObject({
      kind: 'loaded',
      journal: { state: { captain: { name: 'Second' } } },
    });
    expect(hook.result.current.journal).toBeNull();
    expect(hook.result.current.busy).toBe(false);
  });
});
