import { act, renderHook } from '@testing-library/react';
import { expect, vi } from 'vitest';

import { createCampaign } from '../domain/createCampaign';
import type { CampaignJournal } from '../domain/events';
import type { NavalBattleInput, NavalResolution } from '../domain/naval/types';
import { appendJournal, createJournal } from '../domain/replay';
import { navalEngagedDraft, seaLegCompletedDraft, voyageStartedDraft } from '../domain/voyage';
import { CURRENT_SAVE_KEY, saveCampaign, type StorageLike } from '../storage/persistence';
import {
  createCampaignWriter,
  type CampaignWriter,
  type LockManagerLike,
} from '../storage/writer';
import type { CaribbeanRuntime } from './runtime';
import { useCaribbean, type CaribbeanController } from './useCaribbean';

export type MemoryStorage = StorageLike & {
  getItem: ReturnType<typeof vi.fn<(key: string) => string | null>>;
  setItem: ReturnType<typeof vi.fn<(key: string, value: string) => void>>;
  removeItem: ReturnType<typeof vi.fn<(key: string) => void>>;
};

export function memoryStorage(): MemoryStorage {
  const data = new Map<string, string>();
  return {
    getItem: vi.fn((key) => data.get(key) ?? null),
    setItem: vi.fn((key, value) => { data.set(key, value); }),
    removeItem: vi.fn((key) => { data.delete(key); }),
  };
}

export const immediateLocks: LockManagerLike = {
  async request(_name, _options, callback) {
    return await callback({});
  },
};

