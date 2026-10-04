/**
 * The arcade's new home. arcade.knyflores.com keeps serving this build, and
 * the first time a device lands there it says, once, that the arcade now
 * lives at familyarcade.eu. Either answer closes it for good on that device;
 * playing on here stays a choice. Anywhere else (familyarcade.eu, a preview
 * on the laptop) it never shows.
 */
import { useEffect, useRef, useState } from 'react';
import { useDismissOnEscape } from '@shared/ui/useDismissOnEscape';

export const OLD_HOST = 'arcade.knyflores.com';
const NEW_HOME = 'https://familyarcade.eu/';
export const MOVED_SEEN_KEY = 'arcade.movedNotice.seen';

function seenBefore(): boolean {
  try {
    return localStorage.getItem(MOVED_SEEN_KEY) !== null;
  } catch {
    // No storage (a locked-down browser): say it on each visit rather than never.
    return false;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(MOVED_SEEN_KEY, new Date().toISOString());
  } catch {
    // Nothing to remember it in; closing still works for this visit.
  }
}

export function MovedNotice({ host = window.location.hostname }: { host?: string }) {
  const [open, setOpen] = useState(() => host === OLD_HOST && !seenBefore());
  const goRef = useRef<HTMLAnchorElement>(null);
  const stayRef = useRef<HTMLButtonElement>(null);

  const stay = () => {
    markSeen();
    setOpen(false);
  };
  useDismissOnEscape(open, stay);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    goRef.current?.focus();
    return () => opener?.focus?.();
  }, [open]);

  if (!open) return null;

  /** Two controls, so Tab at either end wraps to the other. */
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const edge = e.shiftKey ? goRef.current : stayRef.current;
    if (document.activeElement === edge) {
      e.preventDefault();
      (e.shiftKey ? stayRef : goRef).current?.focus();
    }
  };

  return (
    // The backdrop click is a mouse shortcut for "Keep playing here"; the keyboard path is Escape and the buttons.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="modal-backdrop moved"
      data-testid="moved-notice"
      onClick={(e) => e.target === e.currentTarget && stay()}
      onKeyDown={trapTab}
    >
      <div className="modal moved-card" role="dialog" aria-modal="true" aria-labelledby="moved-title" aria-describedby="moved-body">
        <h2 className="moved-title" id="moved-title">
          The arcade has a new home!
        </h2>
        <p className="moved-body" id="moved-body">
          It lives at <b>familyarcade.eu</b> now, with the newest games. This address keeps working, so you can keep
          playing here too. Players saved here stay here.
        </p>
        <div className="moved-btns">
          <a ref={goRef} className="moved-go" href={NEW_HOME} onClick={markSeen} data-testid="moved-go">
            Go to familyarcade.eu
          </a>
          <button ref={stayRef} type="button" className="moved-stay" onClick={stay} data-testid="moved-stay">
            Keep playing here
          </button>
        </div>
      </div>
    </div>
  );
}
