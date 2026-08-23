import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RotateIcon, WarningIcon } from '@shared/ui/icons';
import { useDismissOnEscape } from '@shared/ui/useDismissOnEscape';

import type {
  Broadside,
  NavalOutcome,
  Rudder,
} from '../../domain/naval/types';
import type { NavalSessionView } from '../../state/naval/NavalSession';
import { BattleHud } from './BattleHud';
import { HtmlTacticalChart } from './HtmlTacticalChart';

export type NavalSceneFactory = () => Promise<unknown>;

export interface NavalBattlePageProps {
  session: NavalSessionView;
  sceneFactory?: NavalSceneFactory | null;
  onResolved?(outcome: NavalOutcome): void;
}

function useSessionSnapshot(session: NavalSessionView) {
  return useSyncExternalStore(
    (listener) => session.subscribe(listener),
    () => session.getSnapshot(),
    () => session.getSnapshot(),
  );
}

function outcomeKey(outcome: NavalOutcome): string {
  return JSON.stringify(outcome);
}

function outcomeCopy(outcome: NavalOutcome): { heading: string; detail: string } {
  if (outcome.kind === 'boarding-ready') {
    return { heading: 'Ready to board', detail: 'The prize is disabled and close enough to take.' };
  }
  if (outcome.kind === 'surrender') {
    return { heading: 'Colours struck', detail: 'The opposing crew has surrendered the Red Jackdaw.' };
  }
  if (outcome.kind === 'sunk') {
    return outcome.victorShipId === 'player'
      ? { heading: 'Red Jackdaw sunk', detail: 'The prize is lost beneath the trade wind.' }
      : { heading: 'Mistral lost', detail: 'Your hull can no longer carry the fight.' };
  }
  if (outcome.kind === 'escaped') {
    return { heading: 'Ship escaped', detail: 'The duel crossed the Battle Lab boundary.' };
  }
  return { heading: 'Ships separated', detail: 'The engagement ended without a decisive capture.' };
}

function CannonIcon() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <path d="m5 11 13-5 2 5-13 5-2-5ZM9 16l3 4M18 12l3 4M6 22h17" />
      <circle cx="11" cy="21" r="2" />
      <circle cx="20" cy="19" r="2" />
    </svg>
  );
}

function TacticalViewport({ state, sceneFactory }: Pick<NavalBattlePageProps, 'sceneFactory'> & { state: NavalSessionView['state'] }) {
  const [failed, setFailed] = useState(sceneFactory === null || sceneFactory === undefined);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!sceneFactory) return;
    let active = true;
    void sceneFactory().then(
      () => { if (active) setReady(true); },
      () => { if (active) setFailed(true); },
    );
    return () => { active = false; };
  }, [sceneFactory]);

  if (failed) return <HtmlTacticalChart state={state} unavailable />;
  if (ready) return <div className="naval-scene-slot" data-testid="naval-scene-slot" />;
  return <div className="naval-chart naval-chart--loading" role="status">Preparing tactical sea…</div>;
}

