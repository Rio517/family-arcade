import { useEffect } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MinimumScreenGate } from './MinimumScreenGate';

const originalWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
const originalHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

function MountProbe({ onMount }: { onMount(): void }) {
  useEffect(onMount, [onMount]);
  return <div data-testid="campaign-controller">Campaign controller</div>;
}

afterEach(() => {
  if (originalWidth) Object.defineProperty(window, 'innerWidth', originalWidth);
  if (originalHeight) Object.defineProperty(window, 'innerHeight', originalHeight);
});

describe('<MinimumScreenGate>', () => {
  it.each([
    [390, 844],
    [820, 1180],
    [1024, 1366],
    [959, 600],
    [960, 599],
  ])('blocks %d × %d without mounting the campaign controller', (width, height) => {
    setViewport(width, height);
    const onMount = vi.fn();

    render(
      <MinimumScreenGate>
        <MountProbe onMount={onMount} />
      </MinimumScreenGate>,
    );

    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent(
      'Caribbean Career needs a 960 × 600 playfield. Use a larger landscape display.',
    );
    expect(notice).toHaveFocus();
    expect(screen.queryByTestId('campaign-controller')).not.toBeInTheDocument();
    expect(onMount).not.toHaveBeenCalled();
  });

  it.each([
    [960, 600],
    [1440, 900],
  ])('mounts the campaign controller at supported landscape %d × %d', (width, height) => {
    setViewport(width, height);
    const onMount = vi.fn();

    render(
      <MinimumScreenGate>
        <MountProbe onMount={onMount} />
      </MinimumScreenGate>,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('campaign-controller')).toBeInTheDocument();
    expect(onMount).toHaveBeenCalledTimes(1);
  });

  it('responds to resize in both directions using the combined landscape boundary', () => {
    setViewport(1024, 1366);
    const onMount = vi.fn();

    render(
      <MinimumScreenGate>
        <MountProbe onMount={onMount} />
      </MinimumScreenGate>,
    );

    expect(screen.getByRole('alert')).toHaveFocus();
    expect(onMount).not.toHaveBeenCalled();

    setViewport(960, 600);
    fireEvent(window, new Event('resize'));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('campaign-controller')).toBeInTheDocument();
    expect(onMount).toHaveBeenCalledTimes(1);

    setViewport(960, 599);
    fireEvent(window, new Event('resize'));

    const notice = screen.getByRole('alert');
    expect(notice).toHaveFocus();
    expect(screen.queryByTestId('campaign-controller')).not.toBeInTheDocument();
  });
});
