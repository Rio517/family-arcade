import { describe, expect, it, vi } from 'vitest';

import { createBearingLineGeometry, updateBearingLineGeometry } from './bearingLine';

describe('allocation-free bearing line', () => {
  it('reuses both GPU attributes across render updates and remains normally disposable', () => {
    const geometry = createBearingLineGeometry();
    const position = geometry.getAttribute('position');
    const lineDistance = geometry.getAttribute('lineDistance');
    const disposed = vi.fn();
    geometry.addEventListener('dispose', disposed);

    for (let index = 0; index < 240; index += 1) {
      updateBearingLineGeometry(
        geometry,
        { x: index / 10, z: -index / 20 },
        { x: 12 + index / 8, z: 7 - index / 15 },
      );
      expect(geometry.getAttribute('position')).toBe(position);
      expect(geometry.getAttribute('lineDistance')).toBe(lineDistance);
    }

    expect(lineDistance.getX(0)).toBe(0);
    expect(lineDistance.getX(1)).toBeCloseTo(Math.hypot(12 + 239 / 8 - 239 / 10, 7 - 239 / 15 + 239 / 20));
    geometry.dispose();
    expect(disposed).toHaveBeenCalledTimes(1);
  });
});
