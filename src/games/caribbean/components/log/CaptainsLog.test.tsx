import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createCampaign } from '../../domain/createCampaign';
import { appendJournal, createJournal } from '../../domain/replay';
import type { CampaignStateV1 } from '../../domain/types';
import { CaptainsLog } from './CaptainsLog';

const NEXT_ACTION = 'Sail east of Bridgetown and identify the Red Jackdaw.';

function acceptedState(): CampaignStateV1 {
  return appendJournal(createJournal(createCampaign({ seed: 1702 })), {
    type: 'lead-accepted',
    payload: { leadId: 'red-jackdaw' },
  }).state;
}

describe("<CaptainsLog>", () => {
  it('shows the exact empty state before the one lead is accepted', () => {
    render(<CaptainsLog state={createCampaign({ seed: 1702 })} />);

    expect(screen.getByText('No leads yet')).toBeInTheDocument();
    expect(screen.queryByText('Red Jackdaw')).not.toBeInTheDocument();
    expect(screen.queryByText(NEXT_ACTION)).not.toBeInTheDocument();
  });

  it('shows one lead, one expiry, and one exact next action', () => {
    const { container } = render(<CaptainsLog state={acceptedState()} />);

    expect(screen.getByRole('heading', { name: 'Red Jackdaw' })).toBeInTheDocument();
    expect(screen.getByText('18 days remaining')).toBeInTheDocument();
    expect(screen.getByText('Next action')).toHaveClass('caribbean-log-action-label');
    expect(screen.getByText(NEXT_ACTION)).toHaveClass('caribbean-log-action-copy');
    expect(screen.getAllByTestId('captains-log-red-jackdaw')).toHaveLength(1);
    expect(container.querySelectorAll('ol, ul, [role="progressbar"], map')).toHaveLength(0);
    expect(container.querySelector('[data-priority], [data-pinned], [data-clue-tree]')).toBeNull();
    expect(container.textContent).not.toMatch(/\b(?:step|priority|pin|clue)\b|\d+%/i);
  });

  it.each([
    ['completed', 'The Red Jackdaw lead is complete.'],
    ['expired', 'This rumour has gone cold.'],
  ] as const)('renders %s terminal copy without the obsolete bearing', (status, terminalCopy) => {
    const state = acceptedState();
    state.leads[0].status = status;
    const { container } = render(<CaptainsLog state={state} />);

    expect(screen.getByRole('heading', { name: 'Red Jackdaw' })).toBeInTheDocument();
    expect(screen.getByText(terminalCopy)).toBeInTheDocument();
    expect(screen.queryByText(NEXT_ACTION)).not.toBeInTheDocument();
    expect(container.querySelector('.caribbean-log-action')).toBeNull();
  });

  it('shows the safe-return explanation without mutating the flagship', () => {
    const state = acceptedState();
    const flagshipBefore = structuredClone(state.fleet.ships[0]);
    state.calendar.elapsedDays = 4;
    state.world.lastVoyage = {
      voyageId: 'voyage-2',
      battleId: 'voyage-2-battle',
      result: 'victory',
      outcome: { kind: 'surrender', victorShipId: 'player' },
      returnedDay: 4,
    };
    state.world.targetDefeated = true;
    state.leads[0].status = 'completed';

    render(<CaptainsLog state={state} />);

    expect(screen.getByTestId('captains-log-last-voyage')).toHaveTextContent(
      'Victory — Red Jackdaw surrendered · Returned on day 4.',
    );
    expect(screen.getByText(
      'Bridgetown’s harbour crew made Mistral ready for the next departure; the battle outcome remains in this log, but its damage is not carried onto the ready flagship.',
    )).toBeInTheDocument();
    expect(state.world.lastVoyage.outcome).toEqual({ kind: 'surrender', victorShipId: 'player' });
    expect(state.fleet.ships[0]).toEqual(flagshipBefore);
  });

  it('renders an avoided return without battle-damage copy', () => {
    const state = acceptedState();
    state.world.lastVoyage = {
      voyageId: 'voyage-2', battleId: null, result: 'avoided', outcome: null, returnedDay: 2,
    };
    render(<CaptainsLog state={state} />);
    expect(screen.getByTestId('captains-log-last-voyage')).toHaveTextContent(
      'Avoided contact · Returned to Bridgetown on day 2.',
    );
    expect(screen.queryByText(/damage is not carried/i)).not.toBeInTheDocument();
  });
});
