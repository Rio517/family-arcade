import type {
  CargoId,
  FactionId,
  FittingId,
  LeadId,
  PortId,
  ShipClassId,
} from '../content/types';
import type { NavalBattleInput, NavalOutcome, Point } from './naval/types';

export type CampaignLength = 'adventure' | 'voyage' | 'legend';
export type Talent = 'fencing' | 'gunnery' | 'navigation' | 'charm' | 'medicine';
export type Morale = 'very-happy' | 'happy' | 'content' | 'unhappy' | 'mutinous';
export type PortActivity = 'menu' | 'governor' | 'tavern' | 'market' | 'shipyard' | 'shares' | 'log';

export interface SailingCheckpoint {
  tick: number;
  position: Point;
  heading: number;
  elapsedDays: number;
  provisionsUsed: number;
}

export interface PrizeSnapshot {
  battleId: string;
  ship: ShipState;
  willingCrew: number;
}

export interface LastVoyageSummary {
  voyageId: string;
  battleId: string | null;
  result: 'avoided' | 'withdrew' | 'victory' | 'defeat' | 'unresolved';
  outcome: NavalOutcome | null;
  returnedDay: number;
}

export type CampaignMode =
  | { kind: 'port'; portId: PortId }
  | { kind: 'sailing'; voyageId: string; checkpoint: SailingCheckpoint }
  | {
      kind: 'encounter';
      encounterId: string;
      voyageId: string;
      returnCheckpoint: SailingCheckpoint;
    }
  | {
      kind: 'naval';
      battleId: string;
      voyageId: string;
      input: NavalBattleInput;
      returnCheckpoint: SailingCheckpoint;
    }
  | {
      kind: 'capture';
      battleId: string;
      prize: PrizeSnapshot;
      voyageId: string;
      returnCheckpoint: SailingCheckpoint;
    }
  | {
      kind: 'boarding';
      battleId: string;
      voyageId: string;
      returnCheckpoint: SailingCheckpoint;
    }
  | { kind: 'treasure'; leadId: LeadId }
  | { kind: 'shares'; portId: PortId }
  | { kind: 'retired'; score: number };

export interface ShipState {
  id: string;
  classId: ShipClassId;
  name: string;
  hull: number;
  sails: number;
  crew: number;
  cannon: number;
  cargo: Record<CargoId, number>;
  fittings: FittingId[];
}

export interface LeadState {
  id: LeadId;
  kind: 'rumour';
  status: 'active' | 'completed' | 'expired';
  acceptedDay: number;
  expiresDay: number | null;
}

export interface CampaignStateV1 {
  schemaVersion: 1;
  contentVersion: 'caribbean-slice-1';
  campaignId: string;
  seed: number;
  career: { length: CampaignLength };
  calendar: { startYear: 1675; elapsedDays: number };
  mode: CampaignMode;
  captain: {
    name: string;
    pronouns: string;
    talent: Talent;
  };
  wealth: { gold: number; earned: number };
  crew: { morale: Morale };
  fleet: { flagshipId: string; ships: ShipState[] };
  standings: Record<FactionId, number>;
  world: {
    ports: Record<PortId, {
      prosperity: 'modest';
      defense: 'guarded';
    }>;
    targetDefeated: boolean;
    lastVoyage?: LastVoyageSummary;
  };
  leads: LeadState[];
  relationships: Record<string, {
    stage: 'acquainted' | 'friendly' | 'close' | 'devoted';
  }>;
  legacy: { capturedShips: number; goldEarned: number };
  rng: { world: number; navigation: number; naval: number };
  lastEventId: number;
}

export interface CreateCampaignOptions {
  seed: number;
  name?: string;
  pronouns?: string;
  talent?: Talent;
  length?: CampaignLength;
}

export interface ValidationIssue {
  path: string;
  code:
    | 'missing'
    | 'unknown-key'
    | 'wrong-type'
    | 'non-json'
    | 'not-finite'
    | 'not-integer'
    | 'out-of-range'
    | 'unknown-id'
    | 'duplicate'
    | 'capacity-exceeded'
    | 'invariant'
    | 'replay-mismatch';
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };
