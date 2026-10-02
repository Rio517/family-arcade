import { useEffect } from 'react';

/**
 * Keep the screen on while `active`: a round other devices are playing in
 * stops when this one sleeps. The browser lets go of the lock when the page
 * is hidden, so it is asked for again when the page shows. Where the browser
 * has no wake lock, or says no, the screen sleeps as it always would.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let done = false;
    const ask = () => {
      if (done || document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then(
        (l) => {
          if (done) void l.release();
          else lock = l;
        },
        () => {},
      );
    };
    ask();
    document.addEventListener('visibilitychange', ask);
    return () => {
      done = true;
      document.removeEventListener('visibilitychange', ask);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}
