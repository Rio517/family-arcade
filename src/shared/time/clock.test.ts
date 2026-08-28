import { afterEach, describe, expect, it, vi } from 'vitest';

import { arcadeNow } from './clock';

describe('arcade clock', () => {
  const originalTestNow = window.__ARCADE_TEST_NOW__;

  afterEach(() => {
    if (originalTestNow === undefined) delete window.__ARCADE_TEST_NOW__;
    else window.__ARCADE_TEST_NOW__ = originalTestNow;
    vi.restoreAllMocks();
  });

  it('uses the browser clock outside deterministic browser evidence runs', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_456_000);
    expect(arcadeNow()).toBe(1_700_000_456_000);
  });

  it('uses the deterministic Arcade clock without replacing global Date.now', () => {
    const nativeNow = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_456_000);
    window.__ARCADE_TEST_NOW__ = vi.fn(() => 1_700_000_123_000);

    expect(arcadeNow()).toBe(1_700_000_123_000);
    expect(window.__ARCADE_TEST_NOW__).toHaveBeenCalledOnce();
    expect(nativeNow).not.toHaveBeenCalled();
  });
});
