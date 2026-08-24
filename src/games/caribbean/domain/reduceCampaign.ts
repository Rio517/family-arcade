import { LEADS } from '../content/campaign';
import { quoteTrade } from './economy';
import {
  type CampaignEvent,
  validateCampaignEvent,
} from './events';
import type { CampaignStateV1, ValidationIssue } from './types';
import { validateCampaign } from './validateCampaign';

function formatIssues(issues: readonly ValidationIssue[]): string {
  return issues.map(({ path, code }) => `${path}:${code}`).join(', ');
}

function assertNever(value: never): never {
  throw new Error(`Unhandled campaign event: ${String(value)}`);
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
    default:
      return assertNever(event);
  }

  const result = validateCampaign(next);
  if (!result.ok) {
    throw new Error(`Invalid campaign transition: ${formatIssues(result.issues)}`);
  }
  return result.value;
}
