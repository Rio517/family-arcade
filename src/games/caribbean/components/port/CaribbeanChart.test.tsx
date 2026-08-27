import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RED_JACKDAW_VOYAGE } from '../../content/voyage';
import { createCampaign } from '../../domain/createCampaign';
import type { CampaignStateV1 } from '../../domain/types';
import { CaribbeanChart } from './CaribbeanChart';

function stateWithLead(status?: 'active' | 'completed' | 'expired'): CampaignStateV1 {
  const state = createCampaign({ seed: 1702, name: 'Morgan' });
  if (status !== undefined) {
    state.leads.push({
      id: 'red-jackdaw',
      kind: 'rumour',
      status,
      acceptedDay: 0,
      expiresDay: 18,
    });
  }
  if (status === 'completed') state.world.targetDefeated = true;
  return state;
}

describe('<CaribbeanChart>', () => {
  it('shows only Bridgetown and the current ship before a course is marked', () => {
    const { container } = render(<CaribbeanChart state={stateWithLead()} />);

    expect(screen.getByText('Bridgetown')).toBeInTheDocument();
    expect(screen.getByText('Mistral')).toBeInTheDocument();
    expect(screen.getByText('No course marked')).toBeInTheDocument();
    expect(screen.queryByText('Red Jackdaw')).not.toBeInTheDocument();
    expect(container.querySelector('[data-chart-route="red-jackdaw"]')).toBeNull();
  });

  it('draws the authored Red Jackdaw route only after the lead is accepted', () => {
    const { container } = render(<CaribbeanChart state={stateWithLead('active')} />);

    expect(screen.getByText('Red Jackdaw')).toBeInTheDocument();
    expect(screen.getByText(RED_JACKDAW_VOYAGE.bearingLabel)).toBeInTheDocument();
    expect(screen.getByText(RED_JACKDAW_VOYAGE.windLabel)).toBeInTheDocument();
    expect(container.querySelector('[data-chart-route="red-jackdaw"]')).toHaveAttribute('data-route-status', 'active');
    expect(container.querySelectorAll('[data-chart-location]')).toHaveLength(2);
  });

  it('keeps a completed route visibly historical without inventing another destination', () => {
    const { container } = render(<CaribbeanChart state={stateWithLead('completed')} />);

    expect(screen.getByText('Lead complete')).toBeInTheDocument();
    expect(screen.getByText('Red Jackdaw')).toBeInTheDocument();
    expect(container.querySelector('[data-chart-route="red-jackdaw"]')).toHaveAttribute('data-route-status', 'completed');
    expect(container.querySelectorAll('[data-chart-location]')).toHaveLength(2);
  });

  it('uses a decorative chart drawing and exposes the same route facts as text', () => {
    const { container } = render(<CaribbeanChart state={stateWithLead('active')} />);

    const chart = screen.getByRole('region', { name: 'Caribbean chart' });
    expect(chart).toHaveTextContent('Course marked');
    expect(chart).toHaveTextContent('East by north');
    expect(chart).toHaveTextContent('Fresh trade wind from ENE');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('svg')).toHaveAttribute('focusable', 'false');
  });
});
