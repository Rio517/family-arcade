import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
    expect(actions.map((action) => action.querySelector('.caribbean-port-action-label')?.textContent?.trim())).toEqual(EXPECTED_LABELS);
    expect(PORT_ACTIONS.map((action) => action.label)).toEqual(EXPECTED_LABELS);
    expect(within(navigation).getByRole('list')).toContainElement(actions[0]);
  });

  it('leads every full-hit action with its own line icon and a compact state line', () => {
    render(<PortMenu activeActivity="menu" readiness={{ kind: 'ready', requiredProvisions: 2 }} busy={false} onSetSail={vi.fn()} onSelect={vi.fn()} />);

    const names = ['governor', 'tavern', 'market', 'shipyard', 'shares', 'log', 'set-sail'];
    for (const name of names) {
      const action = screen.getByTestId(`port-action-${name}`);
      expect(action.querySelector(`[data-port-icon="${name}"]`)).not.toBeNull();
      expect(action.querySelector('.caribbean-port-action-state')).toBeVisible();
    }
    expect(screen.getByTestId('port-action-set-sail')).toHaveTextContent('2 provisions');
    expect(screen.getByTestId('port-action-shares')).toHaveTextContent('After voyage');
    expect(screen.getByTestId('port-action-log')).toHaveTextContent('Review log');
  });

  it('makes every complete navigation tile interactive and keeps supporting copy readable', () => {
    render(<PortMenu activeActivity="menu" readiness={{ kind: 'ready', requiredProvisions: 2 }} busy={false} onSetSail={vi.fn()} onSelect={vi.fn()} />);

    for (const button of screen.getAllByRole('button')) {
      expect(button.parentElement).toHaveClass('caribbean-port-action-item');
    }
    const setSail = screen.getByTestId('port-action-set-sail');
    expect(setSail).toContainElement(screen.getByText('2 provisions'));

    const css = readFileSync(resolve('src/games/caribbean/styles/port.css'), 'utf8');
    expect(css).toMatch(/\.caribbean-port-action-item\s*\{[^}]*display:\s*grid/s);
    expect(css).toMatch(/\.caribbean-port-action-item\s*\{[^}]*padding:\s*0px/s);
    expect(css).toMatch(/\.caribbean-port-actions\s*\{[^}]*grid-auto-rows:\s*112px/s);
    expect(css).toMatch(/\.caribbean-port-action\s*\{[^}]*height:\s*100%/s);
    expect(css).toMatch(/\.caribbean-port \.caribbean-port-action\s*\{[^}]*font-size:\s*15px/s);
    expect(css).toMatch(/\.caribbean-port \.caribbean-port-action\s*\{[^}]*min-width:\s*0/s);
    expect(css).toMatch(/\.caribbean-port \.caribbean-port-action\s*\{[^}]*padding:\s*7px 5px 6px/s);
    expect(css).toMatch(/\.caribbean-port \.caribbean-port-action\s*\{[^}]*background:\s*#07151d/s);
    expect(css).toMatch(/\.caribbean-port-action-label\s*\{[^}]*width:\s*100%/s);
    expect(css).toMatch(/\.caribbean-port-action-state\s*\{[^}]*width:\s*100%/s);
    expect(css).toMatch(/\.caribbean-port-action-state\s*\{[^}]*font-size:\s*14px/s);
    expect(css).toMatch(/\.caribbean-production--port \.caribbean-memory-warning\s*\{[^}]*max-width:\s*340px/s);
    expect(css).toMatch(/@media \(width <= 1180px\)[\s\S]*\.caribbean-port-primary\s*\{[^}]*grid-template-rows:[^;}]*168px/s);
    expect(css).toMatch(/@media \(width <= 1180px\)[\s\S]*\.caribbean-port-actions\s*\{[^}]*grid-template-columns:\s*repeat\(4,/s);
    expect(css).toMatch(/@media \(width <= 1180px\)[\s\S]*\.caribbean-port-action-icon\s*\{[^}]*width:\s*24px[^}]*height:\s*24px/s);
    expect(css).toMatch(/@media \(max-height:\s*700px\)[\s\S]*body:has\(\.caribbean-port\) \.party-root\s*\{[^}]*bottom:\s*calc\(148px/s);
    expect(css).toMatch(/@media \(max-height:\s*700px\)[\s\S]*body:has\(\.caribbean-port\) \.party-root\s*\{[^}]*left:\s*calc\(50% - 10px\)/s);
    expect(css).toMatch(/@media \(width <= 1180px\) and \(max-height:\s*700px\)[\s\S]*\.caribbean-port-primary\s*\{[^}]*grid-template-rows:[^;}]*156px/s);
    expect(css).toMatch(/@media \(width <= 1180px\) and \(max-height:\s*700px\)[\s\S]*\.caribbean-port-actions\s*\{[^}]*grid-auto-rows:\s*70px/s);
    expect(css).toMatch(/@media \(width <= 1180px\) and \(max-height:\s*700px\)[\s\S]*\.caribbean-port-action-item\s*\{[^}]*min-height:\s*70px/s);
  });

  it('gives the icon, label, and state line enough desktop height to remain unclipped', () => {
    const css = readFileSync(resolve('src/games/caribbean/styles/port.css'), 'utf8');
    const menuRule = css.match(/\.caribbean-port-actions\s*\{([^}]*)\}/s)?.[1] ?? '';
    const rowHeight = Number(menuRule.match(/grid-auto-rows:\s*([\d.]+)px/)?.[1]);

    expect(rowHeight).toBeGreaterThanOrEqual(108);
  });

  it('marks the Tavern instead of showing the lead instruction as visible Set Sail copy', () => {
    render(<PortMenu
      activeActivity="menu"
      readiness={{ kind: 'blocked', reason: 'lead-not-active', requiredProvisions: 2 }}
      busy={false}
      onSetSail={vi.fn()}
      onSelect={vi.fn()}
    />);

    const tavern = screen.getByRole('button', { name: 'Tavern' });
    expect(tavern).toHaveAttribute('aria-describedby', 'port-tavern-attention-copy');
    expect(tavern.querySelector('.caribbean-port-action-attention')).not.toBeNull();
    expect(tavern.querySelector('.caribbean-port-action-state')).toHaveTextContent('Rumour');
    expect(screen.getByText('Rumour available', { selector: '.caribbean-visually-hidden' })).toHaveClass('caribbean-visually-hidden');
    expect(screen.getByText('Mark the Red Jackdaw rumour in the Tavern first.')).toHaveClass('caribbean-visually-hidden');
    expect(screen.queryByText('Mark the Red Jackdaw rumour in the Tavern first.', { selector: '.caribbean-port-action-reason' })).not.toBeInTheDocument();
    expect(screen.getByTestId('port-action-set-sail').querySelector('.caribbean-port-action-state')).toHaveTextContent('No course');
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
