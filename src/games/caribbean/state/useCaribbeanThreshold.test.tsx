import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { canonicalJson } from '../canonicalJson';
import { createCampaign } from '../domain/createCampaign';
import { compactJournal } from '../domain/compactJournal';
import { marketTradeDraft, quoteTrade } from '../domain/economy';
import type { CampaignJournal } from '../domain/events';
import type { NavalBattleInput, NavalResolution } from '../domain/naval/types';
import { appendJournal, createJournal } from '../domain/replay';
import {
  navalEngagedDraft,
  navalResolvedDraft,
  seaLegCompletedDraft,
  voyageStartedDraft,
} from '../domain/voyage';
import { CURRENT_SAVE_KEY, loadCampaign, saveCampaign, type StorageLike } from '../storage/persistence';
import { createCampaignWriter, type CampaignWriter, type LockManagerLike } from '../storage/writer';
import type { CaribbeanRuntime } from './runtime';
import { useCaribbean } from './useCaribbean';

type MemoryStorage = StorageLike & {
  getItem: ReturnType<typeof vi.fn<(key: string) => string | null>>;
  setItem: ReturnType<typeof vi.fn<(key: string, value: string) => void>>;
  removeItem: ReturnType<typeof vi.fn<(key: string) => void>>;
};

function memoryStorage(): MemoryStorage {
  const data = new Map<string, string>();
  return {
    getItem: vi.fn((key) => data.get(key) ?? null),
    setItem: vi.fn((key, value) => { data.set(key, value); }),
    removeItem: vi.fn((key) => { data.delete(key); }),
  };
}

const immediateLocks: LockManagerLike = {
  async request(_name, _options, callback) {
    return await callback({});
  },
};

function failedWriter(): CampaignWriter {
  return {
    capability: 'available',
    async run() {
      return { kind: 'acquisition-failed', reason: 'denied', error: new Error('denied') };
    },
  };
}

function runtime(storage: MemoryStorage): CaribbeanRuntime {
  return {
    storage,
    storageCapability: { kind: 'available' },
    writer: createCampaignWriter(immediateLocks),
    build: 'test-build',
    now: () => 100,
    makeSeed: () => 1702,
    makeQuarantineId: () => '00000000-0000-4000-8000-000000000001',
  };
}

function persist(storage: MemoryStorage, journal: CampaignJournal): CampaignJournal {
  const result = saveCampaign(storage, journal, {
    build: 'fixture',
    savedAt: 10,
    expectedRevision: { currentRaw: null, previousRaw: null },
  });
  if (!result.ok) throw new Error(`fixture save failed: ${result.reason}`);
  return result.journal;
}

function activeLeadJournal(): CampaignJournal {
  return appendJournal(
    createJournal(createCampaign({ seed: 1702 })),
    { type: 'lead-accepted', payload: { leadId: 'red-jackdaw' } },
  );
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
      kind: 'surrender',
      victorShipId: 'player',
      surrenderedShipId: 'opponent',
      threshold: 'crew',
      value: 8,
      thresholdValue: 8,
    },
  };
}

let cachedThresholdBytes: {
  departure: string;
  resolutionPredecessor: string;
  resolution: NavalResolution;
} | null = null;

function buildThresholdBytes() {
  if (cachedThresholdBytes !== null) return cachedThresholdBytes;
  let departure = activeLeadJournal();
  let resolutionTrades: CampaignJournal | null = null;
  for (let index = 0; index < 255; index += 1) {
    const quote = quoteTrade(departure.state, {
      portId: 'bridgetown',
      shipId: 'mistral',
      cargoId: 'provisions',
      delta: index % 2 === 0 ? 1 : -1,
    });
    expect(quote.ok, `trade ${index + 1} must be legal`).toBe(true);
    if (!quote.ok) throw new Error(`trade ${index + 1} fixture failed`);
    departure = appendJournal(departure, marketTradeDraft(quote));
    if (index === 251) resolutionTrades = departure;
  }
  if (resolutionTrades === null) throw new Error('resolution trade fixture must exist');
  expect(departure.events[0]).toMatchObject({ id: 1, type: 'lead-accepted' });
  expect(departure.events[255]).toMatchObject({ id: 256, type: 'market-traded' });

  const departed = appendJournal(resolutionTrades, voyageStartedDraft(resolutionTrades.state));
  const contact = appendJournal(departed, seaLegCompletedDraft(departed.state));
  const engaged = appendJournal(contact, navalEngagedDraft(contact.state));
  if (engaged.state.mode.kind !== 'naval') throw new Error('threshold fixture must be naval');
  expect(departed.events.at(-1)).toMatchObject({ id: 254, type: 'voyage-started' });
  expect(contact.events.at(-1)).toMatchObject({ id: 255, type: 'sea-leg-completed' });
  expect(engaged.events.at(-1)).toMatchObject({
    id: 256,
    type: 'naval-engaged',
    payload: { input: { battleId: 'voyage-254-battle' } },
  });
  cachedThresholdBytes = {
    departure: canonicalJson(departure),
    resolutionPredecessor: canonicalJson(engaged),
    resolution: surrenderResolution(engaged.state.mode.input),
  };
  return cachedThresholdBytes;
}

function departureThresholdPredecessor(): CampaignJournal {
  return JSON.parse(buildThresholdBytes().departure) as CampaignJournal;
}

function resolutionThresholdFixture() {
  const bytes = buildThresholdBytes();
  return {
    predecessor: JSON.parse(bytes.resolutionPredecessor) as CampaignJournal,
    resolution: structuredClone(bytes.resolution),
  };
}

async function createPersistedController(predecessor: CampaignJournal) {
  const storage = memoryStorage();
  persist(storage, predecessor);
  storage.setItem.mockClear();
  const injected = runtime(storage);
  const hook = renderHook(() => useCaribbean(injected));
  await act(() => hook.result.current.resume());
  storage.setItem.mockClear();
  return { ...hook, storage, injected };
}

