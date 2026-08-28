import { afterEach, describe, expect, it, vi } from 'vitest';

describe('browser Caribbean runtime', () => {
  const originalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');
  const originalTestNow = window.__ARCADE_TEST_NOW__;

  afterEach(() => {
    if (originalStorage) Object.defineProperty(window, 'localStorage', originalStorage);
    if (originalTestNow === undefined) delete window.__ARCADE_TEST_NOW__;
    else window.__ARCADE_TEST_NOW__ = originalTestNow;
    vi.resetModules();
  });

  it('is a module singleton with stable runtime, storage, and writer identity', async () => {
    vi.resetModules();
    const { getBrowserCaribbeanRuntime } = await import('./runtime');

    const first = getBrowserCaribbeanRuntime();
    const second = getBrowserCaribbeanRuntime();

    expect(second).toBe(first);
    expect(second.storage).toBe(first.storage);
    expect(second.writer).toBe(first.writer);
    // Kills retaining the old port-only build identity after sailing ships.
    expect(first.build).toBe('caribbean-sailing-1');
  });

  it('keeps deterministic campaign time separate from the browser clock', async () => {
    window.__ARCADE_TEST_NOW__ = vi.fn(() => 1_700_000_123_000);
    vi.resetModules();
    const { getBrowserCaribbeanRuntime } = await import('./runtime');

    expect(getBrowserCaribbeanRuntime().now()).toBe(1_700_000_123_000);
    expect(window.__ARCADE_TEST_NOW__).toHaveBeenCalledOnce();
  });

  it('guards localStorage property access and exposes one captured unavailable capability', async () => {
    const denied = new DOMException('Storage denied', 'SecurityError');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw denied;
      },
    });
    vi.resetModules();
    const { getBrowserCaribbeanRuntime } = await import('./runtime');

    let runtime: ReturnType<typeof getBrowserCaribbeanRuntime> | undefined;
    expect(() => {
      runtime = getBrowserCaribbeanRuntime();
    }).not.toThrow();
    expect(runtime?.storageCapability).toEqual({ kind: 'unavailable', error: denied });
    for (const operation of [
      () => runtime?.storage.getItem('anything'),
      () => runtime?.storage.setItem('anything', 'value'),
      () => runtime?.storage.removeItem('anything'),
    ]) {
      try {
        operation();
        throw new Error('guarded storage operation did not throw');
      } catch (error) {
        expect(error).toBe(denied);
      }
    }
  });
});
