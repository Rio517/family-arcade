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
});
