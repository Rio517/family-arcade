import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BATTLE_LAB_INPUT } from '../content/naval';
import { CaribbeanLab } from './CaribbeanLab';
import type { NavalSceneAdapter } from './battle/NavalViewport';

describe('Caribbean Battle Lab flow', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('offers one clear production Battle Lab decision before starting', () => {
    render(<CaribbeanLab sceneFactory={null} />);

    expect(screen.getByRole('heading', { name: 'Caribbean Career' })).toBeVisible();
    expect(screen.getByTestId('lab-start-naval')).toHaveTextContent('Enter Battle Lab');
    expect(screen.getByText(/port decisions are the next slice/i)).toBeVisible();
    expect(screen.getByRole('region', { name: 'Battle controls' })).toHaveTextContent(/A.*Q.*S.*R.*E.*D.*Space/s);
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
    expect(briefing).toHaveTextContent(/cycle.*S/i);
    expect(briefing).toHaveTextContent(/round.*chain.*grape/i);
    expect(briefing.querySelector('.caribbean-briefing__copy > p')?.textContent?.trim().split(/\s+/).length).toBeLessThan(90);
    expect(within(briefing).getByRole('region', { name: 'Battle controls' })).toHaveTextContent(/Space.*Pause/);
    expect(screen.getByTestId('naval-enter-battle')).toHaveTextContent('Enter battle');
    expect(screen.getByRole('heading', { name: 'Disable. Close. Capture.' })).toHaveFocus();
  });

  it.each([
    [959, 820],
    [1180, 599],
    [430, 932],
    [844, 390],
  ])('blocks and focuses the live game notice below the 960 by 600 playfield at %sx%s', async (width, height) => {
    vi.stubGlobal('innerWidth', width);
    vi.stubGlobal('innerHeight', height);

    render(<CaribbeanLab sceneFactory={null} />);

    const notice = screen.getByTestId('caribbean-display-notice');
    expect(notice).toHaveTextContent(/designed for tablet and larger/i);
    expect(notice).toHaveTextContent(/rotate.*larger display/i);
    expect(notice).toHaveAttribute('tabindex', '-1');
    await waitFor(() => expect(notice).toHaveFocus());
    expect(screen.queryByTestId('lab-start-naval')).not.toBeInTheDocument();
    expect(screen.queryByTestId('naval-battle-page')).not.toBeInTheDocument();
  });

  it('allows the exact 960 by 600 playfield boundary', () => {
    vi.stubGlobal('innerWidth', 960);
    vi.stubGlobal('innerHeight', 600);

    render(<CaribbeanLab sceneFactory={null} />);

    expect(screen.getByTestId('lab-start-naval')).toBeVisible();
    expect(screen.queryByTestId('caribbean-display-notice')).not.toBeInTheDocument();
  });

  it('unmounts a live battle below the boundary and explicitly restarts it when the playfield returns', async () => {
    vi.stubGlobal('innerWidth', 1024);
    vi.stubGlobal('innerHeight', 768);
    const dispose = vi.fn();
    const adapter: NavalSceneAdapter = {
      sync: vi.fn(),
      render: vi.fn(),
      metrics: () => ({ fps: 60, dpr: 1, tier: 'low', drawCalls: 1, triangles: 1, textures: 0, geometries: 1, materials: 1, bufferAttributes: 3, activeEffects: 0, effectCapacity: 8, reducedMotion: false, shipIntermediateFrames: 1, cameraIntermediateFrames: 1, reducedMotionShipSnaps: 0, reducedMotionCameraSnaps: 0 }),
      dispose,
    };
    const onSessionReady = vi.fn();
    render(<CaribbeanLab sceneFactory={vi.fn().mockResolvedValue(adapter)} onSessionReady={onSessionReady} />);
    fireEvent.click(screen.getByTestId('lab-start-naval'));
    fireEvent.click(screen.getByTestId('naval-enter-battle'));
    await screen.findByTestId('naval-scene-slot');
    await waitFor(() => expect(onSessionReady).toHaveBeenCalledTimes(1));

    vi.stubGlobal('innerWidth', 844);
    vi.stubGlobal('innerHeight', 390);
    fireEvent(window, new Event('resize'));

    const notice = await screen.findByTestId('caribbean-display-notice');
    expect(notice).toHaveTextContent(/duel restarts/i);
    await waitFor(() => expect(notice).toHaveFocus());
    expect(screen.queryByTestId('naval-battle-page')).not.toBeInTheDocument();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(onSessionReady).toHaveBeenCalledTimes(1);

    vi.stubGlobal('innerWidth', 1024);
    vi.stubGlobal('innerHeight', 768);
    fireEvent(window, new Event('resize'));

    expect(await screen.findByTestId('naval-battle-page')).toBeVisible();
    await waitFor(() => expect(onSessionReady).toHaveBeenCalledTimes(2));
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

  it('starts from a supplied serialized harness input without changing the normal default', async () => {
    const onSessionReady = vi.fn();
    const input = structuredClone(BATTLE_LAB_INPUT);
    input.battleId = 'harness-port-evidence';
    input.seed = 8_023;
    input.player.position = { x: 0, z: 0 };
    input.opponent.position = { x: 20, z: 0 };

    render(<CaribbeanLab sceneFactory={null} battleInput={input} onSessionReady={onSessionReady} />);
    fireEvent.click(screen.getByTestId('lab-start-naval'));
    fireEvent.click(screen.getByTestId('naval-enter-battle'));

    await waitFor(() => expect(onSessionReady).toHaveBeenCalledTimes(1));
    const state = onSessionReady.mock.calls[0][0].getSnapshot().state;
    expect(state.input.battleId).toBe('harness-port-evidence');
    expect(state.input.seed).toBe(8_023);
    expect(state.ships.opponent.position).toEqual({ x: 20, z: 0 });
  });
});
