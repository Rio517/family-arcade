/**
 * The round medallion with a player's initial, in their roster colour — the
 * one avatar the arcade draws (gate stubs, "You're Papa", chairs, chips).
 */

import { playerColor } from './playerColors';
import { initialOf } from './tickets';

export function Medal({ name, index, small = false }: {
  name: string;
  /** Roster position (colour); -1 for a ticket that vanished. */
  index: number;
  small?: boolean;
}) {
  return (
    <span
      className={small ? 'pmedal sm' : 'pmedal'}
      style={{ '--c': playerColor(index) } as React.CSSProperties}
      aria-hidden="true"
    >
      {initialOf(name)}
    </span>
  );
}
