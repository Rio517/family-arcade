import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createCampaign } from '../../domain/createCampaign';
import { appendJournal, createJournal } from '../../domain/replay';
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

const MIN_INLINE_CLEARANCE_PX = 8;
const CONSERVATIVE_GLYPH_EM = {
  condensedUppercase: 0.75,
  monospaceDigits: 0.64,
} as const;
const STATUS_CONTENT_BUDGETS_PX = [64, 72, 68, 178, 92] as const;
const ACTIVITY_LABEL_FOR_TEST = {
  governor: "Governor's House",
  tavern: 'Tavern',
  market: 'Market',
  shipyard: 'Shipyard',
  shares: 'Divide Shares',
  log: "Captain's Log",
} as const;

function ruleBodyContaining(css: string, selector: string, after = 0): string {
  const selectorIndex = css.indexOf(selector, after);
  if (selectorIndex < 0) throw new Error(`Missing CSS selector: ${selector}`);
  const openBrace = css.indexOf('{', selectorIndex);
  const closeBrace = css.indexOf('}', openBrace);
  if (openBrace < 0 || closeBrace < 0) throw new Error(`Incomplete CSS rule: ${selector}`);
  return css.slice(openBrace + 1, closeBrace);
}

function declaration(ruleBody: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return ruleBody.match(new RegExp(`(?:^|;)\\s*${escaped}:\\s*([^;]+)`))?.[1]?.trim() ?? null;
}

function ruleBodyWithDeclaration(css: string, selector: string, property: string, after = 0): string {
  let cursor = after;
  while (cursor < css.length) {
    const selectorIndex = css.indexOf(selector, cursor);
    if (selectorIndex < 0) break;
    const openBrace = css.indexOf('{', selectorIndex);
    const closeBrace = css.indexOf('}', openBrace);
    if (openBrace < 0 || closeBrace < 0) break;
    const body = css.slice(openBrace + 1, closeBrace);
    if (declaration(body, property) !== null) return body;
    cursor = closeBrace + 1;
  }
  throw new Error(`Missing ${property} declaration for CSS selector: ${selector}`);
}

function splitCssTerms(value: string): string[] {
  const terms: string[] = [];
  let depth = 0;
  let term = '';
  for (const character of value) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (/\s/.test(character) && depth === 0) {
      if (term.length > 0) terms.push(term);
      term = '';
    } else {
      term += character;
    }
  }
  if (term.length > 0) terms.push(term);
  return terms;
}

function lengthPixels(value: string, viewportWidth: number): number {
  const trimmed = value.trim();
  const clampMatch = trimmed.match(/^clamp\(([^,]+),\s*([^,]+),\s*([^,]+)\)$/);
  if (clampMatch) {
    const minimum = lengthPixels(clampMatch[1] ?? '', viewportWidth);
    const preferred = lengthPixels(clampMatch[2] ?? '', viewportWidth);
    const maximum = lengthPixels(clampMatch[3] ?? '', viewportWidth);
    return Math.min(maximum, Math.max(minimum, preferred));
  }
  if (trimmed.endsWith('px')) return Number.parseFloat(trimmed);
  if (trimmed.endsWith('vw')) return Number.parseFloat(trimmed) * viewportWidth / 100;
  throw new Error(`Unsupported CSS length in layout contract: ${trimmed}`);
}

function verticalLengthPixels(value: string, viewportHeight: number): number {
  const trimmed = value.trim();
  const clampMatch = trimmed.match(/^clamp\(([^,]+),\s*([^,]+),\s*([^,]+)\)$/);
  if (clampMatch) {
    const minimum = verticalLengthPixels(clampMatch[1] ?? '', viewportHeight);
    const preferred = verticalLengthPixels(clampMatch[2] ?? '', viewportHeight);
    const maximum = verticalLengthPixels(clampMatch[3] ?? '', viewportHeight);
    return Math.min(maximum, Math.max(minimum, preferred));
  }
  if (trimmed.endsWith('px')) return Number.parseFloat(trimmed);
  if (trimmed.endsWith('vh')) return Number.parseFloat(trimmed) * viewportHeight / 100;
  throw new Error(`Unsupported vertical CSS length in layout contract: ${trimmed}`);
}

