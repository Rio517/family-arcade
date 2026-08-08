import { useCallback, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';

const ZOOM_STEP = 1.5;
const DRAG_THRESHOLD_PX = 6;

interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapZoom {
  /** viewBox string for the <svg>, e.g. "0 0 1000 500". */
  viewBox: string;
  /** 1 = whole map in view. Never below 1. */
  scale: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  /** True when scale === 1 and there is no pan offset. */
  isDefault: boolean;
  /** True while a drag-pan is actually in progress (for cursor styling). */
  panning: boolean;
  zoomIn(): void;
  zoomOut(): void;
  reset(): void;
  /**
   * True if the pointer sequence that just ended was a drag rather than a tap.
   * The caller checks this inside territory click handlers to avoid selecting
   * a country at the end of a pan. Must stay true for the duration of the
   * click event that follows the pointerup, then clear.
   */
  wasDragged(): boolean;
  /** Spread onto the <svg> element. */
  bind: {
    onPointerDown: (e: ReactPointerEvent<SVGSVGElement>) => void;
    onPointerMove: (e: ReactPointerEvent<SVGSVGElement>) => void;
    onPointerUp: (e: ReactPointerEvent<SVGSVGElement>) => void;
    onPointerCancel: (e: ReactPointerEvent<SVGSVGElement>) => void;
    onWheel: (e: ReactWheelEvent<SVGSVGElement>) => void;
  };
}

/** Clamp a candidate view so it never shows anything outside the map bounds. */
function clampView(view: ViewRect, width: number, height: number): ViewRect {
  const w = Math.min(view.w, width);
  const h = Math.min(view.h, height);
  const x = Math.min(Math.max(view.x, 0), width - w);
  const y = Math.min(Math.max(view.y, 0), height - h);
  return { x, y, w, h };
}

/** Zoom `view` by `factor` (>1 = in) anchored on the map point (anchorX, anchorY). */
function zoomView(view: ViewRect, factor: number, anchorX: number, anchorY: number, width: number, height: number, maxScale: number): ViewRect {
  const minW = width / maxScale;
  const minH = height / maxScale;
  const nextW = Math.min(width, Math.max(minW, view.w / factor));
  const nextH = Math.min(height, Math.max(minH, view.h / factor));
  // Keep the anchor point at the same fraction of the viewport before and after.
  const fracX = view.w > 0 ? (anchorX - view.x) / view.w : 0.5;
  const fracY = view.h > 0 ? (anchorY - view.y) / view.h : 0.5;
  const nextX = anchorX - fracX * nextW;
  const nextY = anchorY - fracY * nextH;
  return clampView({ x: nextX, y: nextY, w: nextW, h: nextH }, width, height);
}

interface PointerBookkeeping {
  /** clientX/Y at pointerdown, keyed by pointerId — fixed for drag-threshold detection. */
  origin: Map<number, { clientX: number; clientY: number }>;
  /** Most recent clientX/Y per pointer, used to compute per-move deltas. */
  last: Map<number, { clientX: number; clientY: number }>;
  dragging: boolean;
  /** Finger separation in client px when a two-finger pinch started. */
  pinchStartDist: number | null;
  pinchStartView: ViewRect | null;
}

export function useMapZoom(width: number, height: number, opts?: { maxScale?: number }): MapZoom {
  const maxScale = opts?.maxScale ?? 5;
  const defaultView = useMemo<ViewRect>(() => ({ x: 0, y: 0, w: width, h: height }), [width, height]);

  const [view, setView] = useState<ViewRect>(defaultView);
  const [panning, setPanning] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const bookkeeping = useRef<PointerBookkeeping>({
    origin: new Map(),
    last: new Map(),
    dragging: false,
    pinchStartDist: null,
    pinchStartView: null,
  });
  const draggedRef = useRef(false);
  const dragClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scale = width > 0 && view.w > 0 ? width / view.w : 1;

  const markDragged = useCallback(() => {
    draggedRef.current = true;
    // The consuming click handler fires just after pointerup, so clear on the
    // next tick rather than immediately — clearing synchronously would race it.
    if (dragClearTimer.current !== null) clearTimeout(dragClearTimer.current);
    dragClearTimer.current = setTimeout(() => {
      draggedRef.current = false;
    }, 0);
  }, []);

  const wasDragged = useCallback(() => draggedRef.current, []);

  /** Convert a client-px delta to map units using the element's measured width;
   *  jsdom (and a not-yet-laid-out element) reports zero, so fall back to 1:1. */
  const clientDeltaToMapUnits = useCallback(
    (dxClient: number, dyClient: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      const elW = rect?.width ?? 0;
      const elH = rect?.height ?? 0;
      const kx = elW > 0 ? view.w / elW : 1;
      const ky = elH > 0 ? view.h / elH : 1;
      return { dx: dxClient * kx, dy: dyClient * ky };
    },
    [view.w, view.h],
  );

  /** Map a client point to map-space; degrades to the view centre without layout. */
  const clientPointToMap = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      const elW = rect?.width ?? 0;
      const elH = rect?.height ?? 0;
      if (elW <= 0 || elH <= 0) {
        return { x: view.x + view.w / 2, y: view.y + view.h / 2 };
      }
      const fracX = (clientX - rect!.left) / elW;
      const fracY = (clientY - rect!.top) / elH;
      return { x: view.x + fracX * view.w, y: view.y + fracY * view.h };
    },
    [view.x, view.y, view.w, view.h],
  );

  const zoomBy = useCallback(
    (factor: number, anchor?: { x: number; y: number }) => {
      setView((prev) => {
        const ax = anchor?.x ?? prev.x + prev.w / 2;
        const ay = anchor?.y ?? prev.y + prev.h / 2;
        return zoomView(prev, factor, ax, ay, width, height, maxScale);
      });
    },
    [width, height, maxScale],
  );

  const zoomIn = useCallback(() => zoomBy(ZOOM_STEP), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(1 / ZOOM_STEP), [zoomBy]);
  const reset = useCallback(() => setView(defaultView), [defaultView]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      svgRef.current = e.currentTarget;
      const bk = bookkeeping.current;
      const pos = { clientX: e.clientX, clientY: e.clientY };
      bk.origin.set(e.pointerId, pos);
      bk.last.set(e.pointerId, pos);
      if (e.currentTarget.setPointerCapture) {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Some jsdom/browser combinations reject capture on synthetic pointers.
        }
      }
      if (bk.last.size === 2) {
        const pts = [...bk.last.values()];
        bk.pinchStartDist = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
        bk.pinchStartView = view;
      }
    },
    [view],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const bk = bookkeeping.current;
      const origin = bk.origin.get(e.pointerId);
      if (!origin) return;

      if (bk.last.size >= 2) {
        bk.last.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
        const pts = [...bk.last.values()];
        const dist = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
        const startDist = bk.pinchStartDist;
        const startView = bk.pinchStartView;
        if (startDist && startDist > 0 && startView) {
          const midClientX = (pts[0].clientX + pts[1].clientX) / 2;
          const midClientY = (pts[0].clientY + pts[1].clientY) / 2;
          const anchor = clientPointToMap(midClientX, midClientY);
          const factor = dist / startDist;
          setView(zoomView(startView, factor, anchor.x, anchor.y, width, height, maxScale));
        }
        return;
      }

      const dxTotal = e.clientX - origin.clientX;
      const dyTotal = e.clientY - origin.clientY;
      if (!bk.dragging) {
        if (Math.hypot(dxTotal, dyTotal) <= DRAG_THRESHOLD_PX) return;
        bk.dragging = true;
        setPanning(true);
      }

      // Delta since the *previous* move, not the pointerdown — movementX/Y
      // is unreliable across synthetic and real pointer events, so track
      // last-seen client position ourselves instead.
      const last = bk.last.get(e.pointerId) ?? origin;
      const { dx, dy } = clientDeltaToMapUnits(e.clientX - last.clientX, e.clientY - last.clientY);
      bk.last.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
      markDragged();
      setView((prev) => clampView({ x: prev.x - dx, y: prev.y - dy, w: prev.w, h: prev.h }, width, height));
    },
    [clientDeltaToMapUnits, clientPointToMap, markDragged, width, height, maxScale],
  );

  const endPointer = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const bk = bookkeeping.current;
      bk.origin.delete(e.pointerId);
      bk.last.delete(e.pointerId);
      if (e.currentTarget.releasePointerCapture) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // Capture may already be gone (pointercancel, or never granted in jsdom).
        }
      }
      if (bk.last.size < 2) {
        bk.pinchStartDist = null;
        bk.pinchStartView = null;
      }
      if (bk.last.size === 0 && bk.dragging) {
        bk.dragging = false;
        setPanning(false);
      }
    },
    [],
  );

  const onWheel = useCallback(
    (e: ReactWheelEvent<SVGSVGElement>) => {
      if (e.cancelable) e.preventDefault();
      svgRef.current = e.currentTarget;
      const anchor = clientPointToMap(e.clientX, e.clientY);
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      zoomBy(factor, anchor);
    },
    [clientPointToMap, zoomBy],
  );

  const eps = 1e-6;
  const isDefault =
    Math.abs(view.x - defaultView.x) < eps &&
    Math.abs(view.y - defaultView.y) < eps &&
    Math.abs(view.w - defaultView.w) < eps &&
    Math.abs(view.h - defaultView.h) < eps;

  return {
    viewBox: `${view.x} ${view.y} ${view.w} ${view.h}`,
    scale,
    canZoomIn: scale < maxScale - eps,
    canZoomOut: scale > 1 + eps,
    isDefault,
    panning,
    zoomIn,
    zoomOut,
    reset,
    wasDragged,
    bind: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
      onWheel,
    },
  };
}
