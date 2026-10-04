/**
 * The princess, seated: a gown in her colour flaring over her ride, golden
 * hair falling down her back, a gold crown with a pink gem, big glossy
 * cornflower eyes with lashes, blush and an open smile. She can't fly, so she
 * always rides (a cloud, the bird or the unicorn). Built from the seat up,
 * facing +z: her body joins the ride's body, her head turns on its own hinge.
 */
import * as THREE from 'three';
import { Part, place, type V3 } from './kit';
import { blush, eye, smile } from './face';
import type { Rides } from './figure';
import { BLONDE, BLONDE_DEEP, CORNFLOWER, CORNFLOWER_DEEP, CORNFLOWER_LIGHT, GEM, GOLD, GOLD_DEEP, SKIN } from './palette';

const SIDES = [1, -1] as const;
/** Her neck, above the seat: the head's hinge. */
const NECK: V3 = [0, 1.02, 0.04];
const EYES = { deep: CORNFLOWER_DEEP, iris: CORNFLOWER, light: CORNFLOWER_LIGHT };

const tint = (color: number, toWhite: number): number => new THREE.Color(color).lerp(new THREE.Color(0xffffff), toWhite).getHex();

/** The princess in `color`, `scale` times her own size, sitting at the seat. */
export function princess(color: number, scale: number): Rides {
  const gown = tint(color, 0.35);
  const frill = tint(color, 0.7);
  return (body, seat) => {
    const k: V3 = [scale, scale, scale];
    body.within(place(seat, {}, k), () => {
      // A bell of a skirt over the ride's back with a pale frill at the hem, a fitted bodice.
      body.cone((p) => (p.y < -0.26 ? frill : gown), 0.36, 0.74, 0.82, [12, 3], [0, 0.3, 0]);
      body.blob(color, [0.66, 0.6, 0.5], [0, 0.76, 0.02], { round: 0.6, seg: [8, 4] });
      // Arms reaching forward to hold on.
      for (const s of SIDES) {
        body.within(place([0.36 * s, 0.94, 0.04], { rx: -1.0, rz: 0.12 * s }), () => {
          body.blob(SKIN, [0.2, 0.62, 0.2], [0, -0.26, 0], { round: 0.85, seg: [6, 3] });
        });
      }
    });

    const head = new Part(place([0, 0, 0], {}, k));
    head.blob(SKIN, [1.1, 1.02, 0.96], [0, 0.5, 0.04], { round: 0.6, seg: [10, 6] });
    // Golden hair: a cap, a swept fringe, side locks and one long lock down her back.
    head.ball(BLONDE, 0.62, [0, 0.66, -0.12], { scale: [0.98, 0.86, 0.96], seg: [10, 5] });
    head.ball(BLONDE, 0.3, [-0.2, 0.92, 0.36], { scale: [1.3, 0.6, 0.7], rot: { rz: 0.35 }, seg: [6, 3] });
    head.ball(BLONDE_DEEP, 0.24, [0.26, 0.9, 0.36], { scale: [1.1, 0.6, 0.7], rot: { rz: -0.4 }, seg: [6, 3] });
    for (const s of SIDES) head.ball(BLONDE, 0.24, [0.54 * s, 0.32, 0.0], { scale: [0.6, 1.25, 0.9], seg: [6, 3] });
    head.lock(
      [BLONDE, BLONDE_DEEP, BLONDE],
      [
        [0, 0.8, -0.45],
        [0, 0.4, -0.72],
        [0, -0.2, -0.52],
        [0, -0.7, -0.66],
        [0.05, -0.98, -0.5],
      ],
      { width: 0.36, thick: 0.18, along: 5, side: [0, 0, 1] },
    );
    // Crown: a gold band, three points and a pink gem in front.
    head.within(place([0, 1.12, -0.04], { rx: -0.12 }), () => {
      head.cone(GOLD, 0.3, 0.27, 0.16, [10, 1], [0, 0, 0], {}, { gloss: true, open: true });
      for (const a of [-0.7, 0, 0.7]) {
        head.cone(GOLD_DEEP, 0, 0.07, 0.22, [5, 1], [Math.sin(a) * 0.3, 0.17, Math.cos(a) * 0.3], {}, { gloss: true });
      }
      head.ball(GEM, 0.07, [0, 0.0, 0.31], { seg: [6, 2], gloss: true });
    });
    for (const s of SIDES) {
      eye(head, s, [0.24 * s, 0.5, 0.48], { w: 0.34, h: 0.42, turn: 0.22, colors: EYES, seg: [10, 3] });
      blush(head, s, [0.38 * s, 0.27, 0.44], 0.13, 0.4);
    }
    smile(head, [0, 0.2, 0.52], 0.2);

    const at: V3 = [seat[0] + NECK[0] * scale, seat[1] + NECK[1] * scale, seat[2] + NECK[2] * scale];
    return { part: head, at };
  };
}
