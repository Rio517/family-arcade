import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { RotateIcon, WarningIcon } from '@shared/ui/icons';
import { useDismissOnEscape } from '@shared/ui/useDismissOnEscape';

import type {
  Broadside,
  NavalOutcome,
  Rudder,
} from '../../domain/naval/types';
import type { NavalSessionView } from '../../state/naval/NavalSession';
import { BattleHud } from './BattleHud';
import { NavalViewport, type NavalSceneFactory } from './NavalViewport';

export type { NavalSceneFactory } from './NavalViewport';

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

export function NavalBattlePage({ session, sceneFactory, onResolved }: NavalBattlePageProps) {
  const snapshot = useSessionSnapshot(session);
  const { state, battleGeneration, currentCommand, paused, diagnostic } = snapshot;
  const resolvedRef = useRef<string | null>(null);
  const held = useRef({ port: false, starboard: false });
  const portFireRef = useRef<HTMLButtonElement>(null);
  const terminalActionRef = useRef<HTMLButtonElement>(null);
  const underlayRef = useRef<HTMLDivElement>(null);
  const terminal = Boolean(state.outcome || diagnostic);
  const clearHeldRudder = useCallback(() => {
    held.current = { port: false, starboard: false };
  }, []);

  useEffect(() => {
    if (!state.outcome) {
      resolvedRef.current = null;
      return;
    }
    if (diagnostic || !onResolved) return;
    const key = outcomeKey(state.outcome);
    if (resolvedRef.current === key) return;
    resolvedRef.current = key;
    onResolved(state.outcome);
  }, [diagnostic, onResolved, state.outcome]);

  useEffect(() => {
    const underlay = underlayRef.current;
    if (!underlay) return;
    if (terminal) underlay.setAttribute('inert', '');
    else underlay.removeAttribute('inert');

    if (terminal) terminalActionRef.current?.focus();
    else portFireRef.current?.focus();
  }, [terminal]);

  useEffect(() => {
    if (terminal) clearHeldRudder();
  }, [clearHeldRudder, terminal]);

  useEffect(() => {
    const releaseOnBlur = () => {
      const wasHeld = held.current.port || held.current.starboard;
      clearHeldRudder();
      if (wasHeld && !terminal) session.setRudder(0);
    };
    window.addEventListener('blur', releaseOnBlur);
    return () => {
      window.removeEventListener('blur', releaseOnBlur);
      clearHeldRudder();
    };
  }, [clearHeldRudder, session, terminal]);

  useDismissOnEscape(paused && !diagnostic, () => session.togglePause());

  useEffect(() => {
    const rudderFromHeld = (): Rudder => {
      if (held.current.port === held.current.starboard) return 0;
      return held.current.port ? -1 : 1;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (terminal) return;
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
      if (terminal) return;
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
  }, [currentCommand.sail, diagnostic, paused, session, state.outcome, terminal]);

  const holdRudder = (side: 'port' | 'starboard', active: boolean) => {
    if (terminal) {
      clearHeldRudder();
      return;
    }
    held.current[side] = active;
    const rudder: Rudder = held.current.port === held.current.starboard ? 0 : held.current.port ? -1 : 1;
    session.setRudder(rudder);
  };

  const outcome = state.outcome ? outcomeCopy(state.outcome) : null;

  return (
    <section className="naval-battle-page" data-testid="naval-battle-page" aria-label="Caribbean naval battle">
      <div
        ref={underlayRef}
        className="naval-battle-underlay"
        data-testid="naval-battle-underlay"
        aria-hidden={terminal ? true : undefined}
      >
        <BattleHud state={state} paused={paused} onTogglePause={() => session.togglePause()} />

        <div className="naval-command-deck">
          <FireControl buttonRef={portFireRef} side="port" onFire={() => session.requestFire('port')} disabled={Boolean(outcome || diagnostic)} />
          <div className="naval-tactical-center">
            <NavalViewport
              state={state}
              events={state.events}
              battleGeneration={battleGeneration}
              sceneFactory={sceneFactory}
              onRestart={() => session.restart()}
            />
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
      </div>

      {diagnostic && (
        <div className="naval-diagnostic" role="dialog" aria-modal="true" aria-labelledby="naval-diagnostic-title">
          <WarningIcon size={28} />
          <div><strong id="naval-diagnostic-title">Battle state drift detected</strong><span>{diagnostic.issues.join(', ')}</span></div>
          <button
            ref={terminalActionRef}
            type="button"
            className="naval-control naval-hit-target"
            data-testid="naval-restart-input"
            onClick={() => session.restart()}
          >Restart from Battle Lab input</button>
        </div>
      )}

      {outcome && !diagnostic && (
        <div className="naval-result" role="dialog" aria-modal="true" aria-labelledby="naval-result-title">
          <span>Battle Lab result</span>
          <h2 id="naval-result-title">{outcome.heading}</h2>
          <p>{outcome.detail}</p>
          <button
            ref={terminalActionRef}
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

function FireControl({
  side,
  onFire,
  disabled,
  buttonRef,
}: {
  side: Broadside;
  onFire(): void;
  disabled: boolean;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  const isPort = side === 'port';
  return (
    <button
      ref={buttonRef}
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
