/**
 * Pure conversion from MediaPipe result objects to `TrackingFrame` slices.
 * No DOM, no WASM — this is the part of the engine jsdom tests exercise.
 */

import type {
  CategoryLike,
  FaceResultLike,
  GestureResultLike,
  HandGesture,
  TrackedFace,
  TrackedHand,
} from './types';

/**
 * Face Landmarker mesh indices (the 478-point canonical face). Only the
 * handful the effects need:
 */
const BETWEEN_EYES = 168;
const UPPER_LIP = 13;
const LOWER_LIP = 14;
const LEFT_EAR_EDGE = 234;
const RIGHT_EAR_EDGE = 454;

function blendshapeScore(categories: CategoryLike[] | undefined, name: string): number {
  if (!categories) return 0;
  const hit = categories.find((c) => c.categoryName === name);
  return hit ? hit.score : 0;
}

export function toTrackedFaces(result: FaceResultLike): TrackedFace[] {
  const faces: TrackedFace[] = [];
  for (let i = 0; i < result.faceLandmarks.length; i++) {
    const pts = result.faceLandmarks[i];
    // A truncated landmark list (lost tracking mid-frame) is dropped rather
    // than letting an effect latch onto garbage coordinates.
    if (pts.length <= RIGHT_EAR_EDGE) continue;
    const upper = pts[UPPER_LIP];
    const lower = pts[LOWER_LIP];
    const left = pts[LEFT_EAR_EDGE];
    const right = pts[RIGHT_EAR_EDGE];
    faces.push({
      center: { x: pts[BETWEEN_EYES].x, y: pts[BETWEEN_EYES].y },
      mouth: { x: (upper.x + lower.x) / 2, y: (upper.y + lower.y) / 2 },
      width: Math.hypot(right.x - left.x, right.y - left.y),
      jawOpen: blendshapeScore(result.faceBlendshapes?.[i]?.categories, 'jawOpen'),
      poseMatrix: result.facialTransformationMatrixes?.[i]?.data ?? null,
    });
  }
  return faces;
}

/** Hand Landmarker indices. */
const WRIST = 0;
const MIDDLE_KNUCKLE = 9;

const GESTURE_NAMES: Record<string, HandGesture> = {
  Victory: 'victory',
  Thumb_Up: 'thumbsUp',
  Open_Palm: 'openPalm',
  ILoveYou: 'iLoveYou',
};

export function toTrackedHands(result: GestureResultLike): TrackedHand[] {
  const hands: TrackedHand[] = [];
  for (let i = 0; i < result.landmarks.length; i++) {
    const pts = result.landmarks[i];
    if (pts.length <= MIDDLE_KNUCKLE) continue;
    const wrist = pts[WRIST];
    const knuckle = pts[MIDDLE_KNUCKLE];
    const top = result.gestures[i]?.[0];
    hands.push({
      gesture: (top && GESTURE_NAMES[top.categoryName]) || 'none',
      palm: { x: (wrist.x + knuckle.x) / 2, y: (wrist.y + knuckle.y) / 2 },
      size: Math.hypot(knuckle.x - wrist.x, knuckle.y - wrist.y),
    });
  }
  return hands;
}
