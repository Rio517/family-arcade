import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BATTLE_LAB_INPUT } from '../../content/naval';
import { createNavalBattle } from '../../domain/naval/createBattle';
import { BattleHud } from './BattleHud';

describe('<BattleHud>', () => {
  it('publishes a visible fixed-width elapsed engagement with the exact canonical tick', () => {
    const state = createNavalBattle(BATTLE_LAB_INPUT);
    const rendered = render(<BattleHud state={state} paused={false} onTogglePause={vi.fn()} />);

    const elapsed = screen.getByTestId('naval-elapsed');
    expect(elapsed).toBeVisible();
    expect(elapsed).toHaveClass('naval-elapsed');
    expect(elapsed).toHaveTextContent('Engagement 00:00');
    expect(elapsed).toHaveAttribute('data-battle-tick', '0');

    state.tick = 11_855;
    rendered.rerender(<BattleHud state={state} paused onTogglePause={vi.fn()} />);
    expect(screen.getByTestId('naval-elapsed')).toHaveTextContent('Engagement 03:17');
    expect(screen.getByTestId('naval-elapsed')).toHaveAttribute('data-battle-tick', '11855');
  });

  it('keeps enemy telemetry health-only without revealing reload timing', () => {
    const state = createNavalBattle(BATTLE_LAB_INPUT);
    render(<BattleHud state={state} paused={false} onTogglePause={vi.fn()} />);

    const opponent = screen.getByRole('region', { name: `${state.ships.opponent.name} systems` });
    expect(opponent).toHaveTextContent('Hull');
    expect(opponent).not.toHaveTextContent(/reload|ready|reloading/i);
  });

  it('leaves ammunition and sail state to the action-first command cards', () => {
    const state = createNavalBattle(BATTLE_LAB_INPUT);
    render(<BattleHud state={state} paused={false} onTogglePause={vi.fn()} />);

    expect(screen.queryByRole('region', { name: 'Current sailing order' })).not.toBeInTheDocument();
    expect(screen.queryByText('Ammunition')).not.toBeInTheDocument();
    expect(screen.queryByText('Full sail')).not.toBeInTheDocument();
  });
});
