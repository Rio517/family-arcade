export const CARIBBEAN_MAP_HOME = Object.freeze({ scale: 1, panX: 0, panY: 0 });
const CARIBBEAN_MAP_MIN_SCALE = 1;
const CARIBBEAN_MAP_MAX_SCALE = 3;
const CARIBBEAN_MAP_ZOOM_STEP = 0.25;
const CARIBBEAN_MAP_MAX_PAN = 240;

export interface CaribbeanMapView {
  scale: number;
  panX: number;
  panY: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function zoomCaribbeanMap(view: CaribbeanMapView, direction: 1 | -1): CaribbeanMapView {
  const scale = clamp(
    view.scale + direction * CARIBBEAN_MAP_ZOOM_STEP,
    CARIBBEAN_MAP_MIN_SCALE,
    CARIBBEAN_MAP_MAX_SCALE,
  );
  return scale === view.scale ? view : { ...view, scale };
}

export function panCaribbeanMap(view: CaribbeanMapView, deltaX: number, deltaY: number): CaribbeanMapView {
  return {
    ...view,
    panX: clamp(view.panX + deltaX, -CARIBBEAN_MAP_MAX_PAN, CARIBBEAN_MAP_MAX_PAN),
    panY: clamp(view.panY + deltaY, -CARIBBEAN_MAP_MAX_PAN, CARIBBEAN_MAP_MAX_PAN),
  };
}

export function resetCaribbeanMap(): CaribbeanMapView {
  return { ...CARIBBEAN_MAP_HOME };
}
