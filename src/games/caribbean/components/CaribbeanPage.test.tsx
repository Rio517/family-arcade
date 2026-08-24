import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCampaign } from '../domain/createCampaign';
import { createJournal } from '../domain/replay';
import { loadCampaign, saveCampaign, type StorageLike } from '../storage/persistence';
import { createCampaignWriter, type LockManagerLike } from '../storage/writer';
import type { CaribbeanRuntime } from '../state/runtime';
import { defaultProfile } from '@shared/profile/profile';
import { emptyUsersState } from '@shared/profile/users';
import { getUsersSnapshot, setUsersState } from '@shared/profile/usersStore';
import { CaribbeanPage } from './CaribbeanPage';

const originalWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
const originalHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
const immediateLocks: LockManagerLike = {
  async request(_name, _options, callback) { return await callback({}); },
};
const deniedLocks: LockManagerLike = {
  async request() { throw new Error('ownership denied'); },
};

function observedImmediateLocks() {
  const request = vi.fn((
    _name: string,
    _options: { mode: 'exclusive' },
    callback: (lock: unknown) => unknown | PromiseLike<unknown>,
  ) => Promise.resolve(callback({})));
  return { locks: { request } as LockManagerLike, request };
}

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
      if (!callback || !resolveRequest) throw new Error('No pending lock request');
      try {
        resolveRequest(await callback());
      } catch (error) {
        rejectRequest?.(error);
      }
    },
  };
}

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

function storage(): StorageLike & { getItem: ReturnType<typeof vi.fn> } {
  const data = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, value); }),
    removeItem: vi.fn((key: string) => { data.delete(key); }),
  };
}

function operationFailingStorage(operation: 'read-current' | 'read-previous'): StorageLike {
  return {
    getItem(key) {
      if (
        operation === 'read-current' && key === 'caribbean:campaign:current'
        || operation === 'read-previous' && key === 'caribbean:campaign:previous'
      ) throw new DOMException(operation, 'SecurityError');
      return null;
    },
    setItem: vi.fn(),
    removeItem: vi.fn(),
  };
}

function runtime(store = storage()): CaribbeanRuntime {
  return {
    storage: store,
    storageCapability: { kind: 'available' },
    writer: createCampaignWriter(immediateLocks),
    build: 'fixture',
    now: () => 100,
    makeSeed: () => 1702,
    makeQuarantineId: () => '00000000-0000-4000-8000-000000000001',
  };
}

function seedSave(store: StorageLike): void {
  const result = saveCampaign(store, createJournal(createCampaign({ seed: 1702, name: 'Morgan' })), {
    build: 'fixture', savedAt: 100, expectedRevision: { currentRaw: null, previousRaw: null },
  });
  if (!result.ok) throw new Error('fixture save failed');
}

afterEach(() => {
  cleanup();
  if (originalWidth) Object.defineProperty(window, 'innerWidth', originalWidth);
  if (originalHeight) Object.defineProperty(window, 'innerHeight', originalHeight);
  window.location.hash = '';
  setUsersState(emptyUsersState());
});

