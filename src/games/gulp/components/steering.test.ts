import { describe, expect, it } from 'vitest';
import { MOUSE_WAIT_AFTER_KEYS_MS, mouseMayTakeOver } from './steering';

describe('keys and mouse taking turns', () => {
  it('lets the mouse steer when no key has been used', () => {
    expect(mouseMayTakeOver(0, -Infinity, 0)).toBe(true);
  });

  it('keeps the mouse out while a steering key is held', () => {
    expect(mouseMayTakeOver(1, 0, 60_000)).toBe(false);
  });

  it('keeps the mouse out for a moment after the keys are let go', () => {
    expect(mouseMayTakeOver(0, 5_000, 5_000 + MOUSE_WAIT_AFTER_KEYS_MS - 1)).toBe(false);
  });

  it('gives the mouse back once the keys have been quiet long enough', () => {
    expect(mouseMayTakeOver(0, 5_000, 5_000 + MOUSE_WAIT_AFTER_KEYS_MS)).toBe(true);
  });
});
