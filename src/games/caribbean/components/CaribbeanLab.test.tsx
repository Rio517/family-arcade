import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CaribbeanLab } from './CaribbeanLab';

describe('Caribbean Battle Lab flow', () => {
  it('offers one clear production Battle Lab decision before starting', () => {
    render(<CaribbeanLab sceneFactory={null} />);

    expect(screen.getByRole('heading', { name: 'Caribbean Career' })).toBeVisible();
    expect(screen.getByTestId('lab-start-naval')).toHaveTextContent('Enter Battle Lab');
    expect(screen.getByText(/port decisions are the next slice/i)).toBeVisible();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('briefs the objective, controls, sail tradeoff, wind, and ammunition before battle', () => {
    render(<CaribbeanLab sceneFactory={null} />);
    fireEvent.click(screen.getByTestId('lab-start-naval'));

    const briefing = screen.getByTestId('naval-briefing');
    expect(briefing).toHaveTextContent(/capture the Red Jackdaw/i);
    expect(briefing).toHaveTextContent(/trade wind/i);
    expect(briefing).toHaveTextContent(/full sail/i);
    expect(briefing).toHaveTextContent(/reefed/i);
    expect(briefing).toHaveTextContent(/A\/D/i);
    expect(briefing).toHaveTextContent(/Q\/E/i);
    expect(briefing).toHaveTextContent(/round.*chain.*grape/i);
    expect(briefing.textContent?.trim().split(/\s+/).length).toBeLessThan(90);
    expect(screen.getByTestId('naval-enter-battle')).toHaveTextContent('Enter battle');
    expect(screen.getByRole('heading', { name: 'Disable. Close. Capture.' })).toHaveFocus();
  });

  it('enters the chart-centered command deck through the real briefing action', async () => {
    render(<CaribbeanLab sceneFactory={null} />);
    fireEvent.click(screen.getByTestId('lab-start-naval'));
    fireEvent.click(screen.getByTestId('naval-enter-battle'));

    expect(screen.getByTestId('naval-battle-page')).toBeVisible();
    expect(screen.getByTestId('naval-html-chart')).toBeVisible();
    await waitFor(() => expect(screen.getByTestId('naval-fire-port')).toHaveFocus());
  });

  it('provides the live session to a harness-only debug snapshot hook', async () => {
    const onSessionReady = vi.fn();
    render(<CaribbeanLab sceneFactory={null} onSessionReady={onSessionReady} />);
    fireEvent.click(screen.getByTestId('lab-start-naval'));
    fireEvent.click(screen.getByTestId('naval-enter-battle'));

    await waitFor(() => expect(onSessionReady).toHaveBeenCalledTimes(1));
    expect(onSessionReady.mock.calls[0][0].getSnapshot().state.tick).toBeTypeOf('number');
  });
});
