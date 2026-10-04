/**
 * The cloud a princess or the bunny can ride: six soft puffs, white on top
 * and tinted with the rider's colour underneath, with a sleepy-happy face on
 * its front (glossy sky-blue eyes, blush, a small smile). A cloud has no
 * wings of its own; a wings power-up opens a pair, which fold away again
 * after.
 */
import * as THREE from 'three';
import { Part, type V3 } from './kit';
import { blush, eye, smile } from './face';
import type { Figure, Rides } from './figure';
import { featherWing } from './unicorn';
import { FEATHER, SKY, SKY_DEEP, SKY_LIGHT, WHITE } from './palette';

const SIDES = [1, -1] as const;
/** Where a rider sits: into the fluff on top, not above it. */
const CLOUD_SEAT: V3 = [0, 1.7, 0];
const EYES = { deep: SKY_DEEP, iris: SKY, light: SKY_LIGHT };

/** [x, y, z, radius, underneath] */
const PUFFS: ReadonlyArray<readonly [number, number, number, number, boolean]> = [
  [0, 0.1, 0, 1.9, false],
  [1.5, -0.05, 0.4, 1.35, false],
  [-1.5, -0.05, -0.3, 1.35, false],
  [0.8, -0.25, -1.1, 1.15, true],
  [-0.9, -0.3, 1.0, 1.1, true],
  [0, -0.5, 0, 1.4, true],
];

export function cloud(color: number, rides?: Rides): Figure {
  const under = new THREE.Color(WHITE).lerp(new THREE.Color(color), 0.22).getHex();
  const body = new Part();
  // The big puffs on top, the ones the camera sees, are the roundest.
  PUFFS.forEach(([x, y, z, r, low], i) => {
    body.ball(low ? under : WHITE, r, [x, y, z], { seg: low ? [10, 5] : i === 0 ? [16, 8] : [12, 6] });
  });
  for (const s of SIDES) {
    eye(body, s, [0.42 * s, 0.42, 1.78], { w: 0.34, h: 0.4, turn: 0.22, colors: EYES, seg: [10, 3] });
    blush(body, s, [0.74 * s, 0.1, 1.68], 0.16, 0.42);
  }
  smile(body, [0, 0.06, 1.88], 0.24);

  return {
    body,
    rider: rides?.(body, CLOUD_SEAT),
    wings: {
      parts: [featherWing(1, WHITE, [FEATHER[2], FEATHER[1], color, WHITE]), featherWing(-1, WHITE, [FEATHER[2], FEATHER[1], color, WHITE])],
      at: [1.7, 0.6, -0.2],
      rest: 0.5,
      amp: 0.5,
      folded: true,
    },
  };
}
