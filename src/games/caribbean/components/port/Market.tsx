import { useRef, useState } from 'react';

import { CARGO_IDS } from '../../content/campaign';
import { BRIDGETOWN_MARKET, GOODS } from '../../content/market';
import { SLOOP_CLASS } from '../../content/naval';
import type { CargoId } from '../../content/types';
import {
  marketTradeDraft,
  priceCue,
  quoteTrade,
  shipHoldUsed,
  type TradeFailureReason,
  type TradeQuote,
} from '../../domain/economy';
import type { CampaignEventDraftFor } from '../../domain/events';
import { provisionsMonths } from '../../domain/selectors';
import type { CampaignStateV1, ShipState } from '../../domain/types';
import type { CampaignDispatchOutcome } from '../../state/useCaribbean';

export interface MarketProps {
  state: CampaignStateV1;
  busy: boolean;
  onTrade(draft: CampaignEventDraftFor<'market-traded'>): Promise<CampaignDispatchOutcome>;
}

type MarketPhase = 'idle' | 'saving' | 'success' | 'failure';

type MarketActionId = 'sell-all' | 'sell-5' | 'sell-1' | 'buy-1' | 'buy-5' | 'buy-max';

interface MarketActionDefinition {
  id: MarketActionId;
  label: string;
  accessibleVerb: string;
}

interface MarketActionView extends MarketActionDefinition {
  disabled: boolean;
  reason: string | null;
}

const MARKET_ACTIONS = [
  { id: 'sell-all', label: 'Sell all', accessibleVerb: 'Sell all' },
  { id: 'sell-5', label: '−5', accessibleVerb: 'Sell 5' },
  { id: 'sell-1', label: '−1', accessibleVerb: 'Sell 1' },
  { id: 'buy-1', label: '+1', accessibleVerb: 'Buy 1' },
  { id: 'buy-5', label: '+5', accessibleVerb: 'Buy 5' },
  { id: 'buy-max', label: 'Max', accessibleVerb: 'Buy maximum' },
] as const satisfies readonly MarketActionDefinition[];

const PRICE_LABELS = {
  cheap: 'Cheap',
  fair: 'Fair',
  expensive: 'Expensive',
} as const;

function flagship(state: CampaignStateV1): ShipState | null {
  return state.fleet.ships.find((ship) => ship.id === state.fleet.flagshipId) ?? null;
}

function requestQuote(
  state: CampaignStateV1,
  ship: ShipState,
  cargoId: CargoId,
  delta: number,
): TradeQuote {
  return quoteTrade(state, {
    portId: 'bridgetown',
    shipId: ship.id,
    cargoId,
    delta,
  });
}

function maximumBuyQuantity(state: CampaignStateV1, ship: ShipState, cargoId: CargoId): number {
  let low = 0;
  let high = SLOOP_CLASS.hold;
  while (low < high) {
    const middle = Math.floor((low + high + 1) / 2);
    if (requestQuote(state, ship, cargoId, middle).ok) low = middle;
    else high = middle - 1;
  }
  return low;
}

function actionDelta(
  state: CampaignStateV1,
  ship: ShipState,
  cargoId: CargoId,
  actionId: MarketActionId,
): number {
  const owned = ship.cargo[cargoId];
  switch (actionId) {
    case 'sell-all': return -owned;
    case 'sell-5': return -5;
    case 'sell-1': return -1;
    case 'buy-1': return 1;
    case 'buy-5': return 5;
    case 'buy-max': return maximumBuyQuantity(state, ship, cargoId);
  }
}

function failureReason(
  reason: TradeFailureReason,
  owned: number,
): string {
  switch (reason) {
    case 'insufficient-cargo': return owned === 0 ? 'None aboard to sell.' : `Only ${owned} aboard.`;
    case 'insufficient-gold': return 'Not enough gold.';
    case 'insufficient-space': return 'Not enough hold space.';
    case 'not-in-port': return 'Trading is available only in port.';
    case 'wrong-port': return 'This price is available only in Bridgetown.';
    case 'unknown-ship': return 'The flagship record is unavailable.';
    case 'invalid-quantity': return 'That quantity cannot be traded.';
    case 'gold-overflow': return 'That trade exceeds the safe gold limit.';
  }
}

