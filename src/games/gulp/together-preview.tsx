/**
 * Harness: every play-together screen in each of its states, over a picture
 * of the city, so the screens can be checked without a second device.
 *
 *   /preview-gulp-together.html            the list of states
 *   /preview-gulp-together.html?s=guest    one state, full screen
 *
 * The screens are live: the keys type, the host's settings change, the guest
 * picks a colour (the handlers only update this page). Dev-only: built solely
 * when BUILD_HARNESS is set, so it never ships.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@shared/styles/tokens.css';
import './styles/gulp.css';
import type { RoundSettings } from './net/protocol';
import { CodeKeys } from './components/together/CodeKeys';
import { JoinCard } from './components/together/JoinCard';
import { PlayerSelect, type PlayerSelectProps, type SelectSeat } from './components/together/PlayerSelect';
import { PlayRow } from './components/together/PlayRow';
import { WhoStarts } from './components/together/WhoStarts';

const noop = () => {};
const phone = typeof matchMedia === 'function' && matchMedia('(max-width: 600px)').matches;
// The round captures from the pitch, served by the dev server from the repository.
const CITY = `/docs/mockups/20261002-gulp-play-together/frame-${phone ? 'phone' : 'ipad'}.webp`;

const CITY_SETTINGS: RoundSettings = { map: 'city', difficulty: 'medium', duration: 240, powerups: true, fightBack: true };
const KLARA: SelectSeat = { name: 'Klara', skin: 1, state: 'host' };
const MINA: SelectSeat = { name: 'Mina', skin: 2, state: 'ready' };
const OSKAR: SelectSeat = { name: 'Oskar', skin: 3, state: 'ready' };

/** The menu card as the game draws it, holding the pieces under test. */
function Menu({ children }: { children: ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div className="gulp-card">{children}</div>
    </div>
  );
}

/** Types into the letter screen through the real keyboard path, then turns on `busy` (which stops typing). */
function Typed({ letters, busy = false, error }: { letters: string; busy?: boolean; error?: string }) {
  const [typed, setTyped] = useState(false);
  useEffect(() => {
    for (const key of letters) window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    const later = window.setTimeout(() => setTyped(true));
    return () => window.clearTimeout(later);
  }, [letters]);
  return <CodeKeys onCode={noop} onBack={noop} busy={busy && typed} error={error} />;
}

/** The player select with its handlers wired to this page. */
function Select(start: Omit<PlayerSelectProps, 'onSettings' | 'onSkin' | 'onBack'>) {
  const [settings, setSettings] = useState(start.settings);
  const [seats, setSeats] = useState(start.seats);
  const [note, setNote] = useState(start.note ?? null);
  const pick = (skin: number) => {
    setSeats((all) => all.map((s, i) => (s && i === start.mySeat ? { ...s, skin } : s)));
    setNote(null);
  };
  return (
    <PlayerSelect
      {...start}
      settings={settings}
      seats={seats}
      note={note}
      onSettings={start.role === 'host' ? setSettings : undefined}
      onSkin={pick}
      onBack={noop}
    />
  );
}

type Start = Parameters<typeof Select>[0];

// Props as objects: jsx-a11y reads a literal role="host" as an ARIA role.
const host = (seats: Array<SelectSeat | null>, over: Partial<Start> = {}) => {
  const props: Start = { role: 'host', code: 'KQZT', seats, mySeat: 0, settings: CITY_SETTINGS, holesLeft: 6 - seats.filter(Boolean).length, canStart: false, onStart: noop, ...over };
  return <Select {...props} />;
};
const guest = (over: Partial<Start> = {}) => {
  const props: Start = {
    role: 'guest',
    code: 'KQZT',
    seats: [KLARA, MINA, OSKAR, null],
    mySeat: 2,
    settings: CITY_SETTINGS,
    holesLeft: 3,
    canStart: false,
    note: 'Bubblegum was taken, so you got Grape.',
    ...over,
  };
  return <Select {...props} />;
};

const STATES: Array<[id: string, title: string, render: () => ReactNode]> = [
  ['menu', 'Menu: PLAY and PLAY WITH FRIENDS', () => <Menu><PlayRow onPlay={noop} onFriends={noop} /></Menu>],
  ['invite', 'Menu: a linked friend is starting a game', () => <Menu><JoinCard name="Mina" onJoin={noop} /><PlayRow onPlay={noop} onFriends={noop} /></Menu>],
  ['invite-busy', 'Menu: joining Mina', () => <Menu><JoinCard name="Mina" onJoin={noop} busy /><PlayRow onPlay={noop} onFriends={noop} /></Menu>],
  ['invite-error', 'Menu: joining Mina failed', () => <Menu><JoinCard name="Mina" onJoin={noop} error="Mina’s game has started already." /><PlayRow onPlay={noop} onFriends={noop} /></Menu>],
  ['who', 'Who’s starting the game?', () => <WhoStarts onMe={noop} onFriend={noop} onBack={noop} />],
  ['code', 'INSERT CODE, nothing typed', () => <CodeKeys onCode={noop} onBack={noop} />],
  ['code-typed', 'INSERT CODE, two letters', () => <Typed letters="KQ" />],
  ['code-full', 'INSERT CODE, four letters: GO! is on', () => <Typed letters="KQZT" />],
  ['code-busy', 'INSERT CODE, joining', () => <Typed letters="KQZT" busy />],
  ['code-error', 'INSERT CODE, no such game', () => <Typed letters="KQZT" error="No game has those letters. Check them with your friend." />],
  ['host-empty', 'Host: nobody here yet', () => host([KLARA, null, null, null])],
  ['host-filled', 'Host: friends have joined', () => host([KLARA, MINA, OSKAR, null], { canStart: true })],
  ['linked-wait', 'Host: a linked friend is coming', () => host([KLARA, { ...MINA, state: 'coming' }, null, null], { code: '', holesLeft: 4, joinInstead: noop })],
  ['linked-ready', 'Host: the linked friend tapped Join', () => host([KLARA, MINA, null, null], { code: '', canStart: true, joinInstead: noop })],
  ['host-recon', 'Host: my link dropped', () => host([KLARA, MINA, OSKAR, null], { canStart: true, status: 'Reconnecting…' })],
  ['guest', 'Guest: my slot and my colour', () => guest()],
  ['guest-recon', 'Guest: my link dropped', () => guest({ status: 'Reconnecting…', note: null })],
  ['guest-host-away', 'Guest: the host dropped', () => guest({ seats: [{ ...KLARA, state: 'away' }, MINA, OSKAR, null], status: 'Waiting for Klara…', note: null })],
];

function Index() {
  return (
    <div style={{ position: 'relative', padding: '24px 16px', color: '#fff' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: 26 }}>Gulp: play with friends</h1>
      <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9, fontSize: 17 }}>
        {STATES.map(([id, title]) => (
          <li key={id}>
            <a href={`?s=${id}`} style={{ color: '#fff' }}>
              {title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Preview() {
  const id = new URLSearchParams(location.search).get('s');
  const state = STATES.find(([s]) => s === id);
  return (
    <div className="app gulp-root" data-testid="gulp-together-preview" style={{ maxWidth: 'none', padding: 0 }}>
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, background: `#6bbf5a url(${CITY}) center / cover no-repeat` }} />
      {state ? state[2]() : <Index />}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Preview />);
