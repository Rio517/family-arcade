import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixture } from '../../domain/naval/testFixtures';
import type { NavalEvent } from '../../domain/naval/types';
import {
  NavalViewport,
  type NavalSceneAdapter,
  type NavalSceneFactory,
} from './NavalViewport';

interface FakeScene {
  adapter: NavalSceneAdapter;
  disposed: number;
  renders: Array<{ animation: number; wall: number | undefined }>;
  syncs: Array<{ tick: number; eventIds: number[] }>;
  throwOnRender: boolean;
  throwOnSync: boolean;
}

function fakeScene(): FakeScene {
  const fake: FakeScene = {
    disposed: 0,
    renders: [],
    syncs: [],
    throwOnRender: false,
    throwOnSync: false,
    adapter: undefined as unknown as NavalSceneAdapter,
  };
  fake.adapter = {
    sync(state, events) {
      if (fake.throwOnSync) throw new Error('snapshot sync failed');
      fake.syncs.push({ tick: state.tick, eventIds: events.map(({ id }) => id) });
    },
    render(frameSeconds, wallSeconds) {
      if (fake.throwOnRender) throw new Error('context render failed');
      fake.renders.push({ animation: frameSeconds, wall: wallSeconds });
    },
    metrics: () => ({
      fps: 60,
      dpr: 1,
      tier: 'low',
      drawCalls: 1,
      triangles: 2,
      textures: 3,
      geometries: 4,
      materials: 5,
      activeEffects: 0,
      effectCapacity: 32,
    }),
    dispose() {
      fake.disposed += 1;
    },
  };
  return fake;
}

