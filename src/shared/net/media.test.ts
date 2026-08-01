import { describe, expect, it } from 'vitest';
import { MediaLink } from './media';

const noop = {
  onStatus: () => {},
  onLocalStream: () => {},
  onRemoteStream: () => {},
};

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
});
