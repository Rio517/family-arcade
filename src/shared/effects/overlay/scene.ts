/**
 * The transparent overlay scene drawn on top of a video element (ADR 0010).
 * An orthographic camera maps canvas pixels 1:1, tracked landmarks arrive in
 * normalized video coordinates, and each effect anchors to them. The video
 * itself is never touched — this canvas just floats above it.
 */

import * as THREE from 'three';
import { seededRng } from '@shared/rng';
import { disposeDeep } from '@shared/three/disposeDeep';
import { buildDragonHead, buildDragonMask, loadDragonMask, type DragonHead } from './dragon';
import { FireBreath } from './fire';
import { PeaceBurst } from './sparkles';
import type { TrackingFrame } from '../engine/types';
import type { EffectId } from '../effects';

export type { EffectId };

export interface EffectsSceneOptions {
  seed: number;
  reducedMotion: boolean;
  effects: ReadonlySet<EffectId>;
}

export interface EffectsScene {
  /**
   * Resolves once the modelled mask has been decoded and worn (or has failed
   * and left the procedural head on). Screenshot harnesses await it so the
   * captured dragon is always the same one.
   */
  ready: Promise<void>;
  render(frame: TrackingFrame, dtMs: number): void;
  setSize(width: number, height: number, dpr: number): void;
  setEffects(effects: ReadonlySet<EffectId>): void;
  dispose(): void;
}

const MAX_FACES = 2;

interface DragonSlot {
  anchor: THREE.Group;
  head: DragonHead;
  fire: FireBreath;
}

/** Throws when WebGL is unavailable — callers show the friendly fallback. */
export function createEffectsScene(
  canvas: HTMLCanvasElement,
  opts: EffectsSceneOptions,
): EffectsScene {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  // Pixel-space camera, y up: world (x, y) = (px, height - py).
  const camera = new THREE.OrthographicCamera(0, 2, 2, 0, 0.1, 4000);
  camera.position.z = 1000;

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.4);
  sun.position.set(200, 500, 800);
  scene.add(sun);

  let effects = new Set(opts.effects);
  let width = 2;
  let height = 2;

  const rng = seededRng(opts.seed);
  const dragons: DragonSlot[] = [];
  for (let i = 0; i < MAX_FACES; i++) {
    const anchor = new THREE.Group();
    const head = buildDragonHead(rng);
    anchor.add(head.group);
    anchor.visible = false;
    scene.add(anchor);
    const fire = new FireBreath(rng, opts.reducedMotion);
    fire.group.position.z = 400; // always in front of the dragon geometry
    scene.add(fire.group);
    dragons.push({ anchor, head, fire });
  }

  let disposed = false;
  // The modelled mask arrives a moment after the mirror opens; until then the
  // procedural head is already tracking, so the swap is the only visible step.
  const ready = loadDragonMask().then(() => {
    if (disposed) return;
    for (const slot of dragons) {
      const mask = buildDragonMask();
      if (!mask) return; // the model never arrived; the procedural head stays
      slot.anchor.remove(slot.head.group);
      disposeDeep(slot.head.group);
      slot.head = mask;
      slot.anchor.add(mask.group);
    }
  });

  const peace = new PeaceBurst(rng, opts.reducedMotion);
  peace.group.position.z = 420;
  scene.add(peace.group);

  const pose = new THREE.Matrix4();
  const euler = new THREE.Euler();
  const socketWorld = new THREE.Vector3();

  return {
    ready,
    setSize(w, h, dpr) {
      width = Math.max(2, w);
      height = Math.max(2, h);
      renderer.setPixelRatio(Math.min(dpr, 2));
      renderer.setSize(width, height, false);
      camera.right = width;
      camera.top = height;
      camera.updateProjectionMatrix();
    },
    setEffects(next) {
      effects = new Set(next);
    },
    render(frame, dtMs) {
      // Clamp so a background-tab pause doesn't fast-forward the particles.
      const dtS = Math.min(dtMs, 50) / 1000;

      const showDragon = effects.has('dragon');
      for (let i = 0; i < MAX_FACES; i++) {
        const { anchor, head, fire } = dragons[i];
        const face = frame.faces[i];
        anchor.visible = Boolean(showDragon && face);
        let yaw = 0;
        if (face) {
          // Both heads are built in face widths, so the tracked width in
          // pixels is the whole of the scale.
          const facePx = face.width * width;
          anchor.position.set(face.center.x * width, (1 - face.center.y) * height, 0);
          anchor.scale.setScalar(facePx);
          if (face.poseMatrix && face.poseMatrix.length === 16) {
            pose.fromArray(face.poseMatrix);
            euler.setFromRotationMatrix(pose, 'ZYX');
            yaw = euler.y;
            // Desk-derived sign mapping from MediaPipe's camera-space pose to
            // this y-up pixel space; damped so a wrong sign reads as a subtle
            // lean, not a broken mask. Calibrate live (Tidewave) if it feels
            // backwards on a real camera.
            anchor.rotation.set(-euler.x * 0.6, euler.y * 0.7, -euler.z);
          }
          // The jaw drops with the wearer's, and the flame leaves the mask's
          // own mouth rather than the landmark behind it — the socket rides
          // along with every tilt and turn of the head.
          if (head.jaw) head.jaw.rotation.x = head.jawOpenRadians * Math.min(1, Math.max(0, face.jawOpen));
          let mouthX = face.mouth.x * width;
          let mouthY = (1 - face.mouth.y) * height;
          if (head.fireSocket) {
            anchor.updateMatrixWorld(true);
            head.fireSocket.getWorldPosition(socketWorld);
            mouthX = socketWorld.x;
            mouthY = socketWorld.y;
          }
          fire.update({
            x: mouthX,
            y: mouthY,
            dirX: Math.sin(yaw),
            scalePx: Math.max(24, facePx),
            jawOpen: showDragon ? face.jawOpen : 0,
            dtS,
          });
        } else {
          fire.update({ x: 0, y: 0, dirX: 0, scalePx: 24, jawOpen: 0, dtS });
        }
      }

      peace.update({
        dtS,
        hands: effects.has('peace')
          ? frame.hands.map((hand) => ({
              hand,
              x: hand.palm.x * width,
              y: (1 - hand.palm.y) * height,
              sizePx: Math.max(16, hand.size * width),
            }))
          : [],
      });

      renderer.render(scene, camera);
    },
    dispose() {
      disposed = true;
      for (const { anchor, head, fire } of dragons) {
        // A worn mask shares its geometry and textures with the decoded model
        // every other dragon draws from; only the procedural head is ours.
        if (!head.group.userData.cachedResources) disposeDeep(anchor);
        fire.dispose();
      }
      peace.dispose();
      renderer.dispose();
    },
  };
}
