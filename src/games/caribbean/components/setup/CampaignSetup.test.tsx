import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createCampaign } from '../../domain/createCampaign';
import { createJournal } from '../../domain/replay';
import type { CaribbeanController, CaribbeanPersistencePhase } from '../../state/useCaribbean';
import type { LoadResult } from '../../storage/persistence';
import { normalizePronouns } from '@shared/profile/profile';
import { resetUsersStore, setUsersState } from '@shared/profile/usersStore';
import { addUser, emptyUsersState, setActiveUser } from '@shared/profile/users';
import { CampaignSetup, type CampaignSetupIdentity } from './CampaignSetup';

const EMPTY_REVISION = { currentRaw: null, previousRaw: null };

function controller(overrides: Partial<CaribbeanController> = {}): CaribbeanController {
  const base: CaribbeanController = {
    load: { kind: 'empty', revision: EMPTY_REVISION },
    journal: null,
    activity: 'menu',
    busy: false,
    persistence: { kind: 'persisted' },
    recoveryWriterCapability: 'available',
    recoveryFailure: null,
    start: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    continueWithoutSaving: vi.fn(),
    dispatch: vi.fn().mockResolvedValue({ kind: 'not-applied' }),
    setSail: vi.fn().mockResolvedValue({ kind: 'not-applied' }),
    completeSeaLeg: vi.fn().mockResolvedValue({ kind: 'not-applied' }),
    avoidEncounter: vi.fn().mockResolvedValue({ kind: 'not-applied' }),
    engageEncounter: vi.fn().mockResolvedValue({ kind: 'not-applied' }),
    withdrawBattle: vi.fn().mockResolvedValue({ kind: 'not-applied' }),
    resolveBattle: vi.fn().mockResolvedValue({ kind: 'not-applied' }),
    portFocusTarget: null,
    acknowledgePortFocus: vi.fn(),
    retrySaving: vi.fn().mockResolvedValue(undefined),
    reloadExternalSave: vi.fn().mockResolvedValue(undefined),
    exportInMemoryJournal: vi.fn(() => '{"journal":"exact"}'),
    recover: vi.fn().mockResolvedValue(undefined),
    continueRecovery: vi.fn().mockResolvedValue(undefined),
    abandon: vi.fn().mockResolvedValue(undefined),
    selectActivity: vi.fn(),
    closeActivity: vi.fn(),
  };
  return Object.assign(base, overrides);
}

function cleanLoad(length: 'voyage' | 'legend' = 'voyage'): Extract<LoadResult, { kind: 'loaded' }> {
  return {
    kind: 'loaded',
    journal: createJournal(createCampaign({
      seed: 1702,
      name: 'Morgan',
      pronouns: 'they/them',
      talent: 'navigation',
      length,
    })),
    savedAt: Date.UTC(2026, 7, 24, 12, 30),
    build: 'fixture',
    recovered: false,
    unreadableSlots: [],
    revision: { currentRaw: 'current', previousRaw: null },
  };
}

function setupIdentity(overrides: Partial<CampaignSetupIdentity> = {}): CampaignSetupIdentity {
  return {
    playerName: 'Mario',
    pronouns: 'he/him',
    savePronouns: vi.fn(),
    ...overrides,
  };
}

function renderSetup(
  view = controller(),
  identity = setupIdentity(),
  savingAvailable = true,
) {
  return { view, identity, ...render(<CampaignSetup controller={view} identity={identity} savingAvailable={savingAvailable} />) };
}

function expectControlIds(container: HTMLElement, expected: string[]): void {
  const controls = [...container.querySelectorAll<HTMLElement>('input, select, button')];
  expect(controls.map((control) => control.dataset.testid)).toEqual(expected);
  expect(new Set(expected).size).toBe(expected.length);
}

