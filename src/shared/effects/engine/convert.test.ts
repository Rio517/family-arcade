import { describe, expect, it } from 'vitest';
import { toTrackedFaces, toTrackedHands } from './convert';
import type { FaceResultLike, GestureResultLike, LandmarkLike } from './types';

/** A full 478-point mesh, every point at (0.5, 0.5), with chosen overrides. */
function faceMesh(overrides: Record<number, LandmarkLike>): LandmarkLike[] {
  const pts = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  for (const [i, p] of Object.entries(overrides)) pts[Number(i)] = p;
  return pts;
}

describe('toTrackedFaces', () => {
  it('anchors the mask between the eyes and the fire at the lips', () => {
    const result: FaceResultLike = {
      faceLandmarks: [
        faceMesh({
          168: { x: 0.48, y: 0.3 }, // between the eyes
          13: { x: 0.5, y: 0.52 }, // upper lip
          14: { x: 0.5, y: 0.58 }, // lower lip
          234: { x: 0.3, y: 0.4 }, // left face edge
          454: { x: 0.7, y: 0.4 }, // right face edge
        }),
      ],
      faceBlendshapes: [{ categories: [{ categoryName: 'jawOpen', score: 0.8 }] }],
      facialTransformationMatrixes: [{ data: Array.from({ length: 16 }, (_, i) => i) }],
    };
    const [face] = toTrackedFaces(result);
    expect(face.center).toEqual({ x: 0.48, y: 0.3 });
    expect(face.mouth).toEqual({ x: 0.5, y: 0.55 });
    expect(face.width).toBeCloseTo(0.4);
    expect(face.jawOpen).toBe(0.8);
    expect(face.poseMatrix).toHaveLength(16);
  });

  it('tracks two faces independently — two kids, two dragons', () => {
    const result: FaceResultLike = {
      faceLandmarks: [faceMesh({}), faceMesh({ 168: { x: 0.8, y: 0.2 } })],
      faceBlendshapes: [
        { categories: [{ categoryName: 'jawOpen', score: 0.1 }] },
        { categories: [{ categoryName: 'jawOpen', score: 0.9 }] },
      ],
    };
    const faces = toTrackedFaces(result);
    expect(faces).toHaveLength(2);
    expect(faces[0].jawOpen).toBe(0.1);
    expect(faces[1].jawOpen).toBe(0.9);
    expect(faces[1].center.x).toBe(0.8);
  });

  it('survives missing blendshapes, missing matrices, and truncated meshes', () => {
    const result: FaceResultLike = {
      // One healthy mesh and one truncated (tracking lost mid-frame).
      faceLandmarks: [faceMesh({}), faceMesh({}).slice(0, 100)],
    };
    const faces = toTrackedFaces(result);
    expect(faces).toHaveLength(1);
    expect(faces[0].jawOpen).toBe(0);
    expect(faces[0].poseMatrix).toBeNull();
  });
});

/** A 21-point hand, all at (0.5, 0.5), with chosen overrides. */
function handMesh(overrides: Record<number, LandmarkLike>): LandmarkLike[] {
  const pts = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  for (const [i, p] of Object.entries(overrides)) pts[Number(i)] = p;
  return pts;
}

describe('toTrackedHands', () => {
  it('maps the Victory gesture to the peace effect trigger', () => {
    const result: GestureResultLike = {
      landmarks: [handMesh({ 0: { x: 0.2, y: 0.8 }, 9: { x: 0.2, y: 0.6 } })],
      gestures: [[{ categoryName: 'Victory', score: 0.9 }]],
    };
    const [hand] = toTrackedHands(result);
    expect(hand.gesture).toBe('victory');
    expect(hand.palm).toEqual({ x: 0.2, y: 0.7 });
    expect(hand.size).toBeCloseTo(0.2);
  });

  it('collapses unknown gestures to none and handles empty results', () => {
    const result: GestureResultLike = {
      landmarks: [handMesh({}), handMesh({})],
      gestures: [[{ categoryName: 'Pointing_Up', score: 0.9 }], []],
    };
    const hands = toTrackedHands(result);
    expect(hands[0].gesture).toBe('none');
    expect(hands[1].gesture).toBe('none');
    expect(toTrackedHands({ landmarks: [], gestures: [] })).toEqual([]);
  });
});