describe('NavalViewport', () => {
  let frames: FrameRequestCallback[];
  let nextFrameHandle: number;

  beforeEach(() => {
    frames = [];
    nextFrameHandle = 0;
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      frames.push(callback);
      nextFrameHandle += 1;
      return nextFrameHandle;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows loading, syncs canonical snapshots/events, renders, and disposes exactly once', async () => {
    const scene = fakeScene();
    let resolveFactory!: (value: NavalSceneAdapter) => void;
    const sceneFactory: NavalSceneFactory = vi.fn(() => new Promise<NavalSceneAdapter>((resolve) => {
      resolveFactory = resolve;
    }));
    const state = fixture();
    const events: NavalEvent[] = [{
      id: 7,
      kind: 'reload-ready',
      atTick: 0,
      shipId: 'player',
      side: 'port',
    }];

    const { rerender, unmount } = render(
      <NavalViewport state={state} events={events} sceneFactory={sceneFactory} onRestart={vi.fn()} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Preparing tactical sea');

    await act(async () => resolveFactory(scene.adapter));
    expect(await screen.findByTestId('naval-scene-slot')).toBeVisible();
    expect(scene.syncs).toEqual([{ tick: 0, eventIds: [] }]);

    const nextState = fixture({ tick: 12 });
    rerender(<NavalViewport state={nextState} events={[]} sceneFactory={sceneFactory} onRestart={vi.fn()} />);
    expect(scene.syncs.at(-1)).toEqual({ tick: 12, eventIds: [] });

    act(() => frames.shift()?.(1_000));
    act(() => frames.shift()?.(1_016.667));
    expect(scene.renders.at(-1)?.animation).toBeCloseTo(1 / 60, 3);
    expect(scene.renders.at(-1)?.wall).toBeCloseTo(1 / 60, 3);

    unmount();
    expect(scene.disposed).toBe(1);
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it('renders the usable HTML chart after construction failure without logging a Three stack', async () => {
    const state = fixture();
    const onRestart = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const sceneFactory: NavalSceneFactory = vi.fn().mockRejectedValue(new Error('no WebGL'));

    render(<NavalViewport state={state} events={[]} sceneFactory={sceneFactory} onRestart={onRestart} />);

    const chart = await screen.findByTestId('naval-html-chart');
    expect(chart).toHaveTextContent('3D sea unavailable—battle rules continue');
    expect(screen.getByTestId('naval-scene-retry')).toBeEnabled();
    fireEvent.click(screen.getByTestId('naval-scene-restart'));
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(consoleError).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/3D sea unavailable/i);
    await waitFor(() => expect(screen.getByTestId('naval-scene-retry')).toHaveFocus());
    consoleError.mockRestore();
  });

  it('retries scene construction and replaces the fallback when WebGL recovers', async () => {
    const scene = fakeScene();
    const sceneFactory: NavalSceneFactory = vi.fn()
      .mockRejectedValueOnce(new Error('temporary context loss'))
      .mockResolvedValueOnce(scene.adapter);

    const historical: NavalEvent[] = [{ id: 9, kind: 'reload-ready', atTick: 0, shipId: 'player', side: 'port' }];
    render(<NavalViewport state={fixture()} events={historical} sceneFactory={sceneFactory} onRestart={vi.fn()} />);
    await screen.findByTestId('naval-html-chart');
    fireEvent.click(screen.getByTestId('naval-scene-retry'));

    expect(await screen.findByTestId('naval-scene-slot')).toBeVisible();
    expect(sceneFactory).toHaveBeenCalledTimes(2);
    expect(scene.syncs).toEqual([{ tick: 0, eventIds: [] }]);
    expect(screen.getByTestId('naval-scene-frame')).toHaveFocus();
  });

  it('falls back and disposes when rendering fails', async () => {
    const scene = fakeScene();
    scene.throwOnRender = true;
    const sceneFactory: NavalSceneFactory = vi.fn().mockResolvedValue(scene.adapter);

    render(<NavalViewport state={fixture()} events={[]} sceneFactory={sceneFactory} onRestart={vi.fn()} />);
    await screen.findByTestId('naval-scene-slot');
    act(() => frames.shift()?.(1_000));

    await waitFor(() => expect(screen.getByTestId('naval-html-chart')).toBeVisible());
    expect(scene.disposed).toBe(1);
  });

  it('routes initial snapshot sync failure through one-shot fallback disposal', async () => {
    const scene = fakeScene();
    scene.throwOnSync = true;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<NavalViewport state={fixture()} events={[]} sceneFactory={vi.fn().mockResolvedValue(scene.adapter)} onRestart={vi.fn()} />);

    expect(await screen.findByTestId('naval-html-chart')).toBeVisible();
    expect(scene.disposed).toBe(1);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('routes subsequent snapshot sync failure through the same one-shot boundary', async () => {
    const scene = fakeScene();
    const factory = vi.fn().mockResolvedValue(scene.adapter);
    const { rerender } = render(
      <NavalViewport state={fixture()} events={[]} sceneFactory={factory} onRestart={vi.fn()} />,
    );
    await screen.findByTestId('naval-scene-slot');
    scene.throwOnSync = true;

    rerender(<NavalViewport state={fixture({ tick: 12 })} events={[]} sceneFactory={factory} onRestart={vi.fn()} />);

    expect(await screen.findByTestId('naval-html-chart')).toBeVisible();
    expect(scene.disposed).toBe(1);
  });

  it('delivers only live deltas and replays reused event ids after a rematch generation', async () => {
    const scene = fakeScene();
    const factory = vi.fn().mockResolvedValue(scene.adapter);
    const event: NavalEvent = { id: 1, kind: 'reload-ready', atTick: 1, shipId: 'player', side: 'port' };
    const { rerender } = render(
      <NavalViewport state={fixture()} events={[]} battleGeneration={0} sceneFactory={factory} onRestart={vi.fn()} />,
    );
    await screen.findByTestId('naval-scene-slot');

    rerender(<NavalViewport state={fixture({ tick: 1 })} events={[event]} battleGeneration={0} sceneFactory={factory} onRestart={vi.fn()} />);
    rerender(<NavalViewport state={fixture({ tick: 2 })} events={[event]} battleGeneration={0} sceneFactory={factory} onRestart={vi.fn()} />);
    rerender(<NavalViewport state={fixture({ tick: 1 })} events={[event]} battleGeneration={1} sceneFactory={factory} onRestart={vi.fn()} />);

    expect(scene.syncs.map(({ eventIds }) => eventIds)).toEqual([[], [1], [], [1]]);
  });

  it('keeps wall time unclamped while clamping animation after a stalled frame', async () => {
    const scene = fakeScene();
    render(<NavalViewport state={fixture()} events={[]} sceneFactory={vi.fn().mockResolvedValue(scene.adapter)} onRestart={vi.fn()} />);
    await screen.findByTestId('naval-scene-slot');

    act(() => frames.shift()?.(1_000));
    act(() => frames.shift()?.(1_500));

    expect(scene.renders.at(-1)).toEqual({ animation: 0.1, wall: 0.5 });
  });

  it('resets wall timing across hidden intervals while preserving visible low-FPS samples', async () => {
    let visibilityState: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilityState);
    const removeListener = vi.spyOn(document, 'removeEventListener');
    const scene = fakeScene();
    const { unmount } = render(
      <NavalViewport state={fixture()} events={[]} sceneFactory={vi.fn().mockResolvedValue(scene.adapter)} onRestart={vi.fn()} />,
    );
    await screen.findByTestId('naval-scene-slot');

    act(() => frames.shift()?.(1_000));
    act(() => frames.shift()?.(1_500));
    expect(scene.renders.at(-1)).toEqual({ animation: 0.1, wall: 0.5 });

    visibilityState = 'hidden';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    visibilityState = 'visible';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    act(() => frames.shift()?.(9_000));
    expect(scene.renders.at(-1)).toEqual({ animation: 0, wall: 0 });

    act(() => frames.shift()?.(9_500));
    expect(scene.renders.at(-1)).toEqual({ animation: 0.1, wall: 0.5 });

    unmount();
    expect(removeListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });

  it('publishes actual renderer metrics on the harness-visible scene frame', async () => {
    const scene = fakeScene();
    render(<NavalViewport state={fixture()} events={[]} sceneFactory={vi.fn().mockResolvedValue(scene.adapter)} onRestart={vi.fn()} />);
    const frame = await screen.findByTestId('naval-scene-frame');

    act(() => frames.shift()?.(1_000));

    const publishedMetrics = Object.fromEntries(
      Object.entries(frame.dataset).filter(([name]) => name.startsWith('scene')),
    );
    expect(publishedMetrics).toEqual({
      sceneFps: '60',
      sceneDpr: '1',
      sceneTier: 'low',
      sceneDrawCalls: '1',
      sceneTriangles: '2',
      sceneTextures: '3',
      sceneGeometries: '4',
      sceneMaterials: '5',
      sceneActiveEffects: '0',
      sceneEffectCapacity: '32',
    });
  });

  it('uses the HTML chart immediately when 3D is explicitly disabled', () => {
    render(<NavalViewport state={fixture()} events={[]} sceneFactory={null} onRestart={vi.fn()} />);
    expect(screen.getByTestId('naval-html-chart')).toBeVisible();
  });

  it('uses the same fallback boundary when a live sensory update throws', async () => {
    const scene = fakeScene();
    scene.adapter.syncSensorySettings = () => { throw new Error('sensory failure'); };
    const factory = vi.fn().mockResolvedValue(scene.adapter);
    const { rerender } = render(<NavalViewport state={fixture()} events={[]} sceneFactory={factory} onRestart={vi.fn()} />);
    await screen.findByTestId('naval-scene-slot');
    rerender(<NavalViewport state={fixture()} events={[]} reducedMotion sceneFactory={factory} onRestart={vi.fn()} />);
    expect(await screen.findByTestId('naval-html-chart')).toBeVisible();
    expect(scene.disposed).toBe(1);
  });
});