function horizontalPaddingPixels(ruleBody: string, viewportWidth: number): number {
  const padding = declaration(ruleBody, 'padding');
  if (padding === null) throw new Error('Position rule must declare padding');
  const terms = splitCssTerms(padding);
  const inlineStart = terms.length === 1 ? terms[0] : terms[1];
  const inlineEnd = terms.length < 4 ? inlineStart : terms[3];
  return lengthPixels(inlineStart ?? '', viewportWidth) + lengthPixels(inlineEnd ?? '', viewportWidth);
}

function conservativeTextWidth(
  text: string,
  fontSize: number,
  glyphEm: number,
  letterSpacingEm: number,
): number {
  return text.length * fontSize * glyphEm
    + Math.max(0, text.length - 1) * fontSize * letterSpacingEm;
}

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

function makePortController(
  journal: NonNullable<CaribbeanController['journal']>,
  overrides: Partial<CaribbeanController> = {},
): CaribbeanController {
  return Object.assign({
    load: { kind: 'empty', revision: { currentRaw: null, previousRaw: null } },
    journal, activity: 'menu', busy: false, persistence: { kind: 'persisted' },
    recoveryWriterCapability: 'available', recoveryFailure: null,
    start: vi.fn(), resume: vi.fn(), continueWithoutSaving: vi.fn(), dispatch: vi.fn(),
    setSail: vi.fn(), completeSeaLeg: vi.fn(), avoidEncounter: vi.fn(), engageEncounter: vi.fn(),
    withdrawBattle: vi.fn(), resolveBattle: vi.fn(), portFocusTarget: null,
    acknowledgePortFocus: vi.fn(), retrySaving: vi.fn(), reloadExternalSave: vi.fn(),
    exportInMemoryJournal: vi.fn(), recover: vi.fn(), continueRecovery: vi.fn(), abandon: vi.fn(),
    selectActivity: vi.fn(), closeActivity: vi.fn(),
  } as CaribbeanController, overrides);
}

function StatefulPort({
  dispatch = vi.fn(async () => ({ kind: 'not-applied' as const })),
  onSelection = vi.fn(),
  initialActivity = 'menu',
  activeLead = false,
  setSailOutcome = 'not-applied',
}: {
  dispatch?: CaribbeanController['dispatch'];
  onSelection?: (activity: PortActivity) => void;
  initialActivity?: PortActivity;
  activeLead?: boolean;
  setSailOutcome?: 'applied' | 'not-applied';
}) {
  const [journal] = useState(() => {
    const created = createJournal(createCampaign({ seed: 1702, name: 'Morgan' }));
    return activeLead ? appendJournal(created, { type: 'lead-accepted', payload: { leadId: 'red-jackdaw' } }) : created;
  });
  const [activity, setActivity] = useState<PortActivity>(initialActivity);
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
    setSail: vi.fn(async () => {
      const outcome = setSailOutcome === 'applied'
        ? { kind: 'applied' as const, eventId: journal.state.lastEventId + 1 }
        : { kind: 'not-applied' as const };
      if (outcome.kind === 'applied') setActivity('menu');
      return outcome;
    }),
    completeSeaLeg: vi.fn(async () => ({ kind: 'not-applied' as const })),
    avoidEncounter: vi.fn(async () => ({ kind: 'not-applied' as const })),
    engageEncounter: vi.fn(async () => ({ kind: 'not-applied' as const })),
    withdrawBattle: vi.fn(async () => ({ kind: 'not-applied' as const })),
    resolveBattle: vi.fn(async () => ({ kind: 'not-applied' as const })),
    portFocusTarget: null,
    acknowledgePortFocus: vi.fn(),
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

function StatefulReturnFocus({ onAcknowledge }: { onAcknowledge(): void }) {
  const [target, setTarget] = useState<CaribbeanController['portFocusTarget']>('last-voyage');
  const [journal] = useState(() => {
    const active = appendJournal(createJournal(createCampaign({ seed: 1702, name: 'Morgan' })), {
      type: 'lead-accepted', payload: { leadId: 'red-jackdaw' },
    });
    active.state.world.lastVoyage = {
      voyageId: 'voyage-2', battleId: null, result: 'avoided', outcome: null, returnedDay: 2,
    };
    return active;
  });
  const controller = makePortController(journal, {
    portFocusTarget: target,
    acknowledgePortFocus() {
      onAcknowledge();
      setTarget(null);
    },
  });
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

  it('pairs the status facts with quiet decorative instrument marks', () => {
    render(<StatefulPort />);

    const status = screen.getByRole('region', { name: 'Voyage status' });
    const marks = status.querySelectorAll('[data-port-status-icon]');
    expect([...marks].map((mark) => mark.getAttribute('data-port-status-icon'))).toEqual([
      'port', 'gold', 'crew', 'morale', 'ship', 'provisions',
    ]);
    expect([...marks].every((mark) => mark.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('keeps exactly one harbour backdrop while menu, Market, Tavern, and Log rerender', () => {
    render(<StatefulPort />);

    expect(screen.getAllByTestId('caribbean-port-backdrop')).toHaveLength(1);
    for (const activity of ['Market', 'Tavern', "Captain's Log"] as const) {
      fireEvent.click(screen.getByRole('button', { name: activity }));
      expect(screen.getAllByTestId('caribbean-port-backdrop')).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      expect(screen.getAllByTestId('caribbean-port-backdrop')).toHaveLength(1);
    }
  });

  it('layers compact material assets over the existing Bridgetown backdrop', () => {
    render(<StatefulPort />);

    const shell = screen.getByTestId('caribbean-career-ready');
    expect(shell.style.getPropertyValue('--caribbean-port-panel-material')).toMatch(
      /url\(["']?.*port-panel-patina.*\.webp["']?\)/,
    );
    expect(shell.style.getPropertyValue('--caribbean-port-chart-material')).toMatch(
      /url\(["']?.*port-chart-paper.*\.webp["']?\)/,
    );
    expect(screen.getByTestId('caribbean-port-art')).toHaveAttribute(
      'src',
      expect.stringMatching(/bridgetown-1675.*\.webp/),
    );
  });

  it('keeps one chart-led stage and one bottom Done action across every port tab', () => {
    render(<StatefulPort />);

    const stage = screen.getByTestId('caribbean-port-stage');
    expect(screen.getByRole('region', { name: 'Caribbean chart' })).toBeInTheDocument();
    for (const activity of ['Market', 'Tavern', "Captain's Log"] as const) {
      fireEvent.click(screen.getByRole('button', { name: activity }));
      expect(screen.getByTestId('caribbean-port-stage')).toBe(stage);
      expect(stage).not.toHaveClass('caribbean-port-stage--market');
      expect(within(stage).getByRole('button', { name: 'Done' })).toBeInTheDocument();
      fireEvent.click(within(stage).getByRole('button', { name: 'Done' }));
    }
  });

  it('collapses the idle prompt but keeps activity-specific surfaces identifiable', () => {
    render(<StatefulPort />);

    const activity = screen.getByRole('region', { name: 'Port activity' });
    expect(activity).toHaveClass('caribbean-port-activity--menu');
    fireEvent.click(screen.getByRole('button', { name: 'Market' }));
    expect(activity).toHaveClass('caribbean-port-activity--market');
    expect(activity).not.toHaveClass('caribbean-port-activity--menu');
  });

  it('shows activity focus only for keyboard-visible focus, not programmatic focus', () => {
    const css = readFileSync(resolve('src/games/caribbean/styles/port.css'), 'utf8');

    expect(css).not.toMatch(/\.caribbean-port-activity h2:focus\s*\{/);
    expect(css).toMatch(/\.caribbean-port-activity h2:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--caribbean-trade-wind\)/s);
  });

  it('keeps the gradient fallback and every port control usable when harbour art fails', () => {
    render(<StatefulPort />);
    fireEvent.error(screen.getByTestId('caribbean-port-art'));

    expect(screen.getByTestId('caribbean-port-backdrop')).toHaveClass('caribbean-port-backdrop--fallback');
    const actions = ["Governor's House", 'Tavern', 'Market', 'Shipyard', 'Divide Shares', "Captain's Log"];
    for (const name of actions) expect(screen.getByRole('button', { name })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Set Sail' })).toBeDisabled();
  });

  it('opens six useful nonempty activities without dispatching a canonical event', () => {
    const dispatch = vi.fn(async () => ({ kind: 'not-applied' as const }));
    const onSelection = vi.fn();
    render(<StatefulPort dispatch={dispatch} onSelection={onSelection} />);

    const cases = [
      ["Governor's House", 'English control', 'Standing: Neutral (0)', 'Peace holds in Bridgetown.', 'No commission offered today.'],
      ['Tavern', 'The Red Jackdaw was sighted east of Bridgetown, running west with the trade wind.'],
      ['Market', '34 owned', '4 gold / unit', 'Cheap'],
      ['Shipyard', 'Sloop', 'Hold 54 / 100', 'Repairs and refits open after a profitable voyage.'],
      ['Divide Shares', 'Not available until after a profitable voyage', 'approve the crew’s shares and settle the voyage'],
      ["Captain's Log", 'No leads yet'],
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

  it.each(['governor', 'tavern', 'market', 'shipyard', 'shares', 'log'] as const)(
    'resets the open %s activity only after published departure',
    async (activity) => {
      const { rerender } = render(<StatefulPort initialActivity={activity} activeLead setSailOutcome="not-applied" />);
      fireEvent.click(screen.getByTestId('port-action-set-sail'));
      await act(async () => { await Promise.resolve(); });
      expect(screen.getByRole('heading', { name: ACTIVITY_LABEL_FOR_TEST[activity] })).toBeInTheDocument();

      rerender(<StatefulPort initialActivity={activity} activeLead setSailOutcome="applied" />);
      fireEvent.click(screen.getByTestId('port-action-set-sail'));
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Choose your next port action' })).toBeInTheDocument());
    },
  );

  it('focuses the published last voyage action once', async () => {
    const journal = appendJournal(createJournal(createCampaign({ seed: 1702, name: 'Morgan' })), {
      type: 'lead-accepted', payload: { leadId: 'red-jackdaw' },
    });
    journal.state.world.lastVoyage = {
      voyageId: 'voyage-2', battleId: null, result: 'avoided', outcome: null, returnedDay: 2,
    };
    const acknowledgePortFocus = vi.fn();
    const controller = makePortController(journal, {
      portFocusTarget: 'last-voyage', acknowledgePortFocus,
    });
    render(<PortPage controller={controller} />);
    await waitFor(() => expect(screen.getByTestId('port-action-log')).toHaveFocus());
    expect(acknowledgePortFocus).toHaveBeenCalledTimes(1);
  });

  it('keeps focus on Captain\'s Log after acknowledgement clears the return target and rerenders', async () => {
    const acknowledgePortFocus = vi.fn();
    render(<StatefulReturnFocus onAcknowledge={acknowledgePortFocus} />);

    await waitFor(() => expect(acknowledgePortFocus).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId('port-action-log')).toHaveFocus();
    expect(screen.getByTestId('port-action-set-sail')).not.toHaveFocus();
  });

  it('focuses Set Sail on a ready reload and Log on a victorious reload', async () => {
    const ready = appendJournal(createJournal(createCampaign({ seed: 1702, name: 'Morgan' })), {
      type: 'lead-accepted', payload: { leadId: 'red-jackdaw' },
    });
    const { unmount } = render(<PortPage controller={makePortController(ready)} />);
    await waitFor(() => expect(screen.getByTestId('port-action-set-sail')).toHaveFocus());
    unmount();

    const victorious = structuredClone(ready);
    victorious.state.world.targetDefeated = true;
    victorious.state.leads[0].status = 'completed';
    victorious.state.world.lastVoyage = {
      voyageId: 'voyage-2', battleId: 'voyage-2-battle', result: 'victory',
      outcome: { kind: 'surrender', victorShipId: 'player' }, returnedDay: 2,
    };
    render(<PortPage controller={makePortController(victorious)} />);
    await waitFor(() => expect(screen.getByTestId('port-action-log')).toHaveFocus());
  });

  it('focuses the harbour heading when no route or voyage summary is available', async () => {
    render(<StatefulPort />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Choose your next port action' })).toHaveFocus());
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

  it('keeps one brass registration line and no abstract faux skyline blocks', () => {
    const portCss = readFileSync(resolve('src/games/caribbean/styles/port.css'), 'utf8');
    render(<StatefulPort />);

    expect(document.querySelector('.caribbean-port-horizon')).toBeInTheDocument();
    expect(document.querySelector('.caribbean-port-horizon span')).not.toBeInTheDocument();
    expect(portCss).toMatch(/\.caribbean-port-horizon::before\s*\{[^}]*height:\s*1px/s);
    expect(portCss).not.toContain('.caribbean-port-horizon::after');
    expect(portCss).not.toMatch(/\.caribbean-port-horizon span\s*\{/);
  });

  it('gives only non-empty Market live status a minimal opaque ink backplate', () => {
    const portCss = readFileSync(resolve('src/games/caribbean/styles/port.css'), 'utf8');
    const statusRule = ruleBodyContaining(portCss, '.caribbean-market-status:not(:empty)');

    expect(declaration(statusRule, 'width')).toBe('fit-content');
    expect(declaration(statusRule, 'padding-inline')).toBe('6px');
    expect(declaration(statusRule, 'background')).toBe('#07151d');
    expect(ruleBodyContaining(portCss, '.caribbean-market-status')).not.toContain('background:');
  });

  it('gives each separately styled Captain\'s Log action run an explicit opaque ink background', () => {
    const portCss = readFileSync(resolve('src/games/caribbean/styles/port.css'), 'utf8');
    const labelRule = ruleBodyContaining(portCss, '.caribbean-log-action-label');
    const copyRule = ruleBodyContaining(portCss, '.caribbean-log-action-copy');

    expect(declaration(labelRule, 'background')).toBe('#07151d');
    expect(declaration(copyRule, 'background')).toBe('#07151d');
    expect(declaration(labelRule, 'color')).toBe('var(--caribbean-trade-wind)');
    expect(declaration(copyRule, 'color')).toBe('var(--caribbean-sailcloth)');
  });

  it('keeps the measured menu heading and arrival copy on explicit opaque ink', () => {
    const portCss = readFileSync(resolve('src/games/caribbean/styles/port.css'), 'utf8');
    const headingRule = ruleBodyContaining(portCss, '.caribbean-port-activity h2');
    const arrivalRule = ruleBodyWithDeclaration(portCss, '.caribbean-port-arrival', 'background');

    expect(declaration(headingRule, 'background')).toBe('#07151d');
    expect(declaration(arrivalRule, 'background')).toBe('#07151d');
  });

  it.each([
    { label: 'minimum compact playfield', width: 960, height: 600, placeFont: 19 },
    { label: 'compact landscape playfield', width: 1024, height: 768, placeFont: null },
    { label: 'normal desktop playfield', width: 1440, height: 900, placeFont: 21 },
  ])('budgets the place/year at its edge cases and all five facts within the rail at the $label', ({ width, height, placeFont }) => {
    const portCss = readFileSync(resolve('src/games/caribbean/styles/port.css'), 'utf8');
    const railRule = ruleBodyContaining(portCss, '.caribbean-port-status-rail');
    const positionRule = ruleBodyContaining(portCss, '.caribbean-port-position');
    const placeRule = ruleBodyWithDeclaration(portCss, '.caribbean-port-position span', 'font-size');
    const yearRule = ruleBodyWithDeclaration(portCss, '.caribbean-port-position strong', 'font-size');
    const factsRule = ruleBodyContaining(portCss, '.caribbean-port-status-rail dl');
    const factRule = ruleBodyContaining(portCss, '.caribbean-port-status-rail dl div');
    const iconRule = ruleBodyContaining(portCss, '.caribbean-port-status-icon');
    const compactPlaceMedia = portCss.indexOf('@media (max-height: 700px)');
    const compactStatusMediaStart = portCss.indexOf('@media (width <= 1024px)');
    const compactStatusMediaEnd = portCss.indexOf('@media (width <= 960px)', compactStatusMediaStart);
    const compactStatusCss = portCss.slice(compactStatusMediaStart, compactStatusMediaEnd);
    const compactFactRule = width <= 1024
      ? ruleBodyWithDeclaration(compactStatusCss, '.caribbean-port-status-rail dl div', 'grid-template-columns')
      : null;
    const compactIconRule = width <= 1024
      ? ruleBodyWithDeclaration(compactStatusCss, '.caribbean-port-status-icon', 'width')
      : null;
    const compactPlaceRule = height <= 700
      ? ruleBodyWithDeclaration(portCss, '.caribbean-port-position span', 'font-size', compactPlaceMedia)
      : null;

    const firstTrack = splitCssTerms(declaration(railRule, 'grid-template-columns') ?? '')[0];
    const firstTrackPixels = lengthPixels(firstTrack ?? '', width);
    const declaredPlaceFont = lengthPixels(
      declaration(compactPlaceRule ?? placeRule, 'font-size')
        ?? declaration(placeRule, 'font-size')
        ?? '',
      width,
    );
    const declaredYearFont = lengthPixels(declaration(yearRule, 'font-size') ?? '', width);
    const gap = lengthPixels(declaration(positionRule, 'gap') ?? '', width);
    const inlinePadding = horizontalPaddingPixels(positionRule, width);
    const placeLetterSpacing = Number.parseFloat(declaration(placeRule, 'letter-spacing') ?? '0');
    const yearLetterSpacing = Number.parseFloat(declaration(yearRule, 'letter-spacing') ?? '0');
    const placeYearDemand = conservativeTextWidth(
      'BRIDGETOWN',
      declaredPlaceFont,
      CONSERVATIVE_GLYPH_EM.condensedUppercase,
      placeLetterSpacing,
    ) + conservativeTextWidth(
      '1675',
      declaredYearFont,
      CONSERVATIVE_GLYPH_EM.monospaceDigits,
      yearLetterSpacing,
    ) + gap + inlinePadding;

    if (placeFont !== null) {
      expect(declaredPlaceFont).toBe(placeFont);
      expect(declaredYearFont).toBe(14);
      expect(firstTrackPixels - placeYearDemand).toBeGreaterThanOrEqual(MIN_INLINE_CLEARANCE_PX);
    }

    const factFractions = splitCssTerms(declaration(factsRule, 'grid-template-columns') ?? '')
      .map((term) => Number.parseFloat(term));
    const fractionTotal = factFractions.reduce((sum, fraction) => sum + fraction, 0);
    const activeFactRule = compactFactRule ?? factRule;
    const activeIconRule = compactIconRule ?? iconRule;
    const factInlinePadding = horizontalPaddingPixels(activeFactRule, width);
    const factGridTerms = splitCssTerms(declaration(activeFactRule, 'grid-template-columns') ?? '');
    const iconWidth = lengthPixels(
      declaration(activeIconRule, 'width') ?? factGridTerms[0] ?? '',
      width,
    );
    const iconGap = lengthPixels(declaration(activeFactRule, 'column-gap') ?? '', width);
    expect(factFractions).toHaveLength(STATUS_CONTENT_BUDGETS_PX.length);
    for (const [index, contentBudget] of STATUS_CONTENT_BUDGETS_PX.entries()) {
      const fraction = factFractions[index] ?? 0;
      const cellTrack = (width - firstTrackPixels) * fraction / fractionTotal;
      expect(cellTrack - factInlinePadding - iconWidth - iconGap - contentBudget)
        .toBeGreaterThanOrEqual(MIN_INLINE_CLEARANCE_PX);
    }
  });

  it('keeps the place/year line contained and unwrapped without clipping or ellipsis', () => {
    const portCss = readFileSync(resolve('src/games/caribbean/styles/port.css'), 'utf8');
    const positionRule = ruleBodyContaining(portCss, '.caribbean-port-position');
    const labelsRule = portCss.match(
      /\.caribbean-port-position span,\s*\.caribbean-port-position strong\s*\{([^}]*)\}/,
    )?.[1] ?? '';

    expect(positionRule).toMatch(/min-width:\s*0/);
    expect(positionRule).toMatch(/max-width:\s*100%/);
    expect(positionRule).toMatch(/flex-wrap:\s*nowrap/);
    expect(positionRule).not.toMatch(/overflow:\s*(?:hidden|clip)/);
    expect(labelsRule).toMatch(/white-space:\s*nowrap/);
    expect(labelsRule).not.toMatch(/text-overflow:\s*ellipsis/);
  });

  it('caps the tall-desktop gap between the status rail and port stage at 70px', () => {
    const portCss = readFileSync(resolve('src/games/caribbean/styles/port.css'), 'utf8');
    const stageRule = ruleBodyContaining(portCss, '.caribbean-port-stage');
    const margin = declaration(stageRule, 'margin-block-start');

    expect(declaration(stageRule, 'align-self')).toBe('start');
    expect(margin).not.toBeNull();
    expect(verticalLengthPixels(margin ?? '', 1_355)).toBeLessThanOrEqual(70);
    const compactMargin = verticalLengthPixels(margin ?? '', 600);
    expect(compactMargin).toBeGreaterThanOrEqual(24);
    expect(compactMargin + 496).toBeLessThanOrEqual(538);
  });

  it('keeps the complete Market ledger and its final Done control in document order at 1440x900', () => {
    setViewport(1440, 900);
    render(<StatefulPort />);
    fireEvent.click(screen.getByRole('button', { name: 'Market' }));

    const shell = screen.getByTestId('caribbean-career-ready');
    const status = within(shell).getByRole('region', { name: 'Voyage status' });
    const navigation = within(shell).getByRole('navigation', { name: 'Bridgetown activities' });
    const activity = within(shell).getByRole('region', { name: 'Port activity' });
    const done = within(activity).getByRole('button', { name: 'Done' });
    const stage = activity.closest('.caribbean-port-stage');
    const market = activity.querySelector('.caribbean-market');
    const rows = within(activity).getAllByRole('listitem');
    const reasonRows = rows.filter((row) => row.querySelector('.caribbean-market-reasons') !== null);

    expect(stage).not.toBeNull();
    if (market === null) throw new Error('Market ledger must remain inside the activity');
    expect(stage).not.toHaveClass('caribbean-port-stage--market');
    expect(status.parentElement).toBe(shell);
    expect(stage?.parentElement).toBe(shell);
    expect(stage).toContainElement(navigation);
    expect(activity).toContainElement(done);
    expect(rows).toHaveLength(6);
    expect(reasonRows).toHaveLength(6);

    const portCss = readFileSync(resolve('src/games/caribbean/styles/port.css'), 'utf8');
    const desktopCss = portCss.slice(0, portCss.indexOf('@media (max-height: 700px)'));
    const stageRule = ruleBodyContaining(desktopCss, '.caribbean-port-stage');
    const primaryRule = ruleBodyContaining(desktopCss, '.caribbean-port-primary');
    const activityRule = ruleBodyContaining(desktopCss, '.caribbean-port-activity');
    const marketRule = ruleBodyWithDeclaration(desktopCss, '.caribbean-market', 'padding');
    const closeRule = ruleBodyContaining(desktopCss, '.caribbean-port .caribbean-port-close');
    expect(declaration(stageRule, 'min-height')).toBe('0');
    expect(declaration(primaryRule, 'grid-template-rows')).toBe('auto auto auto 112px minmax(0, 1fr)');
    expect(declaration(activityRule, 'overflow-y')).toBe('auto');
    expect(declaration(activityRule, 'scrollbar-gutter')).toBe('stable');
    expect(declaration(marketRule, 'padding')).toBe('20px 22px 22px');
    expect(declaration(closeRule, 'margin')).toBe('auto 0 0 auto');

    expect(market.compareDocumentPosition(done) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });
});
