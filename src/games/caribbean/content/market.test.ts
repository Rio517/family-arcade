import { describe, expect, it } from 'vitest';

import { CARGO_IDS } from './campaign';
import { BRIDGETOWN_MARKET, GOODS } from './market';

describe('Bridgetown market content', () => {
  it('locks authored cargo order, names, prices, and baselines', () => {
    expect(CARGO_IDS.map((id) => [
      id,
      GOODS[id].name,
      BRIDGETOWN_MARKET.unitPrices[id],
      GOODS[id].baselinePrice,
    ])).toEqual([
      ['provisions', 'Provisions', 4, 5],
      ['tools', 'Tools & common goods', 18, 15],
      ['luxuries', 'Luxuries', 32, 36],
      ['sugar-molasses', 'Sugar & molasses', 10, 10],
      ['tobacco-dyewood', 'Tobacco & dyewood', 13, 12],
      ['powder-arms', 'Powder & arms', 26, 22],
    ]);
  });

  it('is deeply frozen and has no stock or quantity model', () => {
    expect(Object.isFrozen(GOODS)).toBe(true);
    expect(Object.isFrozen(BRIDGETOWN_MARKET)).toBe(true);
    expect(Object.isFrozen(BRIDGETOWN_MARKET.unitPrices)).toBe(true);
    expect('stock' in BRIDGETOWN_MARKET).toBe(false);
    for (const id of CARGO_IDS) expect(Object.isFrozen(GOODS[id])).toBe(true);
  });
});
