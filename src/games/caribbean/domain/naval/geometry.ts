import type { Broadside, NavalShipId, NavalShipState, NavalState, Point } from './types';

const TAU = Math.PI * 2;
const LATERAL_ARC_FORWARD_DOT = 0.72;
export const MAX_BROADSIDE_RANGE = 42;
const SAIL_POLAR: ReadonlyArray<readonly [degrees: number, efficiency: number]> = [
  [0, 0.08],
  [30, 0.18],
  [60, 0.65],
  [90, 1],
  [135, 0.88],
  [180, 0.65],
];

function canonicalPoint(point: Point): Point {
  return {
    x: Object.is(point.x, -0) ? 0 : point.x,
    z: Object.is(point.z, -0) ? 0 : point.z,
  };
}

export function normalizeAngle(angle: number): number {
  return ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

export function broadsideVector(heading: number, side: Broadside): Point {
  const lateral = side === 'port' ? 1 : -1;
  return canonicalPoint({
    x: Math.cos(heading) * lateral,
    z: -Math.sin(heading) * lateral,
  });
}

export function bearingSide(origin: Point, heading: number, target: Point): Broadside | null {
  const x = target.x - origin.x;
  const z = target.z - origin.z;
  const distance = Math.hypot(x, z);
  if (distance < 0.0001) return null;

  const forwardDot = (x * Math.sin(heading) + z * Math.cos(heading)) / distance;
  if (Math.abs(forwardDot) > LATERAL_ARC_FORWARD_DOT) return null;

  const port = broadsideVector(heading, 'port');
  return x * port.x + z * port.z >= 0 ? 'port' : 'starboard';
}

export interface BroadsideLegality {
  side: Broadside | null;
  distance: number;
  inRange: boolean;
  loaded: boolean;
  armed: boolean;
  terminal: boolean;
  legal: boolean;
}

function physicalBroadsideLegality(
  ship: NavalShipState,
  target: Point,
  requestedSide: Broadside,
): Omit<BroadsideLegality, 'terminal' | 'legal'> & { physicallyLegal: boolean } {
  const distance = Math.hypot(target.x - ship.position.x, target.z - ship.position.z);
  const side = bearingSide(ship.position, ship.heading, target);
  const inRange = distance <= MAX_BROADSIDE_RANGE;
  const loaded = ship.reload[requestedSide].loaded;
  const armed = Number.isInteger(ship.cannon) && ship.cannon > 0;
  return {
    side,
    distance,
    inRange,
    loaded,
    armed,
    physicallyLegal: side === requestedSide && inRange && loaded && armed,
  };
}

/** The sole state-aware firing gate for reducer, opponent assistance, and presentation. */
export function broadsideLegality(
  state: NavalState,
  shipId: NavalShipId,
  requestedSide: Broadside,
): BroadsideLegality {
  const ship = state.ships[shipId];
  const target = state.ships[shipId === 'player' ? 'opponent' : 'player'];
  const physical = physicalBroadsideLegality(ship, target.position, requestedSide);
  const terminal = state.outcome !== null;
  return {
    side: physical.side,
    distance: physical.distance,
    inRange: physical.inRange,
    loaded: physical.loaded,
    armed: physical.armed,
    terminal,
    legal: !terminal && physical.physicallyLegal,
  };
}

/** Relative angle is zero when the bow points into the wind. */
export function sailingEfficiency(relativeWindAngle: number): number {
  const degrees = Math.abs(normalizeAngle(relativeWindAngle)) * 180 / Math.PI;

  for (let index = 1; index < SAIL_POLAR.length; index++) {
    const [rightAngle, rightEfficiency] = SAIL_POLAR[index];
    const [leftAngle, leftEfficiency] = SAIL_POLAR[index - 1];
    if (degrees <= rightAngle) {
      const fraction = (degrees - leftAngle) / (rightAngle - leftAngle);
      return leftEfficiency + (rightEfficiency - leftEfficiency) * fraction;
    }
  }

  return SAIL_POLAR[SAIL_POLAR.length - 1][1];
}
