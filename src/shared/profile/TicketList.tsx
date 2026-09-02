/**
 * The ticket list — the one way a player is picked anywhere in the arcade:
 * at the gate, behind "Switch player" in a lobby, at the booth's Switch.
 * Saved players are one tap; a single field filters them as you type and,
 * when nobody matches, makes a profile for that name. No chip rows, no
 * second form.
 *
 * The wording says "profile", not "ticket": tickets are the arcade's points,
 * and a child reading "make a ticket for Mario" has to work out which of the
 * two it means. The info button says where a profile lives, because that is
 * the question a parent has at the moment a name is typed in.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { InfoIcon } from '@shared/ui/icons';
import { playerColor } from './playerColors';
import { canCreateTicket, initialOf, matchTickets } from './tickets';
import type { StoredUser } from './users';
import './player.css';

export function TicketList({
  users,
  activeId = null,
  onPick,
  onCreate,
  testIdPrefix = 'ticket',
}: {
  users: StoredUser[];
  /** The signed-in ticket — marked "you", still tappable. */
  activeId?: string | null;
  onPick: (id: string) => void;
  /** Called with a trimmed, non-blank name nobody has yet. */
  onCreate: (name: string) => void;
  testIdPrefix?: string;
}) {
  const [query, setQuery] = useState('');
  const [showWhere, setShowWhere] = useState(false);
  const fieldId = useId();
  const whereId = useId();
  const fieldRef = useRef<HTMLInputElement>(null);
  // A brand-new browser has nothing to tap, so the field takes focus (and the
  // keyboard may come up); a returning player just taps their stub.
  const firstTicket = users.length === 0;
  useEffect(() => {
    if (firstTicket) fieldRef.current?.focus();
  }, [firstTicket]);

  const matches = matchTickets(users, query);
  const name = query.trim();
  const creatable = matches.length === 0 && canCreateTicket(users, query);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const top = matches[0];
    if (top) onPick(top.id);
    else if (creatable) onCreate(name);
  };

  return (
    <form className="tlist" onSubmit={submit}>
      <div className="tlist-labelrow">
        <label className="tlist-label" htmlFor={fieldId}>
          Pick your player or type your name.
        </label>
        <button
          type="button"
          className="tlist-info"
          data-testid={`${testIdPrefix}-info`}
          aria-expanded={showWhere}
          aria-controls={whereId}
          onClick={() => setShowWhere((shown) => !shown)}
        >
          <InfoIcon size={18} />
          <span className="sr-only">Where players are stored</span>
        </button>
      </div>

      {showWhere && (
        <p className="tlist-where" id={whereId} data-testid={`${testIdPrefix}-where`}>
          Players are saved on this device, in this browser — never in the cloud. Nobody else can
          see them, and clearing your browser data clears them too.
        </p>
      )}
      <input
        ref={fieldRef}
        id={fieldId}
        className="tlist-field"
        data-testid={`${testIdPrefix}-name`}
        value={query}
        maxLength={20}
        autoComplete="off"
        autoCapitalize="words"
        spellCheck={false}
        placeholder="Type a name…"
        onChange={(e) => setQuery(e.target.value)}
      />

      {matches.length > 0 && (
        <div className="tlist-stubs">
          {matches.map((u) => (
            <button
              key={u.id}
              type="button"
              className="pstub"
              // Colour by roster position, not by position in the filtered
              // list — a ticket keeps its colour while the list narrows.
              style={{ '--c': playerColor(users.indexOf(u)) } as React.CSSProperties}
              data-testid={`${testIdPrefix}-user-${u.id}`}
              onClick={() => onPick(u.id)}
            >
              <span className="pmedal" aria-hidden="true">{initialOf(u.profile.name)}</span>
              <span className="pstub-body">
                <span className="pstub-name">
                  {u.profile.name}
                  {u.id === activeId && <span className="pstub-you">you</span>}
                </span>
                <span className="pstub-stats">
                  <b>{u.profile.points}</b> tickets · {u.profile.wins} wins
                </span>
              </span>
              <span className="pstub-admit" aria-hidden="true">ADMIT ONE</span>
            </button>
          ))}
        </div>
      )}

      {creatable && (
        <>
          {users.length > 0 && (
            <p className="tlist-empty" data-testid={`${testIdPrefix}-empty`}>Nobody called that yet.</p>
          )}
          <button type="submit" className="tlist-create" data-testid={`${testIdPrefix}-create`}>
            Create a local profile for {name}
          </button>
        </>
      )}
    </form>
  );
}
