/**
 * The guns on the authored hulls. Every shipped ship GLB carries its weapons
 * as named pivots — `Turret_Main_1_Yaw` on the Iowa, `Shokaku_Gun_3_Yaw`,
 * `Deck_Gun_Yaw` on the U-boat, `Hobart_Main_Gun_Yaw`, the Ford's
 * `Carrier_CIWS_Fore_Pivot` — so a turret can train on a bearing by turning
 * its pivot. The Virginia has no gun at all; it fires from a deck hatch.
 *
 * The authored `*_Elevation` nodes sit at the model's origin, so they can't
 * raise the barrels in place. A pivot is inserted at the barrels' breech
 * instead and the barrels moved under it (world transforms kept), which
 * gives each gun a real elevation hinge and a recoil axis.
 *
 * View only: nothing here reads or writes game state.
 */
import * as THREE from 'three';

export interface TurretRig {
  yaw: THREE.Object3D;
  /** The pivot's own rest rotation, which aiming composes onto. */
  baseQuat: THREE.Quaternion;
  /** Angle (about the pivot's up) the barrels point at rest, atan2(-z, x). */
  restAngle: number;
  /** The inserted breech hinge; elevation and recoil move it. */
  hinge: THREE.Object3D;
  hingeRest: THREE.Vector3;
  /** Elevation axis in the pivot's frame (perpendicular to the barrels). */
  axis: THREE.Vector3;
  /** Rest pointing direction in the pivot's frame (unit, horizontal). */
  dir: THREE.Vector3;
  /** Barrel tip in the hinge's frame: where the flash and the shell start. */
  muzzle: THREE.Vector3;
  /** Barrel length in the hinge's frame, for the recoil stroke. */
  length: number;
}

export interface ShipGuns {
  rigs: TurretRig[];
  /** A hull with no gun (the Virginia): launch from these hatches instead. */
  hatches: THREE.Object3D[];
}

const MAIN = /(Main.*_Yaw|Gun_\d+_Yaw|Deck_Gun_Yaw|Main_Gun_Yaw)$/;
const CIWS = /CIWS.*(_Pivot|_Yaw)$/;
const HATCH = /Deck_Hatch_\d+$/;

const tmpV = new THREE.Vector3();
const tmpM = new THREE.Matrix4();

/** Bounding box of `mesh`'s geometry, expressed in `frame`'s local space. */
function boxIn(frame: THREE.Object3D, mesh: THREE.Mesh, out: THREE.Box3): THREE.Box3 {
  const g = mesh.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  tmpM.copy(frame.matrixWorld).invert().multiply(mesh.matrixWorld);
  out.copy(g.boundingBox!).applyMatrix4(tmpM);
  return out;
}

/**
 * Find the guns on one hull and give each a breech hinge. Call on a fresh
 * clone (the hinge moves the clone's barrels; the cached source is untouched).
 */
export function rigGuns(hull: THREE.Object3D): ShipGuns {
  hull.updateMatrixWorld(true);
  const mains: THREE.Object3D[] = [];
  const ciws: THREE.Object3D[] = [];
  const hatches: THREE.Object3D[] = [];
  hull.traverse((o) => {
    if (MAIN.test(o.name) && !/Radar|Torpedo|Secondary/.test(o.name)) mains.push(o);
    else if (CIWS.test(o.name)) ciws.push(o);
    else if (HATCH.test(o.name)) hatches.push(o);
  });
  const pivots = mains.length > 0 ? mains : ciws;
  const rigs: TurretRig[] = [];
  for (const yaw of pivots) {
    const rig = rigOne(yaw);
    if (rig) rigs.push(rig);
  }
  return { rigs, hatches: rigs.length > 0 ? [] : hatches };
}

function rigOne(yaw: THREE.Object3D): TurretRig | null {
  // The barrels: meshes named for them, else the gun's furthest-reaching parts.
  const barrels: THREE.Mesh[] = [];
  yaw.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && /Barrel|Muzzle/.test(o.name)) barrels.push(o as THREE.Mesh);
  });
  if (barrels.length === 0) return null;
  // Where the barrels point at rest, in the pivot's frame.
  const centre = new THREE.Vector3();
  const box = new THREE.Box3();
  for (const b of barrels) centre.add(boxIn(yaw, b, box).getCenter(tmpV));
  centre.divideScalar(barrels.length);
  const dir = new THREE.Vector3(centre.x, 0, centre.z);
  if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
  dir.normalize();
  // The barrels' reach along that direction: breech (min) and muzzle (max).
  let lo = Infinity;
  let hi = -Infinity;
  for (const b of barrels) {
    boxIn(yaw, b, box);
    for (const x of [box.min.x, box.max.x])
      for (const z of [box.min.z, box.max.z]) {
        const d = x * dir.x + z * dir.z;
        lo = Math.min(lo, d);
        hi = Math.max(hi, d);
      }
  }
  // The breech hinge sits where the barrels leave the house, at their height.
  const hingePos = new THREE.Vector3(dir.x * lo, centre.y, dir.z * lo);
  const hinge = new THREE.Object3D();
  hinge.name = `${yaw.name}_Hinge`;
  hinge.position.copy(hingePos);
  yaw.add(hinge);
  hinge.updateMatrixWorld(true);
  // Move the elevating parts under the hinge, keeping where they are.
  const elevation = yaw.children.find((c) => /Elevation/.test(c.name));
  if (elevation) hinge.attach(elevation);
  else for (const b of barrels) hinge.attach(b);
  const muzzle = new THREE.Vector3(dir.x * (hi - lo), 0, dir.z * (hi - lo));
  return {
    yaw,
    baseQuat: yaw.quaternion.clone(),
    restAngle: Math.atan2(-dir.z, dir.x),
    hinge,
    hingeRest: hinge.position.clone(),
    axis: new THREE.Vector3(-dir.z, 0, dir.x).normalize(),
    dir,
    muzzle,
    length: hi - lo,
  };
}

const UP = new THREE.Vector3(0, 1, 0);
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();

/** The pivot's turn (radians from rest) that points its barrels at `world`. */
export function bearingTo(rig: TurretRig, world: THREE.Vector3): number {
  const parent = rig.yaw.parent;
  if (!parent) return 0;
  const local = parent.worldToLocal(tmpV.copy(world)).sub(rig.yaw.position);
  local.applyQuaternion(qa.copy(rig.baseQuat).invert());
  const a = Math.atan2(-local.z, local.x) - rig.restAngle;
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Pose a gun: turned `turn` from rest, barrels raised `elev`, run back `recoil` (0..1). */
export function poseRig(rig: TurretRig, turn: number, elev: number, recoil: number): void {
  rig.yaw.quaternion.copy(rig.baseQuat).multiply(qa.setFromAxisAngle(UP, turn));
  rig.hinge.quaternion.copy(qb.setFromAxisAngle(rig.axis, elev));
  rig.hinge.position.copy(rig.hingeRest).addScaledVector(rig.dir, -recoil * rig.length * 0.22);
}

/** The muzzle's world position and pointing direction right now. */
export function muzzleWorld(rig: TurretRig, pos: THREE.Vector3, dir: THREE.Vector3): void {
  rig.hinge.updateWorldMatrix(true, false);
  pos.copy(rig.muzzle).applyMatrix4(rig.hinge.matrixWorld);
  const base = new THREE.Vector3().setFromMatrixPosition(rig.hinge.matrixWorld);
  dir.copy(pos).sub(base).normalize();
}