function actionView(
  state: CampaignStateV1,
  ship: ShipState,
  cargoId: CargoId,
  action: MarketActionDefinition,
): MarketActionView {
  const owned = ship.cargo[cargoId];
  const delta = actionDelta(state, ship, cargoId, action.id);
  if (delta === 0) {
    if (action.id === 'sell-all') {
      return { ...action, disabled: true, reason: 'None aboard to sell.' };
    }
    const nextUnit = requestQuote(state, ship, cargoId, 1);
    return {
      ...action,
      disabled: true,
      reason: nextUnit.ok ? 'That quantity cannot be traded.' : failureReason(nextUnit.reason, owned),
    };
  }
  const quote = requestQuote(state, ship, cargoId, delta);
  return quote.ok
    ? { ...action, disabled: false, reason: null }
    : { ...action, disabled: true, reason: failureReason(quote.reason, owned) };
}

function PriceCue({ cargoId }: { cargoId: CargoId }) {
  const cue = priceCue(
    BRIDGETOWN_MARKET.unitPrices[cargoId],
    GOODS[cargoId].baselinePrice,
  );
  return (
    <span className={`caribbean-market-price-cue caribbean-market-price-cue--${cue}`} data-testid={`${cargoId}-price-cue`}>
      <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false">
        <path d="M3 2h9l3 4.5-3 4.5H3z" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="M3 2v14" fill="none" stroke="currentColor" strokeWidth="1.7" />
      </svg>
      <span>{PRICE_LABELS[cue]}</span>
    </span>
  );
}

function ProvisionSeverity({ months }: { months: number | null }) {
  const severity = months !== null && months < 0.5
    ? 'critical'
    : months !== null && months < 1
      ? 'low'
      : null;
  if (severity === null) return null;
  return (
    <span
      className={`caribbean-market-severity caribbean-market-severity--${severity}`}
      data-testid="market-provisions-severity"
      data-severity={severity}
    >
      <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false">
        {severity === 'critical'
          ? <path d="M9 1.5 16.5 9 9 16.5 1.5 9Z" fill="none" stroke="currentColor" strokeWidth="2" />
          : <circle cx="9" cy="9" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />}
      </svg>
      <span>{severity === 'critical' ? 'Critical' : 'Low'}</span>
    </span>
  );
}

