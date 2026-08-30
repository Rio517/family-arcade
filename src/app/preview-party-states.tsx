/**
 * Harness: every state of the Party — the real PartyBar and FloatingVideo,
 * each tile on its own hand-made party — laid out on one page. A component
 * gallery for the party layer: what the family sees in every situation,
 * without a second device. Built only under BUILD_HARNESS (see vite.config);
 * `npm run shots -- party-states` captures it, and `vite preview --host`
 * serves it to another machine.
 *
 * The tiles are live: tap around inside them (the writers are no-ops).
 */
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import '@shared/styles/tokens.css';
import './styles/app.css';
import type { PartyValue } from '@shared/party/PartyContext';
import { FloatingVideo } from '@shared/party/FloatingVideo';
import { PartyBar } from '@shared/party/PartyBar';
import { PartyCtx } from '@shared/party/partyCtx';
import { addUser, emptyUsersState, setActiveUser } from '@shared/profile/users';
import { getUsersSnapshot, setUsersState } from '@shared/profile/usersStore';

// The panel wears the signed-in ticket; the gallery makes sure there is one.
if (!getUsersSnapshot().activeId) {
  setUsersState(setActiveUser(addUser(emptyUsersState(), 'seed-klara', 'Klara'), 'seed-klara'));
}

const GAMES: Record<string, { title: string; path: string }> = {
  chess: { title: 'Chess', path: '/chess' },
  battleship: { title: 'Ship Battle', path: '/play' },
  racer: { title: 'Rainbow Racer', path: '/racer' },
};
const noop = () => {};

/** A party in some state. Everything a tile doesn't say is quiet. */
function party(over: Partial<PartyValue> = {}, call: Partial<PartyValue['call']> = {}): PartyValue {
  return {
    myName: 'Klara',
    status: 'idle',
    code: '',
    role: null,
    inParty: false,
    theirName: null,
    reconnecting: false,
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
    resolveGame: (id) => GAMES[id] ?? null,
    effects: [],
    theirEffects: [],
    setEffects: noop,
    call: {
      active: false,
      status: 'idle',
      muted: false,
      cameraOn: false,
      localStream: null,
      remoteStream: null,
      start: noop,
      startVideo: noop,
      stop: noop,
      toggleMute: noop,
      toggleCamera: noop,
      ...call,
    },
    ...over,
  };
}
const withKai = (role: 'host' | 'guest', over: Partial<PartyValue> = {}, call: Partial<PartyValue['call']> = {}) =>
  party({ inParty: true, status: 'connected', code: 'AB23', role, theirName: 'Kai', ...over }, call);

/**
 * A "camera" the gallery can show without a call: a canvas painting a slow
 * gradient with a friendly blob, captured as a real MediaStream. Nothing is
 * recorded and nothing leaves the page — it is paint, not a person.
 */
