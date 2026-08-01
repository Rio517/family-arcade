/**
 * The app-level Party control — a small pill pinned to the bottom-centre of
 * every screen. Collapsed it just shows who you're with; tapped it opens a panel
 * to start/join a party, turn voice/video on (opt-in), or leave. Because it's
 * mounted above the router it stays put as you move between games.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { normalizeCode } from '@shared/net/peer';
import { NamePicker } from '@shared/ui/NamePicker';
import { useParty } from './PartyContext';
import './party.css';

export function PartyBar() {
  const party = useParty();
  const [open, setOpen] = useState(false);
  const [joining, setJoining] = useState(false);
  const [codeInput, setCodeInput] = useState('');

  const { inParty, call } = party;

  return (
    <div className="party-root">
      {open && (
        <div className="party-panel" role="dialog" aria-label="Party">
          {!inParty ? (
            <>
              <label className="party-field">
                <span>Your name</span>
                <input
                  className="party-input"
                  value={party.myName}
                  maxLength={20}
                  onChange={(e) => party.setMyName(e.target.value)}
                  data-testid="party-name"
                />
              </label>
              <NamePicker value={party.myName} onPick={party.setMyName} testIdPrefix="party-chip" />

              {party.role === 'host' ? (
                <div className="party-waiting">
                  <span className="party-eyebrow">Share this code</span>
                  <div className="party-code" data-testid="party-code">{party.code}</div>
                  <p className="party-hint">Tell your friend to open the Party and join with it.</p>
                  <button className="party-btn ghost" onClick={party.leaveParty}>Cancel</button>
                </div>
              ) : joining ? (
                <div className="party-join">
                  <span className="party-eyebrow">Enter your friend's code</span>
                  <input
                    className="party-input code"
                    value={codeInput}
                    maxLength={4}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="ABCD"
                    onChange={(e) => setCodeInput(normalizeCode(e.target.value))}
                    data-testid="party-code-input"
                  />
                  <button
                    className="party-btn primary"
                    disabled={codeInput.length !== 4}
                    onClick={() => party.joinParty(codeInput)}
                    data-testid="party-join-go"
                  >
                    Connect →
                  </button>
                  <button className="party-btn ghost" onClick={() => setJoining(false)}>Back</button>
                </div>
              ) : (
                <div className="party-start">
                  <button className="party-btn primary" onClick={() => party.hostParty()} data-testid="party-create">
                    Start a party
                  </button>
                  <button className="party-btn violet" onClick={() => setJoining(true)} data-testid="party-join">
                    Join with a code
                  </button>
                  <p className="party-hint">
                    Play together, switch games freely, and (if you want) see &amp; hear each other.
                    <br />
                    <Link to="/privacy" onClick={() => setOpen(false)}>How this keeps you safe →</Link>
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="party-live">
              <div className="party-live-head">
                <span className="party-eyebrow">You're in a party</span>
                <span className={`party-status ${party.status}`}>
                  {party.status === 'connected' ? '● connected' : '… ' + party.status}
                </span>
              </div>
              <p className="party-with">
                <b>{party.myName}</b> &amp; <b>{party.theirName ?? 'your friend'}</b>
              </p>

              {!call.active ? (
                <>
                  <button className="party-btn primary" onClick={call.start} data-testid="party-call-start">
                    🎤 Turn on voice
                  </button>
                  <p className="party-hint">Your camera stays off until you turn it on.</p>
                </>
              ) : (
                <div className="party-callctl">
                  <button
                    className={`party-cbtn ${call.muted ? 'active' : ''}`}
                    onClick={call.toggleMute}
                    aria-label={call.muted ? 'Unmute microphone' : 'Mute microphone'}
                    data-testid="party-mute"
                  >
                    {call.muted ? '🔇' : '🎤'}
                  </button>
                  <button
                    className={`party-cbtn ${call.cameraOn ? 'active' : ''}`}
                    onClick={call.toggleCamera}
                    aria-label={call.cameraOn ? 'Turn camera off' : 'Turn camera on'}
                    data-testid="party-camera"
                  >
                    📷
                  </button>
                  <button className="party-cbtn end" onClick={call.stop} aria-label="End the call" data-testid="party-call-end">
                    ✕
                  </button>
                </div>
              )}

              <button className="party-btn ghost" onClick={party.leaveParty} data-testid="party-leave">
                Leave party
              </button>
            </div>
          )}
        </div>
      )}

      <button
        className={`party-pill ${inParty ? 'live' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={inParty ? `Party with ${party.theirName ?? 'a friend'}` : 'Start a party'}
        data-testid="party-pill"
      >
        {inParty ? (
          <>
            <span className="party-ava a">{initial(party.myName)}</span>
            <span className="party-ava b">{initial(party.theirName ?? '?')}</span>
            <span className="party-dot" aria-hidden="true" />
            {call.active && <span className="party-mini">{call.cameraOn ? '📷' : '🎤'}</span>}
          </>
        ) : (
          <>
            <span aria-hidden="true">🎉</span> Party
          </>
        )}
      </button>
    </div>
  );
}

function initial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}
