import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { CARGO_IDS } from '../../content/campaign';
import { createCampaign } from '../../domain/createCampaign';
import { marketTradeDraft, quoteTrade } from '../../domain/economy';
import type { CampaignEventDraftFor } from '../../domain/events';
import { appendJournal, createJournal } from '../../domain/replay';
import type { CampaignStateV1 } from '../../domain/types';
import { loadCampaign, saveCampaign, type StorageLike } from '../../storage/persistence';
import { createCampaignWriter, type LockManagerLike } from '../../storage/writer';
import type { CaribbeanRuntime } from '../../state/runtime';
import { useCaribbean } from '../../state/useCaribbean';
import { CaribbeanPage } from '../CaribbeanPage';
import { Market } from './Market';

type MemoryStorage = StorageLike & {
  getItem: ReturnType<typeof vi.fn<(key: string) => string | null>>;
  setItem: ReturnType<typeof vi.fn<(key: string, value: string) => void>>;
  removeItem: ReturnType<typeof vi.fn<(key: string) => void>>;
};

const originalWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
const originalHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');

const immediateLocks: LockManagerLike = {
  async request(_name, _options, callback) { return await callback({}); },
};

function memoryStorage(): MemoryStorage {
  const data = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, value); }),
    removeItem: vi.fn((key: string) => { data.delete(key); }),
  };
}

function denyAfterFirstLock(error = new Error('ownership denied')): LockManagerLike {
  let requestCount = 0;
  return {
    async request(_name, _options, callback) {
      requestCount += 1;
      if (requestCount > 1) throw error;
      return await callback({});
    },
  };
}

function runtime(store: StorageLike, locks: LockManagerLike = immediateLocks): CaribbeanRuntime {
  return {
    storage: store,
    storageCapability: { kind: 'available' },
    writer: createCampaignWriter(locks),
    build: 'market-fixture',
    now: () => 200,
    makeSeed: () => 1702,
    makeQuarantineId: () => '00000000-0000-4000-8000-000000000001',
  };
}

function persistOpeningCampaign(store: StorageLike): void {
  const result = saveCampaign(
    store,
    createJournal(createCampaign({ seed: 1702, name: 'Morgan' })),
    { build: 'market-fixture', savedAt: 100, expectedRevision: { currentRaw: null, previousRaw: null } },
  );
  if (!result.ok) throw new Error('opening campaign fixture failed to save');
}

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

function openingState(): CampaignStateV1 {
  return createCampaign({ seed: 1702, name: 'Morgan' });
}

async function appliedTrade() {
  return { kind: 'applied' as const, eventId: 1 };
}

function StatefulMarket() {
  const [journal, setJournal] = useState(() => createJournal(openingState()));
  const trade = async (draft: CampaignEventDraftFor<'market-traded'>) => {
    setJournal((current) => appendJournal(current, draft));
    return { kind: 'applied' as const, eventId: 1 };
  };
  return <Market state={journal.state} busy={false} onTrade={trade} />;
}

function ControllerMarketHarness({ injected }: { injected: CaribbeanRuntime }) {
  const controller = useCaribbean(injected);
  if (controller.journal === null) {
    return <button data-testid="market-harness-resume" type="button" onClick={() => void controller.resume()}>Resume market</button>;
  }
  return (
    <>
      <Market
        state={controller.journal.state}
        busy={controller.busy}
        onTrade={controller.dispatch}
      />
      {controller.persistence.kind === 'consent-required' && (
        <button data-testid="market-harness-consent" type="button" onClick={controller.continueWithoutSaving}>
          Continue without saving
        </button>
      )}
    </>
  );
}

afterEach(() => {
  if (originalWidth) Object.defineProperty(window, 'innerWidth', originalWidth);
  if (originalHeight) Object.defineProperty(window, 'innerHeight', originalHeight);
  window.location.hash = '';
});

