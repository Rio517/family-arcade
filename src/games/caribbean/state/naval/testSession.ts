import { BATTLE_LAB_INPUT } from '../../content/naval';
import { createNavalBattle } from '../../domain/naval/createBattle';
import {
  advanceOpponentController,
  initialOpponentController,
} from '../../domain/naval/opponent';
import { stepBattle } from '../../domain/naval/stepBattle';
import type {
  Ammunition,
  Broadside,
  NavalCommand,
  NavalEvent,
  NavalOutcome,
  NavalState,
  Rudder,
  SailSetting,
} from '../../domain/naval/types';
import { validateNavalState, type NavalStateValidation } from '../../domain/naval/validation';
import type {
  NavalDiagnostic,
  NavalSessionSnapshot,
  NavalSessionView,
} from './NavalSession';
import { FrameRunner } from './FrameRunner';

export interface ManualNavalSessionOptions {
  outcome?: NavalOutcome;
  validator?: (state: NavalState) => NavalStateValidation;
}

export interface ManualNavalSession extends NavalSessionView {
  readonly currentCommand: NavalCommand;
  readonly restartCount: number;
  deliverFrame(seconds: number): void;
  commandHistory(): NavalCommand[];
}

function command(): NavalCommand {
  return { rudder: 0, sail: 'full', ammunition: 'round', fire: null };
}

export function manualNavalSession(options: ManualNavalSessionOptions = {}): ManualNavalSession {
  let state = createNavalBattle(BATTLE_LAB_INPUT);
  if (options.outcome) {
    state.outcome = structuredClone(options.outcome);
    state.events = [{ id: 1, kind: 'outcome', atTick: 0, outcome: structuredClone(options.outcome) }];
    state.nextEventId = 2;
  }
  let currentCommand = command();
  let paused = false;
  let diagnostic: NavalDiagnostic | null = null;
  let restartCount = 0;
  let history: NavalCommand[] = [];
  let opponentController = initialOpponentController();
  const runner = new FrameRunner({ tickRate: 60, maxTicksPerFrame: 6 });
  let snapshot: NavalSessionSnapshot;
  const listeners = new Set<() => void>();
  const validator = options.validator ?? validateNavalState;

  const makeSnapshot = (): NavalSessionSnapshot => ({
    state: structuredClone(state),
    opponentMemory: { ...opponentController.memory },
    currentCommand: { ...currentCommand },
    paused,
    diagnostic: diagnostic ? { issues: [...diagnostic.issues] } : null,
  });
  const publish = () => {
    snapshot = makeSnapshot();
    for (const listener of listeners) listener();
  };
  const record = (next: NavalCommand) => {
    currentCommand = next;
    history.push({ ...next });
    publish();
  };
  snapshot = makeSnapshot();

  return {
    get state() { return state; },
    get opponentMemory() { return { ...opponentController.memory }; },
    get currentCommand() { return { ...currentCommand }; },
    get paused() { return paused; },
    get diagnostic() { return diagnostic ? { issues: [...diagnostic.issues] } : null; },
    get restartCount() { return restartCount; },
    setRudder(value: Rudder) { record({ ...currentCommand, rudder: value }); },
    setSail(value: SailSetting) { record({ ...currentCommand, sail: value }); },
    setAmmunition(value: Ammunition) { record({ ...currentCommand, ammunition: value }); },
    requestFire(side: Broadside) { record({ ...currentCommand, fire: side }); },
    togglePause() {
      if (diagnostic) return;
      paused = !paused;
      publish();
    },
    restart() {
      state = createNavalBattle(BATTLE_LAB_INPUT);
      currentCommand = command();
      paused = false;
      diagnostic = null;
      restartCount += 1;
      history = [];
      opponentController = initialOpponentController();
      runner.reset();
      publish();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() { return snapshot; },
    consumeNewEvents(afterId: number): NavalEvent[] {
      return state.events.filter((event) => event.id > afterId).map((event) => structuredClone(event));
    },
    deliverFrame(seconds: number) {
      if (paused || diagnostic || state.outcome) return;
      const ticks = runner.deliverMicros(Math.round(seconds * 1_000_000));
      for (let index = 0; index < ticks && !state.outcome; index += 1) {
        const opponent = advanceOpponentController(state, opponentController);
        opponentController = opponent.controller;
        state = stepBattle(state, { player: currentCommand, opponent: opponent.command });
        if (currentCommand.fire) currentCommand = { ...currentCommand, fire: null };
      }
      const validation = validator(state);
      if (!validation.ok) {
        paused = true;
        diagnostic = { issues: [...validation.issues] };
      }
      publish();
    },
    commandHistory() { return history.map((entry) => ({ ...entry })); },
  };
}
