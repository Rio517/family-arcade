import type { CargoDefinition, CargoId, PortMarketDefinition } from './types';

export const GOODS = Object.freeze({
  provisions: Object.freeze({ id: 'provisions', name: 'Provisions', baselinePrice: 5 } satisfies CargoDefinition),
  tools: Object.freeze({ id: 'tools', name: 'Tools & common goods', baselinePrice: 15 } satisfies CargoDefinition),
  luxuries: Object.freeze({ id: 'luxuries', name: 'Luxuries', baselinePrice: 36 } satisfies CargoDefinition),
  'sugar-molasses': Object.freeze({ id: 'sugar-molasses', name: 'Sugar & molasses', baselinePrice: 10 } satisfies CargoDefinition),
  'tobacco-dyewood': Object.freeze({ id: 'tobacco-dyewood', name: 'Tobacco & dyewood', baselinePrice: 12 } satisfies CargoDefinition),
  'powder-arms': Object.freeze({ id: 'powder-arms', name: 'Powder & arms', baselinePrice: 22 } satisfies CargoDefinition),
} satisfies Record<CargoId, Readonly<CargoDefinition>>);

export const BRIDGETOWN_MARKET = Object.freeze({
  portId: 'bridgetown',
  unitPrices: Object.freeze({
    provisions: 4,
    tools: 18,
    luxuries: 32,
    'sugar-molasses': 10,
    'tobacco-dyewood': 13,
    'powder-arms': 26,
  } satisfies Record<CargoId, number>),
} satisfies PortMarketDefinition);
