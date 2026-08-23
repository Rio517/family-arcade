import type { NavalEvent } from '../domain/naval/types';

export type BattleCue = 'cannon' | 'splash' | 'impact' | 'rig-tear' | 'reload-bell' | 'surrender-bell';

interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, startTime: number): void;
  linearRampToValueAtTime(value: number, endTime: number): void;
  exponentialRampToValueAtTime?(value: number, endTime: number): void;
}

interface FrequencyParamLike {
  value: number;
  setValueAtTime(value: number, startTime: number): void;
  exponentialRampToValueAtTime?(value: number, endTime: number): void;
}

interface AudioNodeLike {
  connect(destination: unknown): unknown;
  disconnect(): void;
  start?(when?: number): void;
  stop?(when?: number): void;
  gain?: AudioParamLike;
  frequency?: FrequencyParamLike;
  type?: OscillatorType;
  buffer?: unknown;
}

export interface BattleAudioContext {
  currentTime: number;
  destination: unknown;
  resume(): Promise<void>;
  close?(): Promise<void>;
  createGain(): AudioNodeLike;
  createOscillator(): AudioNodeLike;
  createBuffer?(channels: number, length: number, sampleRate: number): unknown;
  createBufferSource?(): AudioNodeLike;
  createBiquadFilter?(): AudioNodeLike;
}

export interface AudioFactory {
  createContext(): BattleAudioContext;
  /** Test-only observational hook; no production source depends on it. */
  onCue?(cue: BattleCue): void;
}

export interface BattleAudioSettings {
  master: number;
  effects: number;
  muted: boolean;
  /** False while paused, terminal, or hidden. It also silences the optional sea bed. */
  active: boolean;
}

const DEFAULT_SETTINGS: BattleAudioSettings = { master: 1, effects: 0.9, muted: false, active: true };

function browserFactory(): AudioFactory {
  return {
    createContext: () => {
      const Constructor = window.AudioContext ?? window.webkitAudioContext;
      if (!Constructor) throw new Error('Web Audio unavailable');
      return new Constructor() as unknown as BattleAudioContext;
    },
  };
}

/** Semantic, procedural Web Audio adapter. It never owns canonical battle state. */
export class BattleAudio {
  readonly #factory: AudioFactory;
  #context: BattleAudioContext | null = null;
  #master: AudioNodeLike | null = null;
  #effects: AudioNodeLike | null = null;
  #activation: Promise<boolean> | null = null;
  #pending: NavalEvent[] = [];
  #generation = -1;
  #lastEventId = 0;
  #settings: BattleAudioSettings = { ...DEFAULT_SETTINGS };
  #sources = new Set<AudioNodeLike>();
  #disposed = false;

  constructor(factory: AudioFactory = browserFactory()) {
    this.#factory = factory;
  }

