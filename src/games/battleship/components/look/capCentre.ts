import { useLayoutEffect, type RefObject } from 'react';

/**
 * How far a label set in `fontFamily` must move down, in em, for its capitals
 * to sit in the middle of its line. A line's middle is halfway between the
 * font's ascent and descent lines; DIN Condensed's capitals fill the whole
 * ascent and leave the descent empty, so its labels ride about 0.15em high.
 * Measured on the face the device really draws (the stack falls back by
 * platform), so a fallback that is already centred moves by nothing.
 * 0 when it can't be measured.
 */
export function capCentreShift(fontFamily: string): number {
  if (!fontFamily || typeof document === 'undefined') return 0;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return 0;
  ctx.font = `700 100px ${fontFamily}`;
  const m = ctx.measureText('H');
  const ascent = m.fontBoundingBoxAscent;
  const descent = m.fontBoundingBoxDescent;
  const cap = m.actualBoundingBoxAscent;
  if (!(ascent > 0) || !(cap > 0)) return 0;
  return Math.round(((descent + cap - ascent) / 2 / 100) * 1000) / 1000;
}

/**
 * Sets `--lk-dy` on the element, before the first paint, from the look's
 * condensed face (`--lk-cond`, which a look declares only for its start
 * screens, so it is read again when the look or the phase changes);
 * looks.css moves look C's labels by it.
 */
export function useCapCentre(ref: RefObject<HTMLElement | null>, look: string, phase: string): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dy = capCentreShift(getComputedStyle(el).getPropertyValue('--lk-cond').trim());
    if (dy) el.style.setProperty('--lk-dy', `${dy}em`);
    else el.style.removeProperty('--lk-dy');
  }, [ref, look, phase]);
}
