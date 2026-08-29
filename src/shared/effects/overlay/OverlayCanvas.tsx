/**
 * The working half of `EffectsOverlay`, lazy-loaded so three.js and the
 * MediaPipe tracker stay out of the eager bundle (ADR 0006 / ADR 0010).
 *
 * Renders a transparent canvas absolutely positioned over the host's video
 * box, runs the tracker against the video element every animation frame, and
 * feeds the results to the effects scene. The video pixels are never read
 * into the app and never leave the device.
 */
import { useEffect, useRef, useState } from 'react';
import { createEffectsScene, type EffectId, type EffectsScene } from './scene';
import type { EffectsTracker } from '../engine/tracker';

interface OverlayCanvasProps {
  video: HTMLVideoElement;
  effects: EffectId[];
  /** Seed for the effect rng (ADR 0005); fixed default keeps shots stable. */
  seed?: number;
}

export default function OverlayCanvas({ video, effects, seed = 0x0dda60 }: OverlayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<EffectsScene | null>(null);
  const [status, setStatus] = useState<'loading' | 'on' | 'unavailable'>('loading');

  const liveEffects = useRef(effects);
  liveEffects.current = effects;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let scene: EffectsScene | null = null;
    let tracker: EffectsTracker | null = null;
    let raf = 0;
    let lastTime = 0;
    let cancelled = false;

    try {
      const reducedMotion =
        typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      scene = createEffectsScene(canvas, {
        seed,
        reducedMotion,
        effects: new Set(liveEffects.current),
      });
      sceneRef.current = scene;
    } catch {
      setStatus('unavailable'); // no WebGL — plain video still works
      return;
    }

    const size = () => {
      scene?.setSize(video.clientWidth, video.clientHeight, window.devicePixelRatio || 1);
    };
    size();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(size) : null;
    observer?.observe(video);

    // The tracker is the heavy part (~23 MB of lazy WASM + models on first
    // ever use); the scene waits quietly until it's ready.
    import('../engine/tracker')
      .then((mod) => mod.createEffectsTracker())
      .then((t) => {
        if (cancelled) {
          t.close();
          return;
        }
        tracker = t;
        setStatus('on');
        const loop = (time: number) => {
          raf = requestAnimationFrame(loop);
          const dtMs = lastTime ? time - lastTime : 16;
          lastTime = time;
          const frame = t.detect(video, time);
          scene?.render(frame, dtMs);
        };
        raf = requestAnimationFrame(loop);
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable');
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      observer?.disconnect();
      tracker?.close();
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [video, seed]);

  useEffect(() => {
    sceneRef.current?.setEffects(new Set(effects));
  }, [effects]);

  if (status === 'unavailable') {
    return (
      <p className="fx-fallback" data-testid="effects-fallback">
        This device can’t run the magic effects — the mirror still works.
      </p>
    );
  }

  return (
    <>
      {status === 'loading' && (
        <p className="fx-loading" data-testid="effects-loading" aria-live="polite">
          Warming up the magic…
        </p>
      )}
      <canvas className="fx-canvas" data-testid="effects-canvas" aria-hidden="true" ref={canvasRef} />
    </>
  );
}
