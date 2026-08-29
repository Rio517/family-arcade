/**
 * The ticket booth at every game door: if nobody is signed in on this browser,
 * the game shows this gate instead of itself — tap your ticket (or type a name
 * and make one) and the game opens. Signed in already? The gate renders
 * nothing but the game; "Change" in any lobby or the booth on the front page
 * switches players.
 */

import { Link } from 'react-router-dom';
import { TicketList } from './TicketList';
import { useIdentity } from './useIdentity';
import './player.css';

export function PlayerGate({ gameTitle, children }: {
  gameTitle: string;
  children: React.ReactNode;
}) {
  const { users, active, signIn, newPlayer } = useIdentity();

  if (active) return children;

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

        <TicketList users={users} onPick={signIn} onCreate={newPlayer} testIdPrefix="pgate" />

        <p className="pgate-back">
          <Link to="/">‹ Back to the arcade</Link>
        </p>
      </div>
    </div>
  );
}
