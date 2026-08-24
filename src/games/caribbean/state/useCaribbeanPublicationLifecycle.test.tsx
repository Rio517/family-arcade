import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { canonicalJson } from '../canonicalJson';
import { marketTradeDraft, quoteTrade } from '../domain/economy';
import { appendJournal } from '../domain/replay';
import { CURRENT_SAVE_KEY, loadCampaign, saveCampaign } from '../storage/persistence';
import { createCampaignWriter } from '../storage/writer';
import type { CaribbeanRuntime } from './runtime';
import {
  controller,
  currentSaveWrites,
  deferredLocks,
  failedWriter,
  immediateLocks,
  memoryStorage,
  persist,
  runtime,
  strategicJournals,
} from './useCaribbeanActionsTestSupport';
import { useCaribbean, type ActiveCaribbeanController } from './useCaribbean';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useCaribbean publication lifecycle', () => {
  it('waits for a deferred Web Lock before publishing departure effects', async () => {
    const storage = memoryStorage();
    persist(storage, strategicJournals().active);
    const injected = runtime(storage);
    const hook = renderHook(() => useCaribbean(injected));
    await act(() => hook.result.current.resume());
    const deferred = deferredLocks();
    injected.writer = createCampaignWriter(deferred.locks);
    act(() => hook.result.current.selectActivity('market'));
    let departure!: ReturnType<ActiveCaribbeanController['setSail']>;

    act(() => { departure = hook.result.current.setSail(); });
    await act(async () => { await Promise.resolve(); });
    expect(hook.result.current.activity).toBe('market');
    expect(hook.result.current.journal?.state.mode.kind).toBe('port');

    await act(async () => {
      await deferred.acquire();
      expect(await departure).toEqual({ kind: 'applied', eventId: 2 });
    });
    expect(hook.result.current.activity).toBe('menu');
    expect(hook.result.current.journal?.state.mode.kind).toBe('sailing');
  });

  it.each(['denied-lock', 'write-failure'] as const)(
    'publishes a held departure only after Continue without saving for %s',
    async (failureMode) => {
      const hook = await controller(strategicJournals().active, 'persisted');
      if (failureMode === 'denied-lock') {
        hook.injected.writer = failedWriter('denied', new Error('denied'));
      } else {
        const realSet = hook.storage.setItem.getMockImplementation()!;
        hook.storage.setItem.mockImplementation((key, value) => {
          if (key === CURRENT_SAVE_KEY) throw new Error('write-current denied');
          realSet(key, value);
        });
      }
      act(() => hook.result.current.selectActivity('market'));

      await act(() => hook.result.current.setSail());
      expect(hook.result.current.activity).toBe('market');
      expect(hook.result.current.journal?.state.mode.kind).toBe('port');
      expect(hook.result.current.persistence.kind).toBe('consent-required');

      act(() => hook.result.current.continueWithoutSaving());
      expect(hook.result.current.journal?.state.mode.kind).toBe('sailing');
      expect(hook.result.current.activity).toBe('menu');

      act(() => hook.result.current.selectActivity('tavern'));
      act(() => hook.result.current.continueWithoutSaving());
      expect(hook.result.current.activity).toBe('tavern');
    },
  );

  it('publishes a direct memory departure through the same transient boundary', async () => {
    const hook = await controller(strategicJournals().active, 'memory-only');
    act(() => hook.result.current.selectActivity('shipyard'));

    await act(() => hook.result.current.setSail());

    expect(hook.result.current.activity).toBe('menu');
    expect(hook.result.current.journal?.events.at(-1)).toMatchObject({ id: 2, type: 'voyage-started' });
    expect(currentSaveWrites(hook.storage)).toBe(0);
  });

  it('keeps conflict effects pending, then publishes them once to memory', async () => {
    const hook = await controller(strategicJournals().active, 'persisted');
    const loaded = loadCampaign(hook.storage);
    if (loaded.kind !== 'loaded') throw new Error('conflict fixture must load');
    const quote = quoteTrade(loaded.journal.state, {
      portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta: 1,
    });
    if (!quote.ok) throw new Error('conflict trade fixture failed');
    const external = appendJournal(loaded.journal, marketTradeDraft(quote));
    const saved = saveCampaign(hook.storage, external, {
      build: 'external', savedAt: 700, expectedRevision: loaded.revision,
    });
    if (!saved.ok) throw new Error(`external fixture failed: ${saved.reason}`);
    hook.storage.setItem.mockClear();
    act(() => hook.result.current.selectActivity('governor'));

    await act(() => hook.result.current.setSail());
    expect(hook.result.current.persistence.kind).toBe('save-conflict');
    expect(hook.result.current.activity).toBe('governor');
    expect(hook.result.current.journal?.state.mode.kind).toBe('port');

    act(() => hook.result.current.continueWithoutSaving());
    expect(hook.result.current.persistence).toMatchObject({ kind: 'memory-only', reason: 'save-conflict' });
    expect(hook.result.current.journal?.state.mode.kind).toBe('sailing');
    expect(hook.result.current.activity).toBe('menu');
    expect(currentSaveWrites(hook.storage)).toBe(0);
  });

  it('retry adopts the writer journal without replaying an already-published return focus', async () => {
    const hook = await controller(strategicJournals().contact, 'persisted');
    hook.injected.writer = failedWriter('denied', new Error('denied'));

    await act(() => hook.result.current.avoidEncounter());
    expect(hook.result.current.portFocusTarget).toBeNull();
    act(() => hook.result.current.continueWithoutSaving());
    expect(hook.result.current.portFocusTarget).toBe('last-voyage');
    act(() => hook.result.current.acknowledgePortFocus());

    hook.injected.writer = createCampaignWriter(immediateLocks);
    await act(() => hook.result.current.retrySaving());
    expect(hook.result.current.persistence).toEqual({ kind: 'persisted' });
    expect(hook.result.current.portFocusTarget).toBeNull();
    const loaded = loadCampaign(hook.storage);
    if (loaded.kind !== 'loaded') throw new Error('retry must load');
    expect(canonicalJson(hook.result.current.journal)).toBe(canonicalJson(loaded.journal));
  });

  it('discards a conflicted departure and its effects when reloading the external save', async () => {
    const hook = await controller(strategicJournals().active, 'persisted');
    const loaded = loadCampaign(hook.storage);
    if (loaded.kind !== 'loaded') throw new Error('reload fixture must load');
    const quote = quoteTrade(loaded.journal.state, {
      portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta: 1,
    });
    if (!quote.ok) throw new Error('reload trade fixture failed');
    const external = appendJournal(loaded.journal, marketTradeDraft(quote));
    const saved = saveCampaign(hook.storage, external, {
      build: 'external', savedAt: 701, expectedRevision: loaded.revision,
    });
    if (!saved.ok) throw new Error(`reload fixture failed: ${saved.reason}`);
    act(() => hook.result.current.selectActivity('shares'));

    await act(() => hook.result.current.setSail());
    expect(hook.result.current.persistence.kind).toBe('save-conflict');
    await act(() => hook.result.current.reloadExternalSave());

    expect(hook.result.current.activity).toBe('shares');
    expect(hook.result.current.portFocusTarget).toBeNull();
    expect(hook.result.current.journal?.events.at(-1)).toMatchObject({ id: 2, type: 'market-traded' });
    expect(hook.result.current.journal?.state.mode.kind).toBe('port');
  });

  it('keeps generation-two owner B when stale generation-one A completes', async () => {
    const storageA = memoryStorage();
    const storageB = memoryStorage();
    persist(storageA, strategicJournals(1702).active);
    persist(storageB, strategicJournals(1703).active);
    const runtimeA = runtime(storageA);
    const runtimeB = runtime(storageB);
    const hook = renderHook(
      ({ active }: { active: CaribbeanRuntime }) => useCaribbean(active),
      { initialProps: { active: runtimeA } },
    );
    await act(() => hook.result.current.resume());
    const deferredA = deferredLocks();
    runtimeA.writer = createCampaignWriter(deferredA.locks);
    let actionA!: ReturnType<ActiveCaribbeanController['setSail']>;
    act(() => { actionA = hook.result.current.setSail(); });
    await act(async () => { await Promise.resolve(); });

    hook.rerender({ active: runtimeB });
    await act(() => hook.result.current.resume());
    const deferredB = deferredLocks();
    runtimeB.writer = createCampaignWriter(deferredB.locks);
    let actionB!: ReturnType<ActiveCaribbeanController['setSail']>;
    act(() => { actionB = hook.result.current.setSail(); });
    await act(async () => { await Promise.resolve(); });

    let settledA!: PromiseSettledResult<Awaited<ReturnType<ActiveCaribbeanController['setSail']>>>;
    await act(async () => {
      await deferredA.acquire();
      settledA = await Promise.allSettled([actionA]).then(([entry]) => entry);
    });
    expect(await Promise.allSettled([hook.result.current.setSail()])).toEqual([
      { status: 'fulfilled', value: { kind: 'not-applied' } },
    ]);

    let settledB!: PromiseSettledResult<Awaited<ReturnType<ActiveCaribbeanController['setSail']>>>;
    await act(async () => {
      await deferredB.acquire();
      settledB = await Promise.allSettled([actionB]).then(([entry]) => entry);
    });

    expect(settledA).toEqual({ status: 'fulfilled', value: { kind: 'not-applied' } });
    expect(settledB).toEqual({ status: 'fulfilled', value: { kind: 'applied', eventId: 2 } });
    expect(loadCampaign(storageA)).toMatchObject({ kind: 'loaded', journal: { state: { lastEventId: 2 } } });
    expect(loadCampaign(storageB)).toMatchObject({ kind: 'loaded', journal: { state: { lastEventId: 2 } } });
    expect(currentSaveWrites(storageA)).toBe(2);
    expect(currentSaveWrites(storageB)).toBe(2);
  });
});
