/**
 * "Leave the race?" — the small confirm in front of the corner ‹ while a race
 * is running, so one stray tap never throws a race away. Escape (and a tap on
 * the dim backdrop) means "Keep racing". Focus lands on the safe button, Tab
 * stays inside the card, and focus goes back to the ‹ when it closes.
 */
import { useEffect, useRef } from 'react';
import { useDismissOnEscape } from '@shared/ui/useDismissOnEscape';

export function LeaveRaceDialog({ onKeep, onLeave }: { onKeep: () => void; onLeave: () => void }) {
  const keepRef = useRef<HTMLButtonElement>(null);
  const leaveRef = useRef<HTMLButtonElement>(null);
  useDismissOnEscape(true, onKeep);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    keepRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  /** Two buttons, so Tab at either end wraps to the other. */
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const edge = e.shiftKey ? keepRef.current : leaveRef.current;
    if (document.activeElement === edge) {
      e.preventDefault();
      (e.shiftKey ? leaveRef : keepRef).current?.focus();
    }
  };

  return (
    // The backdrop click is a mouse shortcut for Escape; the keyboard path is Escape and the buttons.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="racer-leave"
      data-testid="racer-leave"
      onClick={(e) => e.target === e.currentTarget && onKeep()}
      onKeyDown={trapTab}
    >
      <div
        className="racer-leave-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="racer-leave-title"
      >
        <h2 id="racer-leave-title">Leave the race?</h2>
        <div className="racer-leave-btns">
          <button ref={keepRef} className="racer-primary" onClick={onKeep} data-testid="racer-leave-keep">
            Keep racing
          </button>
          <button ref={leaveRef} className="racer-ghost" onClick={onLeave} data-testid="racer-leave-confirm">
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}
