import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCampaign } from '../../domain/createCampaign';
import type { CampaignEventDraftFor } from '../../domain/events';
import { appendJournal, createJournal } from '../../domain/replay';
import { loadCampaign, type StorageLike } from '../../storage/persistence';
import { createCampaignWriter, type LockManagerLike } from '../../storage/writer';
import type { CaribbeanRuntime } from '../../state/runtime';
import { CaribbeanPage } from '../CaribbeanPage';
import { Tavern } from './Tavern';

vi.mock('../map/CaribbeanMap', () => ({
  CaribbeanMap: ({ context }: { context: string }) => (
    <section aria-label="Caribbean nautical chart" data-map-context={context} />
  ),
}));

const SENTENCE = 'The Red Jackdaw was sighted east of Bridgetown, running west with the trade wind.';
const NEXT_ACTION = 'Sail east of Bridgetown and identify the Red Jackdaw.';
const originalWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
const originalHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
const immediateLocks: LockManagerLike = {
  async request(_name, _options, callback) { return await callback({}); },
};

function availableState() {
  return createCampaign({ seed: 1702 });
}

function acceptedState() {
  return appendJournal(createJournal(availableState()), {
    type: 'lead-accepted',
    payload: { leadId: 'red-jackdaw' },
  }).state;
}

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

function memoryStorage(): StorageLike & {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
} {
  const data = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, value); }),
    removeItem: vi.fn((key: string) => { data.delete(key); }),
  };
}

function runtime(storage: StorageLike): CaribbeanRuntime {
  return {
    storage,
    storageCapability: { kind: 'available' },
    writer: createCampaignWriter(immediateLocks),
    build: 'fixture',
    now: () => 100,
    makeSeed: () => 1702,
    makeQuarantineId: () => '00000000-0000-4000-8000-000000000001',
  };
}

async function appliedDispatch() {
  return { kind: 'applied' as const, eventId: 1 };
}

afterEach(() => {
  if (originalWidth) Object.defineProperty(window, 'innerWidth', originalWidth);
  if (originalHeight) Object.defineProperty(window, 'innerHeight', originalHeight);
});

