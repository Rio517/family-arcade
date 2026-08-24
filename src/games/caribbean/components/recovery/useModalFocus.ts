import { useEffect, type RefObject } from 'react';

import { useDismissOnEscape } from '@shared/ui/useDismissOnEscape';

const FOCUSABLE = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface ModalFocusOptions {
  active: boolean;
  dialogRef: RefObject<HTMLElement | null>;
  initialFocusRef: RefObject<HTMLElement | null>;
  returnFocusRef: RefObject<HTMLElement | null>;
  backgroundRef: RefObject<HTMLElement | null>;
  onDismiss(): void;
}

export function useModalFocus({
  active,
  dialogRef,
  initialFocusRef,
  returnFocusRef,
  backgroundRef,
  onDismiss,
}: ModalFocusOptions): void {
  useDismissOnEscape(active, onDismiss);

  useEffect(() => {
    if (!active) return;

    const dialog = dialogRef.current;
    const background = backgroundRef.current;
    const returnFocus = returnFocusRef.current;
    const priorInert = background?.getAttribute('inert') ?? null;
    background?.setAttribute('inert', '');
    initialFocusRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || dialog === null) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)]
        .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (background !== null) {
        if (priorInert === null) background.removeAttribute('inert');
        else background.setAttribute('inert', priorInert);
      }
      returnFocus?.focus();
    };
  }, [active, backgroundRef, dialogRef, initialFocusRef, returnFocusRef]);
}
