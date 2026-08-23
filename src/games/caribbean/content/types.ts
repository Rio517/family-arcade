export type PortId = 'bridgetown';
export type CargoId =
  | 'provisions'
  | 'tools'
  | 'luxuries'
  | 'sugar-molasses'
  | 'tobacco-dyewood'
  | 'powder-arms';
export type ShipClassId = 'sloop';
export type FactionId = 'english' | 'french' | 'spanish' | 'dutch';
export type FittingId =
  | 'careened-hull'
  | 'fine-canvas'
  | 'expanded-berths'
  | 'reinforced-scantlings'
  | 'improved-gun-carriages'
  | 'ammunition-lockers';
export type LeadId = 'red-jackdaw';

export interface SloopClass {
  id: ShipClassId;
  hold: number;
  crew: {
    minimum: number;
    safe: number;
    maximum: number;
  };
  cannonMaximum: number;
  hullMaximum: number;
  sailsMaximum: number;
  topSpeed: number;
  turnResponse: number;
  bestWindAngle: number;
  fittingSlots: number;
}

export interface PortDefinition {
  id: PortId;
  name: string;
  controller: FactionId;
  prosperity: 'modest';
  defense: 'guarded';
}

export interface FittingDefinition {
  id: FittingId;
  holdPenalty: number;
}

export interface LeadDefinition {
  id: LeadId;
  expiresAfterDays: number;
  nextAction: string;
}
