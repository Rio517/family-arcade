import { useState } from 'react';
import { normalizeCode } from '@shared/net/peer';
import { NamePicker } from '@shared/ui/NamePicker';
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
  name: string;
  onName: (name: string) => void;
  onHost: (name: string) => void;
  onJoin: (code: string, name: string) => void;
  /** Start a game against a computer captain (ADR 0009). */
  onSolo: (personaId: string, name: string) => void;
  /** Pre-filled join code from a shared link (?g=CODE). */
  initialJoinCode?: string;
}

/** Entry screen: enter a name, then create a game, join by code, or battle a
 *  computer captain. */
export function Lobby({ name, onName, onHost, onJoin, onSolo, initialJoinCode }: LobbyProps) {
  const [mode, setMode] = useState<'choose' | 'join' | 'solo'>(initialJoinCode ? 'join' : 'choose');
  const [code, setCode] = useState(initialJoinCode ? normalizeCode(initialJoinCode) : '');

  const readyName = name.trim() || 'Captain';

  return (
    <div className="stack">
      <div className="panel">
        <h2>Captain’s name</h2>
        <NamePicker value={name} onPick={onName} />
        <div className="field">
          <label htmlFor="name">Shown to your opponent</label>
          <input
            id="name"
            value={name}
            maxLength={20}
            placeholder="Captain"
            onChange={(e) => onName(e.target.value)}
            data-testid="name-input"
          />
        </div>
      </div>

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
              onClick={() => {
                onName(readyName);
                onHost(readyName);
              }}
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
              onClick={() => {
                onName(readyName);
                onSolo(p.id, readyName);
              }}
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
            onClick={() => {
              onName(readyName);
              onJoin(code, readyName);
            }}
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
