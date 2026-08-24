import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCampaign } from '../../domain/createCampaign';
import { createJournal } from '../../domain/replay';
import type { CaribbeanController, CaribbeanPersistencePhase } from '../../state/useCaribbean';
import type { LoadResult } from '../../storage/persistence';
import { CampaignSetup } from './CampaignSetup';

const EMPTY_REVISION = { currentRaw: null, previousRaw: null };

function controller(overrides: Partial<CaribbeanController> = {}): CaribbeanController {
  return {
    load: { kind: 'empty', revision: EMPTY_REVISION },
    journal: null,
    activity: 'menu',
    busy: false,
    persistence: { kind: 'persisted' },
    start: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    continueWithoutSaving: vi.fn(),
    dispatch: vi.fn().mockResolvedValue(undefined),
    retrySaving: vi.fn().mockResolvedValue(undefined),
    reloadExternalSave: vi.fn().mockResolvedValue(undefined),
    exportInMemoryJournal: vi.fn(() => '{"journal":"exact"}'),
    recover: vi.fn().mockResolvedValue(undefined),
    continueRecovery: vi.fn().mockResolvedValue(undefined),
    abandon: vi.fn().mockResolvedValue(undefined),
    selectActivity: vi.fn(),
    closeActivity: vi.fn(),
    ...overrides,
  };
}

function cleanLoad(): Extract<LoadResult, { kind: 'loaded' }> {
  return {
    kind: 'loaded',
    journal: createJournal(createCampaign({
      seed: 1702,
      name: 'Morgan',
      pronouns: 'they/them',
      talent: 'navigation',
      length: 'voyage',
    })),
    savedAt: Date.UTC(2026, 7, 24, 12, 30),
    build: 'fixture',
    recovered: false,
    unreadableSlots: [],
    revision: { currentRaw: 'current', previousRaw: null },
  };
}

describe('<CampaignSetup>', () => {
  beforeEach(() => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:journal'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('offers recommended optional fields, all talents, all lengths, and Bridgetown in 1675', () => {
    const view = controller();
    render(<CampaignSetup controller={view} savingAvailable />);

    expect(screen.getByRole('heading', { name: 'Sign a captain’s commission' })).toBeInTheDocument();
    expect(screen.getByText('Bridgetown · 1675')).toBeInTheDocument();
    expect(screen.getByLabelText('Captain name')).toHaveValue('Captain');
    expect(screen.getByLabelText('Pronouns')).toHaveValue('they/them');
    expect(screen.getByLabelText('Starting talent')).toHaveValue('navigation');
    expect(screen.getByLabelText('Career length')).toHaveValue('adventure');
    expect(screen.getByLabelText('Starting talent').querySelectorAll('option')).toHaveLength(5);
    expect(screen.getByLabelText('Career length').querySelectorAll('option')).toHaveLength(3);

    fireEvent.change(screen.getByLabelText('Captain name'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start career' }));
    const name = screen.getByLabelText('Captain name');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAttribute('aria-describedby', 'captain-name-error');
    expect(screen.getByText('Enter a captain name.')).toHaveAttribute('id', 'captain-name-error');

    fireEvent.change(name, { target: { value: 'Morgan' } });
    fireEvent.change(screen.getByLabelText('Starting talent'), { target: { value: 'medicine' } });
    fireEvent.change(screen.getByLabelText('Career length'), { target: { value: 'legend' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start career' }));
    expect(view.start).toHaveBeenCalledWith({
      name: 'Morgan', pronouns: 'they/them', talent: 'medicine', length: 'legend',
    });
  });

  it('summarizes a clean save and opens an accessible abandon confirmation', () => {
    const load = cleanLoad();
    const view = controller({ load });
    render(<CampaignSetup controller={view} savingAvailable />);

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

  it('states that saving is disabled without claiming a saved campaign', () => {
    render(<CampaignSetup controller={controller()} savingAvailable={false} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Saving disabled/i);
    expect(screen.queryByText(/saved safely/i)).not.toBeInTheDocument();
  });

  it('describes a loaded campaign truthfully when safe resume ownership is unavailable', () => {
    render(<CampaignSetup controller={controller({ load: cleanLoad() })} savingAvailable={false} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Saving disabled. Resume requires explicit memory-only consent.',
    );
    expect(screen.getByRole('heading', { name: 'Morgan’s commission' })).toBeInTheDocument();
  });

  it('omits a cleared optional pronoun field so the domain default remains available', () => {
    const view = controller();
    render(<CampaignSetup controller={view} savingAvailable />);
    fireEvent.change(screen.getByLabelText('Pronouns'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start career' }));
    expect(view.start).toHaveBeenCalledWith({
      name: 'Captain', talent: 'navigation', length: 'adventure',
    });
  });

  it('presents explicit consent after a failed start and invokes it from the keyboard', () => {
    const persistence: CaribbeanPersistencePhase = {
      kind: 'consent-required',
      intent: 'start',
      failure: { kind: 'writer-denied', error: new Error('denied') },
    };
    const view = controller({ persistence });
    render(<CampaignSetup controller={view} savingAvailable={false} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/could not acquire safe save ownership/i);
    const action = screen.getByRole('button', { name: 'Continue without saving' });
    action.focus();
    action.click();
    expect(view.continueWithoutSaving).toHaveBeenCalledTimes(1);
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
    render(<CampaignSetup controller={view} savingAvailable />);

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
});
