/**
 * Harness: the Party bar and every game's lobby standing on a hand-made party,
 * so the screenshot run can capture "the party is the table" without a second
 * device. Built only under BUILD_HARNESS (see vite.config). Routes come from
 * the registry, so this page never names a game itself.
 *
 *   /preview-lobbies.html?scene=host#/chess      host in a party with Kai
 *   /preview-lobbies.html?scene=guest#/play      guest, waiting for Kai's table
 *   /preview-lobbies.html?scene=reconnecting#/racer
 *   /preview-lobbies.html?scene=invite#/         guest; Kai opened Chess elsewhere
 *   /preview-lobbies.html?scene=knock#/          host; Kai knocked on Rainbow Racer
 */
import { createRoot } from 'react-dom/client';
import { HashRouter, Route, Routes } from 'react-router-dom';
import '@shared/styles/tokens.css';
import './styles/app.css';
import type { PartyValue } from '@shared/party/PartyContext';
import { PartyBar } from '@shared/party/PartyBar';
import { PartyCtx } from '@shared/party/partyCtx';
import { GAMES } from './registry';

const scene = new URLSearchParams(location.search).get('scene') ?? 'host';
const noop = () => {};

function resolveGame(id: string) {
  const game = GAMES.find((g) => g.id === id);
  return game ? { title: game.title, path: game.path } : null;
}

const guest = scene === 'guest' || scene === 'invite';
const party: PartyValue = {
  myName: 'Klara',
  status: scene === 'reconnecting' ? 'dialing' : 'connected',
  code: 'AB23',
  role: guest ? 'guest' : 'host',
  inParty: scene !== 'reconnecting',
  theirName: scene === 'reconnecting' ? null : 'Kai',
  reconnecting: scene === 'reconnecting',
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
  resolveGame,
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
    <PartyCtx.Provider value={party}>
      <main className="app-main">
        <Routes>
          <Route
            path="/"
            element={
              <div className="app" style={{ minHeight: '100dvh' }}>
                <p className="subtle center" style={{ margin: '24px 0 0' }}>
                  Harness — the Party bar in a party with Kai ({scene === 'knock' ? 'Kai knocked on Rainbow Racer' : 'Kai opened Chess'}).
                </p>
              </div>
            }
          />
          {GAMES.map((game) => (
            <Route key={game.id} path={game.path} element={<game.Page />} />
          ))}
        </Routes>
      </main>
      <PartyBar />
    </PartyCtx.Provider>
  </HashRouter>,
);
