/**
 * Who's playing? Numbered chairs filled by tapping tickets from the strip
 * below — the default table for Chess same-device and Magic Coins. A game
 * with its own chair chrome (Risk's heraldic seals and computer generals)
 * composes TicketStrip into its own rows instead.
 */

import { useRef } from 'react';
import { CloseIcon } from '@shared/ui/icons';
import { Medal } from './Medal';
import { clearSeat, seatName, type Seat } from './seats';
import { TicketStrip } from './TicketStrip';
import { useIdentity } from './useIdentity';
import './player.css';

export function SeatPicker({
  seats,
  onChange,
  rowLabel,
  accent,
}: {
  seats: Seat[];
  onChange: (next: Seat[]) => void;
  /** e.g. "White" / "Black" — shown beside the chair number. */
  rowLabel?: (index: number) => React.ReactNode;
  /** A per-chair colour for the number badge (a game's seat colours). */
  accent?: (index: number) => string;
}) {
  const { users, active } = useIdentity();
  const rows = useRef<(HTMLLIElement | null)[]>([]);

  const clear = (i: number) => {
    onChange(clearSeat(seats, i));
    // The × unmounts with the ticket; keep the keyboard on the chair it emptied.
    rows.current[i]?.focus();
  };

  return (
    <div className="spick">
      <ol className="spick-rows">
        {seats.map((seat, i) => {
          const name = seatName(seat, users);
          const rosterIndex = seat.kind === 'ticket' ? users.findIndex((u) => u.id === seat.userId) : -1;
          return (
            <li
              key={i}
              ref={(el) => {
                rows.current[i] = el;
              }}
              tabIndex={-1}
              className={`spick-row ${seat.kind}`}
              style={{ '--pc': accent?.(i) ?? 'var(--accent)' } as React.CSSProperties}
              data-testid={`seat-${i}`}
            >
              <span className="spick-num" aria-hidden="true">{i + 1}</span>
              <span className="sr-only">Chair {i + 1}: </span>
              {rowLabel && <span className="spick-label">{rowLabel(i)}</span>}
              {seat.kind === 'empty' ? (
                <span className="spick-empty">tap a ticket below</span>
              ) : (
                <>
                  {seat.kind === 'ticket' && <Medal name={name} index={rosterIndex} small />}
                  <span className="spick-name">
                    {name || 'Someone'}
                    {seat.kind === 'ticket' && seat.userId === active?.id && <span className="pstub-you">you</span>}
                  </span>
                  <button
                    type="button"
                    className="spick-clear"
                    aria-label={`Clear chair ${i + 1}: ${name || 'Someone'}`}
                    data-testid={`seat-${i}-clear`}
                    onClick={() => clear(i)}
                  >
                    <CloseIcon size={18} />
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ol>
      <TicketStrip seats={seats} onChange={onChange} />
    </div>
  );
}
