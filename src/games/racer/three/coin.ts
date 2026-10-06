/**
 * A coin: a gold star coin with a bevelled rim, as one mesh. Every coin
 * shares the geometry and the material, so each costs one draw call.
 *
 * Same size as before (3.6 across the rim's outside), facing along z so it
 * spins about y.
 */
import * as THREE from 'three';

const RIM = new THREE.Color('#ffc93a');
const FACE = new THREE.Color('#f6ac22');
const STAR = new THREE.Color('#ffe27a');

/** The coin's half-section, from the middle of its face out over the rim: [radius, height]. */
const SECTION: Array<[number, number]> = [
  [0, 0.26],
  [2.45, 0.26],
  [2.62, 0.5],
  [2.8, 0.6],
  [3.2, 0.6],
  [3.5, 0.42],
  [3.6, 0.16],
  [3.6, 0],
];

function starShape(): THREE.Shape {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 1.95 : 0.85;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  return shape;
}

function paint(geo: THREE.BufferGeometry, color: (x: number, y: number, z: number) => THREE.Color): THREE.BufferGeometry {
  const p = geo.getAttribute('position');
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) col.set(color(p.getX(i), p.getY(i), p.getZ(i)).toArray(), i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

export function coinGeometry(): THREE.BufferGeometry {
  // The body: front half-section, then the back mirrored, turned about y and laid on its side.
  const pts = [...SECTION.map(([r, h]) => new THREE.Vector2(r, h))];
  for (let i = SECTION.length - 2; i >= 0; i--) pts.push(new THREE.Vector2(SECTION[i][0], -SECTION[i][1]));
  // A lathe of a profile that goes out and back needs its points from bottom to top.
  const body = new THREE.LatheGeometry(pts.reverse(), 30);
  body.rotateX(Math.PI / 2);
  paint(body, (x, y) => (Math.hypot(x, y) > 2.5 ? RIM : FACE));

  const pieces: THREE.BufferGeometry[] = [body.toNonIndexed()];
  for (const side of [1, -1]) {
    const star = new THREE.ExtrudeGeometry(starShape(), {
      depth: 0.12,
      bevelEnabled: true,
      bevelThickness: 0.1,
      bevelSize: 0.1,
      bevelSegments: 1,
    });
    if (side < 0) star.rotateY(Math.PI);
    star.translate(0, 0, side * 0.22);
    pieces.push(paint(star, () => STAR));
  }
  body.dispose();

  const count = pieces.reduce((n, g) => n + g.getAttribute('position').count, 0);
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  let at = 0;
  for (const g of pieces) {
    const n = g.getAttribute('position').count;
    pos.set(g.getAttribute('position').array as Float32Array, at * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, at * 3);
    col.set(g.getAttribute('color').array as Float32Array, at * 3);
    at += n;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

export function coinMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0.75,
    roughness: 0.28,
    emissive: 0xc77d00,
    emissiveIntensity: 0.35,
  });
}
