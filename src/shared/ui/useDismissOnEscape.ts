import { useEffect, useRef } from 'react';

/**
 * Close the active dialog when the player presses Escape.
 *
 * Every overlay in the arcade could be dismissed by clicking the dark
 * backdrop — which is a mouse-only affordance. A keyboard player had no way
 * out of a share sheet or a promotion picker except tabbing to the close
 * button, and the promotion pickers have no close button at all. Escape is
 * the expected key for "never mind" and costs nothing.
 *
 * `onDismiss` is held in a ref, so passing an inline arrow (the common case)
 * doesn't resubscribe the listener on every render.
 *
 * @param active   whether the dialog is currently open
 * @param onDismiss what to run on Escape
 */
export function useDismissOnEscape(active: boolean, onDismiss: () => void): void {
  const handler = useRef(onDismiss);
  // Refreshed in an effect, not during render — writing a ref while
  // rendering is what `react-hooks/refs` (correctly) warns about.
  useEffect(() => {
    handler.current = onDismiss;
  });

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Stop the key reaching a game underneath — Escape shouldn't also
      // pause the racer or deselect a chess piece while closing a dialog.
      e.stopPropagation();
      handler.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active]);
}
