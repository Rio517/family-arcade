import { describe, expect, it } from 'vitest';

import type { NavalEvent } from '../domain/naval/types';
import { BattleAudio, type AudioFactory, type BattleAudioSettings } from './BattleAudio';

type NodeKind = 'gain' | 'oscillator' | 'buffer-source' | 'filter';

interface ParamCall { method: 'set' | 'linear' | 'exponential'; value: number; time: number }

interface FakeParam {
  value: number;
  calls: ParamCall[];
  setValueAtTime(value: number, time: number): void;
  linearRampToValueAtTime(value: number, time: number): void;
  exponentialRampToValueAtTime(value: number, time: number): void;
}

interface FakeNode {
  kind: NodeKind;
  connected: boolean;
  disconnected: boolean;
  started: boolean;
  stopped: boolean;
  onended: (() => void) | null;
  connect(destination: unknown): unknown;
  disconnect(): void;
  start(when?: number): void;
  stop(when?: number): void;
  gain?: FakeParam;
  frequency?: FakeParam;
  Q?: FakeParam;
  type?: OscillatorType | BiquadFilterType;
  buffer?: unknown;
}

interface FakeContext {
  currentTime: number;
  destination: object;
  closed: boolean;
  resume(): Promise<void>;
  close(): Promise<void>;
  createGain(): FakeNode;
  createOscillator(): FakeNode;
  createBuffer(channels: number, length: number, sampleRate: number): { getChannelData(channel: number): Float32Array };
  createBufferSource(): FakeNode;
  createBiquadFilter(): FakeNode;
}

function fakeAudioFactory() {
  const contexts: FakeContext[] = [];
  const nodes: FakeNode[] = [];
  const cues: string[] = [];
  const recipes = new Map<string, FakeNode[][]>();
  const buffers: Float32Array[] = [];
  const resumeQueue: Array<'resolve' | 'reject' | 'defer'> = [];
  const resumeResolvers: Array<() => void> = [];
  let failOperation: string | null = null;
  let recipeCursor = 0;
  let captureStart = 0;

  const maybeFail = (operation: string) => {
    if (failOperation !== operation) return;
    failOperation = null;
    throw new Error(`fault:${operation}`);
  };
  const parameter = (): FakeParam => ({
    value: 0,
    calls: [],
    setValueAtTime(value, time) { this.value = value; this.calls.push({ method: 'set', value, time }); },
    linearRampToValueAtTime(value, time) { this.value = value; this.calls.push({ method: 'linear', value, time }); },
    exponentialRampToValueAtTime(value, time) { this.value = value; this.calls.push({ method: 'exponential', value, time }); },
  });
  const node = (kind: NodeKind): FakeNode => {
    const item: FakeNode = {
      kind,
      connected: false,
      disconnected: false,
      started: false,
      stopped: false,
      onended: null,
      connect(destination) {
        maybeFail(`${kind}.connect`);
        this.connected = true;
        return destination;
      },
      disconnect() { this.connected = false; this.disconnected = true; },
      start() { maybeFail(`${kind}.start`); this.started = true; },
      stop() { maybeFail(`${kind}.stop`); this.stopped = true; },
    };
    if (kind === 'gain') item.gain = parameter();
    if (kind === 'oscillator') item.frequency = parameter();
    if (kind === 'filter') {
      item.frequency = parameter();
      item.Q = parameter();
    }
    nodes.push(item);
    return item;
  };
  const createContext = (): FakeContext => {
    const context: FakeContext = {
      currentTime: 10,
      destination: {},
      closed: false,
      resume: () => {
        const behavior = resumeQueue.shift() ?? 'resolve';
        if (behavior === 'reject') return Promise.reject(new Error('blocked'));
        if (behavior === 'defer') return new Promise<void>((resolve) => resumeResolvers.push(resolve));
        return Promise.resolve();
      },
      close() { this.closed = true; return Promise.resolve(); },
      createGain: () => { maybeFail('createGain'); return node('gain'); },
      createOscillator: () => { maybeFail('createOscillator'); return node('oscillator'); },
      createBuffer: (_channels, length) => {
        maybeFail('createBuffer');
        const data = new Float32Array(length);
        buffers.push(data);
        return { getChannelData: () => data };
      },
      createBufferSource: () => { maybeFail('createBufferSource'); return node('buffer-source'); },
      createBiquadFilter: () => { maybeFail('createBiquadFilter'); return node('filter'); },
    };
    contexts.push(context);
    return context;
  };
  const factory: AudioFactory = {
    createContext,
    onCue: (cue) => {
      cues.push(cue);
      const recipe = nodes.slice(recipeCursor);
      recipeCursor = nodes.length;
      recipes.set(cue, [...(recipes.get(cue) ?? []), recipe]);
    },
  };
  return {
    factory,
    contexts,
    nodes,
    cues,
    recipes,
    buffers,
    resumeQueue,
    resolveResume: () => resumeResolvers.shift()?.(),
    armFailure(operation: string) { failOperation = operation; },
    beginCueCapture() { recipeCursor = nodes.length; captureStart = nodes.length; },
    liveCueNodes() { return nodes.slice(captureStart).filter((item) => !item.disconnected); },
    endScheduled() { nodes.filter((item) => item.started && item.stopped).forEach((item) => item.onended?.()); },
  };
}

