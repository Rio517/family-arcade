import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createCampaign } from '../../domain/createCampaign';
import { appendJournal, createJournal } from '../../domain/replay';
import { voyageStartedDraft } from '../../domain/voyage';
import type { CaribbeanController } from '../../state/useCaribbean';

function sailingController(result: 'applied' | 'not-applied' = 'applied'): CaribbeanController {
  const lead = appendJournal(createJournal(createCampaign({ seed: 1702, name: 'Morgan' })), {
    type: 'lead-accepted', payload: { leadId: 'red-jackdaw' },
  });
  const journal = appendJournal(lead, voyageStartedDraft(lead.state));
  return {
    load: { kind: 'empty', revision: { currentRaw: null, previousRaw: null } },
    journal, activity: 'menu', busy: false, persistence: { kind: 'persisted' },
    recoveryWriterCapability: 'available', recoveryFailure: null,
    start: vi.fn(), resume: vi.fn(), continueWithoutSaving: vi.fn(), dispatch: vi.fn(),
    setSail: vi.fn(),
    completeSeaLeg: vi.fn(async () => result === 'applied' ? { kind: 'applied', eventId: 3 } : { kind: 'not-applied' }),
    avoidEncounter: vi.fn(), engageEncounter: vi.fn(), withdrawBattle: vi.fn(), resolveBattle: vi.fn(),
    portFocusTarget: null, acknowledgePortFocus: vi.fn(), retrySaving: vi.fn(), reloadExternalSave: vi.fn(),
    exportInMemoryJournal: vi.fn(), recover: vi.fn(), continueRecovery: vi.fn(), abandon: vi.fn(),
    selectActivity: vi.fn(), closeActivity: vi.fn(),
  } as CaribbeanController;
}

describe('<SailingPage>', () => {
  it('renders the authored sea leg and encounter actions', async () => {
    const modulePath = './Sailing' + 'Page';
    const { SailingPage } = await import(/* @vite-ignore */ modulePath);
    const controller = sailingController();
    render(<SailingPage controller={controller} />);

    expect(screen.getByRole('heading', { name: 'East by north from Bridgetown' })).toHaveFocus();
    expect(screen.getByText('Fresh trade wind from ENE')).toBeInTheDocument();
    expect(screen.getByText(/Outbound leg spends 1 day and 1 provision/i)).toBeInTheDocument();
    expect(screen.getByText(/34 provisions aboard/i)).toBeInTheDocument();
    expect(screen.getByTestId('voyage-status')).toHaveAttribute('aria-live', 'polite');

    const action = screen.getByTestId('voyage-continue-east');
    fireEvent.click(action);
    fireEvent.click(action);
    expect(controller.completeSeaLeg).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId('voyage-status')).toHaveTextContent('Contact saved.'));
  });

  it('announces a not-applied sea-leg transition without moving its controls', async () => {
    const modulePath = './Sailing' + 'Page';
    const { SailingPage } = await import(/* @vite-ignore */ modulePath);
    const controller = sailingController('not-applied');
    render(<SailingPage controller={controller} />);
    const action = screen.getByTestId('voyage-continue-east');
    fireEvent.click(action);
    await waitFor(() => expect(screen.getByTestId('voyage-status')).toHaveTextContent('Course change was not saved.'));
    expect(action).toBeEnabled();
  });
});