describe('<Market>', () => {
  it('renders the six authored goods in order as a compact fixed-price cargo ledger', () => {
    render(<Market state={openingState()} busy={false} onTrade={appliedTrade} />);

    const summary = screen.getByRole('region', { name: 'Cargo summary' });
    expect(summary).toHaveTextContent('500 gold');
    expect(summary).toHaveTextContent('54 / 100 hold');
    expect(summary).toHaveTextContent('3.4 months');

    const rows = within(screen.getByRole('list', { name: 'Cargo goods' })).getAllByRole('listitem');
    expect(rows).toHaveLength(6);
    expect(rows.map((row) => within(row).getByRole('heading').textContent)).toEqual([
      'Provisions',
      'Tools & common goods',
      'Luxuries',
      'Sugar & molasses',
      'Tobacco & dyewood',
      'Powder & arms',
    ]);
    expect(rows.map((row) => row.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining('34 owned4 gold / unitCheap'),
      expect.stringContaining('4 owned18 gold / unitExpensive'),
      expect.stringContaining('0 owned32 gold / unitFair'),
      expect.stringContaining('0 owned10 gold / unitFair'),
      expect.stringContaining('0 owned13 gold / unitFair'),
      expect.stringContaining('0 owned26 gold / unitExpensive'),
    ]));
    for (const row of rows) {
      const cue = within(row).getByTestId(`${row.dataset.cargoId}-price-cue`);
      expect(cue.querySelector('svg')).not.toBeNull();
      expect(cue).toHaveTextContent(/Cheap|Fair|Expensive/);
    }
  });

  it('gives all six one-tap actions per good a unique name, test id, and 44px target contract', () => {
    render(<Market state={openingState()} busy={false} onTrade={appliedTrade} />);

    expect(screen.getByRole('button', { name: 'Sell all Provisions' })).toHaveAttribute('data-testid', 'market-provisions-sell-all');
    expect(screen.getByRole('button', { name: 'Sell 5 Provisions' })).toHaveAttribute('data-testid', 'market-provisions-sell-5');
    expect(screen.getByRole('button', { name: 'Sell 1 Provisions' })).toHaveAttribute('data-testid', 'market-provisions-sell-1');
    expect(screen.getByRole('button', { name: 'Buy 1 Provisions' })).toHaveAttribute('data-testid', 'market-provisions-buy-1');
    expect(screen.getByRole('button', { name: 'Buy 5 Provisions' })).toHaveAttribute('data-testid', 'market-provisions-buy-5');
    expect(screen.getByRole('button', { name: 'Buy maximum Provisions' })).toHaveAttribute('data-testid', 'market-provisions-buy-max');

    const controls = screen.getAllByRole('button');
    const ids = controls.map((control) => control.dataset.testid);
    expect(controls).toHaveLength(36);
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);

    const css = readFileSync(resolve('src/games/caribbean/styles/port.css'), 'utf8');
    expect(css).toMatch(/\.caribbean-market-action\s*\{[^}]*min-height:\s*44px/s);
    expect(css).toMatch(/\.caribbean-market-action\s*\{[^}]*min-width:\s*44px/s);
    expect(css).toMatch(/\.caribbean-market-action:focus-visible[\s\S]*outline:\s*3px solid var\(--caribbean-trade-wind\)/s);
  });

  it('gives the ledger breathing room and uses a stronger accessible red for warnings', () => {
    const css = readFileSync(resolve('src/games/caribbean/styles/port.css'), 'utf8');
    const theme = readFileSync(resolve('src/games/caribbean/styles/theme.css'), 'utf8');

    expect(css).toMatch(/\.caribbean-market\s*\{[^}]*padding:\s*20px 22px 22px/s);
    expect(css).toMatch(/\.caribbean-market-price-cue\s*\{[^}]*background:\s*#07151d/s);
    expect(theme).toMatch(/--caribbean-signal-red:\s*#e55243/);
    expect(css).toMatch(/\.caribbean-market-price-cue--expensive\s*\{[^}]*var\(--caribbean-signal-red\) 96%/s);
    expect(css).toMatch(/\.caribbean-market-severity--critical\s*\{[^}]*var\(--caribbean-signal-red\) 96%/s);
  });

  it('disables impossible actions and places the exact reason beside their row', () => {
    const { rerender } = render(
      <Market state={openingState()} busy={false} onTrade={appliedTrade} />,
    );

    const toolsSellFive = screen.getByRole('button', { name: 'Sell 5 Tools & common goods' });
    expect(toolsSellFive).toBeDisabled();
    expect(toolsSellFive).toHaveAccessibleDescription('Only 4 aboard.');
    expect(toolsSellFive.closest('[data-cargo-id="tools"]')).toContainElement(screen.getByText('Only 4 aboard.'));

    const luxurySellOne = screen.getByRole('button', { name: 'Sell 1 Luxuries' });
    expect(luxurySellOne).toBeDisabled();
    expect(luxurySellOne).toHaveAccessibleDescription('None aboard to sell.');

    const full = openingState();
    full.fleet.ships[0].cargo['sugar-molasses'] = 46;
    rerender(<Market state={full} busy={false} onTrade={appliedTrade} />);
    const noSpace = screen.getByRole('button', { name: 'Buy 1 Provisions' });
    expect(noSpace).toBeDisabled();
    expect(noSpace).toHaveAccessibleDescription('Not enough hold space.');

    const poor = openingState();
    poor.wealth.gold = 3;
    rerender(<Market state={poor} busy={false} onTrade={appliedTrade} />);
    const noGold = screen.getByRole('button', { name: 'Buy 1 Provisions' });
    expect(noGold).toBeDisabled();
    expect(noGold).toHaveAccessibleDescription('Not enough gold.');
  });

  it('dispatches exactly one resolved semantic event for one click', async () => {
    const onTrade = vi.fn(appliedTrade);
    render(<Market state={openingState()} busy={false} onTrade={onTrade} />);

    fireEvent.click(screen.getByRole('button', { name: 'Buy 5 Provisions' }));
    await act(async () => { await Promise.resolve(); });

    expect(onTrade).toHaveBeenCalledTimes(1);
    expect(onTrade).toHaveBeenCalledWith({
      type: 'market-traded',
      payload: {
        portId: 'bridgetown',
        shipId: 'mistral',
        cargoId: 'provisions',
        delta: 5,
        unitPrice: 4,
      },
    });
  });

  it('quotes every click from current props instead of retaining a stale quote', async () => {
    const onTrade = vi.fn(appliedTrade);
    const { rerender } = render(<Market state={openingState()} busy={false} onTrade={onTrade} />);
    const changed = openingState();
    changed.fleet.ships[0].cargo.provisions = 2;
    rerender(<Market state={changed} busy={false} onTrade={onTrade} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sell all Provisions' }));
    await act(async () => { await Promise.resolve(); });

    expect(onTrade).toHaveBeenCalledTimes(1);
    expect(onTrade).toHaveBeenCalledWith(expect.objectContaining({
      type: 'market-traded',
      payload: expect.objectContaining({ cargoId: 'provisions', delta: -2 }),
    }));
  });

  it('bounds Max by both the sloop hold and current gold', async () => {
    const onTrade = vi.fn(appliedTrade);
    const { rerender } = render(<Market state={openingState()} busy={false} onTrade={onTrade} />);

    fireEvent.click(screen.getByRole('button', { name: 'Buy maximum Provisions' }));
    expect(onTrade).toHaveBeenLastCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ cargoId: 'provisions', delta: 46 }),
    }));
    await act(async () => { await Promise.resolve(); });

    const goldLimited = openingState();
    goldLimited.wealth.gold = 100;
    rerender(<Market state={goldLimited} busy={false} onTrade={onTrade} />);
    fireEvent.click(screen.getByRole('button', { name: 'Buy maximum Luxuries' }));
    await act(async () => { await Promise.resolve(); });
    expect(onTrade).toHaveBeenLastCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ cargoId: 'luxuries', delta: 3 }),
    }));
  });

  it('disables every trade while busy with a visible adjacent reason', () => {
    render(<Market state={openingState()} busy onTrade={appliedTrade} />);

    const controls = screen.getAllByRole('button');
    expect(controls).toHaveLength(36);
    for (const control of controls) {
      expect(control).toBeDisabled();
    }
    expect(controls[0]).not.toHaveAccessibleDescription('Trade is being saved.');
    expect(screen.queryByText('Trade is being saved.')).not.toBeInTheDocument();
  });

  it('keeps reason slots and one polite status node stable without announcing an obvious successful update', async () => {
    let resolveTrade!: (value: { kind: 'applied'; eventId: number }) => void;
    const onTrade = vi.fn(() => new Promise<{ kind: 'applied'; eventId: number }>((resolve) => {
      resolveTrade = resolve;
    }));
    const { container } = render(<Market state={openingState()} busy={false} onTrade={onTrade} />);

    const status = screen.getByTestId('caribbean-market-status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('');
    expect(container.querySelectorAll('.caribbean-market-reasons')).toHaveLength(6);
    expect(screen.getByTestId('caribbean-market')).toHaveAttribute('aria-busy', 'false');

    const action = screen.getByTestId('market-provisions-buy-5');
    action.focus();
    fireEvent.click(action);
    expect(onTrade).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('caribbean-market-status')).toBe(status);
    expect(status).toHaveTextContent('Saving trade.');
    expect(screen.getByTestId('caribbean-market')).toHaveAttribute('aria-busy', 'true');
    expect(document.activeElement).toBe(action);

    await act(async () => { resolveTrade({ kind: 'applied', eventId: 1 }); });
    expect(screen.getByTestId('caribbean-market-status')).toBe(status);
    expect(status).toHaveTextContent('');
    expect(screen.queryByText('Cargo ledger updated.')).not.toBeInTheDocument();
    expect(screen.getByTestId('caribbean-market')).toHaveAttribute('aria-busy', 'false');
    expect(document.activeElement).toBe(action);
  });

  it.each([
    ['not applied', async () => ({ kind: 'not-applied' as const }), 'Trade was not saved.'],
    ['rejected', async () => { throw new Error('writer rejected'); }, 'Trade was not saved.'],
  ])('releases local trade ownership and announces failure when dispatch is %s', async (_label, onTrade, copy) => {
    const trade = vi.fn(onTrade);
    render(<Market state={openingState()} busy={false} onTrade={trade} />);

    const action = screen.getByTestId('market-provisions-buy-5');
    await act(async () => {
      fireEvent.click(action);
      await Promise.resolve();
    });
    expect(screen.getByTestId('caribbean-market-status')).toHaveTextContent(copy);
    await act(async () => {
      fireEvent.click(action);
      await Promise.resolve();
    });
    expect(trade).toHaveBeenCalledTimes(2);
  });

  it('keeps an activated action focusable and guarded after its resolved trade makes it illegal', async () => {
    function ExhaustingMarket() {
      const [state, setState] = useState(() => {
        const next = openingState();
        next.fleet.ships[0].cargo.provisions = 1;
        return next;
      });
      return <Market
        state={state}
        busy={false}
        onTrade={async (draft) => {
          setState((current) => appendJournal(createJournal(current), draft).state);
          return { kind: 'applied', eventId: 1 };
        }}
      />;
    }

    render(<ExhaustingMarket />);
    const action = screen.getByTestId('market-provisions-sell-all');
    action.focus();
    fireEvent.click(action);
    await waitFor(() => expect(screen.getByTestId('caribbean-market-status')).toHaveTextContent(''));
    expect(action).toHaveAttribute('aria-disabled', 'true');
    expect(action).toBeEnabled();
    expect(document.activeElement).toBe(action);
    fireEvent.keyDown(action, { key: 'Enter' });
    fireEvent.keyDown(action, { key: ' ' });
    expect(screen.getByTestId('caribbean-market-status')).toHaveTextContent('');
  });

  it.each([
    [10, '1.0 months', null],
    [9, '0.9 months', 'Low'],
    [5, '0.5 months', 'Low'],
    [4, '0.4 months', 'Critical'],
  ] as const)('shows text-and-shape provision severity for %i provisions', (quantity, months, severity) => {
    const state = openingState();
    state.fleet.ships[0].cargo.provisions = quantity;
    render(<Market state={state} busy={false} onTrade={appliedTrade} />);

    const summary = screen.getByRole('region', { name: 'Cargo summary' });
    expect(summary).toHaveTextContent(months);
    if (severity === null) {
      expect(within(summary).queryByTestId('market-provisions-severity')).not.toBeInTheDocument();
    } else {
      const marker = within(summary).getByTestId('market-provisions-severity');
      expect(marker).toHaveTextContent(severity);
      expect(marker.querySelector('svg')).not.toBeNull();
      expect(marker).toHaveAttribute('data-severity', severity.toLowerCase());
    }
  });

  it('renders only the six cargo resources without consuming or mutating campaign state', () => {
    const state = openingState();
    const before = structuredClone(state);
    render(<Market state={state} busy={false} onTrade={appliedTrade} />);

    expect(state).toEqual(before);
    expect(screen.getAllByRole('listitem')).toHaveLength(CARGO_IDS.length);
    expect(screen.queryByText(/food|water|consumption/i)).not.toBeInTheDocument();
  });

  it('shows 480 gold, 59 / 100 hold, and 3.9 months together after a successful +5 trade', async () => {
    render(<StatefulMarket />);

    fireEvent.click(screen.getByRole('button', { name: 'Buy 5 Provisions' }));

    await waitFor(() => {
      const summary = screen.getByRole('region', { name: 'Cargo summary' });
      expect(summary).toHaveTextContent('480 gold');
      expect(summary).toHaveTextContent('59 / 100 hold');
      expect(summary).toHaveTextContent('3.9 months');
    });
  });

  it('holds denied-writer totals at the persisted predecessor until explicit memory-only consent', async () => {
    const store = memoryStorage();
    persistOpeningCampaign(store);
    render(<ControllerMarketHarness injected={runtime(store, denyAfterFirstLock())} />);

    fireEvent.click(screen.getByRole('button', { name: 'Resume market' }));
    await screen.findByRole('region', { name: 'Cargo summary' });
    fireEvent.click(screen.getByRole('button', { name: 'Buy 5 Provisions' }));

    const consent = await screen.findByRole('button', { name: 'Continue without saving' });
    let summary = screen.getByRole('region', { name: 'Cargo summary' });
    expect(summary).toHaveTextContent('500 gold');
    expect(summary).toHaveTextContent('54 / 100 hold');
    expect(summary).toHaveTextContent('3.4 months');
    expect(loadCampaign(store)).toMatchObject({
      kind: 'loaded',
      journal: { state: { wealth: { gold: 500 }, lastEventId: 0 } },
    });

    fireEvent.click(consent);
    await waitFor(() => {
      summary = screen.getByRole('region', { name: 'Cargo summary' });
      expect(summary).toHaveTextContent('480 gold');
      expect(summary).toHaveTextContent('59 / 100 hold');
      expect(summary).toHaveTextContent('3.9 months');
    });
  });

  it('replaces the market with the frozen conflict choices instead of leaving trade controls visible', async () => {
    setViewport(1440, 900);
    const store = memoryStorage();
    persistOpeningCampaign(store);
    render(<CaribbeanPage runtime={runtime(store)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume career' }));
    await screen.findByTestId('caribbean-career-ready');
    fireEvent.click(screen.getByRole('button', { name: 'Market' }));
    await screen.findByRole('button', { name: 'Buy 5 Provisions' });

    const observed = loadCampaign(store);
    if (observed.kind !== 'loaded') throw new Error('conflict fixture must load');
    const externalQuote = quoteTrade(observed.journal.state, {
      portId: 'bridgetown', shipId: 'mistral', cargoId: 'tools', delta: -1,
    });
    if (!externalQuote.ok) throw new Error('external fixture must quote');
    const externalSave = saveCampaign(
      store,
      appendJournal(observed.journal, marketTradeDraft(externalQuote)),
      { build: 'external', savedAt: 150, expectedRevision: observed.revision },
    );
    if (!externalSave.ok) throw new Error('external fixture must save');

    fireEvent.click(screen.getByRole('button', { name: 'Buy 5 Provisions' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A newer save exists.');
    expect(screen.queryByRole('button', { name: 'Buy 5 Provisions' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload newer save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export in-memory journal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue without saving' })).toBeInTheDocument();
  });
});
