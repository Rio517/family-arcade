import { afterEach, describe, expect, it, vi } from 'vitest';
import { capCentreShift } from './capCentre';

function stubCanvas(metrics: Partial<TextMetrics> | null) {
  const realCreate = document.createElement.bind(document);
  return vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = realCreate(tag);
    if (tag === 'canvas') {
      Object.defineProperty(el, 'getContext', {
        value: () => (metrics ? { font: '', measureText: () => metrics } : null),
      });
    }
    return el;
  });
}

describe('capCentreShift', () => {
  afterEach(() => vi.restoreAllMocks());

  it("moves DIN Condensed's capitals down to the middle of the line", () => {
    // DIN Condensed Bold at 100px: the capitals fill the ascent, the descent is empty.
    stubCanvas({ fontBoundingBoxAscent: 71, fontBoundingBoxDescent: 29, actualBoundingBoxAscent: 71.2 });
    expect(capCentreShift("'DIN Condensed', sans-serif")).toBeCloseTo(0.146, 3);
  });

  it('leaves a face whose capitals are already centred where it is', () => {
    stubCanvas({ fontBoundingBoxAscent: 90, fontBoundingBoxDescent: 20, actualBoundingBoxAscent: 70 });
    expect(capCentreShift('Some Face')).toBe(0);
  });

  it('moves nothing when the page has no face to measure or no canvas', () => {
    expect(capCentreShift('')).toBe(0);
    stubCanvas(null);
    expect(capCentreShift('Some Face')).toBe(0);
  });
});