describe('<Tavern>', () => {
  it('shows exactly one direct speaker card and one accessible action', () => {
    const { container } = render(
      <Tavern state={availableState()} busy={false} onAccept={appliedDispatch} />,
    );

    expect(screen.getAllByTestId('tavern-rumour-card')).toHaveLength(1);
    expect(screen.getByText(SENTENCE)).toBeInTheDocument();
    const action = screen.getByRole('button', { name: 'Mark on chart' });
    expect(action).toHaveAttribute('data-testid', 'tavern-mark-red-jackdaw');
    expect(container.querySelectorAll('[aria-live]')).toHaveLength(1);
    expect(screen.queryByText(NEXT_ACTION)).not.toBeInTheDocument();
  });

  it('dispatches the one accepted lead draft exactly once even on a duplicate click', () => {
    const onAccept = vi.fn((_draft: CampaignEventDraftFor<'lead-accepted'>) => (
      new Promise<{ kind: 'applied'; eventId: number }>(() => undefined)
    ));
    render(<Tavern state={availableState()} busy={false} onAccept={onAccept} />);

    const action = screen.getByRole('button', { name: 'Mark on chart' });
    fireEvent.click(action);
    fireEvent.click(action);

    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onAccept).toHaveBeenCalledWith({
      type: 'lead-accepted',
      payload: { leadId: 'red-jackdaw' },
    });
  });

  it('releases its local guard when dispatch resolves without publishing acceptance', async () => {
    let resolveDispatch!: (outcome: { kind: 'applied'; eventId: number }) => void;
    const onAccept = vi.fn(() => new Promise<{ kind: 'applied'; eventId: number }>((resolve) => {
      resolveDispatch = resolve;
    }));
    render(<Tavern state={availableState()} busy={false} onAccept={onAccept} />);

    const action = screen.getByRole('button', { name: 'Mark on chart' });
    fireEvent.click(action);
    expect(action).toBeDisabled();

    await act(async () => {
      resolveDispatch({ kind: 'applied', eventId: 1 });
      await Promise.resolve();
    });

    expect(action).toBeEnabled();
    fireEvent.click(action);
    expect(onAccept).toHaveBeenCalledTimes(2);
  });

  it('removes the duplicate action and announces acceptance once', () => {
    const { container } = render(
      <Tavern state={acceptedState()} busy={false} onAccept={appliedDispatch} />,
    );

    expect(screen.queryByRole('button', { name: 'Mark on chart' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent("Marked in the Captain's Log");
    expect(container.querySelectorAll('[aria-live]')).toHaveLength(1);
  });

  it('keeps one reserved action slot when Mark on chart becomes its settled status', () => {
    const { container, rerender } = render(
      <Tavern state={availableState()} busy={false} onAccept={appliedDispatch} />,
    );
    const slot = container.querySelector('.caribbean-tavern-action-slot');

    expect(slot).not.toBeNull();
    expect(slot).toContainElement(screen.getByRole('button', { name: 'Mark on chart' }));
    rerender(<Tavern state={acceptedState()} busy={false} onAccept={appliedDispatch} />);
    expect(container.querySelector('.caribbean-tavern-action-slot')).toBe(slot);
    expect(slot).toContainElement(screen.getByRole('status'));

    const css = readFileSync(resolve('src/games/caribbean/styles/port.css'), 'utf8');
    expect(css).toMatch(/\.caribbean-tavern-action-slot\s*\{[^}]*min-block-size:\s*48px/s);
  });

  it('keeps terminal rumours free of a duplicate acceptance control or stale action', () => {
    const state = acceptedState();
    state.leads[0].status = 'expired';
    render(<Tavern state={state} busy={false} onAccept={appliedDispatch} />);

    expect(screen.getByText('This rumour has gone cold.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark on chart' })).not.toBeInTheDocument();
    expect(screen.queryByText(NEXT_ACTION)).not.toBeInTheDocument();
  });

  it('locks the new action target and focus treatment to the accessibility floor', () => {
    const css = readFileSync(resolve('src/games/caribbean/styles/port.css'), 'utf8');

    expect(css).toMatch(/\.caribbean-tavern-mark\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/s);
    expect(css).toMatch(/\.caribbean-tavern-mark:focus-visible[\s\S]*outline:\s*3px solid var\(--caribbean-trade-wind\)/s);
  });

  it('persists Tavern acceptance through the real controller while navigation adds no event or save', async () => {
    setViewport(1440, 900);
    const storage = memoryStorage();
    const first = render(<CaribbeanPage runtime={runtime(storage)} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start career' }));
    await screen.findByTestId('caribbean-career-ready');
    const writesAfterStart = storage.setItem.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Tavern' }));
    const tavernHeading = await screen.findByRole('heading', { name: 'Tavern' });
    expect(storage.setItem).toHaveBeenCalledTimes(writesAfterStart);
    fireEvent.click(screen.getByRole('button', { name: 'Mark on chart' }));
    await screen.findByText("Marked in the Captain's Log");

    const savedAfterAccept = loadCampaign(storage);
    if (savedAfterAccept.kind !== 'loaded') throw new Error('accepted campaign must load');
    expect(savedAfterAccept.journal.events).toEqual([{
      id: 1,
      type: 'lead-accepted',
      atDay: 0,
      payload: { leadId: 'red-jackdaw' },
    }]);
    expect(savedAfterAccept.journal.state.lastEventId).toBe(1);
    const writesAfterAccept = storage.setItem.mock.calls.length;

    fireEvent.keyDown(tavernHeading, { key: 'Escape' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tavern' })).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: "Captain's Log" }));
    expect(await screen.findByText(NEXT_ACTION)).toBeInTheDocument();
    expect(storage.setItem).toHaveBeenCalledTimes(writesAfterAccept);
    expect(loadCampaign(storage)).toMatchObject({
      kind: 'loaded',
      journal: { state: { lastEventId: 1 } },
    });

    first.unmount();
    render(<CaribbeanPage runtime={runtime(storage)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume career' }));
    await screen.findByTestId('caribbean-career-ready');
    fireEvent.click(screen.getByRole('button', { name: "Captain's Log" }));

    expect(await screen.findByText(NEXT_ACTION)).toBeInTheDocument();
    expect(screen.getByText('18 days remaining')).toBeInTheDocument();
    expect(loadCampaign(storage)).toMatchObject({
      kind: 'loaded',
      journal: { state: { lastEventId: 1 } },
    });
  });
});
