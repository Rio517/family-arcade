/**
 * Public face of the camera effects (ADR 0010): float this over any `<video>`
 * and the chosen effects track the people in it. Everything heavy — three.js,
 * the MediaPipe WASM tracker, the models — loads lazily on first use, so
 * mounting this with no effects selected costs nothing.
 */
import './effects.css';
import { Suspense, lazy } from 'react';
import type { EffectId } from './effects';

const OverlayCanvas = lazy(() => import('./overlay/OverlayCanvas'));

interface EffectsOverlayProps {
  /** The playing video element to track; null while the camera warms up. */
  video: HTMLVideoElement | null;
  effects: EffectId[];
}

export function EffectsOverlay({ video, effects }: EffectsOverlayProps) {
  if (!video || effects.length === 0) return null;
  return (
    <Suspense fallback={null}>
      <OverlayCanvas video={video} effects={effects} />
    </Suspense>
  );
}
