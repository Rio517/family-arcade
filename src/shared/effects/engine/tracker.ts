/**
 * The live face + hand tracker (ADR 0010). Wraps MediaPipe Tasks with the
 * repo's offline rules: the WASM runtime comes from the npm package and the
 * `.task` models from `../assets/`, all as bundled `?url` assets — nothing is
 * fetched from a third party at runtime.
 *
 * This module is only ever loaded via dynamic `import()` from the overlay, so
 * players who never open an effect never download the ~23 MB it pulls in.
 *
 * Only the SIMD WASM build ships (every family device has WASM SIMD; shipping
 * the no-SIMD build too would nearly double the payload). On a browser that
 * can't run it, `createEffectsTracker` rejects and the UI shows its friendly
 * fallback instead.
 */

import { FaceLandmarker, GestureRecognizer } from '@mediapipe/tasks-vision';
import wasmLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import faceModelUrl from '../assets/face_landmarker.task?url';
import gestureModelUrl from '../assets/gesture_recognizer.task?url';
import { toTrackedFaces, toTrackedHands } from './convert';
import type { TrackedHand, TrackingFrame } from './types';

export interface EffectsTracker {
  /**
   * Run detection against the video's current frame. `timeMs` must increase
   * monotonically (MediaPipe requires it in video mode).
   */
  detect(video: HTMLVideoElement, timeMs: number): TrackingFrame;
  close(): void;
}

/** Two kids fit in front of one camera — that's the family's actual use case. */
const MAX_FACES = 2;
const MAX_HANDS = 2;

/** Gestures change slower than heads move; running the second model on every
 * Nth frame roughly halves the per-frame cost on older iPads. */
const GESTURE_EVERY_NTH_FRAME = 3;

export async function createEffectsTracker(): Promise<EffectsTracker> {
  const fileset = { wasmLoaderPath: wasmLoaderUrl, wasmBinaryPath: wasmBinaryUrl };
  const [faces, gestures] = await Promise.all([
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: faceModelUrl, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: MAX_FACES,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    }),
    GestureRecognizer.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: gestureModelUrl, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: MAX_HANDS,
    }),
  ]);

  let frameCount = 0;
  let lastHands: TrackedHand[] = [];
  let lastTimeMs = -1;
  let closed = false;

  return {
    detect(video, timeMs) {
      // Guard both MediaPipe invariants: a ready video frame and a strictly
      // increasing clock (rAF can fire twice inside one ms).
      if (closed || video.readyState < 2 || video.videoWidth === 0 || timeMs <= lastTimeMs) {
        return { faces: [], hands: lastHands, timeMs };
      }
      lastTimeMs = timeMs;
      const faceResult = faces.detectForVideo(video, timeMs);
      if (frameCount % GESTURE_EVERY_NTH_FRAME === 0) {
        lastHands = toTrackedHands(gestures.recognizeForVideo(video, timeMs));
      }
      frameCount++;
      return { faces: toTrackedFaces(faceResult), hands: lastHands, timeMs };
    },
    close() {
      closed = true;
      faces.close();
      gestures.close();
    },
  };
}
