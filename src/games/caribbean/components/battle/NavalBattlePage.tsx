import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { RotateIcon, WarningIcon } from '@shared/ui/icons';
import { useDismissOnEscape } from '@shared/ui/useDismissOnEscape';

import type {
  Broadside,
  NavalEvent,
  NavalOutcome,
  NavalState,
  Rudder,
} from '../../domain/naval/types';
import type { NavalSessionView } from '../../state/naval/NavalSession';
import { BattleAudio, type AudioFactory } from '../../audio/BattleAudio';
import { BattleHud } from './BattleHud';
import { NavalViewport, type NavalSceneFactory } from './NavalViewport';
import { selectAimCue } from './aimCue';
import { pulseRudder } from './rudderPulse.mjs';

export type { NavalSceneFactory } from './NavalViewport';

export interface NavalResultAction {
  label: string;
  busy: boolean;
  activate(state: NavalState): void;
}

export interface NavalExitAction {
  label: string;
  busy: boolean;
  activate(): void;
}

export interface NavalResolutionErrorAction {
  message: 'Battle result could not be verified.';
  busy: boolean;
  restartLabel: 'Restart engagement';
  withdrawLabel: 'Withdraw to Bridgetown';
  restart(): void;
  withdraw(): void;
}

export interface NavalBattlePageProps {
  session: NavalSessionView;
  sceneFactory?: NavalSceneFactory | null;
  audioFactory?: AudioFactory;
  onResolved?(outcome: NavalOutcome): void;
  resultAction?: NavalResultAction;
  exitAction?: NavalExitAction;
  resolutionErrorAction?: NavalResolutionErrorAction;
  interactionBlocked?: boolean;
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

function isPlayerReloadReady(event: NavalEvent): event is Extract<NavalEvent, { kind: 'reload-ready' }> {
  return event.kind === 'reload-ready' && event.shipId === 'player';
}

function outcomeCopy(
  outcome: NavalOutcome,
  state: ReturnType<NavalSessionView['getSnapshot']>['state'],
  campaign: boolean,
): { heading: string; detail: string; action: string } {
  const player = state.ships.player;
  const target = state.ships.opponent;
  const range = Math.hypot(target.position.x - player.position.x, target.position.z - player.position.z).toFixed(1);
  if (outcome.kind === 'boarding-ready') {
    if (outcome.victorShipId === 'player') {
      return { heading: 'Ready to board', detail: `Capture summary: ${target.name} sails ${Math.round(target.sails)}%, crew ${Math.round(target.crew)}, range ${range}. The prize is disabled and close enough to take.`, action: 'Rematch Battle Lab' };
    }
    return { heading: `Boarding lost — ${player.name}`, detail: `${player.name}'s crew ${Math.round(player.crew)} cannot prevent ${target.name} from boarding at range ${range}.`, action: 'Restart Battle Lab' };
  }
  if (outcome.kind === 'surrender') {
    const surrendered = outcome.victorShipId === 'player' ? target : player;
    const won = outcome.victorShipId === 'player';
    return { heading: 'Surrender', detail: won
      ? `${surrendered.name} and crew surrendered with hull ${Math.round(surrendered.hull)}%, sails ${Math.round(surrendered.sails)}%, crew ${Math.round(surrendered.crew)}. Capture summary recorded.`
      : `${surrendered.name} and crew surrendered with hull ${Math.round(surrendered.hull)}% and crew ${Math.round(surrendered.crew)}. ${campaign ? 'Return to Bridgetown when ready.' : 'Return to the Battle Lab and restart the duel.'}`, action: won ? 'Rematch Battle Lab' : 'Restart Battle Lab' };
  }
  if (outcome.kind === 'sunk') {
    const sunk = outcome.victorShipId === 'player' ? target : player;
    return outcome.victorShipId === 'player'
      ? { heading: `Sunk — ${sunk.name}`, detail: `${sunk.name} reached hull 0. The prize is lost beneath the trade wind.`, action: 'Rematch Battle Lab' }
      : { heading: `Sunk — ${sunk.name}`, detail: `${sunk.name} reached hull 0. Your hull can no longer carry the fight.`, action: 'Restart Battle Lab' };
  }
  if (outcome.kind === 'escaped') {
    const ship = state.ships[outcome.shipId];
    const distance = Math.hypot(ship.position.x, ship.position.z).toFixed(1);
    return { heading: 'Escaped', detail: `${ship.name} crossed the ${state.input.arenaRadius}-unit boundary at radial range ${distance} while moving outward.`, action: 'Restart Battle Lab' };
  }
  if (outcome.kind === 'separated') {
    const separated = state.ships[outcome.shipId];
    return { heading: 'Separated', detail: `${separated.name} remained in an undecided engagement when tick ${state.tick} reached the ${state.input.timeLimitTicks}-tick limit.`, action: 'Restart Battle Lab' };
  }
  return { heading: 'Battle complete', detail: 'The engagement reached a decisive result.', action: 'Restart Battle Lab' };
}

function useReducedMotionPreference(): boolean {
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

export function NavalBattlePage({
  session,
  sceneFactory,
  audioFactory,
  onResolved,
  resultAction,
  exitAction,
  resolutionErrorAction,
  interactionBlocked = false,
}: NavalBattlePageProps) {
  const snapshot = useSessionSnapshot(session);
  const { state, battleGeneration, currentCommand, paused, diagnostic } = snapshot;
  const resolvedRef = useRef<string | null>(null);
  const held = useRef({ port: false, starboard: false });
  const portFireRef = useRef<HTMLButtonElement>(null);
  const terminalActionRef = useRef<HTMLButtonElement>(null);
  const terminalDialogRef = useRef<HTMLDivElement>(null);
  const underlayRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<BattleAudio | null>(null);
  const reloadAnnouncementRef = useRef<HTMLParagraphElement>(null);
  const reloadAnnouncementFrameRef = useRef<number | null>(null);
  const reloadAnnouncementKeyRef = useRef('');
  const resultActionGuardRef = useRef(false);
  const exitActionGuardRef = useRef(false);
  const resolutionRestartGuardRef = useRef(false);
  const resolutionWithdrawGuardRef = useRef(false);
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  const [sensory, setSensory] = useState({ aim: true, steeringHint: true, shake: true, reducedFlashes: false, effects: 0.9, muted: false });
  const reducedMotion = useReducedMotionPreference();
  const terminal = Boolean(state.outcome || diagnostic || resolutionErrorAction);
  const controlsBlocked = terminal || interactionBlocked;
  const effectiveShake = sensory.shake && !reducedMotion;
  const aimCue = sensory.aim ? selectAimCue(state, 'player') : null;
  const latestReload = [...state.events].reverse().find(isPlayerReloadReady);
  const reloadAnnouncementKey = `${battleGeneration}:${latestReload?.id ?? 'none'}`;
  const reloadAnnouncementMessage = latestReload
    ? `${latestReload.side === 'port' ? 'Port' : 'Starboard'} battery ready`
    : null;
  const activateAudio = useCallback(() => { void audioRef.current?.activate(); }, []);
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
    const onVisibility = () => {
      const nextVisible = document.visibilityState !== 'hidden';
      setVisible(nextVisible);
      if (!nextVisible) {
        session.setPaused(true);
        session.setPauseHold('visibility', true);
      } else {
        session.setPauseHold('visibility', false);
      }
    };
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      session.setPauseHold('visibility', false);
    };
  }, [session]);

  useEffect(() => {
    if (resultAction?.busy) return;
    resultActionGuardRef.current = false;
  }, [resultAction?.busy]);

  useEffect(() => {
    if (exitAction?.busy) return;
    exitActionGuardRef.current = false;
  }, [exitAction?.busy]);

  useEffect(() => {
    if (resolutionErrorAction?.busy) return;
    resolutionRestartGuardRef.current = false;
    resolutionWithdrawGuardRef.current = false;
  }, [resolutionErrorAction?.busy]);

  // Effect ownership survives StrictMode's setup/cleanup rehearsal with a fresh adapter.
  useEffect(() => {
    const audio = new BattleAudio(audioFactory);
    audioRef.current = audio;
    return () => {
      if (audioRef.current === audio) audioRef.current = null;
      audio.dispose();
    };
  }, [audioFactory]);

  useEffect(() => {
    const audio = audioRef.current;
    audio?.syncSettings({ effects: sensory.effects, muted: sensory.muted, active: visible && !paused && !diagnostic });
    audio?.handle(state.events, battleGeneration);
  }, [battleGeneration, diagnostic, paused, sensory.effects, sensory.muted, state.events, terminal, visible]);

  useEffect(() => {
    const region = reloadAnnouncementRef.current;
    if (!region) return;
    if (reloadAnnouncementKeyRef.current === reloadAnnouncementKey) return;
    reloadAnnouncementKeyRef.current = reloadAnnouncementKey;
    if (reloadAnnouncementFrameRef.current !== null) {
      cancelAnimationFrame(reloadAnnouncementFrameRef.current);
      reloadAnnouncementFrameRef.current = null;
    }
    region.textContent = '';
    if (!reloadAnnouncementMessage) return;

    const frame = requestAnimationFrame(() => {
      if (reloadAnnouncementKeyRef.current !== reloadAnnouncementKey) return;
      reloadAnnouncementFrameRef.current = null;
      if (reloadAnnouncementRef.current === region) region.textContent = reloadAnnouncementMessage;
    });
    reloadAnnouncementFrameRef.current = frame;
    return () => {
      if (reloadAnnouncementFrameRef.current === frame) {
        cancelAnimationFrame(frame);
        reloadAnnouncementFrameRef.current = null;
      }
      if (reloadAnnouncementKeyRef.current === reloadAnnouncementKey) {
        reloadAnnouncementKeyRef.current = '';
      }
    };
  }, [reloadAnnouncementKey, reloadAnnouncementMessage]);

  useEffect(() => {
    const underlay = underlayRef.current;
    if (!underlay) return;
    if (terminal) underlay.setAttribute('inert', '');
    else underlay.removeAttribute('inert');

    if (terminal) terminalActionRef.current?.focus();
    else portFireRef.current?.focus();
  }, [resolutionErrorAction, terminal]);

  useEffect(() => {
    if (!state.outcome || diagnostic) return;
    const dialog = terminalDialogRef.current;
    if (!dialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [diagnostic, resolutionErrorAction, state.outcome]);

  useEffect(() => {
    if (!controlsBlocked) return;
    const wasHeld = held.current.port || held.current.starboard;
    clearHeldRudder();
    if (wasHeld && interactionBlocked && !terminal) session.setRudder(0);
  }, [clearHeldRudder, controlsBlocked, interactionBlocked, session, terminal]);

  useEffect(() => {
    const releaseOnBlur = () => {
      const wasHeld = held.current.port || held.current.starboard;
      clearHeldRudder();
      if (wasHeld && !controlsBlocked) session.setRudder(0);
    };
    window.addEventListener('blur', releaseOnBlur);
    return () => {
      window.removeEventListener('blur', releaseOnBlur);
      clearHeldRudder();
    };
  }, [clearHeldRudder, controlsBlocked, session]);

  useDismissOnEscape(paused && !diagnostic && !interactionBlocked, () => session.togglePause());

  useEffect(() => {
    const rudderFromHeld = (): Rudder => {
      if (held.current.port === held.current.starboard) return 0;
      return held.current.port ? -1 : 1;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (controlsBlocked) return;
      activateAudio();
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
      if (controlsBlocked) return;
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
  }, [activateAudio, controlsBlocked, currentCommand.sail, diagnostic, paused, session]);

  const holdRudder = (side: 'port' | 'starboard', active: boolean) => {
    if (controlsBlocked) {
      clearHeldRudder();
      return;
    }
    held.current[side] = active;
    const rudder: Rudder = held.current.port === held.current.starboard ? 0 : held.current.port ? -1 : 1;
    session.setRudder(rudder);
  };

  const outcome = state.outcome ? outcomeCopy(state.outcome, state, Boolean(resultAction)) : null;

  return (
    <section className="naval-battle-page" data-testid="naval-battle-page" aria-label="Caribbean naval battle">
      <div
        ref={underlayRef}
        className="naval-battle-underlay"
        data-testid="naval-battle-underlay"
        aria-hidden={terminal ? true : undefined}
      >
        <div className="naval-battle-stage">
          <NavalViewport
            state={state}
            events={state.events}
            battleGeneration={battleGeneration}
            sceneFactory={sceneFactory}
            reducedMotion={reducedMotion}
            cameraShake={effectiveShake}
            reducedFlashes={sensory.reducedFlashes}
            aimCue={aimCue}
            onRestart={() => session.restart()}
          />
        </div>

        <div className="naval-battle-overlay">
          <BattleHud state={state} paused={paused} onTogglePause={() => { activateAudio(); session.togglePause(); }} />
          {aimCue && <p className="naval-aim-cue" data-testid="naval-aim-cue">{aimCue.message}</p>}

          <div className="naval-command-dock">
            <div className="naval-command-strip" role="group" aria-label="Battle commands">
              <RudderControl side="port" shortcut="A" active={currentCommand.rudder === -1} onHold={holdRudder} onActivate={activateAudio} />
              <FireControl buttonRef={portFireRef} side="port" onFire={() => { activateAudio(); session.requestFire('port'); }} disabled={Boolean(outcome || diagnostic)} />
              <div className="naval-ammunition-controls" role="group" aria-label="Ammunition">
                {(['round', 'chain', 'grape'] as const).map((ammunition, index) => (
                  <button
                    key={ammunition}
                    type="button"
                    className="naval-control naval-hit-target naval-command-control"
                    data-testid={`naval-ammo-${ammunition}`}
                    aria-pressed={currentCommand.ammunition === ammunition}
                    onClick={() => { activateAudio(); session.setAmmunition(ammunition); }}
                  ><kbd>{index + 1}</kbd><span>{ammunition.charAt(0).toUpperCase() + ammunition.slice(1)}</span></button>
                ))}
              </div>
              <button
                type="button"
                className="naval-control naval-hit-target naval-command-control naval-sail-control"
                data-testid="naval-sail-toggle"
                aria-pressed={currentCommand.sail === 'reefed'}
                aria-label={`Sail setting: ${currentCommand.sail}. Press to ${currentCommand.sail === 'full' ? 'reef' : 'set full sail'}`}
                onClick={() => { activateAudio(); session.setSail(currentCommand.sail === 'full' ? 'reefed' : 'full'); }}
              ><kbd>R</kbd><span>Sail: {currentCommand.sail === 'full' ? 'Full' : 'Reefed'}</span></button>
              <FireControl side="starboard" onFire={() => { activateAudio(); session.requestFire('starboard'); }} disabled={Boolean(outcome || diagnostic)} />
              <RudderControl side="starboard" shortcut="D" active={currentCommand.rudder === 1} onHold={holdRudder} onActivate={activateAudio} />
              <details className="naval-options" data-testid="naval-options">
                <summary className="naval-control naval-hit-target" data-testid="naval-options-toggle">Options</summary>
                <div className="naval-options__panel">
                  <button
                    type="button"
                    className="naval-control naval-hit-target naval-restart"
                    data-testid="naval-restart"
                    onClick={() => { activateAudio(); session.restart(); }}
                  ><RotateIcon size={18} /> Restart duel</button>
                  {exitAction && !outcome && !diagnostic && (
                    <button
                      type="button"
                      className="naval-control naval-hit-target naval-exit-action"
                      data-testid="naval-exit-action"
                      disabled={exitAction.busy}
                      onClick={() => {
                        if (exitAction.busy || exitActionGuardRef.current) return;
                        exitActionGuardRef.current = true;
                        exitAction.activate();
                      }}
                    >{exitAction.label}</button>
                  )}
                  <fieldset className="naval-sensory-controls" aria-label="Battle feedback settings">
                    <legend>Battle feedback</legend>
                    <SensoryToggle testId="naval-setting-aim" label="Aim assist" pressed={sensory.aim} onToggle={() => setSensory((value) => ({ ...value, aim: !value.aim }))} />
                    <SensoryToggle testId="naval-setting-steering" label="Steering hint" pressed={sensory.steeringHint} onToggle={() => setSensory((value) => ({ ...value, steeringHint: !value.steeringHint }))} />
                    <SensoryToggle testId="naval-setting-shake" label="Camera shake" pressed={sensory.shake} onToggle={() => setSensory((value) => ({ ...value, shake: !value.shake }))} />
                    <SensoryToggle testId="naval-setting-flashes" label="Reduced flashes" pressed={sensory.reducedFlashes} onToggle={() => setSensory((value) => ({ ...value, reducedFlashes: !value.reducedFlashes }))} />
                    <label className="naval-effects-volume">Effects <input data-testid="naval-setting-effects" type="range" min="0" max="1" step="0.1" value={sensory.effects} onChange={(event) => setSensory((value) => ({ ...value, effects: Number(event.target.value) }))} /></label>
                    <SensoryToggle testId="naval-setting-mute" label="Mute" pressed={sensory.muted} onToggle={() => setSensory((value) => ({ ...value, muted: !value.muted }))} />
                  </fieldset>
                </div>
              </details>
            </div>
          </div>
        </div>
        <span data-testid="naval-effective-shake" className="naval-visually-hidden">Camera shake {effectiveShake ? 'enabled' : 'disabled'}</span>
        <p ref={reloadAnnouncementRef} className="naval-visually-hidden" aria-live="polite" aria-atomic="true" data-testid="naval-reload-announcement" />

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
            onClick={() => { activateAudio(); session.restart(); }}
          >Restart from Battle Lab input</button>
        </div>
      )}

      {outcome && !diagnostic && resolutionErrorAction && (
        <div
          ref={terminalDialogRef}
          className="naval-result naval-resolution-error"
          data-testid="naval-resolution-error"
          role="dialog"
          aria-modal="true"
          aria-labelledby="naval-resolution-error-title"
        >
          <span>Campaign result</span>
          <h2 id="naval-resolution-error-title">Result unverified</h2>
          <p>{resolutionErrorAction.message}</p>
          <div className="naval-result-actions">
            <button
              ref={terminalActionRef}
              type="button"
              className="naval-control naval-hit-target"
              data-testid="naval-resolution-restart"
              disabled={resolutionErrorAction.busy}
              onClick={() => {
                if (resolutionErrorAction.busy || resolutionRestartGuardRef.current) return;
                resolutionRestartGuardRef.current = true;
                resolutionErrorAction.restart();
              }}
            >{resolutionErrorAction.restartLabel}</button>
            <button
              type="button"
              className="naval-control naval-hit-target"
              data-testid="naval-resolution-withdraw"
              disabled={resolutionErrorAction.busy}
              onClick={() => {
                if (resolutionErrorAction.busy || resolutionWithdrawGuardRef.current) return;
                resolutionWithdrawGuardRef.current = true;
                resolutionErrorAction.withdraw();
              }}
            >{resolutionErrorAction.withdrawLabel}</button>
          </div>
        </div>
      )}

      {outcome && !diagnostic && !resolutionErrorAction && (
        <div ref={terminalDialogRef} className="naval-result" role="dialog" aria-modal="true" aria-labelledby="naval-result-title">
          <span>{resultAction ? 'Campaign result' : 'Battle Lab result'}</span>
          <h2 id="naval-result-title">{outcome.heading}</h2>
          <p>{outcome.detail}</p>
          <button
            ref={terminalActionRef}
            type="button"
            className="naval-control naval-hit-target"
            data-testid={resultAction ? 'naval-result-action' : 'naval-result-restart'}
            disabled={resultAction?.busy}
            onClick={() => {
              activateAudio();
              if (!resultAction) {
                session.restart();
                return;
              }
              if (resultAction.busy || resultActionGuardRef.current) return;
              resultActionGuardRef.current = true;
              resultAction.activate(structuredClone(state));
            }}
          >{resultAction ? resultAction.label : <><RotateIcon size={18} /> {outcome.action}</>}</button>
        </div>
      )}
    </section>
  );
}

