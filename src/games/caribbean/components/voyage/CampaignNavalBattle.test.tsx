import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createCampaign } from '../../domain/createCampaign';
import { appendJournal, createJournal } from '../../domain/replay';
import { navalEngagedDraft, seaLegCompletedDraft, voyageStartedDraft } from '../../domain/voyage';
import type { CaribbeanController } from '../../state/useCaribbean';

function navalController(): CaribbeanController {
  const lead = appendJournal(createJournal(createCampaign({ seed: 1702, name: 'Morgan' })), {
    type: 'lead-accepted', payload: { leadId: 'red-jackdaw' },
  });
  const sailing = appendJournal(lead, voyageStartedDraft(lead.state));
  const encounter = appendJournal(sailing, seaLegCompletedDraft(sailing.state));
  const journal = appendJournal(encounter, navalEngagedDraft(encounter.state));
  return {
    load: { kind: 'empty', revision: { currentRaw: null, previousRaw: null } },
    journal, activity: 'menu', busy: false, persistence: { kind: 'persisted' },
    recoveryWriterCapability: 'available', recoveryFailure: null,
    start: vi.fn(), resume: vi.fn(), continueWithoutSaving: vi.fn(), dispatch: vi.fn(), setSail: vi.fn(), completeSeaLeg: vi.fn(),
    avoidEncounter: vi.fn(), engageEncounter: vi.fn(), withdrawBattle: vi.fn(), resolveBattle: vi.fn(),
    portFocusTarget: null, acknowledgePortFocus: vi.fn(), retrySaving: vi.fn(), reloadExternalSave: vi.fn(),
    exportInMemoryJournal: vi.fn(), recover: vi.fn(), continueRecovery: vi.fn(), abandon: vi.fn(),
    selectActivity: vi.fn(), closeActivity: vi.fn(),
  } as CaribbeanController;
}

describe('<CampaignNavalBattle>', () => {
  it('mounts the saved-input battle adapter without writing a campaign event', async () => {
    const modulePath = './CampaignNaval' + 'Battle';
    const { default: CampaignNavalBattle } = await import(/* @vite-ignore */ modulePath);
    const controller = navalController();
    const before = structuredClone(controller.journal);
    render(<CampaignNavalBattle controller={controller} />);

    expect(await screen.findByTestId('naval-battle-page')).toBeInTheDocument();
    expect(screen.getByTestId('naval-battle-underlay')).toBeInTheDocument();
    expect(controller.journal).toEqual(before);
    expect(controller.dispatch).not.toHaveBeenCalled();
    expect(controller.resolveBattle).not.toHaveBeenCalled();
  });

  it('keeps the existing Battle Lab rematch boundary at Task 4', async () => {
    const modulePath = './CampaignNaval' + 'Battle';
    const { default: CampaignNavalBattle } = await import(/* @vite-ignore */ modulePath);
    render(<CampaignNavalBattle controller={navalController()} />);
    expect(screen.queryByTestId('naval-result-action')).not.toBeInTheDocument();
    expect(screen.queryByText('Return to Bridgetown')).not.toBeInTheDocument();
  });
});
