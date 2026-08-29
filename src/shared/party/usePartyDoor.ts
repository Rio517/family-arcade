/**
 * A party guest standing at a game's door.
 *
 * While `active` (the game's own "I'm at the online door" condition), the door
 * knocks once — so the host's pill lights up — and hands over the table the
 * moment the host opens it: once per code, however often the party re-renders
 * or the host re-announces. `onClosed` fires when a table you were handed goes
 * away (the host closed it, or opened a fresh one — then `onTable` follows),
 * whether or not you are still at the door, so a game can hang up a dial at a
 * dead code. The host, and anyone not in a party, get nothing from this hook:
 * the code doors are the game's own business.
 *
 * Shared code stays game-blind: the game passes its registry id in, and gets
 * the code (and the host's side, an opaque string) back.
 */
import { useEffect, useRef } from 'react';
import { useParty } from './PartyContext';

export interface PartyDoor {
  /** A guest in a party, at this door, with no table open yet. */
  waiting: boolean;
  /** The friend's name for the waiting copy (null until their hello lands). */
  friend: string | null;
}

export function usePartyDoor(
  gameId: string,
  active: boolean,
  onTable: (code: string, hostSide?: string) => void,
  onClosed?: () => void,
): PartyDoor {
  const party = useParty();
  const guest = party.inParty && party.role === 'guest';
  const table = guest && party.table?.game === gameId ? party.table : null;
  const code = table?.code ?? null;
  const hostSide = table?.hostSide;
  const { knockOn } = party;

  // The code we sat down at, and whether we have knocked during this closed
  // spell. Both reset on unmount, so StrictMode's rehearsal mount — whose
  // cleanup tears the game's link down — is followed by a real knock and a
  // real seat, not a skipped one.
  const seatedRef = useRef<string | null>(null);
  const knockedRef = useRef(false);
  useEffect(
    () => () => {
      seatedRef.current = null;
      knockedRef.current = false;
    },
    [],
  );

  useEffect(() => {
    if (!guest) {
      // Not a guest (any more): nothing to hold on to.
      seatedRef.current = null;
      knockedRef.current = false;
      return;
    }
    if (!code) {
      if (seatedRef.current) {
        seatedRef.current = null;
        onClosed?.();
      }
      if (active && !knockedRef.current) {
        knockedRef.current = true;
        knockOn(gameId);
      }
      return;
    }
    // A table is open: a re-knock is wanted if it closes again later.
    knockedRef.current = false;
    if (!active || seatedRef.current === code) return;
    // A fresh code while seated at an old one: hang up before dialling again.
    if (seatedRef.current) onClosed?.();
    seatedRef.current = code;
    onTable(code, hostSide);
  }, [guest, active, code, hostSide, gameId, knockOn, onTable, onClosed]);

  return { waiting: guest && active && !code, friend: party.theirName };
}