function SensoryToggle({ testId, label, pressed, onToggle }: { testId: string; label: string; pressed: boolean; onToggle(): void }) {
  return <button type="button" className="naval-control naval-hit-target" data-testid={testId} aria-pressed={pressed} onClick={onToggle}>{label}</button>;
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
      <strong>Fire {side}</strong>
    </button>
  );
}

function RudderControl({ side, shortcut, active, onHold, onActivate }: { side: 'port' | 'starboard'; shortcut: 'A' | 'D'; active: boolean; onHold(side: 'port' | 'starboard', active: boolean): void; onActivate(): void }) {
  const pulse = () => pulseRudder(
    (held) => onHold(side, held),
    (callback, delay) => window.setTimeout(callback, delay),
  );
  return (
    <button
      type="button"
      className="naval-control naval-hit-target naval-rudder-control"
      data-testid={`naval-rudder-${side}`}
      onPointerDown={(event) => {
        onActivate();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        onHold(side, true);
      }}
      onPointerUp={() => onHold(side, false)}
      onPointerCancel={() => onHold(side, false)}
      onLostPointerCapture={() => onHold(side, false)}
      onClick={(event) => {
        onActivate();
        if (event.detail === 0) pulse();
      }}
      aria-label={`Turn ${side}`}
      aria-pressed={active}
    >
      <kbd>{shortcut}</kbd>
      <span>Turn {side}</span>
    </button>
  );
}