export function deferredLocks() {
  let callback: (() => unknown | PromiseLike<unknown>) | null = null;
  let resolveRequest: ((value: unknown) => void) | null = null;
  let rejectRequest: ((error: unknown) => void) | null = null;
  return {
    locks: {
      request(
        _name: string,
        _options: { mode: 'exclusive' },
        next: (lock: unknown) => unknown | PromiseLike<unknown>,
      ) {
        callback = () => next({});
        return new Promise((resolve, reject) => {
          resolveRequest = resolve as (value: unknown) => void;
          rejectRequest = reject;
        });
      },
    } as LockManagerLike,
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

export function failedWriter(tag: 'denied' | 'operation-threw', error: Error): CampaignWriter {
  return {
    capability: 'available',
    async run() {
      return tag === 'denied'
        ? { kind: 'acquisition-failed', reason: 'denied', error }
        : { kind: 'operation-threw', error };
    },
  };
}

export function runtime(storage: MemoryStorage, locks: LockManagerLike | null = immediateLocks): CaribbeanRuntime {
  return {
    storage,
    storageCapability: { kind: 'available' },
    writer: createCampaignWriter(locks),
    build: 'test-build',
    now: () => 100,
    makeSeed: () => 1702,
    makeQuarantineId: () => '00000000-0000-4000-8000-000000000001',
  };
}

export function persist(storage: MemoryStorage, journal: CampaignJournal): void {
  const result = saveCampaign(storage, journal, {
    build: 'fixture', savedAt: 10, expectedRevision: { currentRaw: null, previousRaw: null },
  });
  if (!result.ok) throw new Error(`fixture save failed: ${result.reason}`);
}

export function strategicJournals(seed = 1702) {
  const active = appendJournal(
    createJournal(createCampaign({ seed })),
    { type: 'lead-accepted', payload: { leadId: 'red-jackdaw' } },
  );
  const departed = appendJournal(active, voyageStartedDraft(active.state));
  const contact = appendJournal(departed, seaLegCompletedDraft(departed.state));
  const engaged = appendJournal(contact, navalEngagedDraft(contact.state));
  return { active, departed, contact, engaged };
}

function surrenderResolution(input: NavalBattleInput): NavalResolution {
  return {
    battleId: input.battleId,
    outcome: { kind: 'surrender', victorShipId: 'player' },
    atTick: 7,
    seedAfter: 1,
    player: {
      hull: input.player.hull,
      sails: input.player.sails,
      crew: input.player.crew,
      cannon: input.player.cannon,
    },
    opponent: {
      hull: input.opponent.hull,
      sails: input.opponent.sails,
      crew: 8,
      cannon: input.opponent.cannon,
    },
    decisive: {
      kind: 'surrender', victorShipId: 'player', surrenderedShipId: 'opponent',
      threshold: 'crew', value: 8, thresholdValue: 8,
    },
  };
}

export type NamedActionName =
  | 'setSail'
  | 'completeSeaLeg'
  | 'avoidEncounter'
  | 'engageEncounter'
  | 'withdrawBattle'
  | 'resolveBattle';

export const ACTIONS = [
  { name: 'setSail', predecessor: ({ active }: ReturnType<typeof strategicJournals>) => active, eventId: 2, eventType: 'voyage-started', mode: 'sailing' },
  { name: 'completeSeaLeg', predecessor: ({ departed }: ReturnType<typeof strategicJournals>) => departed, eventId: 3, eventType: 'sea-leg-completed', mode: 'encounter' },
  { name: 'avoidEncounter', predecessor: ({ contact }: ReturnType<typeof strategicJournals>) => contact, eventId: 4, eventType: 'encounter-avoided', mode: 'port' },
  { name: 'engageEncounter', predecessor: ({ contact }: ReturnType<typeof strategicJournals>) => contact, eventId: 4, eventType: 'naval-engaged', mode: 'naval' },
  { name: 'withdrawBattle', predecessor: ({ engaged }: ReturnType<typeof strategicJournals>) => engaged, eventId: 5, eventType: 'battle-withdrawn', mode: 'port' },
  { name: 'resolveBattle', predecessor: ({ engaged }: ReturnType<typeof strategicJournals>) => engaged, eventId: 5, eventType: 'naval-resolved', mode: 'port' },
] as const;

export function invoke(controller: CaribbeanController, name: NamedActionName) {
  if (name !== 'resolveBattle') return controller[name]();
  const fallback = strategicJournals().engaged;
  const input = controller.journal?.state.mode.kind === 'naval'
    ? controller.journal.state.mode.input
    : fallback.state.mode.kind === 'naval'
      ? fallback.state.mode.input
      : null;
  if (input === null) throw new Error('resolution fixture requires naval mode');
  return controller.resolveBattle(surrenderResolution(input));
}

export async function controller(predecessor: CampaignJournal, mode: 'persisted' | 'memory-only') {
  const storage = memoryStorage();
  persist(storage, predecessor);
  storage.setItem.mockClear();
  const injected = runtime(storage, mode === 'persisted' ? immediateLocks : null);
  const hook = renderHook(() => useCaribbean(injected));
  await act(() => hook.result.current.resume());
  if (mode === 'memory-only') act(() => hook.result.current.continueWithoutSaving());
  storage.setItem.mockClear();
  return { ...hook, storage, injected };
}

export function currentSaveWrites(storage: MemoryStorage): number {
  return storage.setItem.mock.calls.filter(([key]) => key === CURRENT_SAVE_KEY).length;
}

export async function assertGuardedAction(
  persistenceMode: 'persisted' | 'memory-only',
  actionCase: (typeof ACTIONS)[number],
): Promise<void> {
  const hook = await controller(actionCase.predecessor(strategicJournals()), persistenceMode);
  const beforeEvents = hook.result.current.journal?.events.length ?? -1;
  let settled!: PromiseSettledResult<Awaited<ReturnType<CaribbeanController['dispatch']>>>[];
  await act(async () => {
    settled = await Promise.allSettled([
      invoke(hook.result.current, actionCase.name),
      invoke(hook.result.current, actionCase.name),
    ]);
  });
  const rejected = settled.find((entry) => entry.status === 'rejected');
  if (rejected?.status === 'rejected') throw rejected.reason;
  expect(settled.every(({ status }) => status === 'fulfilled')).toBe(true);
  const values = settled.map((entry) => entry.status === 'fulfilled' ? entry.value : null);
  expect(values.filter((value) => value?.kind === 'applied')).toEqual([
    { kind: 'applied', eventId: actionCase.eventId },
  ]);
  expect(values.filter((value) => value?.kind === 'not-applied')).toEqual([{ kind: 'not-applied' }]);
  expect(hook.result.current.journal?.events).toHaveLength(beforeEvents + 1);
  expect(hook.result.current.journal?.events.at(-1)).toMatchObject({
    id: actionCase.eventId, type: actionCase.eventType,
  });
  expect(hook.result.current.journal?.state.mode.kind).toBe(actionCase.mode);
  const writes = hook.storage.setItem.mock.calls.filter(([key]) => key === CURRENT_SAVE_KEY);
  expect(writes).toHaveLength(persistenceMode === 'persisted' ? 1 : 0);
}
