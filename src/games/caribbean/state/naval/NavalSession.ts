import { createNavalBattle } from '../../domain/naval/createBattle';
import {
  advanceOpponentController,
  initialOpponentController,
  type OpponentControllerState,
  type OpponentMemory,
} from '../../domain/naval/opponent';
import { stepBattle } from '../../domain/naval/stepBattle';
import type {
  Ammunition,
  Broadside,
  NavalBattleInput,
  NavalCommand,
  NavalEvent,
  NavalState,
  Rudder,
  SailSetting,
} from '../../domain/naval/types';
import { NAVAL_TICK_RATE } from '../../domain/naval/types';
import {
  validateNavalState,
  type NavalStateValidation,
} from '../../domain/naval/validation';
import { FrameRunner } from './FrameRunner';

export interface NavalDiagnostic {
  issues: string[];
}

export interface NavalSessionSnapshot {
  state: NavalState;
  opponentMemory: OpponentMemory;
  currentCommand: NavalCommand;
  paused: boolean;
  diagnostic: NavalDiagnostic | null;
}

export interface NavalSessionView extends NavalSessionSnapshot {
  setRudder(value: Rudder): void;
  setSail(value: SailSetting): void;
  setAmmunition(value: Ammunition): void;
  requestFire(side: Broadside): void;
  togglePause(): void;
  restart(): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): NavalSessionSnapshot;
  consumeNewEvents(afterId: number): NavalEvent[];
}

export interface NavalSessionOptions {
  validator?: (state: NavalState) => NavalStateValidation;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
}

const HUD_TICK_INTERVAL = 6;

function defaultCommand(): NavalCommand {
  return { rudder: 0, sail: 'full', ammunition: 'round', fire: null };
}

export class NavalSession implements NavalSessionView {
  readonly #input: NavalBattleInput;
  readonly #runner = new FrameRunner({ tickRate: NAVAL_TICK_RATE, maxTicksPerFrame: 6 });
  readonly #validator: (state: NavalState) => NavalStateValidation;
  readonly #listeners = new Set<() => void>();
  readonly #requestFrame?: (callback: FrameRequestCallback) => number;
  readonly #cancelFrame?: (handle: number) => void;

  #state: NavalState;
  #playerCommand = defaultCommand();
  #opponentController: OpponentControllerState = initialOpponentController();
  #paused = false;
  #diagnostic: NavalDiagnostic | null = null;
  #snapshot: NavalSessionSnapshot;
  #animationHandle: number | null = null;
  #lastFrameMicros: number | null = null;
  #lastPublishedTick = -HUD_TICK_INTERVAL;

  constructor(input: NavalBattleInput, options: NavalSessionOptions = {}) {
    this.#input = structuredClone(input);
    this.#state = createNavalBattle(this.#input);
    this.#validator = options.validator ?? validateNavalState;
    this.#requestFrame = options.requestFrame
      ?? (typeof requestAnimationFrame === 'function' ? requestAnimationFrame.bind(globalThis) : undefined);
    this.#cancelFrame = options.cancelFrame
      ?? (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame.bind(globalThis) : undefined);
    this.#snapshot = this.#makeSnapshot();
  }

  get state(): NavalState {
    return this.#state;
  }

  get opponentMemory(): OpponentMemory {
    return this.#opponentController.memory;
  }

  get currentCommand(): NavalCommand {
    return { ...this.#playerCommand };
  }

  get paused(): boolean {
    return this.#paused;
  }

  get diagnostic(): NavalDiagnostic | null {
    return this.#diagnostic ? { issues: [...this.#diagnostic.issues] } : null;
  }

  setRudder(value: Rudder): void {
    this.#playerCommand = { ...this.#playerCommand, rudder: value };
    this.#publish(true);
  }

  setSail(value: SailSetting): void {
    this.#playerCommand = { ...this.#playerCommand, sail: value };
    this.#publish(true);
  }

  setAmmunition(value: Ammunition): void {
    this.#playerCommand = { ...this.#playerCommand, ammunition: value };
    this.#publish(true);
  }

  requestFire(side: Broadside): void {
    this.#playerCommand = { ...this.#playerCommand, fire: side };
    this.#publish(true);
  }

  togglePause(): void {
    if (this.#diagnostic) return;
    this.#paused = !this.#paused;
    this.#runner.reset();
    this.#publish(true);
  }

  restart(): void {
    this.#state = createNavalBattle(structuredClone(this.#input));
    this.#playerCommand = defaultCommand();
    this.#opponentController = initialOpponentController();
    this.#paused = false;
    this.#diagnostic = null;
    this.#lastFrameMicros = null;
    this.#lastPublishedTick = -HUD_TICK_INTERVAL;
    this.#runner.reset();
    this.#publish(true);
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  getSnapshot = (): NavalSessionSnapshot => this.#snapshot;

  consumeNewEvents(afterId: number): NavalEvent[] {
    return this.#state.events
      .filter((event) => event.id > afterId)
      .map((event) => structuredClone(event));
  }

  deliverFrameMicros(micros: number): void {
    if (this.#paused || this.#diagnostic || this.#state.outcome) return;

    const ticks = this.#runner.deliverMicros(micros);
    for (let index = 0; index < ticks && !this.#state.outcome; index += 1) {
      const opponent = advanceOpponentController(this.#state, this.#opponentController);
      this.#opponentController = opponent.controller;
      this.#state = stepBattle(this.#state, {
        player: this.#playerCommand,
        opponent: opponent.command,
      });
      if (this.#playerCommand.fire) {
        this.#playerCommand = { ...this.#playerCommand, fire: null };
      }
    }

    const validation = this.#validator(this.#state);
    if (!validation.ok) {
      this.#paused = true;
      this.#diagnostic = { issues: [...validation.issues] };
      this.#runner.reset();
    }

    this.#publish(Boolean(this.#diagnostic || this.#state.outcome));
  }

  start(): void {
    if (this.#animationHandle !== null || !this.#requestFrame) return;

    const frame = (timeMilliseconds: number) => {
      const nowMicros = Math.round(timeMilliseconds * 1_000);
      if (this.#lastFrameMicros !== null) {
        this.deliverFrameMicros(Math.max(0, nowMicros - this.#lastFrameMicros));
      }
      this.#lastFrameMicros = nowMicros;
      this.#animationHandle = this.#requestFrame?.(frame) ?? null;
    };

    this.#animationHandle = this.#requestFrame(frame);
  }

  dispose(): void {
    if (this.#animationHandle !== null) this.#cancelFrame?.(this.#animationHandle);
    this.#animationHandle = null;
    this.#lastFrameMicros = null;
    this.#listeners.clear();
  }

  #makeSnapshot(): NavalSessionSnapshot {
    return {
      state: structuredClone(this.#state),
      opponentMemory: { ...this.#opponentController.memory },
      currentCommand: { ...this.#playerCommand },
      paused: this.#paused,
      diagnostic: this.#diagnostic ? { issues: [...this.#diagnostic.issues] } : null,
    };
  }

  #publish(force: boolean): void {
    if (!force && this.#state.tick - this.#lastPublishedTick < HUD_TICK_INTERVAL) return;
    this.#lastPublishedTick = this.#state.tick;
    this.#snapshot = this.#makeSnapshot();
    for (const listener of this.#listeners) listener();
  }
}
