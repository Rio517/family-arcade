/**
 * Aircraft for the carriers. A carrier has no main guns: on its turn it
 * launches a short ripple of planes that roll down the flight deck, lift off
 * the bow, climb and turn away east toward the enemy, and leave the frame.
 * The enemy's carrier sends a dive bomber in now and then: it dives out of
 * the east, lets its bomb go, and pulls away.
 *
 * Classic carriers fly propeller planes, built here from code (the Shōkaku's
 * model carries none). Modern carriers fly jets cloned from the Ford's own
 * deck aircraft (`Aircraft_01` and its canopy), sharing the model's geometry
 * and materials.
 *
 * Every plane is built nose along +x, wings along z, at board scale (a cell
 * is 1). View only: nothing here reads or writes game state.
 */
import * as THREE from 'three';

export type PlaneSide = 'ours' | 'theirs';

/** A plane ready to fly, and the parts that animate on it. */
export interface Plane {
  root: THREE.Group;
  /** Spins (a propeller); absent on a jet. */
  prop?: THREE.Object3D;
  jet: boolean;
}

const LIVERY = {
  ours: { body: '#8d9c86', belly: '#bcc5b8', cowl: '#2a2f36' },
  theirs: { body: '#737985', belly: '#9ea4ad', cowl: '#b0342a' },
} as const;

/** One wing (or tailplane) planform, extruded thin, lying flat: chord along x, span along z. */
function wing(span: number, root: number, tip: number, sweep: number, thick: number, mat: THREE.Material): THREE.Mesh {
  const s = new THREE.Shape();
  const h = span / 2;
  s.moveTo(root * 0.5, 0);
  s.lineTo(tip * 0.5 - sweep, h);
  s.lineTo(-tip * 0.5 - sweep, h);
  s.lineTo(-root * 0.5, 0);
  s.lineTo(-tip * 0.5 - sweep, -h);
  s.lineTo(tip * 0.5 - sweep, -h);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  // Shape x/y → plane x/z, extrusion → height.
  geo.rotateX(Math.PI / 2);
  geo.translate(0, thick / 2, 0);
  return new THREE.Mesh(geo, mat);
}

/**
 * A low-wing propeller fighter, nose +x, about 0.34 of a cell long: tapered
 * fuselage, dark cowling, canopy, wings and tailplane, a fin, roundels in
 * `accent`, and a spinning propeller with a faint blur disc.
 */
export function propPlane(side: PlaneSide, accent: string, grow = 1): Plane {
  const L = LIVERY[side];
  const root = new THREE.Group();
  root.scale.setScalar(grow);
  const body = new THREE.MeshStandardMaterial({ color: L.body, roughness: 0.62, metalness: 0.15 });
  const belly = new THREE.MeshStandardMaterial({ color: L.belly, roughness: 0.65, metalness: 0.1 });
  const cowl = new THREE.MeshStandardMaterial({ color: L.cowl, roughness: 0.5, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: '#2a3d52', roughness: 0.15, metalness: 0.6 });
  const mark = new THREE.MeshBasicMaterial({ color: accent, toneMapped: false });

  // Fuselage: thick at the nose, tapering to the tail.
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.026, 0.3, 10), body);
  fus.rotation.z = Math.PI / 2;
  fus.position.x = -0.01;
  root.add(fus);
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.029, 0.027, 0.045, 12), cowl);
  nose.rotation.z = Math.PI / 2;
  nose.position.x = 0.155;
  root.add(nose);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), glass);
  canopy.scale.set(2.1, 0.9, 0.85);
  canopy.position.set(0.035, 0.021, 0);
  root.add(canopy);
  // Wings low on the fuselage, the tailplane and the fin aft.
  const w = wing(0.38, 0.085, 0.04, 0.012, 0.007, belly);
  w.position.set(0.04, -0.012, 0);
  root.add(w);
  const tp = wing(0.13, 0.045, 0.024, 0.006, 0.005, belly);
  tp.position.set(-0.14, 0.004, 0);
  root.add(tp);
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(-0.05, 0.055);
  finShape.lineTo(-0.075, 0.05);
  finShape.lineTo(-0.065, 0);
  finShape.closePath();
  const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape, { depth: 0.005, bevelEnabled: false }), body);
  fin.position.set(-0.095, 0.006, -0.0025);
  root.add(fin);
  // Roundels on the upper wings, in the fleet's colour.
  for (const z of [-0.12, 0.12]) {
    const r = new THREE.Mesh(new THREE.CircleGeometry(0.019, 16), mark);
    r.rotation.x = -Math.PI / 2;
    r.position.set(0.035, -0.004, z);
    root.add(r);
  }
  // The propeller: three blades, and a faint disc where they blur.
  const prop = new THREE.Group();
  prop.position.x = 0.181;
  const blade = new THREE.BoxGeometry(0.004, 0.07, 0.009);
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(blade, cowl);
    b.rotation.x = (i * Math.PI * 2) / 3;
    b.position.set(0, Math.cos((i * Math.PI * 2) / 3) * 0.035, Math.sin((i * Math.PI * 2) / 3) * 0.035);
    prop.add(b);
  }
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(0.072, 20),
    new THREE.MeshBasicMaterial({ color: '#d8dee6', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
  );
  disc.rotation.y = Math.PI / 2;
  prop.add(disc);
  root.add(prop);
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return { root, prop, jet: false };
}

/** The Ford's deck jet, as a template to clone: its parts re-centred on the jet, nose +x, at the hull's scale. */
export interface JetTemplate {
  parts: THREE.Mesh[];
  length: number;
}

