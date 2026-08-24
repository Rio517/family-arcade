import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createCampaign } from '../../domain/createCampaign';
import { createJournal } from '../../domain/replay';
import type { PortActivity } from '../../domain/types';
import { loadCampaign, type StorageLike } from '../../storage/persistence';
import { createCampaignWriter, type LockManagerLike } from '../../storage/writer';
import type { CaribbeanRuntime } from '../../state/runtime';
import type { CaribbeanController } from '../../state/useCaribbean';
import { CaribbeanPage } from '../CaribbeanPage';
import { PortPage } from './PortPage';

const originalWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
const originalHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
const immediateLocks: LockManagerLike = {
  async request(_name, _options, callback) { return await callback({}); },
};

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

function makeStorage(): StorageLike & {
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

function makeRuntime(storage: StorageLike): CaribbeanRuntime {
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

function StatefulPort({
  dispatch = vi.fn(async () => undefined),
  onSelection = vi.fn(),
}: {
  dispatch?: CaribbeanController['dispatch'];
  onSelection?: (activity: PortActivity) => void;
}) {
  const [journal] = useState(() => createJournal(createCampaign({ seed: 1702, name: 'Morgan' })));
  const [activity, setActivity] = useState<PortActivity>('menu');
  const controller: CaribbeanController = {
    load: { kind: 'empty', revision: { currentRaw: null, previousRaw: null } },
    journal,
    activity,
    busy: false,
    persistence: { kind: 'persisted' },
    recoveryWriterCapability: 'available',
    recoveryFailure: null,
    start: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
    continueWithoutSaving: vi.fn(),
    dispatch,
    retrySaving: vi.fn(async () => undefined),
    reloadExternalSave: vi.fn(async () => undefined),
    exportInMemoryJournal: vi.fn(() => null),
    recover: vi.fn(async () => undefined),
    continueRecovery: vi.fn(async () => undefined),
    abandon: vi.fn(async () => undefined),
    selectActivity(next) {
      onSelection(next);
      setActivity(next);
    },
    closeActivity() { setActivity('menu'); },
  };
  return <PortPage controller={controller} />;
}

afterEach(() => {
  if (originalWidth) Object.defineProperty(window, 'innerWidth', originalWidth);
  if (originalHeight) Object.defineProperty(window, 'innerHeight', originalHeight);
});

describe('<PortPage>', () => {
  it.each([
    ['minimum supported playfield', 960, 600],
    ['desktop playfield', 1440, 900],
  ])('keeps one logical heading/status/stage/navigation structure at the %s', (_label, width, height) => {
    setViewport(width, height);
    render(<StatefulPort />);

    const shell = screen.getByTestId('caribbean-career-ready');
    const headings = within(shell).getAllByRole('heading');
    expect(headings.map((heading) => [heading.tagName, heading.textContent])).toEqual([
      ['H1', 'Bridgetown'],
      ['H2', 'Choose your next port action'],
    ]);
    expect(within(shell).getByRole('region', { name: 'Voyage status' })).toBeInTheDocument();
    expect(within(shell).getByRole('region', { name: 'Port activity' })).toBeInTheDocument();
    expect(within(shell).getByRole('navigation', { name: 'Bridgetown activities' })).toBeInTheDocument();
  });

  it('shows the glanceable Bridgetown, captain, ship, crew, morale, gold, and provisions facts', () => {
    render(<StatefulPort />);

    const status = screen.getByRole('region', { name: 'Voyage status' });
    expect(status).toHaveTextContent('Bridgetown');
    expect(status).toHaveTextContent('1675');
    expect(status).toHaveTextContent('500 gold');
    expect(status).toHaveTextContent('50 aboard');
    expect(status).toHaveTextContent('Content');
    expect(status).toHaveTextContent('Mistral');
    expect(status).toHaveTextContent('Hull 100 · Sails 100');
    expect(status).toHaveTextContent('3.4 months');
    expect(screen.getByText('Captain Morgan')).toBeInTheDocument();
  });

  it('opens six useful nonempty activities without dispatching a canonical event', () => {
    const dispatch = vi.fn(async () => undefined);
    const onSelection = vi.fn();
    render(<StatefulPort dispatch={dispatch} onSelection={onSelection} />);

    const cases = [
      ["Governor's House", 'English control', 'Standing: Neutral (0)', 'Peace holds in Bridgetown.', 'No commission offered today.'],
      ['Tavern', 'Hear concise leads from Bridgetown’s waterfront.'],
      ['Market', 'Compare six cargo prices and their hold impact.'],
      ['Shipyard', 'Sloop', 'Hold 54 / 100', 'Repairs and refits open after a profitable voyage.'],
      ['Divide Shares', 'Available after a profitable voyage'],
      ["Captain's Log", 'Review one clear next action for every active lead.'],
    ] as const;

    for (const [label, ...copy] of cases) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(screen.getByRole('heading', { name: label })).toBeInTheDocument();
      for (const text of copy) expect(screen.getByText(text, { exact: false })).toBeInTheDocument();
    }
    expect(onSelection.mock.calls.map(([activity]) => activity)).toEqual([
      'governor', 'tavern', 'market', 'shipyard', 'shares', 'log',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Set Sail' }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('moves focus into an activity, then Escape closes it and restores its trigger focus', async () => {
    render(<StatefulPort />);

    const trigger = screen.getByRole('button', { name: 'Shipyard' });
    fireEvent.click(trigger);
    const heading = screen.getByRole('heading', { name: 'Shipyard' });
    await waitFor(() => expect(heading).toHaveFocus());

    fireEvent.keyDown(heading, { key: 'Escape' });
    expect(screen.getByRole('heading', { name: 'Choose your next port action' })).toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('gives every rendered interactive control a stable unique test id', () => {
    render(<StatefulPort />);
    fireEvent.click(screen.getByRole('button', { name: 'Market' }));

    const controls = screen.getAllByRole('button');
    const ids = controls.map((control) => control.dataset.testid);
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps real activity navigation out of the journal and storage boundary', async () => {
    setViewport(1440, 900);
    const storage = makeStorage();
    render(<CaribbeanPage runtime={makeRuntime(storage)} />);
    fireEvent.change(screen.getByLabelText('Captain name'), { target: { value: 'Morgan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start career' }));
    await screen.findByTestId('caribbean-career-ready');

    const writesAfterStart = storage.setItem.mock.calls.length;
    const before = loadCampaign(storage);
    if (before.kind !== 'loaded') throw new Error('fixture campaign must be saved');
    expect(before.journal.state.lastEventId).toBe(0);
    const readsBeforeNavigation = storage.getItem.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Market' }));
    expect(await screen.findByRole('heading', { name: 'Market' })).toBeInTheDocument();
    expect(storage.setItem).toHaveBeenCalledTimes(writesAfterStart);
    expect(storage.getItem).toHaveBeenCalledTimes(readsBeforeNavigation);
    const after = loadCampaign(storage);
    if (after.kind !== 'loaded') throw new Error('fixture campaign must remain saved');
    expect(after.journal).toEqual(before.journal);
    expect(after.journal.state.lastEventId).toBe(0);
  });

  it('locks the compact horizontal overlay CSS and accessibility floors', () => {
    const portCss = readFileSync(resolve('src/games/caribbean/styles/port.css'), 'utf8');
    const fontPixels = [...portCss.matchAll(/font-size:\s*([\d.]+)px/g)].map((match) => Number(match[1]));

    expect(fontPixels.length).toBeGreaterThan(0);
    expect(fontPixels.every((pixels) => pixels >= 14)).toBe(true);
    expect(portCss).toMatch(/\.caribbean-port-action\s*\{[^}]*min-height:\s*44px/s);
    expect(portCss).toMatch(/\.caribbean-port-close\s*\{[^}]*min-height:\s*44px/s);
    expect(portCss).toMatch(/\.caribbean-port-action:focus-visible[\s\S]*outline:\s*3px solid var\(--caribbean-trade-wind\)/s);
    expect(portCss).toMatch(/@media \(prefers-reduced-motion: no-preference\)[\s\S]*animation:/s);
    expect(portCss).toMatch(/\.caribbean-port-actions\s*\{[^}]*grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\)/s);
    expect(portCss).not.toMatch(/@media\s*\([^)]*max-width/s);
    expect(portCss).not.toContain('.caribbean-minimum-screen');
    expect(portCss).not.toMatch(/grid-template-columns:\s*(?:[3-9]\d\d|\d{4,})px\s+1fr/);
  });
});
