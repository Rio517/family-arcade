/**
 * "Papa · Switch player ›" — the one line at the top of every lobby that says
 * who is playing. No game asks for a name; the profile is the identity.
 * Switching opens the picker over the page, so the wrong person at the iPad
 * is two taps from fixed without the lobby moving under their thumb. One
 * name, one verb: the gate, this line and the Ticket Booth all say "Switch
 * player" and open the same picker (the UX pass, docs/mockups/20260831-party-ui).
 */

import { useCallback, useRef, useState } from 'react';
import { Medal } from './Medal';
import { PlayerPicker } from './PlayerPicker';
import { useIdentity } from './useIdentity';
import './player.css';

export function PlayingAs() {
  const { users, active, signIn, newPlayer } = useIdentity();
  const [open, setOpen] = useState(false);
  const changeRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    changeRef.current?.focus();
  }, []);

  // The gate handles "nobody signed in"; the party panel writes its own line.
  if (!active) return null;
  const index = users.findIndex((u) => u.id === active.id);

  return (
    <div className="pas" data-testid="playing-as">
      <div className="pas-pill">
        <Medal name={active.profile.name} index={index} small />
        <span className="pas-who">{active.profile.name}</span>
        <button
          ref={changeRef}
          type="button"
          className="pas-change"
          data-testid="playing-as-change"
          aria-expanded={open}
          onClick={() => (open ? close() : setOpen(true))}
        >
          Switch player ›
        </button>
      </div>

      {open && (
        <PlayerPicker
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
          onClose={close}
        />
      )}
    </div>
  );
}