describe('<CampaignSetup>', () => {
  beforeEach(() => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:journal'),
      revokeObjectURL: vi.fn(),
    });
    localStorage.clear();
    resetUsersStore();
  });

  afterEach(() => vi.restoreAllMocks());

  it('shows whose ticket signs the commission when a player is signed in', () => {
    setUsersState(setActiveUser(addUser(emptyUsersState(), 'u1', 'Rio'), 'u1'));
    renderSetup();

    expect(screen.getByTestId('playing-as')).toHaveTextContent('Rio');
    expect(screen.getByTestId('playing-as-change')).toHaveTextContent('Switch player ›');
  });

  it('aligns all three commission fields and keeps the manifest rule level', () => {
    const css = readFileSync(resolve('src/games/caribbean/styles/production.css'), 'utf8');

    expect(css).toMatch(/\.caribbean-form-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
    expect(css).toMatch(/\.caribbean-form-grid (?:input|input,\s*\n\.caribbean-form-grid select)[\s\S]*width:\s*100%/s);
    expect(css).toMatch(/\.caribbean-course-axis\s*\{[^}]*transform:\s*none/s);
    expect(css).not.toMatch(/\.caribbean-course-axis\s*\{[^}]*rotate\(/s);
  });

  it('gives every commission field the same readable label and exact control geometry', () => {
    const css = readFileSync(resolve('src/games/caribbean/styles/production.css'), 'utf8');

    expect(css).toMatch(/\.caribbean-form-grid\s*\{[^}]*align-items:\s*start/s);
    expect(css).toMatch(/\.caribbean-field\s*\{[^}]*grid-template-rows:\s*20px 48px minmax\(20px,\s*auto\)/s);
    expect(css).toMatch(/\.caribbean-field label\s*\{[^}]*font-size:\s*16px[^}]*line-height:\s*20px/s);
    expect(css).toMatch(/\.caribbean-form-grid input,[\s\S]*?\.caribbean-form-grid select\s*\{[^}]*height:\s*48px/s);
    expect(css).toMatch(/\.caribbean-production \.caribbean-button-primary\s*\{[^}]*font-size:\s*17px/s);
  });

  it('prefills the captain from the active player and submits the shared pronouns with Adventure', () => {
    const view = controller();
    const savePronouns = vi.fn();
    const profileSetName = vi.fn();
    renderSetup(view, { playerName: 'Mario', pronouns: 'he/him', savePronouns, ...{ setName: profileSetName } });

    expect(screen.getByRole('heading', { name: 'Sign a captain’s commission' })).toBeInTheDocument();
    expect(screen.getByText('Bridgetown · 1675')).toBeInTheDocument();
    expect(screen.getByLabelText('Captain name')).toHaveValue('Mario');
    expect(screen.getByLabelText('Player pronouns')).toHaveValue('he/him');
    expect(screen.getByLabelText('Starting talent')).toHaveValue('navigation');
    expect(screen.queryByLabelText('Career length')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Starting talent').querySelectorAll('option')).toHaveLength(5);
    expect(screen.getByText('Shared across every arcade game')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Captain name'), { target: { value: 'Red Morgan' } });
    fireEvent.change(screen.getByLabelText('Player pronouns'), { target: { value: 'they/them' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start career' }));
    expect(view.start).toHaveBeenCalledWith({
      name: 'Red Morgan', pronouns: 'they/them', talent: 'navigation', length: 'adventure',
    });
    expect(savePronouns).toHaveBeenCalledWith('they/them');
    expect(profileSetName).not.toHaveBeenCalled();
  });

  it.each([
    ['blank', ''],
    ['whitespace', '   '],
    ['malformed programmatic value', null],
    ['24 astral code points', '😀'.repeat(24)],
    ['25 astral code points', '😀'.repeat(25)],
  ])('normalizes %s pronouns identically for profile persistence and campaign creation', (_label, raw) => {
    const view = controller();
    const savePronouns = vi.fn();
    renderSetup(view, setupIdentity({ pronouns: raw as unknown as string, savePronouns }));

    fireEvent.click(screen.getByRole('button', { name: 'Start career' }));

    const normalized = normalizePronouns(raw);
    expect(savePronouns).toHaveBeenCalledWith(normalized);
    const campaignPronouns = vi.mocked(view.start).mock.calls[0]?.[0].pronouns;
    expect(campaignPronouns).toBe(normalized);
    if (normalized === 'he/him') expect(campaignPronouns).not.toBe('they/them');
  });

  it('keeps the normalized pronouns in campaign creation when profile persistence throws', () => {
    const view = controller();
    const savePronouns = vi.fn(() => { throw new Error('profile unavailable'); });
    renderSetup(view, setupIdentity({ pronouns: 'they/them', savePronouns }));

    fireEvent.click(screen.getByRole('button', { name: 'Start career' }));

    expect(savePronouns).toHaveBeenCalledWith('they/them');
    expect(view.start).toHaveBeenCalledWith({
      name: 'Mario', pronouns: 'they/them', talent: 'navigation', length: 'adventure',
    });
  });

  it('keeps the previous pronouns and exposes an accessible error beyond 24 Unicode code points', () => {
    renderSetup();
    const input = screen.getByLabelText('Player pronouns');

    fireEvent.change(input, { target: { value: '😀'.repeat(25) } });

    expect(input).toHaveValue('he/him');
    expect(input).toHaveAttribute('aria-describedby', 'caribbean-pronouns-error');
    expect(screen.getByRole('alert')).toHaveTextContent('Use 24 characters or fewer');
  });

  it('summarizes a clean save and opens an accessible abandon confirmation', () => {
    const load = cleanLoad();
    const view = controller({ load });
    renderSetup(view);

    expect(screen.getByRole('heading', { name: 'Morgan’s commission' })).toBeInTheDocument();
    expect(screen.getByText('Voyage · Bridgetown')).toBeInTheDocument();
    expect(screen.getByText(/Last saved/)).toBeInTheDocument();
    expect(screen.getByText('Mistral · Hull 100 · Sails 100')).toBeInTheDocument();
    expect(screen.getByText('500 gold')).toBeInTheDocument();
    expect(screen.getByText('3.4 months provisions')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Resume career' }));
    expect(view.resume).toHaveBeenCalledTimes(1);
    const opener = screen.getByRole('button', { name: 'Abandon campaign' });
    fireEvent.click(opener);
    expect(document.querySelector('.caribbean-commission-content')).toHaveAttribute('inert');
    expect(screen.getByRole('dialog', { name: 'Abandon this campaign?' })).toHaveAccessibleDescription(
      'The save will be copied to quarantine before its active slots are removed.',
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Quarantine and abandon' }));
    expect(view.abandon).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.caribbean-commission-content')).not.toHaveAttribute('inert');
  });

  it.each([
    ['voyage', 'Voyage'],
    ['legend', 'Legend'],
  ] as const)('keeps the original %s compatibility save label in its summary', (length, label) => {
    renderSetup(controller({ load: cleanLoad(length) }));

    expect(screen.getByText(`${label} · Bridgetown`)).toBeInTheDocument();
  });

  it('states that saving is disabled without claiming a saved campaign', () => {
    renderSetup(controller(), setupIdentity(), false);
    expect(screen.getByRole('status')).toHaveTextContent(/Saving disabled/i);
    expect(screen.queryByText(/saved safely/i)).not.toBeInTheDocument();
  });

  it('describes a loaded campaign truthfully when safe resume ownership is unavailable', () => {
    renderSetup(controller({
      load: cleanLoad(),
      recoveryWriterCapability: 'unavailable',
    }), setupIdentity(), false);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Saving disabled. Resume requires explicit memory-only consent.',
    );
    expect(screen.getByRole('heading', { name: 'Morgan’s commission' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/campaign abandonment is disabled/i);
    expect(screen.getByRole('button', { name: 'Resume career' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Abandon campaign' })).toBeDisabled();
  });

  it('suppresses stale resume claims after abandonment succeeds but its same-lock reread fails', () => {
    const load = cleanLoad();
    renderSetup(controller({
      load,
      recoveryFailure: {
        kind: 'post-result-load',
        action: 'abandon',
        result: {
          ok: true,
          kind: 'abandoned',
          quarantineKey: 'caribbean:campaign:quarantine:one',
          revision: { currentRaw: null, previousRaw: null },
        },
        loadFailure: { kind: 'storage-unavailable', operation: 'read-current' },
      },
    }));

    expect(screen.getByRole('heading', { name: 'Campaign storage must be reread' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Morgan’s commission' })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/abandonment completed/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/read-current/i);
    expect(screen.getByRole('button', { name: 'Resume career' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Abandon campaign' })).toBeDisabled();
  });

  it('falls back to Captain and he/him when the setup drafts are blank', () => {
    const view = controller();
    const savePronouns = vi.fn();
    renderSetup(view, setupIdentity({ playerName: '   ', pronouns: '   ', savePronouns }));
    expect(screen.getByLabelText('Captain name')).toHaveValue('Captain');
    expect(screen.getByLabelText('Player pronouns')).toHaveValue('he/him');
    fireEvent.change(screen.getByLabelText('Captain name'), { target: { value: '   ' } });
    fireEvent.change(screen.getByLabelText('Player pronouns'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start career' }));
    expect(view.start).toHaveBeenCalledWith({
      name: 'Captain', pronouns: 'he/him', talent: 'navigation', length: 'adventure',
    });
    expect(savePronouns).toHaveBeenCalledWith('he/him');
  });

  it('presents explicit consent after a failed start and invokes it from the keyboard', () => {
    const persistence: CaribbeanPersistencePhase = {
      kind: 'consent-required',
      intent: 'start',
      failure: { kind: 'writer-denied', error: new Error('denied') },
    };
    const view = controller({ persistence });
    renderSetup(view, setupIdentity(), false);

    expect(screen.getByRole('alert')).toHaveTextContent(/could not acquire safe save ownership/i);
    const action = screen.getByRole('button', { name: 'Continue without saving' });
    action.focus();
    action.click();
    expect(view.continueWithoutSaving).toHaveBeenCalledTimes(1);
  });

  it('keeps setup-only persistence decisions when the journal is null', () => {
    const view = controller({
      journal: null,
      persistence: { kind: 'consent-required', intent: 'start', failure: { kind: 'writer-denied' } },
    });
    renderSetup(view, setupIdentity(), false);

    expect(screen.getByRole('heading', { name: 'Sign a captain’s commission' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/memory-only career/i);
    expect(screen.queryByTestId('campaign-persistence-dialog')).not.toBeInTheDocument();
  });

  it('freezes a conflict behind reload, exact export, or non-saving continuation', () => {
    const view = controller({
      journal: cleanLoad().journal,
      persistence: {
        kind: 'save-conflict',
        expected: { currentRaw: 'old', previousRaw: null },
        actual: { currentRaw: 'new', previousRaw: 'old' },
      },
    });
    renderSetup(view);

    expect(screen.getByRole('alert')).toHaveTextContent(/newer save exists/i);
    fireEvent.click(screen.getByRole('button', { name: 'Reload newer save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export in-memory journal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue without saving' }));
    expect(view.reloadExternalSave).toHaveBeenCalledTimes(1);
    expect(view.exportInMemoryJournal).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:journal');
    expect(view.continueWithoutSaving).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Retry saving' })).not.toBeInTheDocument();
  });

  it('gives every setup, resume, conflict, and modal control a stable semantic test id', () => {
    let rendered = renderSetup();
    expectControlIds(rendered.container, [
      'caribbean-captain-name-input',
      'caribbean-pronouns-input',
      'caribbean-starting-talent-select',
      'caribbean-start-career-button',
    ]);
    cleanup();

    rendered = renderSetup(controller({
      persistence: {
        kind: 'consent-required', intent: 'start', failure: { kind: 'writer-denied' },
      },
    }), setupIdentity(), false);
    expectControlIds(rendered.container, [
      'caribbean-captain-name-input',
      'caribbean-pronouns-input',
      'caribbean-starting-talent-select',
      'caribbean-start-career-button',
      'caribbean-continue-without-saving-button',
    ]);
    cleanup();

    rendered = renderSetup(controller({
      journal: cleanLoad().journal,
      persistence: {
        kind: 'save-conflict',
        expected: { currentRaw: 'old', previousRaw: null },
        actual: { currentRaw: 'new', previousRaw: 'old' },
      },
    }));
    expectControlIds(rendered.container, [
      'caribbean-reload-newer-save-button',
      'caribbean-export-in-memory-journal-button',
      'caribbean-continue-without-saving-button',
    ]);
    cleanup();

    rendered = renderSetup(controller({ load: cleanLoad() }));
    fireEvent.click(screen.getByRole('button', { name: 'Abandon campaign' }));
    expectControlIds(rendered.container, [
      'caribbean-resume-career-button',
      'caribbean-abandon-campaign-button',
      'caribbean-abandon-cancel-button',
      'caribbean-abandon-confirm-button',
    ]);
  });
});