function paintedStream(hue: number): MediaStream | null {
  if (typeof document === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return null;
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 240;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  let t = 0;
  const frame = () => {
    t += 0.02;
    const g = ctx.createLinearGradient(0, 0, 320, 240);
    g.addColorStop(0, `hsl(${hue} 60% 22%)`);
    g.addColorStop(1, `hsl(${hue + 40} 60% 12%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 320, 240);
    ctx.fillStyle = `hsl(${hue + 20} 70% 70%)`;
    ctx.beginPath();
    ctx.arc(160 + Math.sin(t) * 24, 120 + Math.cos(t * 0.7) * 10, 54, 0, Math.PI * 2);
    ctx.fill();
    requestAnimationFrame(frame);
  };
  frame();
  return c.captureStream(12);
}
const kaiCam = paintedStream(200);
const myCam = paintedStream(320);

interface Tile {
  title: string;
  note?: string;
  value: PartyValue;
  /** 'panel' shows the bar open; 'pill' just the pill; 'video' the little window; 'call' the big one. */
  show: 'panel' | 'pill' | 'video' | 'call';
}

const TILES: { section: string; tiles: Tile[] }[] = [
  {
    section: 'Out of a party',
    tiles: [
      { title: 'Start', note: 'Signed in, nothing going on.', value: party(), show: 'panel' },
      { title: 'Host, waiting on the code', value: party({ role: 'host', code: 'AB23', status: 'hosting' }), show: 'panel' },
      { title: 'Guest, dialing', value: party({ role: 'guest', code: 'AB23', status: 'dialing' }), show: 'panel' },
      {
        title: 'Remembered party — host',
        note: 'After a reload: the code stays on show.',
        value: party({ reconnecting: true, role: 'host', code: 'AB23', status: 'hosting' }),
        show: 'panel',
      },
      {
        title: 'Remembered party — guest',
        value: party({ reconnecting: true, role: 'guest', code: 'AB23', status: 'dialing' }),
        show: 'panel',
      },
      { title: "Couldn't reach it", value: party({ role: 'guest', code: 'AB23', status: 'error' }), show: 'panel' },
    ],
  },
  {
    section: 'In a party',
    tiles: [
      { title: 'Connected, quiet', value: withKai('guest'), show: 'panel' },
      { title: 'Kai opened Chess', note: 'Guest side: one tap to join.', value: withKai('guest', { table: { game: 'chess', code: 'CD45', hostSide: 'w' } }), show: 'panel' },
      { title: 'Your table — Chess', note: 'Host walked away from its own table.', value: withKai('host', { table: { game: 'chess', code: 'CD45' } }), show: 'panel' },
      { title: 'Kai knocked on Rainbow Racer', value: withKai('host', { knock: 'racer' }), show: 'panel' },
      { title: 'Voice on, camera off', value: withKai('host', {}, { active: true, status: 'live' }), show: 'panel' },
      { title: 'Camera on, wearing the dragon', value: withKai('host', { effects: ['dragon'] }, { active: true, status: 'live', cameraOn: true }), show: 'panel' },
    ],
  },
  {
    section: 'The pill',
    tiles: [
      { title: 'Not in a party', value: party(), show: 'pill' },
      { title: 'Reconnecting…', value: party({ reconnecting: true, role: 'guest', code: 'AB23', status: 'dialing' }), show: 'pill' },
      { title: 'With Kai', value: withKai('guest'), show: 'pill' },
      { title: 'Lit — Kai opened Chess', value: withKai('guest', { table: { game: 'chess', code: 'CD45' } }), show: 'pill' },
      { title: 'Lit — Kai knocked', value: withKai('host', { knock: 'racer' }), show: 'pill' },
      { title: 'In a call, camera on', value: withKai('host', {}, { active: true, status: 'live', cameraOn: true }), show: 'pill' },
    ],
  },
  {
    section: 'The floating video',
    tiles: [
      { title: 'Connecting…', value: withKai('guest', {}, { active: true, status: 'connecting' }), show: 'video' },
      { title: 'Voice only', note: 'The friend has no camera on.', value: withKai('guest', {}, { active: true, status: 'live' }), show: 'video' },
      {
        title: 'Video, both cameras',
        note: 'Painted canvases stand in for cameras.',
        value: withKai('guest', {}, { active: true, status: 'live', cameraOn: true, remoteStream: kaiCam, localStream: myCam }),
        show: 'video',
      },
    ],
  },
  {
    section: 'The big video call (tap the little window)',
    tiles: [
      { title: 'Big call — voice only', note: 'The camera button is right there; no chips yet.', value: withKai('guest', {}, { active: true, status: 'live' }), show: 'call' },
      {
        title: 'Big call — video, both cameras',
        value: withKai('guest', {}, { active: true, status: 'live', cameraOn: true, remoteStream: kaiCam, localStream: myCam }),
        show: 'call',
      },
      {
        title: 'Big call — wearing the dragon',
        note: 'Effects are chosen here, looking at yourself.',
        value: withKai('guest', { effects: ['dragon'] }, { active: true, status: 'live', cameraOn: true, remoteStream: kaiCam, localStream: myCam }),
        show: 'call',
      },
    ],
  },
];

const CSS = `
  body { margin: 0; }
  .gallery { padding: 24px 24px 64px; color: var(--text); }
  .gallery h1 { margin: 0 0 4px; font-size: 24px; }
  .gallery .lede { color: var(--muted); margin: 0 0 24px; font-size: 14px; }
  .gallery h2 { font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--gold, #ffd76a); margin: 28px 0 12px; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 18px; }
  .tile { border: 1px solid var(--border, #475569); border-radius: 16px; padding: 14px 14px 18px; background: rgba(15, 23, 42, 0.5); }
  .tile h3 { margin: 0 0 2px; font-size: 15px; }
  .tile .note { margin: 0 0 12px; font-size: 14px; color: var(--muted); min-height: 1.2em; }
  .stage { display: grid; place-items: center; min-height: 80px; }
  /* Both live fixed to the viewport in the app; here each sits in its tile. */
  .stage .party-root { position: static; transform: none; }
  .stage .pv { position: relative; right: auto; bottom: auto; }
  .stage .cv { position: relative; inset: auto; width: 100%; height: 440px; border-radius: 14px; overflow: hidden; }
`;

createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <div className="app gallery" style={{ maxWidth: 'none' }}>
      <style>{CSS}</style>
      <h1>Party — every state</h1>
      <p className="lede">
        The real PartyBar and FloatingVideo, each on its own hand-made party. The tiles are live — tap around; nothing
        connects. Signed in as Klara; the friend is Kai.
      </p>
      {TILES.map(({ section, tiles }) => (
        <section key={section}>
          <h2>{section}</h2>
          <div className="tiles">
            {tiles.map((t) => (
              <div className="tile" key={t.title} data-testid={`state-${t.title}`}>
                <h3>{t.title}</h3>
                <p className="note">{t.note ?? ''}</p>
                <div className="stage">
                  <PartyCtx.Provider value={t.value}>
                    {t.show === 'video' || t.show === 'call' ? (
                      <FloatingVideo initiallyExpanded={t.show === 'call'} />
                    ) : (
                      <PartyBar initiallyOpen={t.show === 'panel'} soloEffects={{ title: 'Magic Mirror', path: '/mirror' }} />
                    )}
                  </PartyCtx.Provider>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  </HashRouter>,
);
