/**
 * Who's playing? Numbered chairs filled by tapping tickets from the strip
 * below — the default table for Chess same-device and Magic Coins. A game
 * with its own chair chrome (Risk's heraldic seals and computer generals)
 * composes TicketStrip into its own rows instead.
 */

import { CloseIcon } from '@shared/ui/icons';
import { playerColor } from './playerColors';
import { clearSeat, fillNextEmpty, seatName, seatedUserIds, type Seat } from './seats';
import { initialOf } from './tickets';
import { TicketStrip } from './TicketStrip';
import { useIdentity } from './useIdentity';
import './player.css';

export function SeatPicker({
  seats,
  onChange,
  rowLabel,
  accent,
  botName = () => '',
  testIdPrefix = 'seat',
}: {
  seats: Seat[];
  onChange: (next: Seat[]) => void;
  /** e.g. "White" / "Black" — shown beside the chair number. */
  rowLabel?: (index: number) => React.ReactNode;
  /** A per-chair colour for the number badge (a game's seat colours). */
  accent?: (index: number) => string;
  /** Names a computer chair; only games with bots pass one. */
  botName?: (botId: string) => string;
  testIdPrefix?: string;
}) {
  const { users, active } = useIdentity();
  const seated = new Set(seatedUserIds(seats));
  const full = seats.every((s) => s.kind !== 'empty');

  return (
    <div className="spick">
      <ol className="spick-rows">
        {seats.map((seat, i) => {
          const name = seatName(seat, users, botName);
          const rosterIndex = seat.kind === 'ticket' ? users.findIndex((u) => u.id === seat.userId) : -1;
          return (
            <li
              key={i}
              className={`spick-row ${seat.kind}`}
              style={{ '--pc': accent?.(i) ?? 'var(--accent)' } as React.CSSProperties}
              data-testid={`${testIdPrefix}-${i}`}
            >
              <span className="spick-num" aria-hidden="true">{i + 1}</span>
              {rowLabel && <span className="spick-label">{rowLabel(i)}</span>}
              {seat.kind === 'empty' ? (
                <span className="spick-empty">
                  <span className="sr-only">Chair {i + 1}: </span>tap a ticket below
                </span>
              ) : (
                <>
                  {seat.kind === 'ticket' && (
                    <span
                      className="pmedal sm"
                      style={{ '--c': playerColor(rosterIndex) } as React.CSSProperties}
                      aria-hidden="true"
                    >
                      {initialOf(name)}
                    </span>
                  )}
                  <span className="spick-name">
                    {name || 'Someone'}
                    {seat.kind === 'ticket' && seat.userId === active?.id && <span className="pstub-you">you</span>}
                  </span>
                  <button
                    type="button"
                    className="spick-clear"
                    aria-label={`Clear chair ${i + 1}`}
                    data-testid={`${testIdPrefix}-${i}-clear`}
                    onClick={() => onChange(clearSeat(seats, i))}
                  >
                    <CloseIcon size={18} />
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ol>
      <TicketStrip
        seated={seated}
        full={full}
        onPick={(userId) => onChange(fillNextEmpty(seats, { kind: 'ticket', userId }))}
      />
    </div>
  );
}