function CargoRow({
  state,
  ship,
  cargoId,
  busy,
  phase,
  retainedActionId,
  onTrade,
  onSettleFocus,
}: {
  state: CampaignStateV1;
  ship: ShipState;
  cargoId: CargoId;
  busy: boolean;
  phase: MarketPhase;
  retainedActionId: string | null;
  onTrade(draft: CampaignEventDraftFor<'market-traded'>, actionTestId: string): Promise<void>;
  onSettleFocus(testId: string): void;
}) {
  const good = GOODS[cargoId];
  const actions = MARKET_ACTIONS.map((action) => actionView(state, ship, cargoId, action));
  const reasonIds = new Map<string, string>();
  for (const action of actions) {
    if (action.reason !== null && !reasonIds.has(action.reason)) {
      reasonIds.set(action.reason, `market-${cargoId}-reason-${reasonIds.size + 1}`);
    }
  }

  const trade = (actionId: MarketActionId, testId: string, disabled: boolean): void => {
    if (busy || phase === 'saving' || disabled) return;
    const currentShip = flagship(state);
    if (currentShip === null) return;
    const delta = actionDelta(state, currentShip, cargoId, actionId);
    if (delta === 0) return;
    const freshQuote = requestQuote(state, currentShip, cargoId, delta);
    if (!freshQuote.ok) return;
    void onTrade(marketTradeDraft(freshQuote), testId);
  };

  return (
    <li className="caribbean-market-row" data-cargo-id={cargoId}>
      <div className="caribbean-market-good">
        <h3>{good.name}</h3>
        <span>{ship.cargo[cargoId]} owned</span>
      </div>
      <div className="caribbean-market-quote">
        <strong>{BRIDGETOWN_MARKET.unitPrices[cargoId]} gold / unit</strong>
        <PriceCue cargoId={cargoId} />
      </div>
      <div className="caribbean-market-command">
        <div className="caribbean-market-actions" data-testid={`market-${cargoId}-actions`}>
          {actions.map((action) => (
            (() => {
              const testId = `market-${cargoId}-${action.id}`;
              const retained = retainedActionId === testId;
              const guarded = phase === 'saving' || retained && phase !== 'idle' && action.disabled;
              const disabled = !retained && (busy || phase === 'saving' || action.disabled);
              return (
                <button
                  key={action.id}
                  className="caribbean-market-action"
                  data-testid={testId}
                  type="button"
                  disabled={disabled}
                  aria-disabled={guarded || undefined}
                  aria-label={`${action.accessibleVerb} ${good.name}`}
                  aria-describedby={action.reason === null ? undefined : reasonIds.get(action.reason)}
                  onFocus={() => onSettleFocus(testId)}
                  onKeyDown={(event) => {
                    if (guarded && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
                  }}
                  onClick={() => trade(action.id, testId, action.disabled || guarded)}
                >
                  {action.label}
                </button>
              );
            })()
          ))}
        </div>
        <div className="caribbean-market-reasons">
          {[...reasonIds].map(([reason, id]) => <span id={id} key={id}>{reason}</span>)}
        </div>
      </div>
    </li>
  );
}

export function Market({ state, busy, onTrade }: MarketProps) {
  const [phase, setPhase] = useState<MarketPhase>('idle');
  const [retainedActionId, setRetainedActionId] = useState<string | null>(null);
  const savingRef = useRef(false);
  const ship = flagship(state);
  if (ship === null) return <p className="caribbean-alert" role="alert">The flagship record is unavailable.</p>;
  const months = provisionsMonths(state);
  const holdUsed = shipHoldUsed(ship);

  const startTrade = async (
    draft: CampaignEventDraftFor<'market-traded'>,
    actionTestId: string,
  ): Promise<void> => {
    if (savingRef.current || busy) return;
    savingRef.current = true;
    setRetainedActionId(actionTestId);
    setPhase('saving');
    try {
      const outcome = await onTrade(draft);
      setPhase(outcome.kind === 'applied' ? 'success' : 'failure');
    } catch {
      setPhase('failure');
    } finally {
      savingRef.current = false;
    }
  };

  const settleFocus = (testId: string): void => {
    if (phase !== 'saving' && phase !== 'idle' && retainedActionId !== testId) {
      setRetainedActionId(null);
      setPhase('idle');
    }
  };

  return (
    <section className="caribbean-market" data-testid="caribbean-market" aria-busy={phase === 'saving'}>
      <p className="caribbean-market-status" data-testid="caribbean-market-status" aria-live="polite">
        {phase === 'idle' ? '' : phase === 'saving' ? 'Saving trade.'
          : phase === 'success' ? 'Cargo ledger updated.' : 'Trade was not saved.'}
      </p>
      <dl className="caribbean-market-summary" role="region" aria-label="Cargo summary">
        <div><dt>Gold</dt><dd>{state.wealth.gold} gold</dd></div>
        <div><dt>Flagship hold</dt><dd>{holdUsed} / {SLOOP_CLASS.hold} hold</dd></div>
        <div>
          <dt>Provisions</dt>
          <dd>
            <span>{months === null ? '— months' : `${months.toFixed(1)} months`}</span>
            <ProvisionSeverity months={months} />
          </dd>
        </div>
      </dl>
      <ul className="caribbean-market-goods" aria-label="Cargo goods">
        {CARGO_IDS.map((cargoId) => (
          <CargoRow
            key={cargoId}
            state={state}
            ship={ship}
            cargoId={cargoId}
            busy={busy}
            phase={phase}
            retainedActionId={retainedActionId}
            onTrade={startTrade}
            onSettleFocus={settleFocus}
          />
        ))}
      </ul>
    </section>
  );
}
