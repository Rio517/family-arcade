/**
 * The tappable roster row under any seat UI: every ticket on this device as a
 * chip, the ones already at the table greyed (still reachable by keyboard, so
 * a screen reader hears that Klara is seated), and "+ New player" to make a
 * ticket for someone else without changing who is signed in.
 */

import { useEffect, useRef, useState } from 'react';
import { Medal } from './Medal';
import { fillNextEmpty, isFull, seatedUserIds, type Seat } from './seats';
import { canCreateTicket } from './tickets';
import { useIdentity } from './useIdentity';
import './player.css';

export function TicketStrip({ seats, onChange }: { seats: Seat[]; onChange: (next: Seat[]) => void }) {
  const { users, addPlayer } = useIdentity();
  const seated = new Set(seatedUserIds(seats));
  const full = isFull(seats);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const fieldRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (adding) fieldRef.current?.focus();
  }, [adding]);
  const creatable = canCreateTicket(users, name);

  const pick = (userId: string) => onChange(fillNextEmpty(seats, { kind: 'ticket', userId }));

  const make = (e: React.FormEvent) => {
    e.preventDefault();
    if (!creatable) return;
    const id = addPlayer(name.trim());
    setName('');
    setAdding(false);
    pick(id);
  };

  const cancel = () => {
    setName('');
    setAdding(false);
  };

  return (
    <div className="tstrip">
      <span className="tstrip-label">Tickets on this device</span>
      <div className="tstrip-chips">
        {users.map((u, i) => {
          const taken = seated.has(u.id);
          const off = taken || full;
          return (
            <button
              key={u.id}
              type="button"
              className={`tstrip-chip ${off ? 'taken' : ''}`}
              aria-disabled={off}
              aria-label={taken ? `${u.profile.name} — already at the table` : u.profile.name}
              data-testid={`strip-user-${u.id}`}
              onClick={() => {
                if (!off) pick(u.id);
              }}
            >
              <Medal name={u.profile.name} index={i} small />
              {u.profile.name}
            </button>
          );
        })}
        {!adding && (
          <button
            type="button"
            className="tstrip-chip new"
            disabled={full}
            data-testid="strip-new"
            onClick={() => setAdding(true)}
          >
            + New player
          </button>
        )}
      </div>
      {full && <p className="tstrip-hint">Every chair is taken — clear one to swap.</p>}
      {adding && (
        <form className="tstrip-form" onSubmit={make}>
          <label className="tlist-label" htmlFor="strip-name">Who's joining?</label>
          <div className="tstrip-form-row">
            <input
              ref={fieldRef}
              id="strip-name"
              className="tlist-field"
              data-testid="strip-name"
              value={name}
              maxLength={20}
              autoComplete="off"
              autoCapitalize="words"
              spellCheck={false}
              placeholder="Type a name…"
              onChange={(e) => setName(e.target.value)}
            />
            <button type="submit" className="tlist-create" disabled={!creatable} data-testid="strip-create">
              Make a ticket
            </button>
          </div>
          <button type="button" className="pas-cancel" data-testid="strip-cancel" onClick={cancel}>
            Never mind
          </button>
        </form>
      )}
    </div>
  );
}
