import { useEffect, useRef } from 'react';

/**
 * Moves focus onto a screen when it opens, so the keyboard path starts there
 * and a screen reader names the new screen.
 */
export function useFocusOnOpen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return ref;
}
