/**
 * Harness: the Party bar wearing a hand-made party, so the screenshot run can
 * capture states that need a second device — the friend opened a table, the
 * friend knocked on a game. Built only under BUILD_HARNESS (see vite.config).
 *
 *   /preview-party.html?scene=invite   guest; Kai opened Chess elsewhere
 *   /preview-party.html?scene=knock    host; Kai wants to play Rainbow Racer
 */
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import '@shared/styles/tokens.css';
import type { PartyValue } from './PartyContext';
import { PartyBar } from './PartyBar';
import { PartyCtx } from './partyCtx';

const scene = new URLSearchParams(location.search).get('scene') === 'knock' ? 'knock' : 'invite';
const GAMES: Record<string, { title: string; path: string }> = {
  chess: { title: 'Chess', path: '/chess' },
  racer: { title: 'Rainbow Racer', path: '/racer' },
};
const noop = () => {};

const party: PartyValue = {
  myName: 'Klara',
  status: 'connected',
  code: 'AB23',
  role: scene === 'knock' ? 'host' : 'guest',
  inParty: true,
  theirName: 'Kai',
  reconnecting: false,
  table: scene === 'invite' ? { game: 'chess', code: 'CD45', hostSide: 'w' } : null,
  knock: scene === 'knock' ? 'racer' : null,
  hostParty: () => 'AB23',
  joinParty: noop,
  leaveParty: noop,
  retry: noop,
  openTable: () => 'CD45',
  closeTable: noop,
  knockOn: noop,
  clearKnock: noop,
  resolveGame: (id) => GAMES[id] ?? null,
  call: {
    active: false,
    status: 'idle',
    muted: false,
    cameraOn: false,
    localStream: null,
    remoteStream: null,
    start: noop,
    stop: noop,
    toggleMute: noop,
    toggleCamera: noop,
  },
};

createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <div className="app" style={{ minHeight: '100dvh' }}>
      <p className="subtle center" style={{ margin: '24px 0 0' }}>
        Harness — the Party bar in a party with Kai ({scene === 'knock' ? 'Kai knocked on Rainbow Racer' : 'Kai opened Chess'}).
      </p>
      <PartyCtx.Provider value={party}>
        <PartyBar />
      </PartyCtx.Provider>
    </div>
  </HashRouter>,
);
