import type { NavalEvent } from '../domain/naval/types';

export type BattleCue = 'cannon' | 'splash' | 'impact' | 'rig-tear' | 'reload-bell' | 'surrender-bell';

export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, startTime: number): void;
  linearRampToValueAtTime(value: number, endTime: number): void;
  exponentialRampToValueAtTime?(value: number, endTime: number): void;
}

export interface AudioBufferLike {
  getChannelData(channel: number): Float32Array;
}

export interface AudioNodeLike {
  connect(destination: unknown): unknown;
  disconnect(): void;
  start?(when?: number): void;
  stop?(when?: number): void;
  onended?: (() => void) | null;
  gain?: AudioParamLike;
  frequency?: AudioParamLike;
  Q?: AudioParamLike;
  type?: OscillatorType | BiquadFilterType;
  buffer?: unknown;
}

export interface BattleAudioContext {
  currentTime: number;
  sampleRate?: number;
  destination: unknown;
  resume(): Promise<void>;
  close?(): Promise<void>;
  createGain(): AudioNodeLike;
  createOscillator(): AudioNodeLike;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  createBufferSource(): AudioNodeLike;
  createBiquadFilter(): AudioNodeLike;
}

export interface AudioFactory {
  createContext(): BattleAudioContext;
  /** Observational boundary used by tests and browser evidence; called only after a cue schedules successfully. */
  onCue?(cue: BattleCue): void;
}

export interface BattleAudioSettings {
  master: number;
  effects: number;
  muted: boolean;
  /** False while paused or hidden. Terminal remains active long enough for its decisive event. */
  active: boolean;
}

interface ScheduledSource {
  node: AudioNodeLike;
  start: number;
  stop: number;
}

interface CueTransaction {
  nodes: AudioNodeLike[];
  sources: ScheduledSource[];
}

const DEFAULT_SETTINGS: BattleAudioSettings = { master: 1, effects: 0.9, muted: false, active: true };
const MIN_GAIN = 0.0001;

function browserFactory(): AudioFactory {
  return {
    createContext: () => {
      const Constructor = window.AudioContext ?? window.webkitAudioContext;
      if (!Constructor) throw new Error('Web Audio unavailable');
      return new Constructor() as unknown as BattleAudioContext;
    },
  };
}

function disconnect(node: AudioNodeLike | null): void {
  if (!node) return;
  try { node.disconnect(); } catch { /* already disconnected */ }
}

