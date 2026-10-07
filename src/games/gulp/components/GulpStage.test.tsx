import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { seededRng } from '@shared/rng';
import { createWorld, type Input, type WorldEvent } from '../domain/world';
import type { GulpScene as GulpSceneType } from '../three/scene';
import { GulpStage } from './GulpStage';
import { MOUSE_WAIT_AFTER_KEYS_MS } from './steering';

/** Stands in for the 3D city, so the frame loop runs in jsdom. */
class InertScene {
  sync(): void {}
  render(): void {}
  dispose(): void {}
}
const inert = () => Promise.resolve({ GulpScene: InertScene as unknown as typeof GulpSceneType });

let now = 0;

/** The stage has no layout in jsdom, so its middle is the top-left corner: x 400 is far to the east. */
function mouseAt(x: number, y: number) {
  const Ctor = (window.PointerEvent ?? window.MouseEvent) as typeof MouseEvent;
  const e = new Ctor('pointermove', { clientX: x, clientY: y, bubbles: true });
  Object.defineProperty(e, 'pointerType', { value: 'mouse' });
  fireEvent(screen.getByTestId('gulp-stage'), e);
}

function key(type: 'keydown' | 'keyup', k: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent(type, { key: k }));
  });
}

describe('<GulpStage> keys and mouse', () => {
  const step = vi.fn<(dt: number, input: Input | null) => WorldEvent[]>(() => []);
  /** The steering the round got on its latest frame, after a few more frames have run. */
  async function steering(): Promise<Input | null> {
    const from = step.mock.calls.length;
    await waitFor(() => expect(step.mock.calls.length).toBeGreaterThanOrEqual(from + 2));
    return step.mock.calls.at(-1)?.[1] ?? null;
  }

  beforeEach(() => {
    now = 10_000;
    window.__ARCADE_TEST_NOW__ = () => now;
    step.mockClear();
    render(
      <GulpStage
        world={createWorld(seededRng(1), [{ name: 'Robin', skin: 0 }], [], { countdown: 0 })}
        looks={[]}
        follow={0}
        playing
        pausedRef={{ current: false }}
        onFrame={() => {}}
        step={step}
        load={inert}
      />,
    );
  });

  afterEach(() => {
    delete window.__ARCADE_TEST_NOW__;
  });

  it('a steering key takes over from the mouse at once', async () => {
    mouseAt(400, 0);
    expect((await steering())?.x).toBeGreaterThan(0);

    key('keydown', 'ArrowLeft');
    expect(await steering()).toEqual({ x: -1, z: 0 });
  });

  it('the mouse waits after the keys, then steers again when it moves', async () => {
    mouseAt(400, 0);
    key('keydown', 'ArrowLeft');
    now += 300;
    key('keyup', 'ArrowLeft');
    // Let go of the keys: the resting mouse does not pull the hole its way.
    expect(await steering()).toEqual({ x: 0, z: 0 });

    // Moved too soon, it still waits.
    now += MOUSE_WAIT_AFTER_KEYS_MS - 1;
    mouseAt(400, 0);
    expect(await steering()).toEqual({ x: 0, z: 0 });

    // Moved once the keys have been quiet long enough, it steers.
    now += 1;
    mouseAt(400, 0);
    expect((await steering())?.x).toBeGreaterThan(0);
  });

  it('the mouse never steers while a key is held, however long', async () => {
    key('keydown', 'd');
    now += 60_000;
    mouseAt(-400, 0);
    expect(await steering()).toEqual({ x: 1, z: 0 });
  });
});
