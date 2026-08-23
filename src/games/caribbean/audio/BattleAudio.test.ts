import { describe, expect, it } from 'vitest';

import type { NavalEvent } from '../domain/naval/types';
import { BattleAudio, type AudioFactory, type BattleAudioSettings } from './BattleAudio';

interface FakeNode {
  connect(destination: unknown): unknown;
  disconnect(): void;
  start(): void;
  stop(): void;
  gain?: { value: number; setValueAtTime(value: number): void; linearRampToValueAtTime(value: number): void };
  frequency?: { value: number; setValueAtTime(value: number): void; exponentialRampToValueAtTime(value: number): void };
  type?: OscillatorType;
}

function fakeAudioFactory(options: { rejectResume?: boolean; deferredResume?: boolean } = {}) {
  const nodes: FakeNode[] = [];
  const cues: string[] = [];
  let resolveResume: (() => void) | undefined;
  const context = {
    currentTime: 0,
    destination: {},
    resume: () => options.rejectResume
      ? Promise.reject(new Error('blocked'))
      : options.deferredResume
        ? new Promise<void>((resolve) => { resolveResume = resolve; })
        : Promise.resolve(),
    close: () => Promise.resolve(),
    createGain: () => node(),
    createOscillator: () => node(),
    createBuffer: () => ({ length: 1 }),
    createBufferSource: () => node(),
    createBiquadFilter: () => node(),
  };
  function node(): FakeNode {
    const item: FakeNode = {
      connect: () => undefined,
      disconnect: () => undefined,
      start: () => undefined,
      stop: () => undefined,
      gain: { value: 1, setValueAtTime: () => undefined, linearRampToValueAtTime: () => undefined },
      frequency: { value: 440, setValueAtTime: () => undefined, exponentialRampToValueAtTime: () => undefined },
    };
    nodes.push(item);
    return item;
  }
  const factory: AudioFactory = {
    createContext: () => context,
    onCue: (cue) => cues.push(cue),
  };
  return { factory, contexts: () => 1, nodes, cues, resolveResume: () => resolveResume?.() };
}

const volley: NavalEvent = {
  id: 1, kind: 'volley', atTick: 2, shipId: 'player', targetShipId: 'opponent',
  result: { volleyId: 1, side: 'port', ammunition: 'round', fired: 4, hits: 2, misses: 2, damage: { hull: 4, sails: 1, crew: 0, cannon: 0 }, seedAfter: 1, samples: [] },
};
const damage: NavalEvent = { id: 2, kind: 'damage', atTick: 2, shipId: 'opponent', damage: { hull: 4, sails: 1, crew: 0, cannon: 0 } };

const settings: BattleAudioSettings = { master: 0.8, effects: 0.9, muted: false, active: true };

describe('BattleAudio', () => {
  it('does not create or replay pre-activation history, then handles an event once', async () => {
    const fake = fakeAudioFactory();
    const audio = new BattleAudio(fake.factory);
    audio.handle([volley], 0);
    expect(fake.cues).toEqual([]);

    await audio.activate();
    audio.handle([{ ...volley, id: 2 }, { ...damage, id: 3 }], 0);
    audio.handle([{ ...volley, id: 2 }, { ...damage, id: 3 }], 0);
    expect(fake.cues).toEqual(['cannon', 'splash', 'impact', 'rig-tear']);
  });

  it('scopes duplicate ids to battle generation and ignores old out-of-order events', async () => {
    const fake = fakeAudioFactory();
    const audio = new BattleAudio(fake.factory);
    await audio.activate();
    audio.handle([{ ...volley, id: 3 }], 0);
    audio.handle([{ ...volley, id: 2 }, { ...volley, id: 3 }], 0);
    audio.handle([{ ...volley, id: 1 }], 1);
    expect(fake.cues.filter((cue) => cue === 'cannon')).toHaveLength(2);
  });

  it('coalesces rejected and concurrent activation while remaining retryable', async () => {
    const rejected = fakeAudioFactory({ rejectResume: true });
    const audio = new BattleAudio(rejected.factory);
    await expect(audio.activate()).resolves.toBe(false);
    await expect(audio.activate()).resolves.toBe(false);

    const deferred = fakeAudioFactory({ deferredResume: true });
    const concurrent = new BattleAudio(deferred.factory);
    const first = concurrent.activate();
    const second = concurrent.activate();
    expect(first).toBe(second);
    deferred.resolveResume();
    await expect(first).resolves.toBe(true);
  });

  it('delivers only post-gesture events that arrive during a deferred activation', async () => {
    const fake = fakeAudioFactory({ deferredResume: true });
    const audio = new BattleAudio(fake.factory);
    audio.handle([volley], 0);
    const activating = audio.activate();
    audio.handle([{ ...volley, id: 2 }], 0);
    fake.resolveResume();
    await activating;
    expect(fake.cues).toContain('cannon');
    expect(fake.cues.filter((cue) => cue === 'cannon')).toHaveLength(1);
  });

  it('mutes immediately, never replays muted events, and disposes safely', async () => {
    const fake = fakeAudioFactory();
    const audio = new BattleAudio(fake.factory);
    await audio.activate();
    audio.syncSettings({ ...settings, muted: true });
    audio.handle([volley], 0);
    audio.syncSettings(settings);
    audio.handle([volley], 0);
    audio.dispose();
    audio.dispose();
    expect(fake.cues).toEqual([]);
    expect(fake.nodes.length).toBeGreaterThan(0);
  });

  it('allows a new surrender cue through terminal silence but not muted terminal history', async () => {
    const fake = fakeAudioFactory();
    const audio = new BattleAudio(fake.factory);
    await audio.activate();
    audio.syncSettings({ ...settings, active: false });
    audio.handle([{ id: 8, kind: 'outcome', atTick: 8, outcome: { kind: 'surrender', victorShipId: 'player' } }], 0);
    expect(fake.cues).toContain('surrender-bell');
  });
});
