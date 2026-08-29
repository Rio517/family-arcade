/**
 * "You're Papa · Change ›" — the one line at the top of every lobby that says
 * whose ticket is playing. No game asks for a name; a ticket is the identity.
 * Change drops the ticket list in place, so the wrong person at the iPad is
 * two taps from fixed, without leaving the game.
 */

import { useCallback, useRef, useState } from 'react';
import { useDismissOnEscape } from '@shared/ui/useDismissOnEscape';
import { playerColor } from './playerColors';
import { initialOf, TicketList } from './TicketList';
import { useUsers } from './useUsers';
import './player.css';

export function PlayingAs() {
  const { users, active, signIn, newPlayer } = useUsers();
  const [open, setOpen] = useState(false);
  const changeRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    changeRef.current?.focus();
  }, []);
  useDismissOnEscape(open, close);

  // The gate handles "nobody signed in"; the party panel writes its own line.
  if (!active) return null;
  const index = users.findIndex((u) => u.id === active.id);

  return (
    <div className="pas" data-testid="playing-as">
      <div className="pas-pill">
        <span
          className="pmedal sm"
          style={{ '--c': playerColor(index) } as React.CSSProperties}
          aria-hidden="true"
        >
          {initialOf(active.profile.name)}
        </span>
        <span className="pas-who">You're {active.profile.name}</span>
        <button
          ref={changeRef}
          type="button"
          className="pas-change"
          data-testid="playing-as-change"
          aria-expanded={open}
          onClick={() => (open ? close() : setOpen(true))}
        >
          {open ? 'Close' : 'Change ›'}
        </button>
      </div>

      {open && (
        <div className="pas-card" role="dialog" aria-label="Change player">
          <TicketList
            users={users}
            activeId={active.id}
            testIdPrefix="switch"
            onPick={(id) => {
              signIn(id);
              close();
            }}
            onCreate={(name) => {
              newPlayer(name);
              close();
            }}
          />
          <button type="button" className="pas-cancel" data-testid="playing-as-cancel" onClick={close}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
