import { useState } from 'react';
import type { LookId } from '@games/battleship/state/pitch';
import { normalizeCode } from '@shared/net/peer';
import { useParty } from '@shared/party/PartyContext';
import { PlayingAs } from '@shared/profile/PlayingAs';
import { BotIcon, PartyIcon, PersonIcon } from '@shared/ui/icons';
import { CAPTAIN_PERSONAS } from '../domain/bots/personas';
import type { FleetEra } from '../domain/types';
import { DoorTag, LookHero } from './look/LookParts';
import { arcadeLook } from './look/arcadeLook';

/** Ship Battle's registry id — what the party's table and knock carry. */
const GAME_ID = 'battleship';

interface LobbyProps {
  /** Create a game on your own: the page draws the code and seats the ticket. */
  onHost: () => void;
  /** Join a game by code — typed in or from a shared link. (A code the party
   * hands over goes through the page's door, never through here.) */
  onJoin: (code: string) => void;
  /** Start a game against a computer captain (ADR 0009): a level tap does it. */
  onSolo: (personaId: string) => void;
  /** Which ships sail for you in 3D, and how to change it. */
  era: FleetEra;
  onEra: (era: FleetEra) => void;
  /** Host the table the party just opened under this code. */
  onHostTable: (code: string) => void;
  /** Pre-filled join code from a shared link (?g=CODE). */
  initialJoinCode?: string;
  /** The darker-arcade pitch's start-screen look under review; 'today' is the shipped one. */
  look?: LookId;
}

/** The two sets of ships a captain can sail. */
const ERAS: { id: FleetEra; name: string }[] = [
  { id: 'classic', name: 'Classic' },
  { id: 'modern', name: 'Modern' },
];

/**
 * Entry screen: pick classic or modern ships, then create a game, join by
 * code, or tap a level to play the computer. Every road ends at placing ships.
 * Nobody is asked for a name — the signed-in ticket is the captain. In a party
 * the code doors close: the party is the table (the host opens it with one
 * tap; the guest sees the waiting door here while the page's `usePartyDoor`
 * knocks and walks them in the moment it opens), and only the solo door stays.
 */
