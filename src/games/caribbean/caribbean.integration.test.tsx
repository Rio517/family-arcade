import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import campaignVictory from '../../../scripts/fixtures/caribbean-campaign-victory.json';
import { CaribbeanPage } from './components/CaribbeanPage';
import { createCampaign } from './domain/createCampaign';
import { marketTradeDraft, quoteTrade } from './domain/economy';
import { appendJournal, createJournal } from './domain/replay';
import type { CampaignJournal } from './domain/events';
import { replayBattle, type CommandSegment } from './domain/naval/replay';
import type { NavalBattleInput, NavalCommand } from './domain/naval/types';
import { navalEngagedDraft } from './domain/voyage';
import type { CaribbeanRuntime } from './state/runtime';
import { manualNavalSession, type ManualNavalSession } from './state/naval/testSession';
import {
  CURRENT_SAVE_KEY,
  PREVIOUS_SAVE_KEY,
  loadCampaign,
  saveCampaign,
  type StorageLike,
} from './storage/persistence';
import { QUARANTINE_KEY_PREFIX, serializeRecoveryExport } from './storage/recovery';
import { parseSaveEnvelope } from './storage/schema';
import { createCampaignWriter, type LockManagerLike } from './storage/writer';
import { defaultProfile } from '@shared/profile/profile';
import { emptyUsersState } from '@shared/profile/users';
import { getUsersSnapshot, setUsersState } from '@shared/profile/usersStore';

const navalSessionFactory = vi.hoisted(() => vi.fn());
vi.mock('./components/map/CaribbeanMap', () => ({
  CaribbeanMap: ({ context }: { context: string }) => (
    <section aria-label="Caribbean nautical chart" data-map-context={context} />
  ),
}));
vi.mock('./state/naval/useNavalSession', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const support = await vi.importActual<typeof import('./state/naval/testSession')>('./state/naval/testSession');
  return {
    useNavalSession(input: NavalBattleInput) {
      const [session] = React.useState(() => navalSessionFactory(input) ?? support.manualNavalSession({ input }));
      return session;
    },
  };
});

const originalWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
const originalHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');

const immediateLocks: LockManagerLike = {
  async request(_name, _options, callback) {
    return await callback({});
  },
};

function deferredLocks() {
  let callback: (() => unknown | PromiseLike<unknown>) | null = null;
  let resolveRequest: ((value: unknown) => void) | null = null;
  let rejectRequest: ((error: unknown) => void) | null = null;
  const request = vi.fn((
    _name: string,
    _options: { mode: 'exclusive' },
    next: (lock: unknown) => unknown | PromiseLike<unknown>,
  ) => {
    callback = () => next({});
    return new Promise((resolve, reject) => {
      resolveRequest = resolve;
      rejectRequest = reject;
    });
  });
  return {
    locks: { request } as LockManagerLike,
    request,
    async settle() {
      if (callback === null || resolveRequest === null) throw new Error('No pending lock request');
      try {
        resolveRequest(await callback());
      } catch (error) {
        rejectRequest?.(error);
      }
    },
  };
}

function setViewport(width = 1440, height = 900): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

function runtime(options: {
  storage?: StorageLike;
  locks?: LockManagerLike | null;
  seed?: number;
  now?: number[];
  quarantineIds?: string[];
} = {}): CaribbeanRuntime {
  const times = [...(options.now ?? [100, 200, 300, 400, 500, 600])];
  const ids = [...(options.quarantineIds ?? ['00000000-0000-4000-8000-000000000001'])];
  return {
    storage: options.storage ?? window.localStorage,
    storageCapability: { kind: 'available' },
    writer: createCampaignWriter(options.locks === undefined ? immediateLocks : options.locks),
    build: 'integration-build',
    now: () => times.shift() ?? 999,
    makeSeed: () => options.seed ?? 1702,
    makeQuarantineId: () => ids.shift() ?? '00000000-0000-4000-8000-000000000099',
  };
}

function persist(store: StorageLike, journal: CampaignJournal, savedAt: number): CampaignJournal {
  const loaded = loadCampaign(store);
  if (loaded.kind === 'storage-unavailable' || loaded.kind === 'unreadable') {
    throw new Error(`fixture load failed: ${loaded.kind}`);
  }
  const result = saveCampaign(store, journal, {
    build: 'integration-build',
    savedAt,
    expectedRevision: loaded.revision,
  });
  if (!result.ok) throw new Error(`fixture save failed: ${result.reason}`);
  return result.journal;
}

