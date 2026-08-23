/**
 * The ticket booth at every game door: if nobody is signed in on this browser,
 * the game shows this gate instead of itself — pick your ticket (or make one)
 * and the game opens. Signed in already? The gate renders nothing but the
 * game; players switch at the booth on the arcade's front page.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FAMILY_NAMES } from './profile';
import { playerColor } from './playerColors';
import { useUsers } from './useUsers';
import './player.css';

export function PlayerGate({ gameTitle, children }: {
  gameTitle: string;
  children: React.ReactNode;
}) {
  const { users, active, signIn, newPlayer } = useUsers();
  const [name, setName] = useState('');
  // With no roster yet, creating a ticket IS the whole gate; otherwise the
  // form hides behind "+ New player" so returning players see one tap.
  const [creating, setCreating] = useState(false);
  const showForm = creating || users.length === 0;

  if (active) return children;

  const create = (n: string) => {
    const clean = n.trim();
    if (clean) newPlayer(clean);
  };
  // Family regulars who don't have a ticket yet become one-tap chips.
  const taken = new Set(users.map((u) => u.profile.name.trim().toLowerCase()));
  const chips = FAMILY_NAMES.filter((n) => !taken.has(n.toLowerCase()));

  return (
    <div className="app pgate" data-testid="player-gate">
      <div className="pgate-card">
        <div className="pgate-awning" aria-hidden="true" />
        <h1 className="pgate-title">Step right up!</h1>
        <p className="pgate-sub">
          {users.length === 0
            ? 'Make your ticket — it keeps your points and wins in every game.'
            : `${gameTitle} needs a player — whose ticket?`}
        </p>

        {users.map((u, i) => (
          <button
            key={u.id}
            type="button"
            className="pstub"
            style={{ '--c': playerColor(i) } as React.CSSProperties}
            data-testid={`pgate-user-${u.id}`}
            onClick={() => signIn(u.id)}
          >
            <span className="pmedal" aria-hidden="true">{initialOf(u.profile.name)}</span>
            <span className="pstub-body">
              <span className="pstub-name">{u.profile.name}</span>
              <span className="pstub-stats">
                <b>{u.profile.points}</b> tickets · {u.profile.wins} wins
              </span>
            </span>
            <span className="pstub-admit" aria-hidden="true">ADMIT ONE</span>
          </button>
        ))}

        {showForm ? (
          <form
            className="pgate-new"
            onSubmit={(e) => {
              e.preventDefault();
              create(name);
            }}
          >
            {chips.length > 0 && (
              <div className="pgate-chips">
                {chips.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="pgate-chip"
                    data-testid={`pgate-chip-${n}`}
                    onClick={() => create(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
            <div className="pgate-row">
              <label className="pgate-label" htmlFor="pgate-name">Or type a name</label>
              <input
                id="pgate-name"
                data-testid="pgate-name"
                value={name}
                maxLength={20}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
              <button type="submit" className="pgate-create" data-testid="pgate-create">
                Make my ticket
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="pstub pstub-new"
            data-testid="pgate-new"
            onClick={() => setCreating(true)}
          >
            + New player
          </button>
        )}

        <p className="pgate-back">
          <Link to="/">‹ Back to the arcade</Link>
        </p>
      </div>
    </div>
  );
}

function initialOf(name: string): string {
  const first = [...name.trim()][0];
  return (first ?? '?').toUpperCase();
}
