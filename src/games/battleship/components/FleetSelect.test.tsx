import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FleetSelect } from './FleetSelect';
import { defaultProfile } from '@shared/profile/profile';

function setup(overrides = {}) {
  const onSelect = vi.fn();
  const onUnlock = vi.fn(() => false);
  const onContinue = vi.fn();
  const onName = vi.fn();
  render(
    <FleetSelect
      profile={defaultProfile()}
      selectedSkinId="aqua"
      name="Kid"
      onName={onName}
      onSelect={onSelect}
      onUnlock={onUnlock}
      onContinue={onContinue}
      {...overrides}
    />,
  );
  return { onSelect, onUnlock, onContinue, onName };
}

describe('<FleetSelect>', () => {
  it('renders the fleet options', () => {
    setup();
    expect(screen.getByTestId('skin-aqua')).toBeInTheDocument();
    expect(screen.getByTestId('skin-phantom')).toBeInTheDocument();
  });

  it('explains (via the info button) that fleets are cosmetic', () => {
    setup();
    expect(screen.queryByTestId('fleet-info-box')).toBeNull();
    fireEvent.click(screen.getByTestId('fleet-info'));
    const box = screen.getByTestId('fleet-info-box');
    expect(box).toHaveTextContent(/cosmetic/i);
    expect(box).toHaveTextContent(/same ships and the same rules/i);
  });

  it('selects an owned fleet', () => {
    const { onSelect } = setup();
    fireEvent.click(screen.getByTestId('skin-ember')); // free, owned by default
    expect(onSelect).toHaveBeenCalledWith('ember');
  });

  it('continues with the chosen fleet', () => {
    const { onContinue } = setup();
    fireEvent.click(screen.getByTestId('fleet-continue'));
    expect(onContinue).toHaveBeenCalled();
  });

  it('lets you change your captain name here', () => {
    const { onName } = setup();
    fireEvent.change(screen.getByTestId('fleet-name-input'), { target: { value: 'Skipper' } });
    expect(onName).toHaveBeenCalledWith('Skipper');
  });
});
