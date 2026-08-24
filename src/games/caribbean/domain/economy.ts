import { CARGO_IDS, FITTINGS, isCargoId } from '../content/campaign';
import { SLOOP_CLASS } from '../content/naval';
import { BRIDGETOWN_MARKET } from '../content/market';
import type { CargoId, PortId } from '../content/types';
import type { CampaignEventDraftFor } from './events';
import type { CampaignStateV1, ShipState } from './types';

export type TradeRequest = {
  portId: PortId;
  shipId: string;
  cargoId: CargoId;
  delta: number;
};

export type TradeFailureReason =
  | 'not-in-port' | 'wrong-port' | 'unknown-ship' | 'invalid-quantity'
  | 'insufficient-gold' | 'insufficient-cargo' | 'insufficient-space'
  | 'gold-overflow';

export type TradeQuote =
  | {
      ok: true;
      request: TradeRequest;
      unitPrice: number;
      goldDelta: number;
      goldAfter: number;
      quantityAfter: number;
      holdUsedAfter: number;
      holdCapacity: number;
    }
  | { ok: false; reason: TradeFailureReason };

function failed(reason: TradeFailureReason): TradeQuote {
  return { ok: false, reason };
}

export function shipHoldUsed(ship: ShipState): number {
  return CARGO_IDS.reduce((used, cargoId) => used + ship.cargo[cargoId], 0)
    + ship.cannon * 2
    + ship.fittings.reduce((penalty, fittingId) => penalty + FITTINGS[fittingId].holdPenalty, 0);
}

export function quoteTrade(state: CampaignStateV1, request: TradeRequest): TradeQuote {
  if (state.mode.kind !== 'port') return failed('not-in-port');
  if (state.mode.portId !== request.portId || request.portId !== BRIDGETOWN_MARKET.portId) return failed('wrong-port');
  const ship = state.fleet.ships.find(({ id }) => id === request.shipId);
  if (!ship) return failed('unknown-ship');
  if (!isCargoId(request.cargoId) || !Number.isSafeInteger(request.delta) || request.delta === 0) {
    return failed('invalid-quantity');
  }

  const unitPrice = BRIDGETOWN_MARKET.unitPrices[request.cargoId];
  const magnitude = Math.abs(request.delta);
  const value = magnitude * unitPrice;
  if (!Number.isSafeInteger(value)) return failed('gold-overflow');
  const goldDelta = request.delta > 0 ? -value : value;
  if (!Number.isSafeInteger(goldDelta)) return failed('gold-overflow');
  const goldAfter = state.wealth.gold + goldDelta;
  if (!Number.isSafeInteger(goldAfter)) return failed('gold-overflow');

  const quantityAfter = ship.cargo[request.cargoId] + request.delta;
  if (!Number.isSafeInteger(quantityAfter)) return failed('invalid-quantity');
  if (request.delta > 0 && goldAfter < 0) return failed('insufficient-gold');
  if (request.delta < 0 && quantityAfter < 0) return failed('insufficient-cargo');

  const holdUsedAfter = shipHoldUsed(ship) + request.delta;
  if (request.delta > 0 && holdUsedAfter > SLOOP_CLASS.hold) return failed('insufficient-space');
  return {
    ok: true,
    request: { ...request },
    unitPrice,
    goldDelta,
    goldAfter,
    quantityAfter,
    holdUsedAfter,
    holdCapacity: SLOOP_CLASS.hold,
  };
}

export function marketTradeDraft(
  quote: Extract<TradeQuote, { ok: true }>,
): CampaignEventDraftFor<'market-traded'> {
  return {
    type: 'market-traded',
    payload: {
      portId: quote.request.portId,
      shipId: quote.request.shipId,
      cargoId: quote.request.cargoId,
      delta: quote.request.delta,
      unitPrice: quote.unitPrice,
    },
  };
}

export function priceCue(price: number, baseline: number): 'cheap' | 'fair' | 'expensive' {
  const ratio = price / baseline;
  if (ratio <= 0.85) return 'cheap';
  if (ratio >= 1.15) return 'expensive';
  return 'fair';
}
