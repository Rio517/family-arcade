import { createRedJackdawBattleInput } from '../content/naval';
import { RED_JACKDAW_VOYAGE } from '../content/voyage';
import type { CampaignEventDraftFor } from './events';
import { nextSeed } from './naval/rng';
import type { NavalResolution } from './naval/types';
import type { CampaignStateV1, ShipState } from './types';

export type VoyageBlockedReason =
  | 'not-in-bridgetown'
  | 'target-defeated'
  | 'lead-not-active'
  | 'flagship-unavailable'
  | 'insufficient-provisions';

export type VoyageReadiness =
  | { kind: 'ready'; requiredProvisions: 2 }
  | { kind: 'blocked'; reason: VoyageBlockedReason; requiredProvisions: 2 };

export class VoyageTransitionError extends Error {
  readonly code: 'wrong-predecessor' | 'not-ready';

  constructor(code: 'wrong-predecessor' | 'not-ready') {
    super(code);
    this.name = 'VoyageTransitionError';
    this.code = code;
  }
}

function flagship(state: CampaignStateV1): ShipState | undefined {
  return state.fleet.ships.find((ship) => ship.id === state.fleet.flagshipId);
}

function activeLead(state: CampaignStateV1): boolean {
  return state.leads.some((lead) => lead.id === 'red-jackdaw' && lead.status === 'active');
}

export function voyageReadiness(state: CampaignStateV1): VoyageReadiness {
  if (state.mode.kind !== 'port' || state.mode.portId !== RED_JACKDAW_VOYAGE.portId) return { kind: 'blocked', reason: 'not-in-bridgetown', requiredProvisions: 2 };
  if (state.world.targetDefeated) return { kind: 'blocked', reason: 'target-defeated', requiredProvisions: 2 };
  if (!activeLead(state)) return { kind: 'blocked', reason: 'lead-not-active', requiredProvisions: 2 };
  const ship = flagship(state);
  if (!ship) return { kind: 'blocked', reason: 'flagship-unavailable', requiredProvisions: 2 };
  if (ship.cargo.provisions < 2) return { kind: 'blocked', reason: 'insufficient-provisions', requiredProvisions: 2 };
  return { kind: 'ready', requiredProvisions: 2 };
}

export function voyageBlockedCopy(reason: VoyageBlockedReason): string {
  switch (reason) {
    case 'not-in-bridgetown': return 'Return to Bridgetown before setting a new course.';
    case 'target-defeated': return 'The Red Jackdaw lead is complete.';
    case 'lead-not-active': return 'Mark the Red Jackdaw rumour in the Tavern first.';
    case 'flagship-unavailable': return 'The flagship record is unavailable.';
    case 'insufficient-provisions': return 'Buy at least 2 provisions for the round trip.';
  }
}

function requireMode<K extends CampaignStateV1['mode']['kind']>(state: CampaignStateV1, kind: K): Extract<CampaignStateV1['mode'], { kind: K }> {
  if (state.mode.kind !== kind) throw new VoyageTransitionError('wrong-predecessor');
  return state.mode as Extract<CampaignStateV1['mode'], { kind: K }>;
}

function player(ship: ShipState) {
  return { stableShipId: ship.id, name: ship.name, classId: ship.classId, hull: ship.hull, sails: ship.sails, crew: ship.crew, cannon: ship.cannon } as const;
}

export function voyageStartedDraft(state: CampaignStateV1): CampaignEventDraftFor<'voyage-started'> {
  if (voyageReadiness(state).kind !== 'ready') throw new VoyageTransitionError('not-ready');
  return { type: 'voyage-started', payload: { voyageId: `voyage-${state.lastEventId + 1}` } };
}

export function seaLegCompletedDraft(state: CampaignStateV1): CampaignEventDraftFor<'sea-leg-completed'> {
  const mode = requireMode(state, 'sailing');
  return { type: 'sea-leg-completed', payload: { voyageId: mode.voyageId, encounterId: `${mode.voyageId}-contact`, checkpoint: structuredClone(RED_JACKDAW_VOYAGE.contact), navigationRng: { before: state.rng.navigation, after: nextSeed(state.rng.navigation) } } };
}

export function encounterAvoidedDraft(state: CampaignStateV1): CampaignEventDraftFor<'encounter-avoided'> {
  const mode = requireMode(state, 'encounter');
  return { type: 'encounter-avoided', payload: { voyageId: mode.voyageId, encounterId: mode.encounterId } };
}

export function navalEngagedDraft(state: CampaignStateV1): CampaignEventDraftFor<'naval-engaged'> {
  const mode = requireMode(state, 'encounter');
  const ship = flagship(state);
  if (!ship) throw new VoyageTransitionError('not-ready');
  const battleId = `${mode.voyageId}-battle`;
  const navalAfter = nextSeed(state.rng.naval);
  return { type: 'naval-engaged', payload: { voyageId: mode.voyageId, encounterId: mode.encounterId, battleId, navalRng: { before: state.rng.naval, after: navalAfter }, input: createRedJackdawBattleInput({ battleId, seed: navalAfter, player: player(ship) }) } };
}

export function battleWithdrawnDraft(state: CampaignStateV1): CampaignEventDraftFor<'battle-withdrawn'> {
  const mode = requireMode(state, 'naval');
  return { type: 'battle-withdrawn', payload: { voyageId: mode.voyageId, battleId: mode.battleId } };
}

export function navalResolvedDraft(state: CampaignStateV1, resolution: NavalResolution): CampaignEventDraftFor<'naval-resolved'> {
  const mode = requireMode(state, 'naval');
  return { type: 'naval-resolved', payload: { voyageId: mode.voyageId, battleId: mode.battleId, resolution: structuredClone(resolution) } };
}
