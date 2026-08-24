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

const MIN_INLINE_CLEARANCE_PX = 8;
const CONSERVATIVE_GLYPH_EM = {
  condensedUppercase: 0.75,
  monospaceDigits: 0.64,
} as const;
const STATUS_CONTENT_BUDGETS_PX = [64, 72, 68, 178, 92] as const;

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

function optionalRuleBodyWithDeclaration(css: string, selector: string, property: string): string | null {
  let cursor = 0;
  while (cursor < css.length) {
    const selectorIndex = css.indexOf(selector, cursor);
    if (selectorIndex < 0) return null;
    const openBrace = css.indexOf('{', selectorIndex);
    const closeBrace = css.indexOf('}', openBrace);
    if (openBrace < 0 || closeBrace < 0) return null;
    const body = css.slice(openBrace + 1, closeBrace);
    if (declaration(body, property) !== null) return body;
    cursor = closeBrace + 1;
  }
  return null;
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

function shorthandBlockPixels(value: string, viewportWidth: number): number {
  const terms = splitCssTerms(value);
  const start = terms[0] ?? '';
  const end = terms.length < 3 ? start : terms[2] ?? '';
  return lengthPixels(start, viewportWidth) + lengthPixels(end, viewportWidth);
}

function blockEndPixels(value: string, viewportWidth: number): number {
  const terms = splitCssTerms(value);
  const end = terms.length < 3 ? terms[0] : terms[2];
  return lengthPixels(end ?? '', viewportWidth);
}

function cascadedBlockEndPixels(
  css: string,
  selectors: readonly string[],
  viewportWidth: number,
): number {
  let value: number | null = null;
  for (const selector of selectors) {
    const shorthandRule = optionalRuleBodyWithDeclaration(css, selector, 'margin');
    if (shorthandRule !== null) {
      value = blockEndPixels(declaration(shorthandRule, 'margin') ?? '', viewportWidth);
    }
    const longhandRule = optionalRuleBodyWithDeclaration(css, selector, 'margin-bottom');
    if (longhandRule !== null) {
      value = lengthPixels(declaration(longhandRule, 'margin-bottom') ?? '', viewportWidth);
    }
  }
  if (value === null) throw new Error(`Missing block-end margin for ${selectors.join(' -> ')}`);
  return value;
}

function cascadedDeclaration(
  css: string,
  property: string,
  selectors: readonly string[],
): string {
  let value: string | null = null;
  for (const selector of selectors) {
    const body = optionalRuleBodyWithDeclaration(css, selector, property);
    value = body === null ? value : declaration(body, property);
  }
  if (value === null) throw new Error(`Missing ${property} declaration for ${selectors.join(' -> ')}`);
  return value;
}

function lineBoxPixels(
  css: string,
  selectors: readonly string[],
  viewportWidth: number,
  inheritedLineHeight: number,
): number {
  const fontSize = lengthPixels(cascadedDeclaration(css, 'font-size', selectors), viewportWidth);
  const lineHeightValue = selectors.reduce<string | null>((value, selector) => {
    const body = optionalRuleBodyWithDeclaration(css, selector, 'line-height');
    return body === null ? value : declaration(body, 'line-height');
  }, null);
  const lineHeight = lineHeightValue === null ? inheritedLineHeight : Number.parseFloat(lineHeightValue);
  return fontSize * lineHeight;
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
      ['Market', '34 owned', '4 gold / unit', 'Cheap'],
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

  it.each([
    { label: 'minimum compact playfield', width: 960, height: 600, placeFont: 19 },
    { label: 'normal desktop playfield', width: 1440, height: 900, placeFont: 21 },
  ])('budgets the place/year and all five facts within the rail at the $label', ({ width, height, placeFont }) => {
    const portCss = readFileSync(resolve('src/games/caribbean/styles/port.css'), 'utf8');
    const railRule = ruleBodyContaining(portCss, '.caribbean-port-status-rail');
    const positionRule = ruleBodyContaining(portCss, '.caribbean-port-position');
    const placeRule = ruleBodyWithDeclaration(portCss, '.caribbean-port-position span', 'font-size');
    const yearRule = ruleBodyWithDeclaration(portCss, '.caribbean-port-position strong', 'font-size');
    const factsRule = ruleBodyContaining(portCss, '.caribbean-port-status-rail dl');
    const factRule = ruleBodyContaining(portCss, '.caribbean-port-status-rail dl div');
    const compactMedia = portCss.indexOf('@media (max-height: 700px)');
    const compactPlaceRule = height <= 700
      ? ruleBodyWithDeclaration(portCss, '.caribbean-port-position span', 'font-size', compactMedia)
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

    expect(declaredPlaceFont).toBe(placeFont);
    expect(declaredYearFont).toBe(14);
    expect(firstTrackPixels - placeYearDemand).toBeGreaterThanOrEqual(MIN_INLINE_CLEARANCE_PX);

    const factFractions = splitCssTerms(declaration(factsRule, 'grid-template-columns') ?? '')
      .map((term) => Number.parseFloat(term));
    const fractionTotal = factFractions.reduce((sum, fraction) => sum + fraction, 0);
    const factInlinePadding = horizontalPaddingPixels(factRule, width);
    expect(factFractions).toHaveLength(STATUS_CONTENT_BUDGETS_PX.length);
    for (const [index, contentBudget] of STATUS_CONTENT_BUDGETS_PX.entries()) {
      const fraction = factFractions[index] ?? 0;
      const cellTrack = (width - firstTrackPixels) * fraction / fractionTotal;
      expect(cellTrack - factInlinePadding - contentBudget).toBeGreaterThanOrEqual(MIN_INLINE_CLEARANCE_PX);
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

  it('fits the complete Market ledger and Back control inside the 1440x900 desktop stage', () => {
    setViewport(1440, 900);
    render(<StatefulPort />);
    fireEvent.click(screen.getByRole('button', { name: 'Market' }));

    const shell = screen.getByTestId('caribbean-career-ready');
    const status = within(shell).getByRole('region', { name: 'Voyage status' });
    const navigation = within(shell).getByRole('navigation', { name: 'Bridgetown activities' });
    const activity = within(shell).getByRole('region', { name: 'Port activity' });
    const back = within(activity).getByRole('button', { name: 'Back to harbour' });
    const stage = activity.closest('.caribbean-port-stage');
    const market = activity.querySelector('.caribbean-market');
    const rows = within(activity).getAllByRole('listitem');
    const reasonRows = rows.filter((row) => row.querySelector('.caribbean-market-reasons') !== null);

    expect(stage).not.toBeNull();
    if (market === null) throw new Error('Market ledger must remain inside the activity');
    expect(stage).toHaveClass('caribbean-port-stage--market');
    expect(status.parentElement).toBe(shell);
    expect(stage?.parentElement).toBe(shell);
    expect(navigation.parentElement).toBe(shell);
    expect(activity).toContainElement(back);
    expect(rows).toHaveLength(6);
    expect(reasonRows).toHaveLength(5);

    const viewportWidth = 1440;
    const viewportHeight = 900;
    const portCss = readFileSync(resolve('src/games/caribbean/styles/port.css'), 'utf8');
    const desktopCss = portCss.slice(0, portCss.indexOf('@media (max-height: 700px)'));
    const tokensCss = readFileSync(resolve('src/shared/styles/tokens.css'), 'utf8');
    const bodyRule = ruleBodyWithDeclaration(tokensCss, 'body', 'line-height');
    const inheritedLineHeight = Number.parseFloat(declaration(bodyRule, 'line-height') ?? '');

    const portRule = ruleBodyContaining(desktopCss, '.caribbean-port');
    const statusHeight = lengthPixels(
      splitCssTerms(declaration(portRule, 'grid-template-rows') ?? '')[0] ?? '',
      viewportWidth,
    );
    const menuRule = ruleBodyContaining(desktopCss, '.caribbean-port-menu');
    const menuPadding = declaration(menuRule, 'padding') ?? '';
    const menuBottom = lengthPixels(menuPadding.match(/max\(([^,]+)/)?.[1] ?? '', viewportWidth);
    const actionsRule = ruleBodyContaining(desktopCss, '.caribbean-port-actions');
    const itemRule = ruleBodyContaining(desktopCss, '.caribbean-port-action-item');
    const menuHeight = lengthPixels(splitCssTerms(declaration(actionsRule, 'padding') ?? '')[0] ?? '', viewportWidth)
      + lengthPixels(splitCssTerms(declaration(itemRule, 'padding') ?? '')[0] ?? '', viewportWidth)
      + lengthPixels(cascadedDeclaration(desktopCss, 'min-height', ['.caribbean-port-action']), viewportWidth)
      + lengthPixels(cascadedDeclaration(desktopCss, 'min-height', ['.caribbean-port-action-reason']), viewportWidth)
      + menuBottom;
    const middleTrack = viewportHeight - statusHeight - menuHeight;

    const stageRule = ruleBodyContaining(desktopCss, '.caribbean-port-stage');
    const marketStageRule = ruleBodyContaining(desktopCss, '.caribbean-port-stage--market');
    const stageMargins = shorthandBlockPixels(declaration(marketStageRule, 'margin-block') ?? '', viewportWidth);
    const stagePadding = declaration(marketStageRule, 'padding-block') === null
      ? shorthandBlockPixels(declaration(stageRule, 'padding') ?? '', viewportWidth)
      : shorthandBlockPixels(declaration(marketStageRule, 'padding-block') ?? '', viewportWidth);
    const stageContent = middleTrack - stageMargins - stagePadding;

    expect(declaration(stageRule, 'min-height')).toBe('0');
    expect(declaration(marketStageRule, 'overflow-y')).toBe('auto');

    const captainLine = lineBoxPixels(
      desktopCss,
      ['.caribbean-port-captain', '.caribbean-port-stage--market .caribbean-port-captain'],
      viewportWidth,
      inheritedLineHeight,
    );
    const captainMargin = cascadedBlockEndPixels(
      desktopCss,
      ['.caribbean-port-captain', '.caribbean-port-stage--market .caribbean-port-captain'],
      viewportWidth,
    );
    const placeLine = lineBoxPixels(
      desktopCss,
      ['.caribbean-port-stage h1', '.caribbean-port-stage--market h1'],
      viewportWidth,
      inheritedLineHeight,
    );
    const activityMargin = lengthPixels(cascadedDeclaration(
      desktopCss,
      'margin-top',
      ['.caribbean-port-activity', '.caribbean-port-stage--market .caribbean-port-activity'],
    ), viewportWidth);
    const activityPadding = lengthPixels(cascadedDeclaration(
      desktopCss,
      'padding-top',
      ['.caribbean-port-activity', '.caribbean-port-stage--market .caribbean-port-activity'],
    ), viewportWidth);
    const bearingLine = lineBoxPixels(
      desktopCss,
      ['.caribbean-port-bearing', '.caribbean-port-stage--market .caribbean-port-bearing'],
      viewportWidth,
      inheritedLineHeight,
    );
    const bearingMargin = cascadedBlockEndPixels(
      desktopCss,
      ['.caribbean-port-bearing', '.caribbean-port-stage--market .caribbean-port-bearing'],
      viewportWidth,
    );
    const activityHeadingLine = lineBoxPixels(
      desktopCss,
      ['.caribbean-port-activity h2', '.caribbean-port-stage--market .caribbean-port-activity h2'],
      viewportWidth,
      inheritedLineHeight,
    );
    const activityHeadingMargin = cascadedBlockEndPixels(
      desktopCss,
      ['.caribbean-port-activity h2', '.caribbean-port-stage--market .caribbean-port-activity h2'],
      viewportWidth,
    );
    const activityChrome = captainLine + captainMargin + placeLine
      + activityMargin + activityPadding + 1
      + bearingLine + bearingMargin + activityHeadingLine + activityHeadingMargin;

    const summaryFactRule = ruleBodyContaining(desktopCss, '.caribbean-market-summary > div');
    const summaryLabelLine = lineBoxPixels(
      desktopCss,
      ['.caribbean-market-summary dt'],
      viewportWidth,
      inheritedLineHeight,
    );
    const summaryValueLine = lineBoxPixels(
      desktopCss,
      ['.caribbean-market-summary dd'],
      viewportWidth,
      inheritedLineHeight,
    );
    const summaryValueRule = ruleBodyContaining(desktopCss, '.caribbean-market-summary dd');
    const summaryHeight = shorthandBlockPixels(declaration(summaryFactRule, 'padding') ?? '', viewportWidth)
      + summaryLabelLine
      + lengthPixels(splitCssTerms(declaration(summaryValueRule, 'margin') ?? '')[0] ?? '', viewportWidth)
      + summaryValueLine
      + 2;
    const marketRule = ruleBodyWithDeclaration(desktopCss, '.caribbean-market', 'gap');
    const summaryAndGap = summaryHeight + lengthPixels(declaration(marketRule, 'gap') ?? '', viewportWidth);

    const marketActionHeight = lengthPixels(cascadedDeclaration(
      desktopCss,
      'min-height',
      ['.caribbean-market-action'],
    ), viewportWidth);
    const rowRule = ruleBodyContaining(desktopCss, '.caribbean-market-row');
    const rowChrome = shorthandBlockPixels(declaration(rowRule, 'padding') ?? '', viewportWidth) + 1;
    const reasonsRule = ruleBodyWithDeclaration(desktopCss, '.caribbean-market-reasons', 'min-height');
    const reasonHeight = lengthPixels(declaration(reasonsRule, 'min-height') ?? '', viewportWidth)
      + lengthPixels(declaration(reasonsRule, 'margin-top') ?? '', viewportWidth);
    const rowsHeight = marketActionHeight + rowChrome
      + reasonRows.length * (marketActionHeight + reasonHeight + rowChrome);

    const closeRule = ruleBodyContaining(desktopCss, '.caribbean-port-close');
    const closeStyleRule = ruleBodyContaining(desktopCss, '.caribbean-port .caribbean-port-close');
    const marketCloseRule = optionalRuleBodyWithDeclaration(
      desktopCss,
      '.caribbean-port-stage--market .caribbean-port-close',
      'position',
    );
    const closeIsOutOfFlow = declaration(marketCloseRule ?? '', 'position') === 'absolute';
    const closeFlowHeight = closeIsOutOfFlow
      ? 0
      : lengthPixels(declaration(closeRule, 'min-height') ?? '', viewportWidth)
        + lengthPixels(declaration(closeStyleRule, 'margin-top') ?? '', viewportWidth);
    const requiredContent = activityChrome + summaryAndGap + rowsHeight + closeFlowHeight;
    const clearance = stageContent - requiredContent;

    expect(clearance).toBeGreaterThanOrEqual(8);

    const marketActivityRule = ruleBodyContaining(
      desktopCss,
      '.caribbean-port-stage--market .caribbean-port-activity',
    );
    const marketHeadingRule = ruleBodyWithDeclaration(
      desktopCss,
      '.caribbean-port-stage--market .caribbean-port-activity h2',
      'padding-inline-end',
    );
    const marketBearingRule = ruleBodyWithDeclaration(
      desktopCss,
      '.caribbean-port-stage--market .caribbean-port-bearing',
      'padding-inline-end',
    );
    const closeWidth = lengthPixels(declaration(marketCloseRule ?? '', 'min-width') ?? '', viewportWidth);
    const headingReserve = lengthPixels(declaration(marketHeadingRule, 'padding-inline-end') ?? '', viewportWidth);
    const bearingReserve = lengthPixels(declaration(marketBearingRule, 'padding-inline-end') ?? '', viewportWidth);
    const closeOffset = lengthPixels(declaration(marketCloseRule ?? '', 'inset-block-start') ?? '', viewportWidth);
    const headerHeight = activityPadding + bearingLine + bearingMargin
      + activityHeadingLine + activityHeadingMargin;

    expect(declaration(marketActivityRule, 'position')).toBe('relative');
    expect(closeIsOutOfFlow).toBe(true);
    expect(headingReserve - closeWidth).toBeGreaterThanOrEqual(8);
    expect(bearingReserve - closeWidth).toBeGreaterThanOrEqual(8);
    expect(closeOffset + marketActionHeight).toBeLessThanOrEqual(headerHeight);
    expect(back.compareDocumentPosition(market) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });
});