export function NavalBattlePage({ session, sceneFactory = null, onResolved }: NavalBattlePageProps) {
  const snapshot = useSessionSnapshot(session);
  const { state, currentCommand, paused, diagnostic } = snapshot;
  const resolvedRef = useRef<string | null>(null);
  const held = useRef({ port: false, starboard: false });

  useEffect(() => {
    if (!state.outcome || diagnostic || !onResolved) return;
    const key = outcomeKey(state.outcome);
    if (resolvedRef.current === key) return;
    resolvedRef.current = key;
    onResolved(state.outcome);
  }, [diagnostic, onResolved, state.outcome]);

  useDismissOnEscape(paused && !diagnostic, () => session.togglePause());

  useEffect(() => {
    const rudderFromHeld = (): Rudder => {
      if (held.current.port === held.current.starboard) return 0;
      return held.current.port ? -1 : 1;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape' && event.repeat) {
        event.stopImmediatePropagation();
        return;
      }
      if (event.repeat && (event.code === 'KeyQ' || event.code === 'KeyE' || event.code === 'Space')) return;
      if (event.code === 'KeyQ') session.requestFire('port');
      if (event.code === 'KeyE') session.requestFire('starboard');
      if (event.code === 'KeyA' || event.code === 'ArrowLeft') held.current.port = true;
      if (event.code === 'KeyD' || event.code === 'ArrowRight') held.current.starboard = true;
      if (event.code === 'KeyA' || event.code === 'ArrowLeft' || event.code === 'KeyD' || event.code === 'ArrowRight') {
        session.setRudder(rudderFromHeld());
      }
      if (event.code === 'Digit1') session.setAmmunition('round');
      if (event.code === 'Digit2') session.setAmmunition('chain');
      if (event.code === 'Digit3') session.setAmmunition('grape');
      if (event.code === 'KeyR') session.setSail(currentCommand.sail === 'full' ? 'reefed' : 'full');
      if (event.code === 'Space') {
        event.preventDefault();
        session.togglePause();
      }
      if (event.code === 'Escape' && !paused && !diagnostic) session.togglePause();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'KeyA' || event.code === 'ArrowLeft') held.current.port = false;
      if (event.code === 'KeyD' || event.code === 'ArrowRight') held.current.starboard = false;
      if (event.code === 'KeyA' || event.code === 'ArrowLeft' || event.code === 'KeyD' || event.code === 'ArrowRight') {
        session.setRudder(rudderFromHeld());
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [currentCommand.sail, diagnostic, paused, session]);

  const holdRudder = (side: 'port' | 'starboard', active: boolean) => {
    held.current[side] = active;
    const rudder: Rudder = held.current.port === held.current.starboard ? 0 : held.current.port ? -1 : 1;
    session.setRudder(rudder);
  };

  const outcome = state.outcome ? outcomeCopy(state.outcome) : null;

  return (
    <section className="naval-battle-page" data-testid="naval-battle-page" aria-label="Caribbean naval battle">
      <BattleHud state={state} paused={paused} onTogglePause={() => session.togglePause()} />

      <div className="naval-command-deck">
        <FireControl side="port" onFire={() => session.requestFire('port')} disabled={Boolean(outcome || diagnostic)} />
        <div className="naval-tactical-center">
          <TacticalViewport state={state} sceneFactory={sceneFactory} />
          <div className="naval-steering" aria-label="Rudder controls">
            <RudderControl side="port" onHold={holdRudder} />
            <div className="naval-steering__keel"><span>Rudder</span><strong>A / D</strong></div>
            <RudderControl side="starboard" onHold={holdRudder} />
          </div>
        </div>
        <FireControl side="starboard" onFire={() => session.requestFire('starboard')} disabled={Boolean(outcome || diagnostic)} />
      </div>

      <div className="naval-order-controls">
        <OrderGroup label="Sail setting">
          {(['full', 'reefed'] as const).map((sail) => (
            <button
              key={sail}
              type="button"
              className="naval-control naval-hit-target"
              data-testid={`naval-sail-${sail}`}
              aria-pressed={currentCommand.sail === sail}
              onClick={() => session.setSail(sail)}
            >{sail === 'full' ? 'Full sail' : 'Reefed'}</button>
          ))}
        </OrderGroup>
        <OrderGroup label="Ammunition">
          {(['round', 'chain', 'grape'] as const).map((ammunition) => (
            <button
              key={ammunition}
              type="button"
              className="naval-control naval-hit-target"
              data-testid={`naval-ammo-${ammunition}`}
              aria-pressed={currentCommand.ammunition === ammunition}
              onClick={() => session.setAmmunition(ammunition)}
            >{ammunition.charAt(0).toUpperCase() + ammunition.slice(1)}</button>
          ))}
        </OrderGroup>
        <button
          type="button"
          className="naval-control naval-hit-target naval-restart"
          data-testid="naval-restart"
          onClick={() => session.restart()}
        ><RotateIcon size={18} /> Restart duel</button>
      </div>

      {paused && !diagnostic && !outcome && (
        <div className="naval-pause-banner" role="status">Battle paused <span>Escape or Resume continues</span></div>
      )}

      {diagnostic && (
        <div className="naval-diagnostic" role="alert">
          <WarningIcon size={28} />
          <div><strong>Battle state drift detected</strong><span>{diagnostic.issues.join(', ')}</span></div>
          <button
            type="button"
            className="naval-control naval-hit-target"
            data-testid="naval-restart-input"
            onClick={() => session.restart()}
          >Restart from Battle Lab input</button>
        </div>
      )}

      {outcome && !diagnostic && (
        <div className="naval-result" role="status">
          <span>Battle Lab result</span>
          <h2>{outcome.heading}</h2>
          <p>{outcome.detail}</p>
          <button
            type="button"
            className="naval-control naval-hit-target"
            data-testid="naval-result-restart"
            onClick={() => session.restart()}
          ><RotateIcon size={18} /> Restart duel</button>
        </div>
      )}
    </section>
  );
}

function FireControl({ side, onFire, disabled }: { side: Broadside; onFire(): void; disabled: boolean }) {
  const isPort = side === 'port';
  return (
    <button
      type="button"
      className={`naval-control naval-hit-target naval-fire-control naval-fire-control--${side}`}
      data-testid={`naval-fire-${side}`}
      onClick={onFire}
      disabled={disabled}
    >
      <span className="naval-fire-control__key">{isPort ? 'Q' : 'E'}</span>
      <CannonIcon />
      <strong>Fire {side}</strong>
      <span>{isPort ? 'Port battery' : 'Starboard battery'}</span>
    </button>
  );
}

function RudderControl({ side, onHold }: { side: 'port' | 'starboard'; onHold(side: 'port' | 'starboard', active: boolean): void }) {
  const value: Rudder = side === 'port' ? -1 : 1;
  const pulse = () => {
    onHold(side, true);
    window.setTimeout(() => onHold(side, false), 140);
  };
  return (
    <button
      type="button"
      className="naval-control naval-hit-target naval-rudder-control"
      data-testid={`naval-rudder-${side}`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        onHold(side, true);
      }}
      onPointerUp={() => onHold(side, false)}
      onPointerCancel={() => onHold(side, false)}
      onLostPointerCapture={() => onHold(side, false)}
      onClick={(event) => {
        if (event.detail === 0) pulse();
      }}
      aria-label={`Turn ${side}`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d={value < 0 ? 'M19 5 7 12l12 7M7 12h14' : 'm5 5 12 7-12 7M17 12H3'} /></svg>
      <span>Turn {side}</span>
    </button>
  );
}

function OrderGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return <fieldset className="naval-order-group"><legend>{label}</legend><div>{children}</div></fieldset>;
}
