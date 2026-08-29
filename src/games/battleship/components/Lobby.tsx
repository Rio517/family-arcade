import { useState } from 'react';
import { normalizeCode } from '@shared/net/peer';
import { PlayingAs } from '@shared/profile/PlayingAs';
import { BotIcon, PersonIcon } from '@shared/ui/icons';
import { CAPTAIN_PERSONAS } from '../domain/bots/personas';

/** Kid-readable difficulty words for the four rungs of the captain ladder. */
const RUNG_WORDS: Record<number, string> = {
  1: 'easiest',
  2: 'a fair fight',
  3: 'sharp shooter',
  4: 'the boss',
};

interface LobbyProps {
  /** The signed-in player's name — the captain the opponent will see. */
  name: string;
  onHost: (name: string) => void;
  onJoin: (code: string, name: string) => void;
  /** Start a game against a computer captain (ADR 0009). */
  onSolo: (personaId: string, name: string) => void;
  /** Pre-filled join code from a shared link (?g=CODE). */
  initialJoinCode?: string;
}

/** Entry screen: create a game, join by code, or battle a computer captain.
 *  Nobody is asked for a name — the signed-in ticket is the captain. */
export function Lobby({ name, onHost, onJoin, onSolo, initialJoinCode }: LobbyProps) {
  const [mode, setMode] = useState<'choose' | 'join' | 'solo'>(initialJoinCode ? 'join' : 'choose');
  const [code, setCode] = useState(initialJoinCode ? normalizeCode(initialJoinCode) : '');

  const readyName = name.trim() || 'Captain';

  return (
    <div className="stack">
      <PlayingAs />

      {mode === 'choose' ? (
        <div className="lobby-doors">
          {/* Two rooms, clearly signposted: play together across two devices,
              or play alone against a captain — each with its own colour. */}
          <div className="panel stack lobby-door lobby-door-duo">
            <span className="lobby-eyebrow">
              <PersonIcon size={14} />
              <PersonIcon size={14} /> Play together — two devices
            </span>
            <button
              className="btn btn-primary btn-lg btn-block"
              onClick={() => onHost(readyName)}
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

          <div className="panel stack lobby-door lobby-door-solo">
            <span className="lobby-eyebrow">
              <BotIcon size={15} /> Play solo — just you
            </span>
            <button
              className="btn btn-amber btn-lg btn-block"
              onClick={() => setMode('solo')}
              data-testid="solo-game"
            >
              Battle the computer
            </button>
            <p className="subtle center">Four captains, from easiest to the boss.</p>
          </div>
        </div>
      ) : mode === 'solo' ? (
        <div className="panel stack lobby-door lobby-door-solo">
          <span className="lobby-eyebrow">
            <BotIcon size={15} /> Play solo — just you
          </span>
          <h2>Choose your captain</h2>
          <p className="subtle">Level 1 is the gentlest — climb the ladder as you win.</p>
          {CAPTAIN_PERSONAS.map((p) => (
            <button
              key={p.id}
              className="btn btn-block lobby-captain"
              onClick={() => onSolo(p.id, readyName)}
              data-testid={`captain-${p.id}`}
            >
              <span className="lobby-captain-level" aria-hidden="true">
                <strong>Lv {p.rung}</strong>
                <span className="lobby-captain-pips">
                  {Array.from({ length: 4 }, (_, i) => (
                    <i key={i} className={i < p.rung ? 'on' : ''} />
                  ))}
                </span>
              </span>
              <span className="lobby-captain-who">
                <strong>
                  {p.name} <em className="lobby-captain-rank">— level {p.rung}, {RUNG_WORDS[p.rung]}</em>
                </strong>
                <span className="subtle lobby-captain-tag">{p.tagline}</span>
              </span>
            </button>
          ))}
          <button className="btn btn-ghost btn-block" onClick={() => setMode('choose')}>
            ← Back
          </button>
        </div>
      ) : (
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
            onClick={() => onJoin(code, readyName)}
            data-testid="join-game"
          >
            Connect →
          </button>
          <button className="btn btn-ghost btn-block" onClick={() => setMode('choose')}>
            ← Back
          </button>
        </div>
      )}
    </div>
  );
}
