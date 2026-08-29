/**
 * Camera-effects tracking types (ADR 0010).
 *
 * The tracker turns MediaPipe results into these small frame objects; the
 * overlay scenes consume only these. Keeping the shapes independent of
 * MediaPipe's own types lets the conversion layer stay pure and unit-testable
 * in jsdom, where the WASM tracker can't run.
 *
 * Coordinates are normalized to the video frame: x and y in [0, 1] with the
 * origin at the top-left, exactly as MediaPipe reports landmarks. The overlay
 * scene maps them to canvas pixels.
 */

export interface EffectPoint {
  x: number;
  y: number;
}

export interface TrackedFace {
  /** Point between the eyes — where a mask/head effect is anchored. */
  center: EffectPoint;
  /** Middle of the lips — where breath effects spawn. */
  mouth: EffectPoint;
  /** Normalized face width (ear to ear), the effect's scale reference. */
  width: number;
  /** 0 = mouth closed … 1 = jaw fully dropped (MediaPipe `jawOpen`). */
  jawOpen: number;
  /**
   * Head pose as a column-major 4×4 matrix over the canonical face, straight
   * from MediaPipe. Scenes decompose it for tilt/turn; it is passed through
   * untouched so the pure layer needs no matrix math.
   */
  poseMatrix: number[] | null;
}

/** The gestures effects react to; everything else collapses to 'none'. */
export type HandGesture = 'victory' | 'thumbsUp' | 'openPalm' | 'iLoveYou' | 'none';

export interface TrackedHand {
  gesture: HandGesture;
  /** Middle of the palm — where gesture effects spawn. */
  palm: EffectPoint;
  /** Normalized hand size (wrist to middle knuckle), the scale reference. */
  size: number;
}

/** One tracked video frame: everything the overlay needs to draw. */
export interface TrackingFrame {
  faces: TrackedFace[];
  hands: TrackedHand[];
  /** Milliseconds timestamp of the source video frame. */
  timeMs: number;
}

/* ------------------------------------------------------------------ *
 * Structural slices of the MediaPipe result objects — just the fields
 * the converters read, so tests can build them as plain literals.
 * ------------------------------------------------------------------ */

export interface LandmarkLike {
  x: number;
  y: number;
}

export interface CategoryLike {
  categoryName: string;
  score: number;
}

export interface FaceResultLike {
  faceLandmarks: LandmarkLike[][];
  faceBlendshapes?: { categories: CategoryLike[] }[];
  facialTransformationMatrixes?: { data: number[] }[];
}

export interface GestureResultLike {
  landmarks: LandmarkLike[][];
  gestures: CategoryLike[][];
}
