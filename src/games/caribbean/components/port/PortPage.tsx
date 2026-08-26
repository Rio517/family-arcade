import { useCallback, useEffect, useRef } from 'react';

import { useDismissOnEscape } from '@shared/ui/useDismissOnEscape';
import { BRIDGETOWN } from '../../content/campaign';
import { provisionsMonths } from '../../domain/selectors';
import type { CampaignStateV1, PortActivity } from '../../domain/types';
import { voyageReadiness } from '../../domain/voyage';
import type { CaribbeanController } from '../../state/useCaribbean';
import '../../styles/port.css';
import { CaptainsLog } from '../log/CaptainsLog';
import { DivideShares } from './DivideShares';
import { GovernorHouse } from './GovernorHouse';
import { Market } from './Market';
import { PortBackdrop } from './PortBackdrop';
import { PortMenu } from './PortMenu';
import { ShipyardSummary } from './ShipyardSummary';
import { Tavern } from './Tavern';

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

function ActivityContent({
  activity,
  state,
  controller,
}: {
  activity: OpenActivity;
  state: CampaignStateV1;
  controller: CaribbeanController;
}) {
  const flagship = state.fleet.ships.find((ship) => ship.id === state.fleet.flagshipId);
  switch (activity) {
    case 'governor':
      return <GovernorHouse state={state} />;
    case 'tavern':
      return <Tavern state={state} busy={controller.busy} onAccept={controller.dispatch} />;
    case 'market':
      return <Market state={state} busy={controller.busy} onTrade={controller.dispatch} />;
    case 'shipyard':
      return flagship === undefined
        ? <p>The flagship record is unavailable.</p>
        : <ShipyardSummary ship={flagship} />;
    case 'shares':
      return <DivideShares />;
    case 'log':
      return <CaptainsLog state={state} />;
  }
}

export function PortPage({ controller }: { controller: CaribbeanController }) {
  const state = controller.journal?.state;
  if (state === undefined) throw new Error('PortPage requires an active campaign journal');

  const flagship = state.fleet.ships.find((ship) => ship.id === state.fleet.flagshipId);
  const months = provisionsMonths(state);
  const readiness = voyageReadiness(state);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const triggerRefs = useRef<Partial<Record<OpenActivity, HTMLButtonElement | null>>>({});
  const setSailRef = useRef<HTMLButtonElement | null>(null);
  const previousActivityRef = useRef(controller.activity);
  const initialFocusAppliedRef = useRef(false);
  const acknowledgedFocusRef = useRef(false);
  const { acknowledgePortFocus, portFocusTarget } = controller;

  useEffect(() => {
    const previous = previousActivityRef.current;
    previousActivityRef.current = controller.activity;
    if (controller.activity === 'menu') {
      if (portFocusTarget === 'last-voyage' && !acknowledgedFocusRef.current) {
        initialFocusAppliedRef.current = true;
        triggerRefs.current.log?.focus();
        acknowledgedFocusRef.current = true;
        acknowledgePortFocus();
      } else if (previous !== 'menu') {
        triggerRefs.current[previous]?.focus();
      } else if (!initialFocusAppliedRef.current) {
        initialFocusAppliedRef.current = true;
        if (readiness.kind === 'ready') setSailRef.current?.focus();
        else if (state.world.lastVoyage !== undefined) triggerRefs.current.log?.focus();
        else headingRef.current?.focus();
      }
      return;
    }
    headingRef.current?.focus();
  }, [controller.activity, portFocusTarget, acknowledgePortFocus, readiness.kind, state.world.lastVoyage]);

  const registerTrigger = useCallback((activity: OpenActivity, element: HTMLButtonElement | null) => {
    triggerRefs.current[activity] = element;
  }, []);

  const activeActivity = controller.activity === 'menu' ? null : controller.activity;
  const closeActivity = controller.closeActivity;
  useDismissOnEscape(activeActivity !== null, closeActivity);
  const heading = activeActivity === null
    ? 'Choose your next port action'
    : ACTIVITY_LABELS[activeActivity];
  const closeControl = activeActivity === null ? null : (
    <button
      className="caribbean-port-close"
      data-testid="port-close-activity"
      type="button"
      onClick={closeActivity}
    >
      {activeActivity === 'market' ? 'Done' : 'Back to harbour'}
    </button>
  );

  return (
    <section
      className="caribbean-port"
      data-testid="caribbean-career-ready"
      aria-labelledby="caribbean-port-title"
    >
      <PortBackdrop />
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

      <div className="caribbean-port-horizon" aria-hidden="true" />

      <div className={`caribbean-port-stage${activeActivity === 'market' ? ' caribbean-port-stage--market' : ''}`}>
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
              <ActivityContent activity={activeActivity} state={state} controller={controller} />
              {closeControl}
            </>
          )}
        </section>
      </div>

      <PortMenu
        activeActivity={controller.activity}
        readiness={readiness}
        busy={controller.busy}
        onSetSail={controller.setSail}
        onSelect={controller.selectActivity}
        registerTrigger={registerTrigger}
        registerSetSailTrigger={(element) => { setSailRef.current = element; }}
      />
    </section>
  );
}
