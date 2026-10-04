/**
 * The bunny, sitting up: candy pink with a white muzzle, belly, paws and
 * powder-puff tail, long ears deeper pink inside, a bow in the bunny's own
 * sky blue at one ear, big glossy brown eyes with lashes, blush and an open
 * smile. The bunny can't fly, so it always rides (a cloud, the bird or the
 * unicorn). Built from the seat up, facing +z: its body joins the ride's
 * body, its head turns on its own hinge.
 */
import * as THREE from 'three';
import { Part, place, type V3 } from './kit';
import { blush, bow, eye, smile } from './face';
import type { Rides } from './figure';
import { BUNNY, BUNNY_EAR, BUNNY_SHADE, COCOA, COCOA_DEEP, COCOA_LIGHT, WHITE } from './palette';

const SIDES = [1, -1] as const;
const NECK: V3 = [0, 0.98, 0.18];
const EYES = { deep: COCOA_DEEP, iris: COCOA, light: COCOA_LIGHT };

/** The bunny, `scale` times its own size, sitting at the seat; its bow is in `color`. */
export function bunny(color: number, scale: number): Rides {
  const ribbon = new THREE.Color(color).lerp(new THREE.Color(WHITE), 0.15).getHex();
  const ribbonDeep = new THREE.Color(color).lerp(new THREE.Color(0x1f4785), 0.2).getHex();
  return (body, seat) => {
    const k: V3 = [scale, scale, scale];
    body.within(place(seat, {}, k), () => {
      // A white belly on the front of a round pink body.
      body.blob((p) => (p.z > 0.38 && Math.abs(p.x) < 0.32 && p.y > -0.4 ? WHITE : BUNNY), [1.1, 1.05, 1.25], [0, 0.5, -0.1], {
        round: 0.9,
        seg: [10, 6],
      });
      body.ball(WHITE, 0.28, [0, 0.5, -0.74], { seg: [8, 4] });
      for (const s of SIDES) {
        body.blob(BUNNY_SHADE, [0.34, 0.24, 0.66], [0.4 * s, 0.12, 0.22], { round: 0.8, seg: [6, 3] });
        body.blob(WHITE, [0.22, 0.42, 0.24], [0.25 * s, 0.4, 0.56], { round: 0.85, seg: [6, 3] });
      }
    });

    const head = new Part(place([0, 0, 0], {}, k));
    head.blob(BUNNY, [1.16, 1.0, 1.0], [0, 0.42, 0.12], { round: 0.75, seg: [10, 6] });
    head.blob(WHITE, [0.56, 0.34, 0.3], [0, 0.17, 0.55], { round: 0.85, seg: [8, 3] });
    head.ball(BUNNY_EAR, 0.075, [0, 0.33, 0.69], { seg: [6, 2] });
    // Long ears, flat, pink on the inside: the blob's front face is its +y before turning.
    for (const s of SIDES) {
      head.within(place([0.24 * s, 0.82, -0.02], { rz: -0.14 * s, rx: -0.18 }), () => {
        head.blob((q) => (q.y > 0 && Math.hypot(q.x / 0.17, q.z / 0.6) < 0.72 ? BUNNY_EAR : BUNNY), [0.34, 0.14, 1.2], [0, 0.56, 0], {
          round: 0.85,
          seg: [8, 3],
          rot: { rx: Math.PI / 2 },
        });
      });
    }
    bow(head, [0.36, 0.92, 0.02], 0.44, { rz: -0.35, ry: 0.4 }, [ribbon, ribbonDeep]);
    for (const s of SIDES) {
      eye(head, s, [0.25 * s, 0.5, 0.56], { w: 0.32, h: 0.4, turn: 0.26, colors: EYES, seg: [10, 3] });
      blush(head, s, [0.4 * s, 0.22, 0.5], 0.12, 0.45);
    }
    smile(head, [0, 0.03, 0.66], 0.16);

    const at: V3 = [seat[0] + NECK[0] * scale, seat[1] + NECK[1] * scale, seat[2] + NECK[2] * scale];
    return { part: head, at };
  };
}