describe('<CaribbeanPage>', () => {
  it('prefills setup from the active profile, snapshots the captain, and preserves the site-wide name', async () => {
    setViewport(1440, 900);
    const store = storage();
    setUsersState({
      users: [{
        id: 'mario',
        createdAt: 0,
        profile: { ...defaultProfile(), name: 'Mario', pronouns: 'he/him' },
      }],
      activeId: 'mario',
    });
    const { unmount } = render(<CaribbeanPage runtime={runtime(store)} />);

    expect(screen.getByLabelText('Captain name')).toHaveValue('Mario');
    expect(screen.getByLabelText('Player pronouns')).toHaveValue('he/him');
    expect(screen.queryByLabelText('Career length')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Captain name'), { target: { value: 'Red Morgan' } });
    fireEvent.change(screen.getByLabelText('Player pronouns'), { target: { value: 'they/them' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start career' }));
    await screen.findByTestId('caribbean-career-ready');

    expect(loadCampaign(store)).toMatchObject({
      kind: 'loaded',
      journal: { state: { captain: { name: 'Red Morgan', pronouns: 'they/them' } } },
    });
    expect(getUsersSnapshot().users[0]?.profile).toMatchObject({ name: 'Mario', pronouns: 'they/them' });
    unmount();
  });

  it('keeps the controller-owning child outside the tree on unsupported screens', () => {
    setViewport(1024, 1366);
    const store = storage();
    render(<CaribbeanPage runtime={runtime(store)} />);

    expect(screen.getByRole('alert')).toHaveTextContent('960 × 600 playfield');
    expect(store.getItem).not.toHaveBeenCalled();
  });

  it('keeps the first supplied runtime across rerenders and StrictMode probe remounts', () => {
    setViewport(1440, 900);
    const firstStore = storage();
    const secondStore = storage();
    const first = runtime(firstStore);
    const second = runtime(secondStore);
    const { rerender } = render(
      <StrictMode><CaribbeanPage runtime={first} /></StrictMode>,
    );
    expect(screen.getByRole('heading', { name: 'Sign a captain’s commission' })).toBeInTheDocument();

    rerender(<StrictMode><CaribbeanPage runtime={second} /></StrictMode>);
    expect(firstStore.getItem).toHaveBeenCalled();
    expect(secondStore.getItem).not.toHaveBeenCalled();
  });

  it('auto-resumes only a clean save when the Save Station query is present', async () => {
    setViewport(1440, 900);
    const store = storage();
    seedSave(store);
    window.location.hash = '#/caribbean?resume=1';

    const observed = observedImmediateLocks();
    const injected = runtime(store);
    injected.writer = createCampaignWriter(observed.locks);
    const writesBefore = vi.mocked(store.setItem).mock.calls.length;
    render(<CaribbeanPage runtime={injected} />);

    expect(await screen.findByTestId('caribbean-career-ready')).toHaveTextContent('Morgan');
    expect(observed.request).toHaveBeenCalledTimes(1);
    expect(store.setItem).toHaveBeenCalledTimes(writesBefore);
    expect(loadCampaign(store)).toMatchObject({ kind: 'loaded', recovered: false });
  });

  it('survives StrictMode rehearsal and settles one deferred query resume without a duplicate or stale summary', async () => {
    setViewport(1440, 900);
    const store = storage();
    seedSave(store);
    window.location.hash = '#/caribbean?resume=1';
    const deferred = deferredLocks();
    const injected = runtime(store);
    injected.writer = createCampaignWriter(deferred.locks);
    const writesBefore = vi.mocked(store.setItem).mock.calls.length;

    render(<StrictMode><CaribbeanPage runtime={injected} /></StrictMode>);

    await waitFor(() => expect(deferred.request).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('heading', { name: 'Morgan’s commission' })).toBeInTheDocument();
    expect(screen.queryByTestId('caribbean-career-ready')).not.toBeInTheDocument();

    await act(async () => deferred.settle());

    expect(await screen.findByTestId('caribbean-career-ready')).toHaveTextContent('Morgan');
    expect(screen.queryByRole('heading', { name: 'Morgan’s commission' })).not.toBeInTheDocument();
    expect(deferred.request).toHaveBeenCalledTimes(1);
    expect(store.setItem).toHaveBeenCalledTimes(writesBefore);
  });

  it('does not bypass recovery or request writer ownership for a degraded save even with the resume query', () => {
    setViewport(1440, 900);
    const store = storage();
    seedSave(store);
    store.setItem('caribbean:campaign:previous', '{corrupt');
    window.location.hash = '#/caribbean?resume=1';

    const observed = observedImmediateLocks();
    const injected = runtime(store);
    injected.writer = createCampaignWriter(observed.locks);
    render(<CaribbeanPage runtime={injected} />);

    expect(screen.getByRole('heading', { name: 'Campaign recovery required' })).toBeInTheDocument();
    expect(screen.queryByTestId('caribbean-career-ready')).not.toBeInTheDocument();
    expect(observed.request).not.toHaveBeenCalled();
  });

  it('renders saving-disabled setup and constructs memory state only after the explicit second action', () => {
    setViewport(1440, 900);
    const denied = new DOMException('Storage denied', 'SecurityError');
    const guarded: StorageLike = {
      getItem: () => { throw denied; },
      setItem: () => { throw denied; },
      removeItem: () => { throw denied; },
    };
    const makeSeed = vi.fn(() => 1702);
    const injected: CaribbeanRuntime = {
      storage: guarded,
      storageCapability: { kind: 'unavailable', error: denied },
      writer: createCampaignWriter(immediateLocks),
      build: 'fixture', now: () => 100, makeSeed,
      makeQuarantineId: () => '00000000-0000-4000-8000-000000000001',
    };
    render(<CaribbeanPage runtime={injected} />);

    expect(screen.getByRole('status')).toHaveTextContent(/Saving disabled/i);
    fireEvent.click(screen.getByRole('button', { name: 'Start career' }));
    expect(makeSeed).not.toHaveBeenCalled();
    expect(screen.queryByTestId('caribbean-career-ready')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continue without saving' }));
    expect(makeSeed).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('caribbean-career-ready')).toHaveTextContent('Captain');
    expect(screen.getByRole('status')).toHaveTextContent(/not being saved/i);
  });

  it.each(['read-current', 'read-previous'] as const)(
    'renders operation-level saving-disabled consent after an initial %s failure',
    async (operation) => {
      setViewport(1440, 900);
      const makeSeed = vi.fn(() => 1702);
      const injected: CaribbeanRuntime = {
        storage: operationFailingStorage(operation),
        storageCapability: { kind: 'available' },
        writer: createCampaignWriter(immediateLocks),
        build: 'fixture', now: () => 100, makeSeed,
        makeQuarantineId: () => '00000000-0000-4000-8000-000000000001',
      };
      render(<CaribbeanPage runtime={injected} />);

      expect(screen.getByRole('status')).toHaveTextContent(/Saving disabled/i);
      fireEvent.click(screen.getByRole('button', { name: 'Start career' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/storage is unavailable/i);
      expect(makeSeed).not.toHaveBeenCalled();
      expect(screen.queryByTestId('caribbean-career-ready')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Continue without saving' }));
      expect(makeSeed).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('caribbean-career-ready')).toHaveTextContent('Captain');
    },
  );

  it('gives the memory-only Retry saving control a stable semantic test id', async () => {
    setViewport(1440, 900);
    const injected = runtime();
    injected.writer = createCampaignWriter(deniedLocks);
    render(<CaribbeanPage runtime={injected} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start career' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue without saving' }));

    expect(screen.getByRole('button', { name: 'Retry saving' })).toHaveAttribute(
      'data-testid',
      'caribbean-retry-saving-button',
    );
  });
});
