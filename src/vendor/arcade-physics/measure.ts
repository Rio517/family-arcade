import { Box3, Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import type { Object3D } from 'three';
import type { BodyOptions } from './types';
import type { BodySpec } from './engine';

const box = new Box3();
const center = new Vector3();
const size = new Vector3();
const origin = new Vector3();
const savedQ = new Quaternion();
const rel = new Matrix4();
const p = new Vector3();

const MAX_HULL_POINTS = 96;

/**
 * Measures an object for the engine: its size with its own turn removed, where the shape's middle
 * sits relative to the object's origin, and (for hulls) its vertices. Parents are assumed to be
 * turn-free (a scene or a plain group); scale anywhere is honoured.
 */
export function measure(object: Object3D, options: BodyOptions): Pick<BodySpec, 'kind' | 'half' | 'radius' | 'points' | 'offset' | 'position' | 'quaternion'> {
  object.updateWorldMatrix(true, true);
  object.getWorldPosition(origin);
  const position = { x: origin.x, y: origin.y, z: origin.z };
  savedQ.copy(object.quaternion);
  const quaternion = { x: savedQ.x, y: savedQ.y, z: savedQ.z, w: savedQ.w };

  object.quaternion.identity();
  object.updateWorldMatrix(false, true);
  box.makeEmpty();
  box.setFromObject(object, true);
  let points: Float32Array | null = null;
  if (options.shape === 'hull') points = hullPoints(object);
  object.quaternion.copy(savedQ);
  object.updateWorldMatrix(false, true);

  if (box.isEmpty()) box.set(origin.clone().addScalar(-0.5), origin.clone().addScalar(0.5));
  box.getCenter(center);
  box.getSize(size);
  const s = options.size;
  const sx = s?.x ?? size.x;
  const sy = s?.y ?? size.y;
  const sz = s?.z ?? size.z;
  const half = { x: Math.max(sx, 1e-3) / 2, y: Math.max(sy, 1e-3) / 2, z: Math.max(sz, 1e-3) / 2 };
  const offset = s ? { x: 0, y: 0, z: 0 } : { x: center.x - origin.x, y: center.y - origin.y, z: center.z - origin.z };
  const radius = Math.max(half.x, half.y, half.z);
  return { kind: options.shape ?? 'box', half, radius, points, offset, position, quaternion };
}

function hullPoints(object: Object3D): Float32Array | null {
  const out: number[] = [];
  object.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const attr = mesh.geometry.getAttribute('position');
    if (!attr) return;
    rel.copy(mesh.matrixWorld);
    // Relative to the object's origin, with its world scale kept and its own turn removed.
    const step = Math.max(1, Math.ceil(attr.count / MAX_HULL_POINTS));
    for (let i = 0; i < attr.count; i += step) {
      p.fromBufferAttribute(attr, i).applyMatrix4(rel);
      out.push(p.x - origin.x, p.y - origin.y, p.z - origin.z);
    }
  });
  return out.length >= 12 ? new Float32Array(out) : null;
}
