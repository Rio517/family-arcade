import { afterEach, describe, expect, it, vi } from 'vitest';
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
 *  pointer capture is unimplemented (undefined), not merely a no-op. The
 *  style object is real, though — the hook writes the gesture preview
 *  transform to it. */
function fakeSvg() {
  return {
    style: { transform: '' },
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
const svgStyle = (currentTarget as unknown as { style: { transform: string } }).style;

function pointer(pointerId: number, clientX: number, clientY: number) {
  return { pointerId, clientX, clientY, currentTarget } as unknown as ReactPointerEvent<SVGSVGElement>;
}

describe('useMapZoom', () => {
  afterEach(() => {
    vi.useRealTimers();
    svgStyle.transform = '';
  });

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

  // Below the drag threshold nothing is captured, so a pointer that slides
  // off the map delivers its pointerup elsewhere and its bookkeeping entry
  // would go stale. The two tests pin the two ways that stale entry bites.

  it('a buttonless mouse hover after a missed pointerup does not pan the map', () => {
    const { result } = renderHook(() => useMapZoom(WIDTH, HEIGHT));
    act(() => result.current.zoomIn());
    const before = result.current.viewBox;

    act(() => {
      result.current.bind.onPointerDown(pointer(1, 100, 100));
    });
    // The mouse leaves, releases elsewhere, and later hovers back across the
    // map — same pointerId, no button held.
    act(() => {
      result.current.bind.onPointerMove({ ...pointer(1, 160, 160), buttons: 0 } as ReactPointerEvent<SVGSVGElement>);
      result.current.bind.onPointerMove({ ...pointer(1, 220, 220), buttons: 0 } as ReactPointerEvent<SVGSVGElement>);
    });

    expect(result.current.viewBox).toBe(before);
    expect(result.current.panning).toBe(false);
  });

  // ── Gesture preview: pans and pinches ride a cheap CSS transform and the
  // expensive viewBox repaint happens ONCE, when the fingers lift. ──────────

  it('defers a pan to a transform preview and commits the viewBox on release', () => {
    const { result } = renderHook(() => useMapZoom(WIDTH, HEIGHT));
    act(() => result.current.zoomIn());
    const before = result.current.viewBox;
    const [bx, by] = parseViewBox(before);

    act(() => {
      result.current.bind.onPointerDown(pointer(1, 100, 100));
      result.current.bind.onPointerMove(pointer(1, 60, 80));
    });
    // Mid-drag: the committed viewBox is untouched; the preview transform moves the map.
    expect(result.current.viewBox).toBe(before);
    expect(svgStyle.transform).not.toBe('');

    act(() => {
      result.current.bind.onPointerUp(pointer(1, 60, 80));
    });
    // Release: one commit, in map units (1:1 px fallback without layout), preview cleared.
    const [ax, ay] = parseViewBox(result.current.viewBox);
    expect(ax).toBeCloseTo(bx + 40, 4);
    expect(ay).toBeCloseTo(by + 20, 4);
    expect(svgStyle.transform).toBe('');
  });

  it('defers a pinch and commits the zoomed viewBox when the fingers lift', () => {
    const { result } = renderHook(() => useMapZoom(WIDTH, HEIGHT));

    act(() => {
      result.current.bind.onPointerDown(pointer(1, 200, 250));
      result.current.bind.onPointerDown(pointer(2, 400, 250));
      result.current.bind.onPointerMove(pointer(2, 600, 250));
    });
    // Mid-pinch: committed scale still 1, the preview transform carries the zoom.
    expect(result.current.scale).toBe(1);
    expect(result.current.panning).toBe(true);
    expect(svgStyle.transform).toContain('scale');

    act(() => {
      result.current.bind.onPointerUp(pointer(1, 200, 250));
      result.current.bind.onPointerUp(pointer(2, 600, 250));
    });
    expect(result.current.scale).toBeCloseTo(2, 5);
    expect(svgStyle.transform).toBe('');
    // The pinch's trailing click must not select a territory.
    expect(result.current.wasDragged()).toBe(true);
  });

  it('wheel zoom scales with the delta and commits after the stream goes quiet', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useMapZoom(WIDTH, HEIGHT));
    const wheel = (deltaY: number) =>
      ({ clientX: 500, clientY: 250, deltaY, cancelable: true, preventDefault: () => {}, currentTarget }) as unknown as ReactWheelEvent<SVGSVGElement>;

    act(() => {
      result.current.bind.onWheel(wheel(-100));
    });
    // Streaming: preview only, no commit yet.
    expect(result.current.scale).toBe(1);
    expect(svgStyle.transform).toContain('scale');

    act(() => {
      vi.advanceTimersByTime(300);
    });
    const gentle = result.current.scale;
    expect(gentle).toBeGreaterThan(1);
    expect(svgStyle.transform).toBe('');

    act(() => {
      result.current.bind.onWheel(wheel(-300));
      vi.advanceTimersByTime(300);
    });
    // A bigger delta zooms further in one event — no more fixed 1.5x slam.
    expect(result.current.scale / gentle).toBeGreaterThan(gentle);
  });

  it('a finger that left the map pre-threshold does not turn the next pan into a pinch', () => {
    const { result } = renderHook(() => useMapZoom(WIDTH, HEIGHT));
    act(() => result.current.zoomIn());
    const scaleAfterZoom = result.current.scale;

    act(() => {
      result.current.bind.onPointerDown(pointer(1, 10, 10));
      // Slides off the map before the threshold; its pointerup lands elsewhere.
      result.current.bind.onPointerLeave?.(pointer(1, 12, 12));
      // A fresh one-finger pan must be a pan, not a pinch with a ghost finger.
      result.current.bind.onPointerDown(pointer(2, 300, 300));
      result.current.bind.onPointerMove(pointer(2, 360, 300));
      result.current.bind.onPointerMove(pointer(2, 420, 300));
    });

    expect(result.current.panning).toBe(true);
    expect(result.current.scale).toBeCloseTo(scaleAfterZoom, 6);
  });
});
