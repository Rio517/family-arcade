/**
 * The bird a princess or the bunny can ride: a plump round bird in the
 * rider's colour, softened toward pastel, with a cream belly and face, big
 * glossy plum eyes with lashes, blush, a sunny beak, a three-feather crest,
 * rounded feather wings and a fan tail. About five units nose to tail, faces
 * +z.
 */
import * as THREE from 'three';
import { Part, place, type V3 } from './kit';
import { blush, eye } from './face';
import type { Figure, Rides } from './figure';
import { feather, featherWing } from './unicorn';
import { BEAK, BEAK_DEEP, CREAM, PLUM, PLUM_DEEP, PLUM_LIGHT, WHITE } from './palette';

const SIDES = [1, -1] as const;
const HEAD_PIVOT: V3 = [0, 2.2, 0.95];
const TAIL_PIVOT: V3 = [0, 1.8, -1.2];
const BIRD_SEAT: V3 = [0, 2.3, -0.5];
const EYES = { deep: PLUM_DEEP, iris: PLUM, light: PLUM_LIGHT };

export function bird(color: number, rides?: Rides): Figure {
  const tint = new THREE.Color(color);
  const coat = tint.clone().lerp(new THREE.Color(WHITE), 0.12).getHex();
  const light = tint.clone().lerp(new THREE.Color(WHITE), 0.5).getHex();
  const deep = tint.clone().lerp(new THREE.Color(0x3a2a80), 0.18).getHex();

  const body = new Part();
  body.blob(coat, [2.24, 1.96, 2.6], [0, 1.5, -0.1], { round: 0.85, seg: [12, 8] });
  body.blob(CREAM, [1.7, 1.4, 1.9], [0, 1.25, 0.32], { round: 0.9, seg: [10, 5] });
  for (const s of SIDES) {
    body.blob(BEAK_DEEP, [0.28, 0.2, 0.62], [0.42 * s, 0.5, 0.55], { round: 0.8, seg: [6, 3] });
  }

  const head = new Part();
  head.ball(coat, 0.86, [0, 0.32, 0.18], { seg: [12, 7] });
  head.blob(CREAM, [1.3, 1.02, 0.6], [0, 0.18, 0.66], { round: 0.9, seg: [10, 4] });
  for (const s of SIDES) {
    eye(head, s, [0.36 * s, 0.42, 0.9], { w: 0.42, h: 0.52, turn: 0.3, colors: EYES });
    blush(head, s, [0.58 * s, 0.08, 0.78], 0.15, 0.6);
  }
  // A short round beak, the lower half a shade deeper, smiling at the corners.
  head.blob(BEAK, [0.5, 0.26, 0.56], [0, 0.12, 1.1], { round: 0.8, seg: [8, 3] });
  head.blob(BEAK_DEEP, [0.38, 0.16, 0.4], [0, -0.04, 1.04], { round: 0.8, seg: [6, 3] });
  // A little tuft of three feathers curling forward, the middle one deeper.
  head.within(place([0, 1.02, 0.12], { ry: Math.PI / 2 }), () => {
    for (const [c, droop, len] of [
      [coat, -0.75, 0.5],
      [deep, -1.05, 0.6],
      [coat, -1.4, 0.48],
    ] as const) {
      feather(head, c, -1, [0, 0, 0], len, 0.26, droop);
    }
  });

  // Fan tail: five flat feathers spread back and a little up, deep and light in turn.
  const tail = new Part();
  for (let i = 0; i < 5; i++) {
    const f = i - 2;
    const len = 1.75 - Math.abs(f) * 0.15;
    tail.within(place([0, 0, 0], { ry: f * 0.3, rx: 0.3 - Math.abs(f) * 0.04 }), () => {
      tail.blob(i % 2 ? light : deep, [0.52, 0.2, len], [0, 0, -len / 2], { round: 0.8, seg: [10, 3] });
    });
  }

  return {
    body,
    head: { part: head, at: HEAD_PIVOT },
    rider: rides?.(body, BIRD_SEAT),
    wings: { parts: [featherWing(1, coat, [light, deep, color, coat]), featherWing(-1, coat, [light, deep, color, coat])], at: [0.95, 2.0, 0.2], rest: 0.5, amp: 0.5 },
    tail: { part: tail, at: TAIL_PIVOT },
  };
}