export function Lobby({ onHost, onJoin, onSolo, era, onEra, onHostTable, initialJoinCode, look }: LobbyProps) {
  const arcade = arcadeLook(look);
  const party = useParty();
  const [mode, setMode] = useState<'choose' | 'join'>(initialJoinCode ? 'join' : 'choose');
  const [code, setCode] = useState(initialJoinCode ? normalizeCode(initialJoinCode) : '');

  const friend = party.theirName ?? 'your friend';
  const partyHost = party.inParty && party.role === 'host';
  const partyGuest = party.inParty && party.role === 'guest';
  // While the party is (re)linking or linked, codes are its business, not the player's.
  const partyBusy = party.reconnecting || party.inParty;
  // The doors are showing (not the join form).
  const choosing = !(mode === 'join' && !partyBusy);

  return (
    <div className="stack">
      {arcade && <LookHero look={arcade} compact={!choosing} />}
      <PlayingAs />

      {mode === 'join' && !partyBusy ? (
        <div className="panel stack">
          <h2>Join a game</h2>
          <div className="field">
            <label htmlFor="code">Enter the 4-character code</label>
            <input
              id="code"
              className="code-input"
              value={code}
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={4}
              placeholder="ABCD"
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              data-testid="code-input"
            />
          </div>
          <button
            className="btn btn-primary btn-lg btn-block"
            disabled={code.length !== 4}
            onClick={() => onJoin(code)}
            data-testid="join-game"
          >
            Connect →
          </button>
          <button className="btn btn-ghost btn-block" onClick={() => setMode('choose')}>
            ← Back
          </button>
        </div>
      ) : (
        <>
          <div className="lobby-ships" data-testid="lobby-ships">
            <span className="lobby-ships-label" id="lobby-ships-label">Ships</span>
            <div className="ships-switch" role="group" aria-labelledby="lobby-ships-label">
              {ERAS.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className="ships-opt"
                  data-selected={era === e.id}
                  aria-pressed={era === e.id}
                  onClick={() => onEra(e.id)}
                  data-testid={`ships-${e.id}`}
                >
                  <span className="ships-t">{e.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="lobby-doors">
          {/* Two rooms, clearly signposted: play together across two devices,
              or play alone against a captain — each with its own colour. In a
              party, the together door is the party itself. */}
          {party.reconnecting ? (
            <div className="panel stack lobby-door lobby-door-duo" data-testid="battle-party-reconnecting">
              {arcade && <DoorTag players={2} />}
              <span className="lobby-eyebrow">
                <PartyIcon size={15} /> Play together — your party
              </span>
              <div className="placing-wait">
                <div className="qr-radar">
                  <span className="ping" />
                  <span className="ping" />
                  <span className="ping" />
                  <div className="conn-badge" aria-hidden="true">
                    <PartyIcon size={30} />
                  </div>
                </div>
                <p className="pw-line">
                  Reconnecting to your party
                  <span className="ell">
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                  </span>
                </p>
                <p className="subtle">Finding your friend.</p>
              </div>
            </div>
          ) : partyHost ? (
            <div className="panel stack lobby-door lobby-door-duo">
              {arcade && <DoorTag players={2} />}
              <span className="lobby-eyebrow">
                <PartyIcon size={15} /> Play together — your party
              </span>
              <button
                className="btn btn-primary btn-lg btn-block"
                onClick={() => onHostTable(party.openTable(GAME_ID))}
                data-testid="battle-party-play"
              >
                Play Ship Battle with {friend}
              </button>
              <p className="subtle center">{friend} hops straight in — no code to share.</p>
            </div>
          ) : partyGuest ? (
            <div className="panel stack lobby-door lobby-door-duo" data-testid="battle-party-waiting">
              {arcade && <DoorTag players={2} />}
              <span className="lobby-eyebrow">
                <PartyIcon size={15} /> Play together — your party
              </span>
              <div className="placing-wait">
                <div className="qr-radar">
                  <span className="ping" />
                  <span className="ping" />
                  <span className="ping" />
                  <div className="conn-badge" aria-hidden="true">
                    <PartyIcon size={30} />
                  </div>
                </div>
                <p className="pw-line">
                  Waiting for <strong>{friend}</strong> to open Ship Battle
                  <span className="ell">
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                  </span>
                </p>
                <p className="subtle">We’ve let them know you’re at the door.</p>
              </div>
            </div>
          ) : (
            <div className="panel stack lobby-door lobby-door-duo">
              {arcade && <DoorTag players={2} />}
              <span className="lobby-eyebrow">
                <PersonIcon size={14} />
                <PersonIcon size={14} /> Play together
              </span>
              <button
                className="btn btn-primary btn-lg btn-block"
                onClick={() => onHost()}
                data-testid="create-game"
              >
                Create a game
              </button>
              <p className="subtle center">You’ll get a code to share with the other iPad.</p>
              <button
                className="btn btn-violet btn-lg btn-block"
                onClick={() => setMode('join')}
                data-testid="show-join"
              >
                Join with a code
              </button>
            </div>
          )}

          <div className="panel stack lobby-door lobby-door-solo">
            {arcade && <DoorTag players={1} />}
            <span className="lobby-eyebrow">
              <BotIcon size={15} /> Play the computer
            </span>
            <p className="lobby-pick" id="lobby-pick">Pick a level</p>
            <div className="level-grid" role="group" aria-labelledby="lobby-pick">
              {CAPTAIN_PERSONAS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="level-btn"
                  onClick={() => onSolo(p.id)}
                  aria-label={`Level ${p.rung}, ${p.level}`}
                  data-testid={`level-${p.rung}`}
                >
                  <span className="level-n" aria-hidden="true">{p.rung}</span>
                  <span className="level-w" aria-hidden="true">{p.level}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