/** Find the deck jet on a Ford hull (null on a hull without one). */
export function findJet(hull: THREE.Object3D): JetTemplate | null {
  hull.updateMatrixWorld(true);
  let body: THREE.Mesh | null = null;
  let canopy: THREE.Mesh | null = null;
  hull.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    if (o.name === 'Aircraft_01') body = o as THREE.Mesh;
    else if (o.name === 'Aircraft_01_Canopy') canopy = o as THREE.Mesh;
  });
  if (!body) return null;
  const b = body as THREE.Mesh;
  // Undo the hull's placement (and the jet's own slight yaw on deck): keep
  // the scale, put the jet at the origin, nose along +x.
  const scale = new THREE.Vector3().setFromMatrixScale(b.matrixWorld);
  const inv = new THREE.Matrix4().copy(b.matrixWorld).invert();
  const parts: THREE.Mesh[] = [];
  for (const m of [b, canopy as THREE.Mesh | null]) {
    if (!m) continue;
    const local = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
    const part = new THREE.Mesh(m.geometry, m.material);
    part.position.setFromMatrixPosition(local).multiply(scale);
    part.scale.copy(scale);
    parts.push(part);
  }
  if (!b.geometry.boundingBox) b.geometry.computeBoundingBox();
  const length = (b.geometry.boundingBox!.max.x - b.geometry.boundingBox!.min.x) * scale.x;
  return { parts, length };
}

/** A jet to fly, cloned from the template (shared geometry and materials). Theirs is painted rust-grey. */
export function jetPlane(t: JetTemplate, side: PlaneSide, grow = 1.15): Plane {
  const root = new THREE.Group();
  for (const p of t.parts) {
    const m = p.clone();
    if (side === 'theirs') {
      const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
      const dark = mat.clone();
      // The enemy's: a warm, rust-grey airframe, still easy to pick out on a night sea.
      dark.color = mat.color.clone().multiply(new THREE.Color(0.95, 0.6, 0.52));
      m.material = dark;
      m.userData.ownMaterial = true;
    }
    m.castShadow = true;
    root.add(m);
  }
  root.scale.setScalar(grow);
  return { root, jet: true };
}

/** Free what a plane owns: its own geometry and materials, never the hull model's shared ones. */
export function disposePlane(p: Plane): void {
  p.root.removeFromParent();
  if (p.jet) {
    p.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.userData.ownMaterial) (m.material as THREE.Material).dispose();
    });
    return;
  }
  p.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
  });
}

/** A flight: a plane on a path over time, banking into its turns. */
export interface Flight {
  plane: Plane;
  /** Where the plane is at `u` (0..1 of the flight). */
  path: (u: number, out: THREE.Vector3) => THREE.Vector3;
  start: number;
  dur: number;
  /** Called once, when the flight reaches `releaseAt` (a bomb let go). */
  release?: { at: number; fn: (pos: THREE.Vector3, vel: THREE.Vector3) => void; done?: boolean };
}

const UP = new THREE.Vector3(0, 1, 0);
const fwd = new THREE.Vector3();
const side = new THREE.Vector3();
const upv = new THREE.Vector3();
const ahead = new THREE.Vector3();
const behind = new THREE.Vector3();
const basis = new THREE.Matrix4();
const bankQ = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);

/**
 * Put a flight's plane where it is at `now`, nose along its path, banked
 * into the turn. Returns false once the flight is over (or before it starts).
 */
export function poseFlight(f: Flight, now: number): boolean {
  const u = (now - f.start) / f.dur;
  const root = f.plane.root;
  if (u < 0) {
    root.visible = false;
    return true;
  }
  if (u >= 1) return false;
  root.visible = true;
  f.path(u, root.position);
  const du = 0.012;
  f.path(Math.min(1, u + du), ahead);
  f.path(Math.max(0, u - du), behind);
  fwd.subVectors(ahead, behind);
  if (fwd.lengthSq() < 1e-10) return true;
  fwd.normalize();
  side.crossVectors(fwd, UP);
  if (side.lengthSq() < 1e-8) side.set(0, 0, 1);
  side.normalize();
  upv.crossVectors(side, fwd);
  basis.makeBasis(fwd, upv, side);
  root.quaternion.setFromRotationMatrix(basis);
  // Bank with the turn: the heading's change over the look-ahead.
  const h1 = Math.atan2(-(root.position.z - behind.z), root.position.x - behind.x);
  const h2 = Math.atan2(-(ahead.z - root.position.z), ahead.x - root.position.x);
  const turn = Math.atan2(Math.sin(h2 - h1), Math.cos(h2 - h1));
  const bank = Math.max(-0.95, Math.min(0.95, -turn * 9));
  root.quaternion.multiply(bankQ.setFromAxisAngle(X, bank));
  if (f.plane.prop) f.plane.prop.rotation.x = now * 0.09;
  if (f.release && !f.release.done && u >= f.release.at) {
    f.release.done = true;
    const vel = new THREE.Vector3().subVectors(ahead, behind).divideScalar((2 * du * f.dur) / 1000);
    f.release.fn(root.position.clone(), vel);
  }
  return true;
}

/** A cubic Bézier through four points, written into `out`. */
export function cubic(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, t: number, out: THREE.Vector3): THREE.Vector3 {
  const u = 1 - t;
  return out
    .copy(a)
    .multiplyScalar(u * u * u)
    .addScaledVector(b, 3 * u * u * t)
    .addScaledVector(c, 3 * u * t * t)
    .addScaledVector(d, t * t * t);
}
