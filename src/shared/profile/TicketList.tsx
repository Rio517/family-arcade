/**
 * The ticket list — the one way a player is picked anywhere in the arcade:
 * at the gate, behind "Change" in a lobby, at the booth's Switch. Saved
 * tickets are one tap; a single field filters them as you type and, when
 * nobody matches, makes a ticket for that name. No chip rows, no second form.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { playerColor } from './playerColors';
import { canCreateTicket, matchTickets } from './tickets';
import type { StoredUser } from './users';
import './player.css';

export function TicketList({
  users,
  activeId = null,
  onPick,
  onCreate,
  autoFocus = false,
  testIdPrefix = 'ticket',
}: {
  users: StoredUser[];
  /** The signed-in ticket — marked "you", still tappable. */
  activeId?: string | null;
  onPick: (id: string) => void;
  /** Called with a trimmed, non-blank name nobody has yet. */
  onCreate: (name: string) => void;
  /** Focus the field on mount — only when the roster is empty, so a returning
   * player who just needs to tap their stub isn't handed a keyboard. */
  autoFocus?: boolean;
  testIdPrefix?: string;
}) {
  const [query, setQuery] = useState('');
  const fieldId = useId();
  const fieldRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) fieldRef.current?.focus();
  }, [autoFocus]);

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
      <label className="tlist-label" htmlFor={fieldId}>
        {users.length === 0 ? 'Make your ticket' : 'Type a name to find or add'}
      </label>
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
            Make a ticket for {name}
          </button>
        </>
      )}
    </form>
  );
}

export function initialOf(name: string): string {
  const first = [...name.trim()][0];
  return (first ?? '?').toUpperCase();
}