  activate(): Promise<boolean> {
    if (this.#disposed) return Promise.resolve(false);
    if (this.#context) return Promise.resolve(true);
    if (this.#activation) return this.#activation;
    this.#activation = this.#activate();
    return this.#activation;
  }

  async #activate(): Promise<boolean> {
    let context: BattleAudioContext | null = null;
    try {
      context = this.#factory.createContext();
      await context.resume();
      if (this.#disposed) {
        await context.close?.();
        return false;
      }
      this.#context = context;
      this.#master = context.createGain();
      this.#effects = context.createGain();
      this.#effects.connect(this.#master);
      this.#master.connect(context.destination);
      this.#syncGain();
      const pending = this.#pending;
      this.#pending = [];
      for (const event of pending) this.#emit(event);
      return true;
    } catch {
      this.#pending = [];
      await context?.close?.().catch(() => undefined);
      return false;
    } finally {
      this.#activation = null;
    }
  }

  syncSettings(settings: Partial<BattleAudioSettings>): void {
    this.#settings = { ...this.#settings, ...settings };
    this.#syncGain();
  }

  handle(events: readonly NavalEvent[], battleGeneration: number): void {
    if (this.#disposed) return;
    if (this.#generation !== battleGeneration) {
      this.#generation = battleGeneration;
      this.#lastEventId = 0;
      this.#pending = [];
    }
    const current = events.filter((event) => event.id > this.#lastEventId);
    for (const event of current) this.#lastEventId = Math.max(this.#lastEventId, event.id);
    // History before a real gesture is deliberately advanced and never replayed.
    if (!this.#context) {
      if (this.#activation) this.#pending.push(...current);
      return;
    }
    if (this.#settings.muted) return;
    for (const event of current) {
      if (this.#settings.active || (event.kind === 'outcome' && event.outcome.kind === 'surrender')) this.#emit(event);
    }
  }

  #syncGain(): void {
    const gain = this.#master?.gain;
    if (!gain || !this.#context) return;
    const level = this.#settings.muted || !this.#settings.active ? 0 : this.#settings.master;
    gain.setValueAtTime(Math.max(0, level), this.#context.currentTime);
    const effects = this.#effects?.gain;
    effects?.setValueAtTime(Math.max(0, this.#settings.effects), this.#context.currentTime);
  }

  #emit(event: NavalEvent): void {
    if (event.kind === 'volley') {
      this.#play('cannon', 72, 0.18, 'sawtooth');
      if (event.result.misses > 0) this.#play('splash', 155, 0.13, 'triangle');
      return;
    }
    if (event.kind === 'damage' && event.damage.hull + event.damage.sails + event.damage.crew + event.damage.cannon > 0) {
      this.#play('impact', 110, 0.1, 'square');
      if (event.damage.sails > 0) this.#play('rig-tear', 290, 0.12, 'triangle');
      return;
    }
    if (event.kind === 'reload-ready' && event.shipId === 'player') {
      this.#play('reload-bell', event.side === 'port' ? 620 : 520, 0.16, 'sine');
      return;
    }
    if (event.kind === 'outcome' && event.outcome.kind === 'surrender') {
      this.#play('surrender-bell', 390, 0.42, 'sine', true);
    }
  }

  #play(cue: BattleCue, frequency: number, duration: number, type: OscillatorType, decisive = false): void {
    const context = this.#context;
    const destination = this.#effects;
    if (!context || !destination || this.#settings.muted || (!this.#settings.active && !decisive)) return;
    this.#factory.onCue?.(cue);
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency?.setValueAtTime(frequency, context.currentTime);
      gain.gain?.setValueAtTime(cue === 'cannon' ? 0.09 : 0.06, context.currentTime);
      gain.gain?.linearRampToValueAtTime(0.0001, context.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(destination);
      this.#sources.add(oscillator);
      this.#sources.add(gain);
      oscillator.start?.(context.currentTime);
      oscillator.stop?.(context.currentTime + duration);
      const cleanup = () => {
        this.#sources.delete(oscillator);
        this.#sources.delete(gain);
        try { oscillator.disconnect(); } catch { /* already disconnected */ }
        try { gain.disconnect(); } catch { /* already disconnected */ }
      };
      (oscillator as AudioNodeLike & { onended?: (() => void) | null }).onended = cleanup;
    } catch {
      // A partially supported browser remains silently usable and retry-safe.
    }
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const source of this.#sources) {
      try { source.stop?.(); } catch { /* already stopped */ }
      try { source.disconnect(); } catch { /* already disconnected */ }
    }
    this.#sources.clear();
    try { this.#effects?.disconnect(); } catch { /* already disconnected */ }
    try { this.#master?.disconnect(); } catch { /* already disconnected */ }
    const owned = this.#context;
    this.#context = null;
    this.#effects = null;
    this.#master = null;
    this.#lastEventId = 0;
    this.#pending = [];
    void owned?.close?.().catch(() => undefined);
  }
}

declare global {
  interface Window { webkitAudioContext?: typeof AudioContext; }
}
