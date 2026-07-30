/**
 * Rainbow Racer's pre-race screens: the 1P/2P mode choice, the driver picker,
 * and the two-player lobby (create a code / join with a code). RacerPage owns
 * the phase machine and just picks which of these to show.
 */
import { useState } from 'react';
import { ConnectionBadge } from '@shared/ui/ConnectionBadge';
import { normalizeCode } from '@shared/net/peer';
import type { RacerLook } from '../three/scene';
import type { RaceMode } from '../domain/race';
import type { RacerNet } from '../net/useRacerNet';

export interface Driver {
  id: string;
  name: string;
  emoji: string;
  color: number;
  css: string;
}

export const DRIVERS: Driver[] = [
  { id: 'unicorn', name: 'Unicorn', emoji: '🦄', color: 0xff7fc4, css: '#ff7fc4' },
  { id: 'dragon', name: 'Dragon', emoji: '🐉', color: 0x54c274, css: '#54c274' },
  { id: 'fairy', name: 'Fairy', emoji: '🧚', color: 0xffcf4a, css: '#ffcf4a' },
  { id: 'butterfly', name: 'Butterfly', emoji: '🦋', color: 0xa78bfa, css: '#a78bfa' },
];

export const driverById = (id: string): Driver => DRIVERS.find((d) => d.id === id) ?? DRIVERS[0];
export const lookOf = (d: Driver): RacerLook => ({ emoji: d.emoji, color: d.color });

export function ModeScreen({ onPick }: { onPick: (m: RaceMode) => void }) {
  return (
    <div className="racer-setup">
      <div className="racer-setup-head">
        <h1>Rainbow Racer</h1>
        <p>Race around a 3D arena and collect 20 coins! 🪙</p>
      </div>
      <div className="racer-choices">
        <button className="racer-big-btn" onClick={() => onPick('solo')} data-testid="racer-mode-solo">
          <span className="racer-big-emoji">🦄</span>
          <span className="racer-big-label">1 Player</span>
          <span className="racer-big-sub">Race on your own</span>
        </button>
        <button className="racer-big-btn" onClick={() => onPick('net')} data-testid="racer-mode-net">
          <span className="racer-big-emoji">🦄🐉</span>
          <span className="racer-big-label">2 Players</span>
          <span className="racer-big-sub">Race a friend on another device</span>
        </button>
      </div>
    </div>
  );
}

export function PickScreen({ mode, onPick }: { mode: RaceMode; onPick: (d: Driver) => void }) {
  return (
    <div className="racer-setup">
      <div className="racer-setup-head">
        <h1>Pick your racer</h1>
        <p>{mode === 'net' ? 'Then connect with your friend.' : 'Then drive and collect 20 coins! 🪙'}</p>
      </div>
      <div className="racer-cast">
        {DRIVERS.map((d) => (
          <button
            key={d.id}
            className="racer-cast-btn"
            style={{ borderColor: d.css }}
            onClick={() => onPick(d)}
            data-testid={`racer-driver-${d.id}`}
          >
            <span className="racer-cast-emoji">{d.emoji}</span>
            <span className="racer-cast-name" style={{ color: d.css }}>{d.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function RacerLobby({
  driver,
  name,
  setName,
  net,
}: {
  driver: Driver;
  name: string;
  setName: (n: string) => void;
  net: RacerNet;
}) {
  const [joinMode, setJoinMode] = useState(false);
  const [code, setCode] = useState('');

  if (net.role) {
    // Connecting / waiting.
    return (
      <div className="racer-lobby">
        <ConnectionBadge status={net.status} detail={net.statusDetail} />
        {net.role === 'host' ? (
          <div className="racer-lobby-card">
            <h2>Share this code</h2>
            <div className="racer-code" data-testid="racer-code">{net.code}</div>
            <p>Ask your friend to open Rainbow Racer → 2 Players → Join, and type this code.</p>
            <p className="racer-lobby-status">
              {net.connected ? 'Connected! Starting…' : 'Waiting for your friend to join…'}
            </p>
          </div>
        ) : (
          <div className="racer-lobby-card">
            <h2>Joining game {net.code}…</h2>
            <p className="racer-lobby-status">
              {net.connected ? 'Connected! Starting…' : 'Looking for the host…'}
            </p>
          </div>
        )}
        <button className="racer-ghost" onClick={net.leave} data-testid="racer-lobby-back">← Back</button>
      </div>
    );
  }

  return (
    <div className="racer-lobby">
      <div className="racer-lobby-card">
        <h2>Your racer {driver.emoji}</h2>
        <label className="racer-name-label">
          Your name
          <input
            className="racer-name-input"
            data-testid="racer-name-input"
            value={name}
            maxLength={16}
            onChange={(e) => setName(e.target.value)}
            placeholder="Racer"
          />
        </label>
      </div>
      {joinMode ? (
        <div className="racer-lobby-card">
          <h2>Join a game</h2>
          <input
            className="racer-code-input"
            data-testid="racer-code-input"
            value={code}
            maxLength={4}
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="ABCD"
            onChange={(e) => setCode(normalizeCode(e.target.value))}
          />
          <button
            className="racer-primary"
            disabled={code.length !== 4}
            onClick={() => net.join(code)}
            data-testid="racer-join"
          >
            Connect →
          </button>
          <button className="racer-ghost" onClick={() => setJoinMode(false)} data-testid="racer-join-back">
            ← Back
          </button>
        </div>
      ) : (
        <div className="racer-lobby-card">
          <h2>Play with a friend</h2>
          <button className="racer-primary" onClick={net.host} data-testid="racer-create">Create a game</button>
          <p className="racer-lobby-status">You’ll get a code to share.</p>
          <button className="racer-ghost" onClick={() => setJoinMode(true)} data-testid="racer-show-join">
            Join with a code
          </button>
        </div>
      )}
    </div>
  );
}
