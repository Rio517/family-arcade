import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FleetSelect } from './FleetSelect';

function setup(overrides = {}) {
  const onContinue = vi.fn();
  const onEra = vi.fn();
  render(
    <FleetSelect
      era="classic"
      onEra={onEra}
      onContinue={onContinue}
      {...overrides}
    />,
  );
  return { onContinue, onEra };
}

describe('<FleetSelect>', () => {
  it('offers no colours to choose from', () => {
    setup();
    expect(screen.queryByTestId('skin-aqua')).toBeNull();
    expect(screen.queryByTestId('fleet-info')).toBeNull();
  });

  it('continues with the chosen navy', () => {
    const { onContinue } = setup();
    fireEvent.click(screen.getByTestId('fleet-continue'));
    expect(onContinue).toHaveBeenCalled();
  });

  it('never asks for a captain name — the ticket already says who you are', () => {
    setup();
    expect(screen.queryByTestId('fleet-name-input')).toBeNull();
  });

  it('offers Classic and Modern navies as a separate choice, by those names', () => {
    const { onEra } = setup();
    // The words the family asked for, so players get what they're picking…
    expect(screen.getByTestId('era-classic')).toHaveTextContent('Classic');
    expect(screen.getByTestId('era-modern')).toHaveTextContent('Modern');
    // …with the actual ships spelled out on each card.
    expect(screen.getByTestId('era-classic')).toHaveTextContent(/Iowa/);
    expect(screen.getByTestId('era-modern')).toHaveTextContent(/Virginia/);
    expect(screen.getByTestId('era-classic')).toHaveAttribute('data-selected', 'true');

    fireEvent.click(screen.getByTestId('era-modern'));
    expect(onEra).toHaveBeenCalledWith('modern');
  });
});
