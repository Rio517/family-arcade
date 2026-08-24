import { LEADS } from '../content/campaign';
import { createRedJackdawBattleInput } from '../content/naval';
import { RED_JACKDAW_VOYAGE } from '../content/voyage';
import { canonicalJson } from '../canonicalJson';
import { quoteTrade } from './economy';
import {
  type CampaignEvent,
  validateCampaignEvent,
} from './events';
import type { CampaignStateV1, ValidationIssue } from './types';
import { nextSeed } from './naval/rng';
import { validateNavalResolution } from './naval/resolution';
import type { NavalOutcome } from './naval/types';
import { validateCampaign } from './validateCampaign';

function formatIssues(issues: readonly ValidationIssue[]): string {
  return issues.map(({ path, code }) => `${path}:${code}`).join(', ');
}

function assertNever(value: never): never {
  throw new Error(`Unhandled campaign event: ${String(value)}`);
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function currentFlagship(state: CampaignStateV1) {
  return state.fleet.ships.find((ship) => ship.id === state.fleet.flagshipId);
}

function spendVoyageCost(state: CampaignStateV1, elapsedDays: number, provisionsUsed: number): void {
  const ship = currentFlagship(state);
  if (!ship || ship.cargo.provisions < provisionsUsed) throw new Error('Invalid voyage: insufficient provisions');
  ship.cargo.provisions -= provisionsUsed;
  state.calendar.elapsedDays += elapsedDays;
}

function classifyResolution(outcome: NavalOutcome): 'victory' | 'defeat' | 'unresolved' {
  switch (outcome.kind) {
    case 'escaped':
    case 'separated':
      return 'unresolved';
    case 'surrender':
    case 'sunk':
    case 'boarding-ready':
      return outcome.victorShipId === 'player' ? 'victory' : 'defeat';
    default:
      return assertNever(outcome);
  }
}

function returnToBridgetown(
  state: CampaignStateV1,
  eventId: number,
  summary: NonNullable<CampaignStateV1['world']['lastVoyage']>,
): void {
  spendVoyageCost(state, RED_JACKDAW_VOYAGE.returnCost.elapsedDays, RED_JACKDAW_VOYAGE.returnCost.provisionsUsed);
  state.mode = { kind: 'port', portId: 'bridgetown' };
  state.world.lastVoyage = { ...summary, returnedDay: state.calendar.elapsedDays };
  const lead = state.leads.find((entry) => entry.id === 'red-jackdaw');
  if (lead) {
    if (summary?.result === 'victory') {
      lead.status = 'completed';
      state.world.targetDefeated = true;
    } else if (lead.expiresDay !== null && state.calendar.elapsedDays >= lead.expiresDay) {
      lead.status = 'expired';
    }
  }
  state.lastEventId = eventId;
}

export function reduceCampaign(
  inputState: CampaignStateV1,
  inputEvent: CampaignEvent,
): CampaignStateV1 {
  const prior = validateCampaign(inputState);
  if (!prior.ok) {
    throw new Error(`Invalid prior campaign state: ${formatIssues(prior.issues)}`);
  }
  const state = prior.value;

  const validatedEvent = validateCampaignEvent(inputEvent);
  if (!validatedEvent.ok) {
    throw new Error(`Invalid campaign event: ${formatIssues(validatedEvent.issues)}`);
  }
  const event = validatedEvent.value;

  if (state.lastEventId === 0xffff_ffff) {
    throw new Error('Campaign event ID space exhausted');
  }
  const expectedId = state.lastEventId + 1;
  if (event.id !== expectedId) {
    throw new Error(`Invalid campaign event: expected event ${expectedId}, received ${event.id}`);
  }
  if (event.atDay !== state.calendar.elapsedDays) {
    throw new Error(`Invalid campaign event: expected day ${state.calendar.elapsedDays}, received ${event.atDay}`);
  }

  const next = structuredClone(state);
  switch (event.type) {
    case 'lead-accepted': {
      if (next.leads.some(({ id }) => id === event.payload.leadId)) {
        throw new Error(`Lead ${event.payload.leadId} has already been accepted`);
      }
      next.leads.push({
        id: event.payload.leadId,
        kind: 'rumour',
        status: 'active',
        acceptedDay: event.atDay,
        expiresDay: event.atDay + LEADS[event.payload.leadId].expiresAfterDays,
      });
      next.lastEventId = event.id;
      break;
    }
    case 'market-traded': {
      const quote = quoteTrade(state, {
        portId: event.payload.portId,
        shipId: event.payload.shipId,
        cargoId: event.payload.cargoId,
        delta: event.payload.delta,
      });
      if (!quote.ok) {
        throw new Error(`Invalid market trade: ${quote.reason}`);
      }
      if (quote.unitPrice !== event.payload.unitPrice) {
        throw new Error(`Invalid market trade: expected unit price ${quote.unitPrice}, received ${event.payload.unitPrice}`);
      }
      const ship = next.fleet.ships.find(({ id }) => id === event.payload.shipId);
      if (!ship) throw new Error(`Invalid market trade: unknown ship ${event.payload.shipId}`);
      next.wealth.gold = quote.goldAfter;
      ship.cargo[event.payload.cargoId] = quote.quantityAfter;
      next.lastEventId = event.id;
      break;
    }
    case 'voyage-started': {
      if (state.mode.kind !== 'port' || state.mode.portId !== 'bridgetown') throw new Error('Invalid voyage: wrong predecessor');
      if (event.payload.voyageId !== `voyage-${event.id}`) throw new Error('Invalid voyage: wrong voyage ID');
      if (!state.leads.some((lead) => lead.id === 'red-jackdaw' && lead.status === 'active') || state.world.targetDefeated || !currentFlagship(state) || currentFlagship(state)!.cargo.provisions < 2) throw new Error('Invalid voyage: not ready');
      next.mode = { kind: 'sailing', voyageId: event.payload.voyageId, checkpoint: structuredClone(RED_JACKDAW_VOYAGE.start) };
      next.lastEventId = event.id;
      break;
    }
    case 'sea-leg-completed': {
      if (state.mode.kind !== 'sailing') throw new Error('Invalid voyage: wrong predecessor');
      if (event.payload.voyageId !== state.mode.voyageId || event.payload.encounterId !== `${state.mode.voyageId}-contact` || !sameJson(event.payload.checkpoint, RED_JACKDAW_VOYAGE.contact) || event.payload.navigationRng.before !== state.rng.navigation || event.payload.navigationRng.after !== nextSeed(state.rng.navigation)) throw new Error('Invalid voyage: invalid sea leg');
      spendVoyageCost(next, RED_JACKDAW_VOYAGE.contact.elapsedDays, RED_JACKDAW_VOYAGE.contact.provisionsUsed);
      next.rng.navigation = event.payload.navigationRng.after;
      next.mode = { kind: 'encounter', voyageId: state.mode.voyageId, encounterId: event.payload.encounterId, returnCheckpoint: structuredClone(RED_JACKDAW_VOYAGE.contact) };
      next.lastEventId = event.id;
      break;
    }
    case 'encounter-avoided': {
      if (state.mode.kind !== 'encounter' || event.payload.voyageId !== state.mode.voyageId || event.payload.encounterId !== state.mode.encounterId) throw new Error('Invalid voyage: wrong predecessor');
      returnToBridgetown(next, event.id, { voyageId: state.mode.voyageId, battleId: null, result: 'avoided', outcome: null, returnedDay: 0 });
      break;
    }
    case 'naval-engaged': {
      if (state.mode.kind !== 'encounter') throw new Error('Invalid voyage: wrong predecessor');
      const ship = currentFlagship(state);
      if (!ship || event.payload.voyageId !== state.mode.voyageId || event.payload.encounterId !== state.mode.encounterId || event.payload.battleId !== `${state.mode.voyageId}-battle` || event.payload.navalRng.before !== state.rng.naval || event.payload.navalRng.after !== nextSeed(state.rng.naval)) throw new Error('Invalid voyage: invalid engagement');
      const expected = { battleId: event.payload.battleId, seed: event.payload.navalRng.after, player: { stableShipId: ship.id, name: ship.name, classId: ship.classId, hull: ship.hull, sails: ship.sails, crew: ship.crew, cannon: ship.cannon } };
      if (!sameJson(event.payload.input, createRedJackdawBattleInput(expected))) throw new Error('Invalid voyage: invalid battle input');
      next.rng.naval = event.payload.navalRng.after;
      next.mode = { kind: 'naval', voyageId: state.mode.voyageId, battleId: event.payload.battleId, input: structuredClone(event.payload.input), returnCheckpoint: structuredClone(RED_JACKDAW_VOYAGE.contact) };
      next.lastEventId = event.id;
      break;
    }
    case 'battle-withdrawn': {
      if (state.mode.kind !== 'naval' || event.payload.voyageId !== state.mode.voyageId || event.payload.battleId !== state.mode.battleId) throw new Error('Invalid voyage: wrong predecessor');
      returnToBridgetown(next, event.id, { voyageId: state.mode.voyageId, battleId: state.mode.battleId, result: 'withdrew', outcome: null, returnedDay: 0 });
      break;
    }
    case 'naval-resolved': {
      if (state.mode.kind !== 'naval' || event.payload.voyageId !== state.mode.voyageId || event.payload.battleId !== state.mode.battleId) throw new Error('Invalid voyage: wrong predecessor');
      const resolution = validateNavalResolution(state.mode.input, event.payload.resolution);
      if (!resolution.ok) throw new Error(`Invalid naval resolution: ${resolution.issues.join(', ')}`);
      const result = classifyResolution(resolution.value.outcome);
      returnToBridgetown(next, event.id, { voyageId: state.mode.voyageId, battleId: state.mode.battleId, result, outcome: structuredClone(resolution.value.outcome), returnedDay: 0 });
      break;
    }
    default:
      return assertNever(event);
  }

  const result = validateCampaign(next);
  if (!result.ok) {
    throw new Error(`Invalid campaign transition: ${formatIssues(result.issues)}`);
  }
  return result.value;
}