async function beginRecommendedCareer(root: HTMLElement = document.body): Promise<void> {
  fireEvent.click(within(root).getByRole('button', { name: 'Start career' }));
  await within(root).findByTestId('caribbean-career-ready');
}

async function openPortActivity(label: string, root: HTMLElement = document.body): Promise<void> {
  fireEvent.click(within(root).getByRole('button', { name: label }));
  await waitFor(() => expect(within(root).getByRole('heading', { name: label, level: 2 })).toHaveFocus());
}

async function closeActivity(root: HTMLElement = document.body): Promise<void> {
  const done = within(root).queryByRole('button', { name: 'Done' });
  fireEvent.click(done ?? within(root).getByRole('button', { name: 'Back to harbour' }));
  await within(root).findByRole('heading', { name: 'Choose your next port action' });
}

function loadedJournal(store: StorageLike): CampaignJournal {
  const loaded = loadCampaign(store);
  if (loaded.kind !== 'loaded') throw new Error(`expected loaded save, got ${loaded.kind}`);
  return loaded.journal;
}

function campaignVictorySegments(): CommandSegment[] {
  const fixture = campaignVictory as unknown as {
    expected: { atTick: number };
    segments: Array<{ atTick: number } & NavalCommand>;
  };
  return fixture.segments.flatMap((row, index) => {
    const untilTick = fixture.segments[index + 1]?.atTick ?? fixture.expected.atTick;
    const player: NavalCommand = {
      rudder: row.rudder,
      sail: row.sail,
      ammunition: row.ammunition,
      fire: row.fire,
    };
    if (row.fire === null) return [{ fromTick: row.atTick, untilTick, player }];
    return [
      { fromTick: row.atTick, untilTick: row.atTick + 1, player },
      { fromTick: row.atTick + 1, untilTick, player: { ...player, fire: null } },
    ];
  });
}

function terminalCampaignSession(input: NavalBattleInput): ManualNavalSession {
  const terminal = replayBattle(input, campaignVictorySegments());
  const session = manualNavalSession({ input });
  Object.assign(session.state, structuredClone(terminal));
  session.setSail(terminal.ships.player.sail);
  return session;
}

