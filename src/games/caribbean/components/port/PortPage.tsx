import { useCallback, useEffect, useRef } from 'react';

import { useDismissOnEscape } from '@shared/ui/useDismissOnEscape';
import { BRIDGETOWN } from '../../content/campaign';
import { provisionsMonths } from '../../domain/selectors';
import type { CampaignStateV1, PortActivity } from '../../domain/types';
import type { CaribbeanController } from '../../state/useCaribbean';
import '../../styles/port.css';
import { DivideShares } from './DivideShares';
import { GovernorHouse } from './GovernorHouse';
import { PortMenu } from './PortMenu';
import { ShipyardSummary } from './ShipyardSummary';

type OpenActivity = Exclude<PortActivity, 'menu'>;

const ACTIVITY_LABELS = {
  governor: "Governor's House",
  tavern: 'Tavern',
  market: 'Market',
  shipyard: 'Shipyard',
  shares: 'Divide Shares',
  log: "Captain's Log",
} as const satisfies Record<OpenActivity, string>;

function titleCase(value: string): string {
  return value.split('-').map((part) => `${part[0]?.toUpperCase()}${part.slice(1)}`).join(' ');
}

function ActivityContent({ activity, state }: { activity: OpenActivity; state: CampaignStateV1 }) {
  const flagship = state.fleet.ships.find((ship) => ship.id === state.fleet.flagshipId);
  switch (activity) {
    case 'governor':
      return <GovernorHouse state={state} />;
    case 'tavern':
      return (
        <div className="caribbean-port-stub">
          <p className="caribbean-port-lede">Hear concise leads from Bridgetown’s waterfront.</p>
          <p>The taproom is open; its first chart-worthy rumour arrives in the next package.</p>
        </div>
      );
    case 'market':
      return (
        <div className="caribbean-port-stub">
          <p className="caribbean-port-lede">Compare six cargo prices and their hold impact.</p>
          <p>Bridgetown’s fixed-price market opens for trading in the next package.</p>
        </div>
      );
    case 'shipyard':
      return flagship === undefined
        ? <p>The flagship record is unavailable.</p>
        : <ShipyardSummary ship={flagship} />;
    case 'shares':
      return <DivideShares />;
    case 'log':
      return (
        <div className="caribbean-port-stub">
          <p className="caribbean-port-lede">Review one clear next action for every active lead.</p>
          <p>No lead has been marked on the chart yet.</p>
        </div>
      );
  }
}

export function PortPage({ controller }: { controller: CaribbeanController }) {
  const state = controller.journal?.state;
  if (state === undefined) throw new Error('PortPage requires an active campaign journal');

  const flagship = state.fleet.ships.find((ship) => ship.id === state.fleet.flagshipId);
  const months = provisionsMonths(state);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const triggerRefs = useRef<Partial<Record<OpenActivity, HTMLButtonElement | null>>>({});
  const previousActivityRef = useRef(controller.activity);

  useEffect(() => {
    const previous = previousActivityRef.current;
    previousActivityRef.current = controller.activity;
    if (controller.activity === 'menu') {
      if (previous !== 'menu') triggerRefs.current[previous]?.focus();
      return;
    }
    headingRef.current?.focus();
  }, [controller.activity]);

  const registerTrigger = useCallback((activity: OpenActivity, element: HTMLButtonElement | null) => {
    triggerRefs.current[activity] = element;
  }, []);

  const activeActivity = controller.activity === 'menu' ? null : controller.activity;
  const closeActivity = controller.closeActivity;
  useDismissOnEscape(activeActivity !== null, closeActivity);
  const heading = activeActivity === null
    ? 'Choose your next port action'
    : ACTIVITY_LABELS[activeActivity];

  return (
    <section
      className="caribbean-port"
      data-testid="caribbean-career-ready"
      aria-labelledby="caribbean-port-title"
    >
      <header className="caribbean-port-status-rail" role="region" aria-label="Voyage status">
        <p className="caribbean-port-position">
          <span>{BRIDGETOWN.name}</span>
          <strong>{state.calendar.startYear}</strong>
        </p>
        <dl>
          <div><dt>Gold</dt><dd>{state.wealth.gold} gold</dd></div>
          <div><dt>Crew</dt><dd>{flagship?.crew ?? 0} aboard</dd></div>
          <div><dt>Morale</dt><dd>{titleCase(state.crew.morale)}</dd></div>
          <div><dt>{flagship?.name ?? 'Flagship'}</dt><dd>Hull {flagship?.hull ?? 0} · Sails {flagship?.sails ?? 0}</dd></div>
          <div><dt>Provisions</dt><dd>{months === null ? '—' : months.toFixed(1)} months</dd></div>
        </dl>
      </header>

      <div className="caribbean-port-horizon" aria-hidden="true"><span /></div>

      <div className="caribbean-port-stage">
        <p className="caribbean-port-captain">Captain {state.captain.name}</p>
        <h1 id="caribbean-port-title">Bridgetown</h1>
        <section className="caribbean-port-activity" aria-label="Port activity">
          <p className="caribbean-port-bearing">
            {activeActivity === null ? 'Harbour course · seven calls' : `Port call · ${heading}`}
          </p>
          <h2 ref={headingRef} tabIndex={-1}>{heading}</h2>
          {activeActivity === null ? (
            <p className="caribbean-port-arrival">
              Mistral lies secure beneath the trade wind. Choose the next call from the harbour line.
            </p>
          ) : (
            <>
              <ActivityContent activity={activeActivity} state={state} />
              <button
                className="caribbean-port-close"
                data-testid="port-close-activity"
                type="button"
                onClick={closeActivity}
              >
                Back to harbour
              </button>
            </>
          )}
        </section>
      </div>

      <PortMenu
        activeActivity={controller.activity}
        onSelect={controller.selectActivity}
        registerTrigger={registerTrigger}
      />
    </section>
  );
}
