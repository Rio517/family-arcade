import { describe, expect, it } from 'vitest';

import { bearingSide, broadsideMuzzleOrigin, broadsideVector, normalizeAngle, sailingEfficiency } from './geometry';
import type { Point } from './types';

function expectPoint(actual: Point, expected: Point): void {
  expect(actual.x).toBeCloseTo(expected.x, 10);
  expect(actual.z).toBeCloseTo(expected.z, 10);
}

describe('naval geometry', () => {
  it.each([
    [0, { x: 1, z: 0 }, { x: -1, z: 0 }],
    [Math.PI / 2, { x: 0, z: -1 }, { x: 0, z: 1 }],
    [Math.PI, { x: -1, z: 0 }, { x: 1, z: 0 }],
    [-Math.PI / 2, { x: 0, z: 1 }, { x: 0, z: -1 }],
  ])('maps physical broadsides at heading %d', (heading, port, starboard) => {
    expectPoint(broadsideVector(heading, 'port'), port);
    expectPoint(broadsideVector(heading, 'starboard'), starboard);
  });

  it('places renderer and harness muzzle evidence on the same physical broadside', () => {
    expectPoint(broadsideMuzzleOrigin({ x: 4, z: -3 }, 0, 'port'), { x: 7.1, z: -3 });
    expectPoint(broadsideMuzzleOrigin({ x: 4, z: -3 }, 0, 'starboard'), { x: 0.9, z: -3 });
  });

  it('normalizes angles into the half-open canonical range', () => {
    expect(normalizeAngle(Math.PI)).toBe(-Math.PI);
    expect(normalizeAngle(-Math.PI)).toBe(-Math.PI);
    expect(normalizeAngle(3 * Math.PI)).toBe(-Math.PI);
  });

  it('classifies only lateral targets against physical sides', () => {
    expect(bearingSide({ x: 0, z: 0 }, 0, { x: 20, z: 0 })).toBe('port');
    expect(bearingSide({ x: 0, z: 0 }, 0, { x: -20, z: 0 })).toBe('starboard');
    expect(bearingSide({ x: 0, z: 0 }, 0, { x: 0, z: 20 })).toBeNull();
    expect(bearingSide({ x: 0, z: 0 }, 0, { x: 0, z: 0 })).toBeNull();
  });

  it.each([[0, 0.08], [30, 0.18], [60, 0.65], [90, 1], [135, 0.88], [180, 0.65]])(
    'returns %f drive at %d degrees off wind',
    (degrees, want) => expect(sailingEfficiency(degrees * Math.PI / 180)).toBeCloseTo(want, 5),
  );
});