describe('Caribbean integrated production journey', () => {
  let capturedBlobParts: unknown[] | null;

  beforeEach(() => {
    setViewport();
    window.location.hash = '#/caribbean';
    window.localStorage.clear();
    capturedBlobParts = null;
    navalSessionFactory.mockReset();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.stubGlobal('Blob', class {
      constructor(parts: unknown[]) {
        capturedBlobParts = parts;
      }
    });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:caribbean-integration'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    setUsersState(emptyUsersState());
    window.location.hash = '';
    if (originalWidth) Object.defineProperty(window, 'innerWidth', originalWidth);
    if (originalHeight) Object.defineProperty(window, 'innerHeight', originalHeight);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('snapshots active profile identity at setup while later shared-profile pronoun changes leave the journal unchanged', async () => {
    const store = window.localStorage;
    setUsersState({
      users: [{
        id: 'mario',
        profile: { ...defaultProfile(), name: 'Mario', pronouns: 'he/him' },
      }],
      activeId: 'mario',
    });
    const first = render(<CaribbeanPage runtime={runtime({ storage: store })} />);

    expect(screen.getByLabelText('Captain name')).toHaveValue('Mario');
    expect(screen.getByLabelText('Player pronouns')).toHaveValue('he/him');
    fireEvent.click(screen.getByRole('button', { name: 'Start career' }));
    await screen.findByTestId('caribbean-career-ready');
    expect(loadedJournal(store).state.captain).toMatchObject({ name: 'Mario', pronouns: 'he/him' });
    first.unmount();

    const users = getUsersSnapshot();
    setUsersState({
      ...users,
      users: users.users.map((user) => user.id === 'mario'
        ? { ...user, profile: { ...user.profile, pronouns: 'they/them' } }
        : user),
    });

    render(<CaribbeanPage runtime={runtime({ storage: store })} />);
    expect(screen.getByRole('heading', { name: 'Mario’s commission' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume career' }));
    await screen.findByTestId('caribbean-career-ready');
    expect(loadedJournal(store).state.captain).toMatchObject({ name: 'Mario', pronouns: 'he/him' });
    expect(getUsersSnapshot().users[0]?.profile.pronouns).toBe('they/them');
  });

  it('persists setup -> trade -> rumour -> log while port navigation stays transient', async () => {
    const store = window.localStorage;
    const first = render(<CaribbeanPage runtime={runtime({ storage: store, seed: 1702, now: [100, 200, 300] })} />);

    await beginRecommendedCareer();
    await openPortActivity('Market');
    fireEvent.click(screen.getByRole('button', { name: 'Buy 5 Provisions' }));
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Cargo summary' })).getByText('3.9 months')).toBeVisible());
    await closeActivity();
    await openPortActivity('Tavern');
    fireEvent.click(screen.getByRole('button', { name: 'Mark on chart' }));
    await screen.findByText("Marked in the Captain's Log");
    await closeActivity();
    await openPortActivity("Captain's Log");

    expect(screen.getByText('Sail east of Bridgetown and identify the Red Jackdaw.')).toBeVisible();
    expect(loadedJournal(store).state.lastEventId).toBe(2);
    first.unmount();

    render(<CaribbeanPage runtime={runtime({ storage: store })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume career' }));
    await screen.findByTestId('caribbean-career-ready');
    expect(screen.getByRole('region', { name: 'Voyage status' })).toHaveTextContent('3.9 months');
    expect(loadedJournal(store).state.lastEventId).toBe(2);
  });

  it('completes the literal two-voyage campaign through a real-domain terminal Return and reloads its safe log', async () => {
    const store = window.localStorage;
    const first = render(<CaribbeanPage runtime={runtime({
      storage: store,
      seed: 1702,
      now: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    })} />);

    await beginRecommendedCareer();
    await openPortActivity('Tavern');
    fireEvent.click(screen.getByRole('button', { name: 'Mark on chart' }));
    await screen.findByText("Marked in the Captain's Log");
    await closeActivity();
    fireEvent.click(screen.getByTestId('port-action-set-sail'));
    await screen.findByTestId('voyage-continue-east');

    first.unmount();
    window.location.hash = '#/caribbean?resume=1';
    const resumed = render(<CaribbeanPage runtime={runtime({ storage: store, now: [1_000, 1_100, 1_200, 1_300, 1_400, 1_500] })} />);
    await screen.findByTestId('voyage-continue-east');
    fireEvent.click(screen.getByTestId('voyage-continue-east'));
    await screen.findByTestId('encounter-avoid');
    fireEvent.click(screen.getByTestId('encounter-avoid'));
    await screen.findByTestId('caribbean-career-ready');

    fireEvent.click(screen.getByTestId('port-action-set-sail'));
    await screen.findByTestId('voyage-continue-east');
    fireEvent.click(screen.getByTestId('voyage-continue-east'));
    await screen.findByTestId('encounter-pursue');
    const encounter = loadedJournal(store);
    const terminalSession = terminalCampaignSession(navalEngagedDraft(encounter.state).payload.input);
    navalSessionFactory.mockReturnValue(terminalSession);
    fireEvent.click(screen.getByTestId('encounter-pursue'));
    expect(await screen.findByTestId('naval-result-action')).toHaveTextContent('Return to Bridgetown');

    const beforeReturn = loadedJournal(store);
    expect(beforeReturn.events).toHaveLength(7);
    expect(beforeReturn.state.mode).toMatchObject({
      kind: 'naval', voyageId: 'voyage-5', battleId: 'voyage-5-battle',
      input: { seed: 1_971_161_494 },
    });
    fireEvent.click(screen.getByTestId('naval-result-action'));
    expect(await screen.findByTestId('caribbean-career-ready')).toBeInTheDocument();
    expect(screen.getByTestId('port-action-log')).toHaveFocus();
    expect(screen.getByText('Mistral lies secure beneath the trade wind. Choose the next call from the harbour line.')).toBeVisible();
    expect(screen.getByTestId('port-action-set-sail')).toBeDisabled();
    expect(screen.getByText('The Red Jackdaw lead is complete.')).toBeVisible();

    const completed = loadedJournal(store);
    expect(completed.events.map(({ id, type, atDay }) => ({ id, type, atDay }))).toEqual([
      { id: 1, type: 'lead-accepted', atDay: 0 },
      { id: 2, type: 'voyage-started', atDay: 0 },
      { id: 3, type: 'sea-leg-completed', atDay: 0 },
      { id: 4, type: 'encounter-avoided', atDay: 1 },
      { id: 5, type: 'voyage-started', atDay: 2 },
      { id: 6, type: 'sea-leg-completed', atDay: 2 },
      { id: 7, type: 'naval-engaged', atDay: 3 },
      { id: 8, type: 'naval-resolved', atDay: 3 },
    ]);
    expect(completed.state).toMatchObject({
      calendar: { elapsedDays: 4 },
      rng: { navigation: 2_953_755_055, naval: 1_971_161_494 },
      mode: { kind: 'port', portId: 'bridgetown' },
      world: {
        targetDefeated: true,
        lastVoyage: {
          voyageId: 'voyage-5', battleId: 'voyage-5-battle', result: 'victory',
          outcome: { kind: 'boarding-ready', victorShipId: 'player' }, returnedDay: 4,
        },
      },
      fleet: {
        flagshipId: 'mistral',
        ships: [{ id: 'mistral', hull: 100, sails: 100, crew: 50, cannon: 8, cargo: { provisions: 30 } }],
      },
      leads: [{ id: 'red-jackdaw', status: 'completed' }],
    });
    expect(completed.events.filter(({ type }) => type === 'naval-resolved')).toHaveLength(1);

    resumed.unmount();
    const canonicalBeforeReload = JSON.stringify(completed);
    render(<CaribbeanPage runtime={runtime({ storage: store })} />);
    expect(await screen.findByTestId('caribbean-career-ready')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('port-action-log'));
    expect(await screen.findByTestId('captains-log-last-voyage')).toHaveTextContent('Victory — Red Jackdaw ready to board · Returned on day 4.');
    expect(screen.getByTestId('captains-log-last-voyage')).toHaveTextContent(
      'Bridgetown’s harbour crew made Mistral ready for the next departure; the battle outcome remains in this log, but its damage is not carried onto the ready flagship.',
    );
    expect(JSON.stringify(loadedJournal(store))).toBe(canonicalBeforeReload);
  }, 15_000);

  it('exports corrupt bytes, quarantines them under writer ownership, republishes the canonical previous save, and resumes after reload', async () => {
    const store = window.localStorage;
    const initial = createJournal(createCampaign({ seed: 1702, name: 'Morgan' }));
    persist(store, initial, 10);
    const quote = quoteTrade(initial.state, {
      portId: 'bridgetown', shipId: 'mistral', cargoId: 'provisions', delta: 5,
    });
    if (!quote.ok) throw new Error('fixture trade must quote');
    persist(store, appendJournal(initial, marketTradeDraft(quote)), 20);
    const knownPreviousRaw = store.getItem(PREVIOUS_SAVE_KEY);
    if (knownPreviousRaw === null) throw new Error('fixture previous save is missing');
    const knownPrevious = parseSaveEnvelope(knownPreviousRaw);
    if (!knownPrevious.ok) throw new Error('fixture previous save is invalid');
    const corruptCurrentRaw = '{not-json:exact-corrupt-current';
    store.setItem(CURRENT_SAVE_KEY, corruptCurrentRaw);
    const degraded = loadCampaign(store);
    if (degraded.kind !== 'loaded') throw new Error('fixture did not degrade to previous');

    const view = render(<CaribbeanPage runtime={runtime({ storage: store, now: [30, 40] })} />);
    expect(screen.getByRole('heading', { name: 'Campaign recovery required' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download recovery file' }));
    expect(capturedBlobParts).toEqual([
      serializeRecoveryExport(degraded.revision, degraded.unreadableSlots),
    ]);
    expect(String(capturedBlobParts?.[0])).toContain(corruptCurrentRaw);

    fireEvent.click(screen.getByRole('button', { name: 'Recover known-good campaign' }));
    await screen.findByRole('heading', { name: 'Morgan’s commission' });

    const quarantineKeys = Object.keys(store).filter((key) => key.startsWith(QUARANTINE_KEY_PREFIX));
    expect(quarantineKeys).toHaveLength(1);
    expect(store.getItem(quarantineKeys[0])).toContain(corruptCurrentRaw);
    const recovered = loadCampaign(store);
    expect(recovered).toMatchObject({ kind: 'loaded', recovered: false, unreadableSlots: [] });
    if (recovered.kind !== 'loaded') throw new Error('recovery did not publish a clean save');
    expect(recovered.journal).toEqual(knownPrevious.envelope.payload);
    const recoveredCurrentRaw = store.getItem(CURRENT_SAVE_KEY);
    if (recoveredCurrentRaw === null) throw new Error('recovered current is missing');
    const recoveredEnvelope = parseSaveEnvelope(recoveredCurrentRaw);
    if (!recoveredEnvelope.ok) throw new Error('recovered current is invalid');
    expect(recoveredEnvelope.envelope.checksum).toBe(knownPrevious.envelope.checksum);
    view.unmount();

    render(<CaribbeanPage runtime={runtime({ storage: store })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume career' }));
    expect(await screen.findByTestId('caribbean-career-ready')).toHaveTextContent('Morgan');
    expect(screen.getByRole('region', { name: 'Voyage status' })).toHaveTextContent('3.4 months');
    expect(loadCampaign(store)).toMatchObject({ kind: 'loaded', recovered: false, unreadableSlots: [] });
  });

  it('publishes nothing without a writer until explicit memory consent and never changes storage afterward', async () => {
    const store = window.localStorage;
    render(<CaribbeanPage runtime={runtime({ storage: store, locks: null })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start career' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/safe save ownership is unavailable/i);
    expect(screen.queryByTestId('caribbean-career-ready')).not.toBeInTheDocument();
    expect(store.getItem(CURRENT_SAVE_KEY)).toBeNull();
    expect(store.getItem(PREVIOUS_SAVE_KEY)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Continue without saving' }));
    await screen.findByTestId('caribbean-career-ready');
    expect(screen.getByRole('status')).toHaveTextContent('This career is not being saved. Keep this tab open.');
    await openPortActivity('Market');
    fireEvent.click(screen.getByRole('button', { name: 'Buy 5 Provisions' }));
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Cargo summary' })).getByText('3.9 months')).toBeVisible());

    expect(screen.getByRole('status')).toHaveTextContent('This career is not being saved. Keep this tab open.');
    expect(store.getItem(CURRENT_SAVE_KEY)).toBeNull();
    expect(store.getItem(PREVIOUS_SAVE_KEY)).toBeNull();
  });

  it('freezes a two-controller conflict, exports the local fork, then reloads the external journal by choice', async () => {
    const store = window.localStorage;
    persist(store, createJournal(createCampaign({ seed: 1702, name: 'Morgan' })), 10);
    const tree = render(
      <>
        <div data-testid="controller-a"><CaribbeanPage runtime={runtime({ storage: store })} /></div>
        <div data-testid="controller-b"><CaribbeanPage runtime={runtime({ storage: store })} /></div>
      </>,
    );
    const a = within(tree.getByTestId('controller-a'));
    const b = within(tree.getByTestId('controller-b'));
    fireEvent.click(a.getByRole('button', { name: 'Resume career' }));
    fireEvent.click(b.getByRole('button', { name: 'Resume career' }));
    await a.findByTestId('caribbean-career-ready');
    await b.findByTestId('caribbean-career-ready');

    await openPortActivity('Tavern', tree.getByTestId('controller-a'));
    fireEvent.click(a.getByRole('button', { name: 'Mark on chart' }));
    await a.findByText("Marked in the Captain's Log");
    await openPortActivity('Market', tree.getByTestId('controller-b'));
    fireEvent.click(b.getByRole('button', { name: 'Buy 5 Provisions' }));
    expect(await b.findByRole('alert')).toHaveTextContent(/newer save exists/i);
    expect(loadedJournal(store).events.map((event) => event.type)).toEqual(['lead-accepted']);

    fireEvent.click(b.getByRole('button', { name: 'Export in-memory journal' }));
    expect(String(capturedBlobParts?.[0])).toContain('market-traded');
    fireEvent.click(b.getByRole('button', { name: 'Reload newer save' }));
    await b.findByTestId('caribbean-career-ready');
    expect(loadedJournal(store).events.map((event) => event.type)).toEqual(['lead-accepted']);
    await openPortActivity("Captain's Log", tree.getByTestId('controller-b'));
    expect(b.getByText('Sail east of Bridgetown and identify the Red Jackdaw.')).toBeVisible();
  });

  it('lets an acquired mutation finish exactly once after unmount and a new page resumes it', async () => {
    const store = window.localStorage;
    persist(store, createJournal(createCampaign({ seed: 1702, name: 'Morgan' })), 10);
    const injected = runtime({ storage: store });
    const first = render(<CaribbeanPage runtime={injected} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume career' }));
    await screen.findByTestId('caribbean-career-ready');
    const deferred = deferredLocks();
    injected.writer = createCampaignWriter(deferred.locks);
    await openPortActivity('Tavern');
    fireEvent.click(screen.getByRole('button', { name: 'Mark on chart' }));
    await waitFor(() => expect(deferred.request).toHaveBeenCalledTimes(1));
    first.unmount();

    await act(async () => deferred.settle());

    expect(loadedJournal(store).events.map((event) => event.type)).toEqual(['lead-accepted']);
    render(<CaribbeanPage runtime={runtime({ storage: store })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume career' }));
    await screen.findByTestId('caribbean-career-ready');
    await openPortActivity("Captain's Log");
    expect(screen.getByText('Sail east of Bridgetown and identify the Red Jackdaw.')).toBeVisible();
  });
});