describe('useCaribbean event-257 publication', () => {
  it.each(['departure', 'resolution'] as const)(
    'keeps compacted event-257 %s initial and state reference-isolated',
    (history) => {
      const resolutionFixture = history === 'resolution' ? resolutionThresholdFixture() : null;
      const predecessor = history === 'departure'
        ? departureThresholdPredecessor()
        : resolutionFixture!.predecessor;
      const candidate = appendJournal(
        predecessor,
        history === 'departure'
          ? voyageStartedDraft(predecessor.state)
          : navalResolvedDraft(predecessor.state, resolutionFixture!.resolution),
      );

      const compacted = compactJournal(candidate);

      expect(compacted.events).toEqual([]);
      expect(compacted.initial).toEqual(compacted.state);
      expect(compacted.initial).not.toBe(compacted.state);
    },
  );

  it.each(['departure', 'resolution'] as const)(
    'adopts the compacted event-257 %s save while consuming the original event once',
    async (history) => {
      const resolutionFixture = history === 'resolution' ? resolutionThresholdFixture() : null;
      const predecessor = history === 'departure'
        ? departureThresholdPredecessor()
        : resolutionFixture!.predecessor;
      const hook = await createPersistedController(predecessor);
      act(() => hook.result.current.selectActivity('market'));

      await act(() => history === 'departure'
        ? hook.result.current.setSail()
        : hook.result.current.resolveBattle(resolutionFixture!.resolution));

      expect(hook.result.current.journal?.state.lastEventId).toBe(257);
      expect(hook.result.current.journal?.events).toEqual([]);
      expect(hook.result.current.journal?.initial).toEqual(hook.result.current.journal?.state);
      expect(hook.result.current.journal?.initial).not.toBe(hook.result.current.journal?.state);
      expect(canonicalJson(hook.result.current.journal?.initial)).toBe(canonicalJson(hook.result.current.journal?.state));
      const loaded = loadCampaign(hook.storage);
      if (loaded.kind !== 'loaded') throw new Error('compacted save must load');
      expect(canonicalJson(hook.result.current.journal)).toBe(canonicalJson(loaded.journal));
      if (history === 'departure') {
        expect(hook.result.current.activity).toBe('menu');
        expect(hook.result.current.portFocusTarget).toBeNull();
      } else {
        expect(hook.result.current.activity).toBe('market');
        expect(hook.result.current.portFocusTarget).toBe('last-voyage');
        expect(hook.result.current.journal?.state.world.lastVoyage).toMatchObject({
          voyageId: 'voyage-254', battleId: 'voyage-254-battle', result: 'victory',
          outcome: { kind: 'surrender', victorShipId: 'player' },
        });
      }
    },
    30_000,
  );

  it.each(['departure', 'resolution'] as const)(
    'publishes the event-257 %s in memory, then retry adopts compaction without a second effect',
    async (history) => {
      const resolutionFixture = history === 'resolution' ? resolutionThresholdFixture() : null;
      const predecessor = history === 'departure'
        ? departureThresholdPredecessor()
        : resolutionFixture!.predecessor;
      const hook = await createPersistedController(predecessor);
      hook.injected.writer = failedWriter();
      act(() => hook.result.current.selectActivity('market'));

      await act(() => history === 'departure'
        ? hook.result.current.setSail()
        : hook.result.current.resolveBattle(resolutionFixture!.resolution));
      expect(hook.result.current.journal?.state.lastEventId).toBe(256);
      expect(hook.result.current.activity).toBe('market');
      expect(hook.result.current.portFocusTarget).toBeNull();

      act(() => hook.result.current.continueWithoutSaving());
      expect(hook.result.current.journal?.events).toHaveLength(257);
      expect(hook.result.current.journal?.events.at(-1)).toMatchObject({
        id: 257,
        type: history === 'departure' ? 'voyage-started' : 'naval-resolved',
      });
      if (history === 'departure') {
        expect(hook.result.current.activity).toBe('menu');
        act(() => hook.result.current.selectActivity('tavern'));
      } else {
        expect(hook.result.current.portFocusTarget).toBe('last-voyage');
        act(() => hook.result.current.acknowledgePortFocus());
      }

      hook.injected.writer = createCampaignWriter(immediateLocks);
      await act(() => hook.result.current.retrySaving());
      expect(hook.result.current.journal?.events).toEqual([]);
      expect(hook.result.current.journal?.initial).toEqual(hook.result.current.journal?.state);
      expect(hook.result.current.journal?.initial).not.toBe(hook.result.current.journal?.state);
      expect(canonicalJson(hook.result.current.journal?.initial)).toBe(canonicalJson(hook.result.current.journal?.state));
      const loaded = loadCampaign(hook.storage);
      if (loaded.kind !== 'loaded') throw new Error('retried compacted save must load');
      expect(canonicalJson(hook.result.current.journal)).toBe(canonicalJson(loaded.journal));
      if (history === 'departure') {
        expect(hook.result.current.activity).toBe('tavern');
      } else {
        expect(hook.result.current.portFocusTarget).toBeNull();
        expect(hook.result.current.journal?.state.world.lastVoyage).toMatchObject({
          voyageId: 'voyage-254', battleId: 'voyage-254-battle', result: 'victory',
        });
      }
    },
    30_000,
  );

  it('adopts the compacted journal returned by a successful mutation save', async () => {
    const storage = memoryStorage();
    const journal = departureThresholdPredecessor();
    persist(storage, journal);
    const injected = runtime(storage);
    const { result } = renderHook(() => useCaribbean(injected));
    await act(() => result.current.resume());
    const quote = quoteTrade(result.current.journal!.state, {
      portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta: -1,
    });
    if (!quote.ok) throw new Error('fixture quote failed');

    await act(() => result.current.dispatch(marketTradeDraft(quote)));

    expect(result.current.journal?.state.lastEventId).toBe(257);
    expect(result.current.journal?.events).toEqual([]);
    expect(storage.setItem.mock.calls.filter(([key]) => key === CURRENT_SAVE_KEY)).toHaveLength(2);
  });
});
