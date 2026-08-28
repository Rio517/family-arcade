declare global {
  interface Window {
    __ARCADE_TEST_NOW__?: () => number;
  }
}

export function arcadeNow(): number {
  return typeof window === 'undefined'
    ? Date.now()
    : window.__ARCADE_TEST_NOW__?.() ?? Date.now();
}
