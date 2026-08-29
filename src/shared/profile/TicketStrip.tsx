/**
 * The tappable roster row under any seat UI: every ticket on this browser as a
 * chip, the ones already at the table greyed, and "+ New player" to make a
 * ticket for someone else without changing who is signed in.
 */

import { useState } from 'react';
import { playerColor } from './playerColors';
import { canCreateTicket, initialOf } from './tickets';
import { useIdentity } from './useIdentity';
import './player.css';

export function TicketStrip({
  seated,
  onPick,
  full = false,
  testIdPrefix = 'strip',
}: {
  /** Ticket ids already at the table — shown taken. */
  seated: ReadonlySet<string>;
  /** An unseated ticket was tapped, or a brand-new one was just made. */
  onPick: (userId: string) => void;
  /** Every chair is taken: the whole strip greys and says so. */
  full?: boolean;
  testIdPrefix?: string;
}) {
  const { users, addPlayer } = useIdentity();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const creatable = canCreateTicket(users, name);

  const make = (e: React.FormEvent) => {
    e.preventDefault();
    if (!creatable) return;
    const id = addPlayer(name.trim());
    setName('');
    setAdding(false);
    onPick(id);
  };

  return (
    <div className="tstrip">
      <span className="tstrip-label">Tickets on this {deviceWord()}</span>
      <div className="tstrip-chips">
        {users.map((u, i) => {
          const taken = seated.has(u.id);
          return (
            <button
              key={u.id}
              type="button"
              className={`tstrip-chip ${taken ? 'taken' : ''}`}
              style={{ '--c': playerColor(i) } as React.CSSProperties}
              disabled={taken || full}
              aria-pressed={taken}
              data-testid={`${testIdPrefix}-user-${u.id}`}
              onClick={() => onPick(u.id)}
            >
              <span className="pmedal sm" aria-hidden="true">{initialOf(u.profile.name)}</span>
              {u.profile.name}
            </button>
          );
        })}
        {!adding && (
          <button
            type="button"
            className="tstrip-chip new"
            disabled={full}
            data-testid={`${testIdPrefix}-new`}
            onClick={() => setAdding(true)}
          >
            + New player
          </button>
        )}
      </div>
      {full && <p className="tstrip-hint">Every chair is taken — clear one to swap.</p>}
      {adding && (
        <form className="tstrip-form" onSubmit={make}>
          <label className="tlist-label" htmlFor={`${testIdPrefix}-name`}>Who's joining?</label>
          <div className="tstrip-form-row">
            <input
              id={`${testIdPrefix}-name`}
              className="tlist-field"
              data-testid={`${testIdPrefix}-name`}
              value={name}
              maxLength={20}
              autoComplete="off"
              autoCapitalize="words"
              spellCheck={false}
              placeholder="Type a name…"
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit" className="tlist-create" disabled={!creatable} data-testid={`${testIdPrefix}-create`}>
              Make a ticket
            </button>
          </div>
          <button type="button" className="pas-cancel" onClick={() => setAdding(false)}>
            Never mind
          </button>
        </form>
      )}
    </div>
  );
}

/** "iPad" on a touch device, "computer" otherwise — the family's own words. */
function deviceWord(): string {
  return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 ? 'iPad' : 'computer';
}