/** Semantic, deterministic procedural Web Audio adapter. It never owns canonical battle state. */
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
    let master: AudioNodeLike | null = null;
    let effects: AudioNodeLike | null = null;
    try {
      context = this.#factory.createContext();
      await context.resume();
      if (this.#disposed) {
        await context.close?.();
        return false;
      }
      master = context.createGain();
      effects = context.createGain();
      effects.connect(master);
      master.connect(context.destination);
      this.#context = context;
      this.#master = master;
      this.#effects = effects;
      this.#syncGain();
      const pending = this.#pending;
      this.#pending = [];
      for (const event of pending) this.#emit(event);
      return true;
    } catch {
      this.#pending = [];
      if (this.#context === context) {
        this.#context = null;
        this.#master = null;
        this.#effects = null;
      }
      disconnect(effects);
      disconnect(master);
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
    if (this.#settings.muted || !this.#settings.active) return;
    for (const event of current) this.#emit(event);
  }

  #syncGain(): void {
    const gain = this.#master?.gain;
    if (!gain || !this.#context) return;
    const level = this.#settings.muted || !this.#settings.active ? 0 : this.#settings.master;
    gain.setValueAtTime(Math.max(0, level), this.#context.currentTime);
    this.#effects?.gain?.setValueAtTime(Math.max(0, this.#settings.effects), this.#context.currentTime);
  }

  #emit(event: NavalEvent): void {
    if (event.kind === 'volley') {
      this.#play('cannon');
      if (event.result.misses > 0) this.#play('splash');
      return;
    }
    if (event.kind === 'damage' && event.damage.hull + event.damage.sails + event.damage.crew + event.damage.cannon > 0) {
      this.#play('impact');
      if (event.damage.sails > 0) this.#play('rig-tear');
      return;
    }
    if (event.kind === 'reload-ready' && event.shipId === 'player') {
      this.#play('reload-bell', event.side);
      return;
    }
    if (event.kind === 'outcome' && event.outcome.kind === 'surrender') this.#play('surrender-bell');
  }

  #play(cue: BattleCue, variant?: 'port' | 'starboard'): void {
    const context = this.#context;
    const destination = this.#effects;
    if (!context || !destination || this.#settings.muted || !this.#settings.active) return;
    const transaction: CueTransaction = { nodes: [], sources: [] };
    let cleaned = false;
    const cleanup = (stopSources: boolean) => {
      if (cleaned) return;
      cleaned = true;
      if (stopSources) {
        for (const source of transaction.sources) {
          try { source.node.stop?.(); } catch { /* failed or already stopped */ }
        }
      }
      for (const node of transaction.nodes) {
        this.#sources.delete(node);
        disconnect(node);
      }
    };

    try {
      this.#buildCue(cue, variant, transaction, context, destination);
      let remaining = transaction.sources.length;
      const ended = () => {
        remaining -= 1;
        if (remaining <= 0) cleanup(false);
      };
      for (const source of transaction.sources) source.node.onended = ended;
      for (const node of transaction.nodes) this.#sources.add(node);
      for (const source of transaction.sources) {
        source.node.start?.(source.start);
        source.node.stop?.(source.stop);
      }
      this.#factory.onCue?.(cue);
    } catch {
      cleanup(true);
    }
  }

  #buildCue(
    cue: BattleCue,
    variant: 'port' | 'starboard' | undefined,
    transaction: CueTransaction,
    context: BattleAudioContext,
    destination: AudioNodeLike,
  ): void {
    const now = context.currentTime;
    if (cue === 'cannon') {
      this.#tone(transaction, context, destination, { frequency: 76, endFrequency: 42, type: 'triangle', peak: 0.11, start: now, attack: 0.006, duration: 0.24 });
      this.#noise(transaction, context, destination, { seed: 0xc4110, duration: 0.2, peak: 0.095, filters: [['lowpass', 920, 0.7]] });
      return;
    }
    if (cue === 'splash') {
      this.#noise(transaction, context, destination, { seed: 0x5a1a5, duration: 0.34, peak: 0.055, attack: 0.018, filters: [['highpass', 520, 0.65], ['lowpass', 3_600, 0.6]] });
      return;
    }
    if (cue === 'impact') {
      this.#noise(transaction, context, destination, { seed: 0x1a9ac7, duration: 0.13, peak: 0.075, filters: [['lowpass', 680, 1.1]] });
      return;
    }
    if (cue === 'rig-tear') {
      this.#noise(transaction, context, destination, { seed: 0x7197ea, duration: 0.38, peak: 0.045, attack: 0.012, filters: [['bandpass', 1_350, 1.6]] });
      this.#tone(transaction, context, destination, { frequency: 205, endFrequency: 118, type: 'sawtooth', peak: 0.025, start: now + 0.035, attack: 0.018, duration: 0.31 });
      return;
    }
    if (cue === 'reload-bell') {
      const base = variant === 'port' ? 660 : 550;
      this.#tone(transaction, context, destination, { frequency: base, type: 'sine', peak: 0.044, start: now, attack: 0.008, duration: 0.42 });
      this.#tone(transaction, context, destination, { frequency: base * 1.5, type: 'sine', peak: 0.024, start: now + 0.012, attack: 0.006, duration: 0.28 });
      return;
    }
    this.#tone(transaction, context, destination, { frequency: 392, type: 'sine', peak: 0.05, start: now, attack: 0.012, duration: 0.92 });
    this.#tone(transaction, context, destination, { frequency: 588, type: 'sine', peak: 0.032, start: now + 0.045, attack: 0.018, duration: 0.72 });
    this.#tone(transaction, context, destination, { frequency: 784, type: 'sine', peak: 0.018, start: now + 0.09, attack: 0.02, duration: 0.54 });
  }

  #tone(
    transaction: CueTransaction,
    context: BattleAudioContext,
    destination: AudioNodeLike,
    options: { frequency: number; endFrequency?: number; type: OscillatorType; peak: number; start: number; attack: number; duration: number },
  ): void {
    const oscillator = context.createOscillator();
    transaction.nodes.push(oscillator);
    const gain = context.createGain();
    transaction.nodes.push(gain);
    oscillator.type = options.type;
    oscillator.frequency?.setValueAtTime(options.frequency, options.start);
    if (options.endFrequency) oscillator.frequency?.exponentialRampToValueAtTime?.(options.endFrequency, options.start + options.duration);
    gain.gain?.setValueAtTime(MIN_GAIN, options.start);
    gain.gain?.linearRampToValueAtTime(options.peak, options.start + options.attack);
    gain.gain?.exponentialRampToValueAtTime?.(MIN_GAIN, options.start + options.duration);
    oscillator.connect(gain);
    gain.connect(destination);
    transaction.sources.push({ node: oscillator, start: options.start, stop: options.start + options.duration });
  }

  #noise(
    transaction: CueTransaction,
    context: BattleAudioContext,
    destination: AudioNodeLike,
    options: { seed: number; duration: number; peak: number; attack?: number; filters: ReadonlyArray<readonly [BiquadFilterType, number, number]> },
  ): void {
    const sampleRate = context.sampleRate ?? 44_100;
    const length = Math.max(1, Math.ceil(sampleRate * options.duration));
    const buffer = context.createBuffer(1, length, sampleRate);
    const samples = buffer.getChannelData(0);
    let seed = options.seed >>> 0;
    for (let index = 0; index < samples.length; index += 1) {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      const white = seed / 0xffff_ffff * 2 - 1;
      const shape = 1 - index / samples.length;
      samples[index] = white * shape;
    }

    const source = context.createBufferSource();
    transaction.nodes.push(source);
    source.buffer = buffer;
    let previous: AudioNodeLike = source;
    for (const [type, frequency, q] of options.filters) {
      const filter = context.createBiquadFilter();
      transaction.nodes.push(filter);
      filter.type = type;
      filter.frequency?.setValueAtTime(frequency, context.currentTime);
      filter.Q?.setValueAtTime(q, context.currentTime);
      previous.connect(filter);
      previous = filter;
    }
    const gain = context.createGain();
    transaction.nodes.push(gain);
    const attack = options.attack ?? 0.004;
    gain.gain?.setValueAtTime(MIN_GAIN, context.currentTime);
    gain.gain?.linearRampToValueAtTime(options.peak, context.currentTime + attack);
    gain.gain?.exponentialRampToValueAtTime?.(MIN_GAIN, context.currentTime + options.duration);
    previous.connect(gain);
    gain.connect(destination);
    transaction.sources.push({ node: source, start: context.currentTime, stop: context.currentTime + options.duration });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const source of this.#sources) {
      try { source.stop?.(); } catch { /* already stopped */ }
      disconnect(source);
    }
    this.#sources.clear();
    disconnect(this.#effects);
    disconnect(this.#master);
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