const volley: NavalEvent = {
  id: 1, kind: 'volley', atTick: 2, shipId: 'player', targetShipId: 'opponent',
  result: { volleyId: 1, side: 'port', ammunition: 'round', fired: 4, hits: 4, misses: 0, damage: { hull: 4, sails: 0, crew: 0, cannon: 0 }, seedAfter: 1, samples: [] },
};
const splashVolley: NavalEvent = { ...volley, id: 2, result: { ...volley.result, hits: 2, misses: 2 } };
const damage: NavalEvent = { id: 3, kind: 'damage', atTick: 2, shipId: 'opponent', damage: { hull: 4, sails: 0, crew: 0, cannon: 0 } };
const rigDamage: NavalEvent = { ...damage, id: 4, damage: { hull: 0, sails: 4, crew: 0, cannon: 0 } };
const reload: NavalEvent = { id: 5, kind: 'reload-ready', atTick: 3, shipId: 'player', side: 'port' };
const surrender: NavalEvent = { id: 6, kind: 'outcome', atTick: 4, outcome: { kind: 'surrender', victorShipId: 'player' } };
const settings: BattleAudioSettings = { master: 0.8, effects: 0.9, muted: false, active: true };

describe('BattleAudio', () => {
  it('does not create or replay pre-activation history, then handles each newer event once', async () => {
    const fake = fakeAudioFactory();
    const audio = new BattleAudio(fake.factory);
    audio.handle([volley], 0);
    expect(fake.contexts).toHaveLength(0);

    await audio.activate();
    fake.beginCueCapture();
    audio.handle([{ ...volley, id: 2 }, { ...damage, id: 3 }], 0);
    audio.handle([{ ...volley, id: 2 }, { ...damage, id: 3 }], 0);
    expect(fake.cues).toEqual(['cannon', 'impact']);
  });

  it('retains post-gesture events across deferred activation but discards genuine pre-gesture history', async () => {
    const fake = fakeAudioFactory();
    fake.resumeQueue.push('defer');
    const audio = new BattleAudio(fake.factory);
    audio.handle([volley], 0);
    const activating = audio.activate();
    audio.handle([{ ...volley, id: 2 }], 0);
    fake.resolveResume();

    await expect(activating).resolves.toBe(true);
    expect(fake.cues).toEqual(['cannon']);
  });

  it('drops rejected-generation pending events and retries with a fresh owned context', async () => {
    const fake = fakeAudioFactory();
    fake.resumeQueue.push('defer', 'resolve');
    const audio = new BattleAudio(fake.factory);
    const rejected = audio.activate();
    audio.handle([volley], 0);
    audio.handle([{ ...volley, id: 1 }], 1);
    fake.contexts[0].resume = () => Promise.reject(new Error('unused'));
    fake.contexts[0].close = () => { fake.contexts[0].closed = true; return Promise.resolve(); };
    audio.dispose();
    fake.resolveResume();
    await expect(rejected).resolves.toBe(false);
    expect(fake.cues).toEqual([]);
    expect(fake.contexts[0].closed).toBe(true);

    const retryFake = fakeAudioFactory();
    retryFake.resumeQueue.push('reject', 'resolve');
    const retryable = new BattleAudio(retryFake.factory);
    await expect(retryable.activate()).resolves.toBe(false);
    await expect(retryable.activate()).resolves.toBe(true);
    expect(retryFake.contexts).toHaveLength(2);
    expect(retryFake.contexts[0].closed).toBe(true);
  });

  it('keeps only the newest generation while activation is pending', async () => {
    const fake = fakeAudioFactory();
    fake.resumeQueue.push('defer');
    const audio = new BattleAudio(fake.factory);
    const activating = audio.activate();
    audio.handle([volley], 0);
    audio.handle([{ ...damage, id: 1 }], 1);
    fake.resolveResume();
    await activating;
    expect(fake.cues).toEqual(['impact']);
  });

  it('coalesces concurrent activation and closes without draining when disposed while pending', async () => {
    const fake = fakeAudioFactory();
    fake.resumeQueue.push('defer');
    const audio = new BattleAudio(fake.factory);
    const first = audio.activate();
    expect(audio.activate()).toBe(first);
    audio.handle([volley], 0);
    audio.dispose();
    fake.resolveResume();
    await expect(first).resolves.toBe(false);
    expect(fake.contexts[0].closed).toBe(true);
    expect(fake.cues).toEqual([]);
  });

  it('scopes duplicate ids to battle generation and ignores old out-of-order events', async () => {
    const fake = fakeAudioFactory();
    const audio = new BattleAudio(fake.factory);
    await audio.activate();
    fake.beginCueCapture();
    audio.handle([{ ...volley, id: 3 }], 0);
    audio.handle([{ ...volley, id: 2 }, { ...volley, id: 3 }], 0);
    audio.handle([{ ...volley, id: 1 }], 1);
    expect(fake.cues.filter((cue) => cue === 'cannon')).toHaveLength(2);
  });

  it('uses distinct deterministic layered recipes for all six semantic cues', async () => {
    const fake = fakeAudioFactory();
    const audio = new BattleAudio(fake.factory);
    await audio.activate();
    fake.beginCueCapture();
    audio.handle([volley, splashVolley, damage, rigDamage, reload, surrender], 0);

    expect(fake.cues).toEqual(['cannon', 'cannon', 'splash', 'impact', 'impact', 'rig-tear', 'reload-bell', 'surrender-bell']);
    const recipe = (cue: string, index = 0) => fake.recipes.get(cue)?.[index] ?? [];
    expect(recipe('cannon')).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'oscillator', type: expect.any(String) }),
      expect.objectContaining({ kind: 'buffer-source' }),
      expect.objectContaining({ kind: 'filter', type: 'lowpass' }),
    ]));
    expect(recipe('splash')).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'buffer-source' }),
      expect.objectContaining({ kind: 'filter', type: 'highpass' }),
      expect.objectContaining({ kind: 'filter', type: 'lowpass' }),
    ]));
    expect(recipe('impact')).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'buffer-source' }),
      expect.objectContaining({ kind: 'filter', type: 'lowpass' }),
    ]));
    expect(recipe('rig-tear')).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'buffer-source' }),
      expect.objectContaining({ kind: 'filter', type: 'bandpass' }),
      expect.objectContaining({ kind: 'oscillator' }),
    ]));
    expect(recipe('reload-bell').filter(({ kind }) => kind === 'oscillator')).toHaveLength(2);
    expect(recipe('surrender-bell').filter(({ kind }) => kind === 'oscillator')).toHaveLength(3);
    expect(recipe('reload-bell').map((node) => node.frequency?.value).filter(Boolean))
      .not.toEqual(recipe('surrender-bell').map((node) => node.frequency?.value).filter(Boolean));
    for (const cue of ['cannon', 'splash', 'impact', 'rig-tear', 'reload-bell', 'surrender-bell']) {
      expect(recipe(cue).some((node) => node.gain?.calls.some((call) => call.method !== 'set'))).toBe(true);
    }
  });

  it('fills local noise buffers with deterministic non-random samples', async () => {
    const first = fakeAudioFactory();
    const second = fakeAudioFactory();
    const firstAudio = new BattleAudio(first.factory);
    const secondAudio = new BattleAudio(second.factory);
    await firstAudio.activate();
    await secondAudio.activate();
    firstAudio.handle([volley], 0);
    secondAudio.handle([volley], 0);

    expect(first.buffers.length).toBeGreaterThan(0);
    expect(first.buffers[0].some((sample) => sample !== 0)).toBe(true);
    expect([...first.buffers[0]]).toEqual([...second.buffers[0]]);
  });

  it.each([
    'createOscillator',
    'createGain',
    'createBuffer',
    'createBufferSource',
    'createBiquadFilter',
    'oscillator.connect',
    'gain.connect',
    'buffer-source.connect',
    'filter.connect',
    'oscillator.start',
    'oscillator.stop',
    'buffer-source.start',
    'buffer-source.stop',
  ])('cleans every partial cue node and reports no cue when %s throws', async (boundary) => {
    const fake = fakeAudioFactory();
    const audio = new BattleAudio(fake.factory);
    await audio.activate();
    fake.beginCueCapture();
    fake.armFailure(boundary);
    audio.handle([volley], 0);
    expect(fake.cues).toEqual([]);
    expect(fake.liveCueNodes()).toEqual([]);
  });

  it('disconnects every completed one-shot node on end and remains bounded across generations', async () => {
    const fake = fakeAudioFactory();
    const audio = new BattleAudio(fake.factory);
    await audio.activate();
    fake.beginCueCapture();
    for (let generation = 0; generation < 8; generation += 1) {
      audio.handle([volley], generation);
      fake.endScheduled();
      expect(fake.liveCueNodes()).toEqual([]);
    }
  });

  it('suppresses hidden, paused, and muted surrender without false playback observation', async () => {
    for (const update of [{ active: false }, { muted: true }]) {
      const fake = fakeAudioFactory();
      const audio = new BattleAudio(fake.factory);
      await audio.activate();
      fake.beginCueCapture();
      audio.syncSettings({ ...settings, ...update });
      audio.handle([surrender], 0);
      expect(fake.cues).toEqual([]);
      expect(fake.liveCueNodes()).toEqual([]);
    }
  });

  it('mutes immediately, never replays muted events, and disposes safely', async () => {
    const fake = fakeAudioFactory();
    const audio = new BattleAudio(fake.factory);
    await audio.activate();
    fake.beginCueCapture();
    audio.syncSettings({ ...settings, muted: true });
    audio.handle([volley], 0);
    audio.syncSettings(settings);
    audio.handle([volley], 0);
    audio.dispose();
    audio.dispose();
    expect(fake.cues).toEqual([]);
    expect(fake.contexts[0].closed).toBe(true);
  });
});
