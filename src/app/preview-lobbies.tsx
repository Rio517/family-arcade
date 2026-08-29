/**
 * Harness: every game's lobby standing on a hand-made party, so the screenshot
 * run can capture "the party is the table" without a second device. Built only
 * under BUILD_HARNESS (see vite.config). Routes come from the registry, so
 * this page never names a game itself.
 *
 *   /preview-lobbies.html?scene=host#/chess      host in a party with Kai
 *   /preview-lobbies.html?scene=guest#/play      guest, waiting for Kai's table
 *   /preview-lobbies.html?scene=reconnecting#/racer
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

const party: PartyValue = {
  myName: 'Klara',
  status: scene === 'reconnecting' ? 'dialing' : 'connected',
  code: 'AB23',
  role: scene === 'guest' ? 'guest' : 'host',
  inParty: scene !== 'reconnecting',
  theirName: scene === 'reconnecting' ? null : 'Kai',
  reconnecting: scene === 'reconnecting',
  table: null,
  knock: null,
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
          {GAMES.map((game) => (
            <Route key={game.id} path={game.path} element={<game.Page />} />
          ))}
        </Routes>
      </main>
      <PartyBar />
    </PartyCtx.Provider>
  </HashRouter>,
);
