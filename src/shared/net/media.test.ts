import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaLink } from './media';

const noop = {
  onStatus: () => {},
  onLocalStream: () => {},
  onRemoteStream: () => {},
};

// A minimal in-memory PeerJS stand-in (mirrors peer.test.ts): enough surface
// for MediaLink to register and receive calls, driven by emitted events.
const { FakeMediaPeer, FakeMediaConnection, fakeMediaPeers } = vi.hoisted(() => {
  class FakeEmitter {
    private handlers = new Map<string, Array<(...args: unknown[]) => void>>();
    on(ev: string, fn: (...args: unknown[]) => void) {
      const list = this.handlers.get(ev) ?? [];
      list.push(fn);
      this.handlers.set(ev, list);
      return this;
    }
    emit(ev: string, ...args: unknown[]) {
      for (const fn of [...(this.handlers.get(ev) ?? [])]) fn(...args);
    }
    removeAllListeners() {
      this.handlers.clear();
    }
  }

  class FakeMediaConnection extends FakeEmitter {
    open = false;
    closed = false;
    /** What answer() was handed — 'unanswered' until it happens. */
    answered: unknown = 'unanswered';
    constructor(public peer: string) {
      super();
    }
    answer(stream?: unknown) {
      this.answered = stream ?? null;
      this.open = true;
    }
    close() {
      this.closed = true;
      this.open = false;
      this.emit('close');
    }
  }

  const fakeMediaPeers: FakeMediaPeer[] = [];
  class FakeMediaPeer extends FakeEmitter {
    id: string | undefined;
    constructor(...args: unknown[]) {
      super();
      this.id = typeof args[0] === 'string' ? args[0] : undefined;
      fakeMediaPeers.push(this);
    }
    call(id: string) {
      return new FakeMediaConnection(id);
    }
    reconnect() {}
    destroy() {}
  }

  return { FakeMediaPeer, FakeMediaConnection, fakeMediaPeers };
});

vi.mock('peerjs', () => ({ default: FakeMediaPeer }));

describe('MediaLink — only the party answers the party', () => {
  // Give jsdom a mic: a stub stream so start() gets past capture and actually
  // opens the peer. Scoped to this block — the pure-surface tests below rely
  // on capture failing.
  const fakeStream = { getTracks: () => [], getAudioTracks: () => [] };
  beforeEach(() => {
    fakeMediaPeers.length = 0;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: () => Promise.resolve(fakeStream) },
      configurable: true,
    });
  });
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'mediaDevices');
  });

  it('the guest registers the derived guest id, not an anonymous one', async () => {
    const link = new MediaLink(noop, 'party-call-v1-');
    await link.start('KXQZ', 'guest');
    expect(fakeMediaPeers[fakeMediaPeers.length - 1].id).toBe('party-call-v1-KXQZ-guest');
    link.destroy();
  });

  it('the host answers the party guest and refuses any other caller', async () => {
    const link = new MediaLink(noop, 'party-call-v1-');
    await link.start('KXQZ', 'host');
    const peer = fakeMediaPeers[fakeMediaPeers.length - 1];
    peer.emit('open');

    // A stranger who learned the code dials the host's media id directly.
    // They must never be answered — answering hands them live mic audio.
    const stranger = new FakeMediaConnection('some-random-peer');
    peer.emit('call', stranger);
    expect(stranger.answered).toBe('unanswered');
    expect(stranger.closed).toBe(true);

    // The party's own guest (on the derived id) gets answered.
    const guest = new FakeMediaConnection('party-call-v1-KXQZ-guest');
    peer.emit('call', guest);
    expect(guest.answered).not.toBe('unanswered');
    expect(guest.closed).toBe(false);
    link.destroy();
  });
});

// The WebRTC/getUserMedia paths need a real browser; here we cover the pure
// state surface that doesn't touch the network or media devices.
describe('MediaLink (pure surface)', () => {
  it('starts muted-off and camera-off', () => {
    const link = new MediaLink(noop);
    expect(link.isMuted).toBe(false);
    expect(link.isCameraOn).toBe(false);
  });

  it('toggles mute without a live stream', () => {
    const link = new MediaLink(noop);
    expect(link.toggleMute()).toBe(true);
    expect(link.isMuted).toBe(true);
    expect(link.toggleMute()).toBe(false);
    expect(link.isMuted).toBe(false);
  });

  it('is safe to destroy before starting', () => {
    const link = new MediaLink(noop);
    expect(() => link.destroy()).not.toThrow();
  });

  it('ignores setCamera before a call has started', async () => {
    const link = new MediaLink(noop);
    await expect(link.setCamera(true)).resolves.toBeUndefined();
    expect(link.isCameraOn).toBe(false);
  });

  it('a blocked camera does not report a fatal "denied" (voice keeps going)', async () => {
    const seen: Array<{ s: string; d?: string }> = [];
    const link = new MediaLink({
      onStatus: (s, d) => seen.push({ s, d }),
      onLocalStream: () => {},
      onRemoteStream: () => {},
    });
    // start() can't reach a mic under jsdom, but it records the code so the
    // subsequent setCamera actually runs its capture path.
    await link.start('ABCD', 'guest', false);
    seen.length = 0; // ignore start()'s own statuses
    await link.setCamera(true);
    expect(link.isCameraOn).toBe(false); // camera stayed off
    // Crucially NOT 'denied' — that would tear the whole call (and the voice) down.
    expect(seen.map((e) => e.s)).not.toContain('denied');
    expect(seen.some((e) => e.d === 'Camera permission was blocked.')).toBe(true);
  });
});
