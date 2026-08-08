import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import { useMapZoom } from './useMapZoom';

const WIDTH = 1000;
const HEIGHT = 500;

function parseViewBox(viewBox: string): [number, number, number, number] {
  const parts = viewBox.split(' ').map(Number);
  expect(parts).toHaveLength(4);
  return parts as [number, number, number, number];
}

/** Mimics the real jsdom <svg>: getBoundingClientRect is all zeros, and
 *  pointer capture is unimplemented (undefined), not merely a no-op. */
function fakeSvg() {
  return {
    getBoundingClientRect: () => ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      toJSON: () => ({}),
    }),
  } as unknown as SVGSVGElement;
}

const currentTarget = fakeSvg();

function pointer(pointerId: number, clientX: number, clientY: number) {
  return { pointerId, clientX, clientY, currentTarget } as unknown as ReactPointerEvent<SVGSVGElement>;
}

describe('useMapZoom', () => {
  it('defaults to the whole map in view', () => {
    const { result } = renderHook(() => useMapZoom(WIDTH, HEIGHT));
    expect(result.current.viewBox).toBe(`0 0 ${WIDTH} ${HEIGHT}`);
    expect(result.current.scale).toBe(1);
    expect(result.current.isDefault).toBe(true);
    expect(result.current.canZoomOut).toBe(false);
    expect(result.current.canZoomIn).toBe(true);
  });

  it('zoomIn raises scale and narrows the viewBox while staying inside the map', () => {
    const { result } = renderHook(() => useMapZoom(WIDTH, HEIGHT));

    act(() => result.current.zoomIn());

    expect(result.current.scale).toBeGreaterThan(1);
    expect(result.current.isDefault).toBe(false);

    const [x, y, w, h] = parseViewBox(result.current.viewBox);
    expect(w).toBeLessThan(WIDTH);
    expect(h).toBeLessThan(HEIGHT);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x + w).toBeLessThanOrEqual(WIDTH + 1e-6);
    expect(y + h).toBeLessThanOrEqual(HEIGHT + 1e-6);
  });

  it('zoomOut from the default view does nothing and canZoomOut is false', () => {
    const { result } = renderHook(() => useMapZoom(WIDTH, HEIGHT));

    expect(result.current.canZoomOut).toBe(false);
    act(() => result.current.zoomOut());

    expect(result.current.viewBox).toBe(`0 0 ${WIDTH} ${HEIGHT}`);
    expect(result.current.scale).toBe(1);
    expect(result.current.isDefault).toBe(true);
  });

  it('clamps zoom at maxScale and disables further zoom in', () => {
    const { result } = renderHook(() => useMapZoom(WIDTH, HEIGHT, { maxScale: 4 }));

    // Overshoot with plenty of zoomIn calls; the hook must clamp rather than
    // creep past maxScale.
    act(() => {
      for (let i = 0; i < 20; i++) result.current.zoomIn();
    });

    expect(result.current.scale).toBeCloseTo(4, 5);
    expect(result.current.canZoomIn).toBe(false);
    expect(result.current.canZoomOut).toBe(true);
  });

  it('reset() restores the default viewBox', () => {
    const { result } = renderHook(() => useMapZoom(WIDTH, HEIGHT));

    act(() => {
      result.current.zoomIn();
      result.current.zoomIn();
    });
    expect(result.current.isDefault).toBe(false);

    act(() => result.current.reset());

    expect(result.current.viewBox).toBe(`0 0 ${WIDTH} ${HEIGHT}`);
    expect(result.current.scale).toBe(1);
    expect(result.current.isDefault).toBe(true);
  });

  it('never produces a NaN viewBox across a sequence of zoom, pan and pinch operations', () => {
    const { result } = renderHook(() => useMapZoom(WIDTH, HEIGHT));

    act(() => {
      result.current.zoomIn();
      result.current.bind.onWheel({
        clientX: 300,
        clientY: 200,
        deltaY: -100,
        cancelable: true,
        preventDefault: () => {},
        currentTarget,
      } as unknown as ReactWheelEvent<SVGSVGElement>);
      result.current.bind.onPointerDown(pointer(1, 100, 100));
      result.current.bind.onPointerMove(pointer(1, 140, 130));
      result.current.bind.onPointerDown(pointer(2, 300, 300));
      result.current.bind.onPointerMove(pointer(2, 260, 260));
      result.current.bind.onPointerUp(pointer(1, 140, 130));
      result.current.bind.onPointerUp(pointer(2, 260, 260));
      result.current.zoomOut();
      result.current.reset();
    });

    const [x, y, w, h] = parseViewBox(result.current.viewBox);
    for (const n of [x, y, w, h]) expect(Number.isFinite(n)).toBe(true);
    expect(Number.isFinite(result.current.scale)).toBe(true);
  });

  it('a pointerdown/up with no movement is a tap, not a drag', () => {
    const { result } = renderHook(() => useMapZoom(WIDTH, HEIGHT));

    act(() => {
      result.current.bind.onPointerDown(pointer(1, 50, 50));
      result.current.bind.onPointerUp(pointer(1, 50, 50));
    });

    expect(result.current.wasDragged()).toBe(false);
    expect(result.current.panning).toBe(false);
  });
});
