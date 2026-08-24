import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createCampaign } from '../../domain/createCampaign';
import { appendJournal, createJournal } from '../../domain/replay';
import { seaLegCompletedDraft, voyageStartedDraft } from '../../domain/voyage';
import type { CaribbeanController } from '../../state/useCaribbean';

function encounterController(): CaribbeanController {
  const lead = appendJournal(createJournal(createCampaign({ seed: 1702, name: 'Morgan' })), {
    type: 'lead-accepted', payload: { leadId: 'red-jackdaw' },
  });
  const sailing = appendJournal(lead, voyageStartedDraft(lead.state));
  const journal = appendJournal(sailing, seaLegCompletedDraft(sailing.state));
  return {
    load: { kind: 'empty', revision: { currentRaw: null, previousRaw: null } },
    journal, activity: 'menu', busy: false, persistence: { kind: 'persisted' },
    recoveryWriterCapability: 'available', recoveryFailure: null,
    start: vi.fn(), resume: vi.fn(), continueWithoutSaving: vi.fn(), dispatch: vi.fn(), setSail: vi.fn(), completeSeaLeg: vi.fn(),
    avoidEncounter: vi.fn(async () => ({ kind: 'applied', eventId: 4 })),
    engageEncounter: vi.fn(async () => ({ kind: 'not-applied' })),
    withdrawBattle: vi.fn(), resolveBattle: vi.fn(), portFocusTarget: null, acknowledgePortFocus: vi.fn(),
    retrySaving: vi.fn(), reloadExternalSave: vi.fn(), exportInMemoryJournal: vi.fn(), recover: vi.fn(),
    continueRecovery: vi.fn(), abandon: vi.fn(), selectActivity: vi.fn(), closeActivity: vi.fn(),
  } as CaribbeanController;
}

describe('<EncounterPage>', () => {
  it('renders the authored sea leg and encounter actions', async () => {
    const modulePath = './Encounter' + 'Page';
    const { EncounterPage } = await import(/* @vite-ignore */ modulePath);
    const controller = encounterController();
    render(<EncounterPage controller={controller} />);

    expect(screen.getByRole('heading', { name: 'Red Jackdaw sighted' })).toHaveFocus();
    expect(screen.getByText(/Avoid and return spends the guaranteed 1 day and 1 provision/i)).toBeInTheDocument();
    expect(screen.getByText(/keeps the Red Jackdaw lead active/i)).toBeInTheDocument();
    expect(screen.getByText(/Pursue enters a two-to-four-minute naval duel/i)).toBeInTheDocument();
    expect(screen.getByTestId('voyage-status')).toHaveAttribute('aria-live', 'polite');

    fireEvent.click(screen.getByTestId('encounter-avoid'));
    fireEvent.click(screen.getByTestId('encounter-pursue'));
    expect(controller.avoidEncounter).toHaveBeenCalledTimes(1);
    expect(controller.engageEncounter).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('voyage-status')).toHaveTextContent('Return to Bridgetown saved.'));
  });

  it('announces a not-applied pursuit and restores both choices', async () => {
    const modulePath = './Encounter' + 'Page';
    const { EncounterPage } = await import(/* @vite-ignore */ modulePath);
    const controller = encounterController();
    render(<EncounterPage controller={controller} />);
    fireEvent.click(screen.getByTestId('encounter-pursue'));
    await waitFor(() => expect(screen.getByTestId('voyage-status')).toHaveTextContent('Pursuit was not saved.'));
    expect(screen.getByTestId('encounter-avoid')).toBeEnabled();
    expect(screen.getByTestId('encounter-pursue')).toBeEnabled();
  });
});
