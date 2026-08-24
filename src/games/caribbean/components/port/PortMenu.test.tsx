import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PORT_ACTIONS, PortMenu } from './PortMenu';

const EXPECTED_LABELS = [
  "Governor's House",
  'Tavern',
  'Market',
  'Shipyard',
  'Divide Shares',
  "Captain's Log",
  'Set Sail',
] as const;

describe('<PortMenu>', () => {
  it('renders the seven Bridgetown actions in their exact semantic navigation order', () => {
    render(<PortMenu activeActivity="menu" onSelect={vi.fn()} />);

    const navigation = screen.getByRole('navigation', { name: 'Bridgetown activities' });
    const actions = within(navigation).getAllByRole('button');
    expect(actions.map((action) => action.textContent?.trim())).toEqual(EXPECTED_LABELS);
    expect(PORT_ACTIONS.map((action) => action.label)).toEqual(EXPECTED_LABELS);
    expect(within(navigation).getByRole('list')).toContainElement(actions[0]);
  });

  it('marks only the active activity and gives every control a stable unique test id', () => {
    render(<PortMenu activeActivity="market" onSelect={vi.fn()} />);

    const actions = screen.getAllByRole('button');
    expect(screen.getByRole('button', { name: 'Market' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Tavern' })).not.toHaveAttribute('aria-current');
    expect(actions.map((action) => action.dataset.testid)).toEqual([
      'port-action-governor',
      'port-action-tavern',
      'port-action-market',
      'port-action-shipyard',
      'port-action-shares',
      'port-action-log',
      'port-action-set-sail',
    ]);
    expect(new Set(actions.map((action) => action.dataset.testid)).size).toBe(actions.length);
  });

  it('keeps Set Sail natively disabled with an adjacent reason and no selection path', () => {
    const onSelect = vi.fn();
    render(<PortMenu activeActivity="menu" onSelect={onSelect} />);

    const setSail = screen.getByRole('button', { name: 'Set Sail' });
    const reason = screen.getByText('Sea routes open in the next package.');
    expect(setSail).toBeDisabled();
    expect(setSail).toHaveAttribute('aria-describedby', reason.id);
    expect(setSail.parentElement).toContainElement(reason);

    fireEvent.click(setSail);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
