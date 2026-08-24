import { SLOOP_CLASS } from './naval';
import type {
  CargoId,
  FactionId,
  FittingDefinition,
  FittingId,
  LeadDefinition,
  LeadId,
  PortDefinition,
  PortId,
  ShipClassId,
} from './types';

function isKnownId<T extends string>(ids: readonly T[], value: string): value is T {
  return ids.includes(value as T);
}

export const PORT_IDS = Object.freeze(['bridgetown'] satisfies readonly PortId[]);
export const CARGO_IDS = Object.freeze([
  'provisions',
  'tools',
  'luxuries',
  'sugar-molasses',
  'tobacco-dyewood',
  'powder-arms',
] satisfies readonly CargoId[]);
export const SHIP_CLASS_IDS = Object.freeze(['sloop'] satisfies readonly ShipClassId[]);
export const FACTION_IDS = Object.freeze(['english', 'french', 'spanish', 'dutch'] satisfies readonly FactionId[]);
export const FITTING_IDS = Object.freeze([
  'careened-hull',
  'fine-canvas',
  'expanded-berths',
  'reinforced-scantlings',
  'improved-gun-carriages',
  'ammunition-lockers',
] satisfies readonly FittingId[]);
export const LEAD_IDS = Object.freeze(['red-jackdaw'] satisfies readonly LeadId[]);

export const BRIDGETOWN = Object.freeze({
  id: 'bridgetown',
  name: 'Bridgetown',
  controller: 'english',
  prosperity: 'modest',
  defense: 'guarded',
} satisfies PortDefinition);

export const FITTINGS = Object.freeze({
  'careened-hull': Object.freeze({ id: 'careened-hull', holdPenalty: 0 } satisfies FittingDefinition),
  'fine-canvas': Object.freeze({ id: 'fine-canvas', holdPenalty: 0 } satisfies FittingDefinition),
  'expanded-berths': Object.freeze({ id: 'expanded-berths', holdPenalty: 6 } satisfies FittingDefinition),
  'reinforced-scantlings': Object.freeze({ id: 'reinforced-scantlings', holdPenalty: 0 } satisfies FittingDefinition),
  'improved-gun-carriages': Object.freeze({ id: 'improved-gun-carriages', holdPenalty: 2 } satisfies FittingDefinition),
  'ammunition-lockers': Object.freeze({ id: 'ammunition-lockers', holdPenalty: 2 } satisfies FittingDefinition),
} satisfies Record<FittingId, Readonly<FittingDefinition>>);

export const LEADS = Object.freeze({
  'red-jackdaw': Object.freeze({
    id: 'red-jackdaw',
    expiresAfterDays: 18,
    nextAction: 'Sail east of Bridgetown and identify the Red Jackdaw.',
    sentence: 'The Red Jackdaw was sighted east of Bridgetown, running west with the trade wind.',
  } satisfies LeadDefinition),
} satisfies Record<LeadId, Readonly<LeadDefinition>>);

export const SLOOP_VALIDATION_LIMITS = SLOOP_CLASS;

export function isPortId(value: string): value is PortId {
  return isKnownId(PORT_IDS, value);
}

export function isCargoId(value: string): value is CargoId {
  return isKnownId(CARGO_IDS, value);
}

export function isShipClassId(value: string): value is ShipClassId {
  return isKnownId(SHIP_CLASS_IDS, value);
}

export function isFactionId(value: string): value is FactionId {
  return isKnownId(FACTION_IDS, value);
}

export function isFittingId(value: string): value is FittingId {
  return isKnownId(FITTING_IDS, value);
}

export function isLeadId(value: string): value is LeadId {
  return isKnownId(LEAD_IDS, value);
}
