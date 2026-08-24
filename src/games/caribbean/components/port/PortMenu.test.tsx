import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { voyageBlockedCopy, type VoyageBlockedReason } from '../../domain/voyage';
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
    render(<PortMenu activeActivity="menu" readiness={{ kind: 'ready', requiredProvisions: 2 }} busy={false} onSetSail={vi.fn()} onSelect={vi.fn()} />);

    const navigation = screen.getByRole('navigation', { name: 'Bridgetown activities' });
    const actions = within(navigation).getAllByRole('button');
    expect(actions.map((action) => action.textContent?.trim())).toEqual(EXPECTED_LABELS);
    expect(PORT_ACTIONS.map((action) => action.label)).toEqual(EXPECTED_LABELS);
    expect(within(navigation).getByRole('list')).toContainElement(actions[0]);
  });

  it('marks only the active activity and gives every control a stable unique test id', () => {
    render(<PortMenu activeActivity="market" readiness={{ kind: 'ready', requiredProvisions: 2 }} busy={false} onSetSail={vi.fn()} onSelect={vi.fn()} />);

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

  it.each([
    'not-in-bridgetown',
    'target-defeated',
    'lead-not-active',
    'flagship-unavailable',
    'insufficient-provisions',
  ] satisfies VoyageBlockedReason[])('renders the domain-owned blocked copy for the complete readiness table: %s', (reason) => {
    render(<PortMenu
      activeActivity="menu"
      readiness={{ kind: 'blocked', reason, requiredProvisions: 2 }}
      busy={false}
      onSetSail={vi.fn()}
      onSelect={vi.fn()}
    />);

    const setSail = screen.getByTestId('port-action-set-sail');
    const explanation = screen.getByText(voyageBlockedCopy(reason));
    expect(setSail).toBeDisabled();
    expect(setSail).toHaveAttribute('aria-describedby', explanation.id);
  });

  it('enables Set Sail only when voyage readiness is ready and guards busy activation', () => {
    const onSetSail = vi.fn().mockResolvedValue({ kind: 'applied', eventId: 2 });
    const { rerender } = render(<PortMenu
      activeActivity="menu"
      readiness={{ kind: 'ready', requiredProvisions: 2 }}
      busy={false}
      onSetSail={onSetSail}
      onSelect={vi.fn()}
    />);
    const setSail = screen.getByTestId('port-action-set-sail');
    expect(setSail).toBeEnabled();
    fireEvent.click(setSail);
    fireEvent.click(setSail);
    expect(onSetSail).toHaveBeenCalledTimes(1);

    rerender(<PortMenu
      activeActivity="menu"
      readiness={{ kind: 'ready', requiredProvisions: 2 }}
      busy
      onSetSail={onSetSail}
      onSelect={vi.fn()}
    />);
    expect(screen.getByTestId('port-action-set-sail')).toBeDisabled();
  });

  it('uses the selector-owned completed-target copy instead of Tavern instructions', () => {
    render(<PortMenu
      activeActivity="log"
      readiness={{ kind: 'blocked', reason: 'target-defeated', requiredProvisions: 2 }}
      busy={false}
      onSetSail={vi.fn()}
      onSelect={vi.fn()}
    />);
    expect(screen.getByText('The Red Jackdaw lead is complete.')).toBeInTheDocument();
    expect(screen.queryByText(/Tavern first/)).not.toBeInTheDocument();
  });

  it('activates a ready Set Sail control from the keyboard once', () => {
    const onSetSail = vi.fn().mockResolvedValue({ kind: 'applied', eventId: 2 });
    render(<PortMenu
      activeActivity="menu"
      readiness={{ kind: 'ready', requiredProvisions: 2 }}
      busy={false}
      onSetSail={onSetSail}
      onSelect={vi.fn()}
    />);
    const action = screen.getByTestId('port-action-set-sail');
    action.focus();
    fireEvent.keyDown(action, { key: 'Enter' });
    fireEvent.click(action, { detail: 0 });
    expect(onSetSail).toHaveBeenCalledTimes(1);
  });
});
