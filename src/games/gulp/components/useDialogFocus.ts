/**
 * Keyboard focus for Gulp's cards (pause, results): while one is open, focus
 * starts on its first button, Tab cycles through its own buttons only, and
 * when it closes focus goes back to where it was.
 */
import { useEffect, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function useDialogFocus(active: boolean, dialogRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!active || !dialog) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const items = () => [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
    items()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = items();
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      const inside = dialog.contains(document.activeElement);
      if (e.shiftKey && (!inside || document.activeElement === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      before?.focus();
    };
  }, [active, dialogRef]);
}
