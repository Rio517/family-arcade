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

function modalBackgroundBranches(
  dialog: HTMLElement | null,
  localBackground: HTMLElement | null,
): HTMLElement[] {
  const branches = new Set<HTMLElement>();
  const add = (element: HTMLElement | null) => {
    if (element !== null && element !== dialog && !element.contains(dialog)) {
      branches.add(element);
    }
  };
  add(localBackground);

  let activeBranch: HTMLElement | null = dialog;
  while (activeBranch?.parentElement) {
    const parent = activeBranch.parentElement;
    for (const sibling of parent.children) {
      if (sibling !== activeBranch && sibling instanceof HTMLElement) add(sibling);
    }
    if (parent === document.body) break;
    activeBranch = parent;
  }

  return [...branches];
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
    const inertSnapshots = modalBackgroundBranches(dialog, background).map((element) => ({
      element,
      priorInert: element.getAttribute('inert'),
    }));
    for (const { element } of inertSnapshots) element.setAttribute('inert', '');
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

    const onFocusIn = (event: FocusEvent) => {
      if (dialog === null || !(event.target instanceof Node) || dialog.contains(event.target)) return;
      initialFocusRef.current?.focus();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('focusin', onFocusIn, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('focusin', onFocusIn, { capture: true });
      for (const { element, priorInert } of inertSnapshots) {
        if (priorInert === null) element.removeAttribute('inert');
        else element.setAttribute('inert', priorInert);
      }
      returnFocus?.focus();
    };
  }, [active, backgroundRef, dialogRef, initialFocusRef, returnFocusRef]);
}
