/**
 * PLAYER SELECT: the full-screen arcade screen where friends gather before a
 * shared round. A red marquee sign, the four letters, four slots from 1P to
 * 4P (INSERT COIN while a slot is free), the round's settings and START.
 *
 * The host changes the settings and presses START once a friend is in. A
 * guest sees the same choices without being able to change them, picks a
 * colour (colours other children hold are taken) and waits for the host.
 */
import '../../styles/together.css';
import { useId } from 'react';
import { MAPS, type MapId } from '../../domain/city';
import type { Difficulty } from '../../domain/rivals';
import type { RoundSettings } from '../../net/protocol';
import { DIFFICULTY_TITLE, MAP_ORDER } from '../round';
import { SKINS } from '../skins';
import { BackButton, CheckIcon, ChevIcon, Hole, LeaveIcon, MiniTiles, PlugIcon, Tiles } from './parts';
import { useFocusOnOpen } from './useFocusOnOpen';

export interface SelectSeat {
  name: string;
  skin: number;
  state: 'host' | 'ready' | 'coming' | 'away';
}

export interface PlayerSelectProps {
  role: 'host' | 'guest';
  /** The four letters, shown as tiles; empty for friends linked in the party, who need none. */
  code: string;
  /** Four slots; null is a free one (INSERT COIN). */
  seats: Array<SelectSeat | null>;
  /** This device's slot, outlined. */
  mySeat: number;
  settings: RoundSettings;
  /** The host's; a guest sees the same choices read-only. */
  onSettings?: (s: RoundSettings) => void;
  /** The guest's colour picker. */
  onSkin: (skin: number) => void;
  /** Why the colour changed, e.g. "Bubblegum was taken, so you got Grape". */
  note?: string | null;
  /** Computer holes in the round, which fill the map's holes the children leave. */
  holesLeft: number;
  /** The host's START is on. */
  canStart: boolean;
  onStart?: () => void;
  /** Set when a linked friend may be starting a game of their own. */
  joinInstead?: () => void;
  /** A banner over the screen, e.g. "Reconnecting…". */
  status?: string | null;
  onBack: () => void;
}

type Length = 'short' | 'long' | 'endless';
const LEVELS: Difficulty[] = ['easy', 'medium', 'hard'];
const skinOf = (i: number) => SKINS[((i % SKINS.length) + SKINS.length) % SKINS.length];

function lengthOf(s: RoundSettings): Length {
  if (s.duration === 0) return 'endless';
  return s.duration === MAPS[s.map].minutes * 120 ? 'long' : 'short';
}
const durationFor = (map: MapId, length: Length) => (length === 'endless' ? 0 : MAPS[map].minutes * 60 * (length === 'long' ? 2 : 1));
const timeLabel = (s: RoundSettings) => (s.duration === 0 ? 'No limit' : `${Math.round(s.duration / 60)} min`);

export function PlayerSelect(p: PlayerSelectProps) {
  const ref = useFocusOnOpen<HTMLElement>();
  const host = p.role === 'host';
  const seats = [0, 1, 2, 3].map((i) => p.seats[i] ?? null);
  const hostSeat = seats.find((s) => s?.state === 'host') ?? seats[0];
  const hostName = hostSeat?.name ?? '';
  const coming = seats.find((s) => s?.state === 'coming');
  const total = MAPS[p.settings.map].rivals + 1;
  const kids = Math.max(0, total - p.holesLeft);
  const holesLine = `${MAPS[p.settings.map].label} has ${total} holes: ${kids} ${kids === 1 ? 'child' : 'children'} and ${p.holesLeft} computer ${p.holesLeft === 1 ? 'hole' : 'holes'}.`;
  const waitNote = coming ? `Start wakes up when ${coming.name} taps Join.` : 'Waiting for a friend to join…';

  return (
    <section
      ref={ref}
      tabIndex={-1}
      className={`gulp-tg gulp-tg-screen gulp-tg-select ${p.role}`}
      aria-label="Player select"
      data-testid="gulp-select"
    >
      <div className="gulp-tg-col gulp-tg-psel">
        <div className="gulp-tg-top">
          <BackButton onBack={p.onBack} testId="gulp-select-back" />
          <h2 className="gulp-tg-sign">PLAYER SELECT</h2>
        </div>
        {p.status && (
          <p className="gulp-tg-banner" role="status" data-testid="gulp-select-status">
            <span className="gulp-tg-spin">
              <PlugIcon size={24} />
            </span>
            {p.status}
          </p>
        )}

        {!host && <RoundChips settings={p.settings} hostName={hostName} total={total} />}

        {p.code && (
          <div className="gulp-tg-coderow">
            <p className="tl">JOIN CODE</p>
            <Tiles code={p.code} label={`Join code ${p.code.split('').join(' ')}`} testId="gulp-select-code" />
          </div>
        )}
        {host && p.code && (
          <p className="gulp-tg-howto">
            <span>On the other iPads:</span>
            <b>Play with friends</b>
            <ChevIcon size={18} />
            <b>A friend</b>
            <ChevIcon size={18} />
            <span>
              type <MiniTiles code={p.code} />
            </span>
          </p>
        )}

        <ol className="gulp-tg-slots" aria-label="Players">
          {seats.map((seat, i) => (
            <Slot key={i} index={i} seat={seat} mine={i === p.mySeat} guest={!host} />
          ))}
        </ol>

        {host ? (
          <SettingsBar settings={p.settings} onSettings={p.onSettings} />
        ) : (
          <SkinPicker seats={seats} mySeat={p.mySeat} note={p.note ?? null} onSkin={p.onSkin} />
        )}
        {host && p.note && (
          <p className="gulp-tg-note">
            <CheckIcon size={18} />
            <span>{p.note}</span>
          </p>
        )}

        {host ? (
          <div className="gulp-tg-startrow">
            <p className="note">{p.canStart ? holesLine : waitNote}</p>
            <button
              type="button"
              className="gulp-tg-ab y big"
              disabled={!p.canStart}
              onClick={() => p.onStart?.()}
              data-testid="gulp-select-start"
            >
              START
            </button>
          </div>
        ) : (
          <div className="gulp-tg-startrow">
            <p className="note">{hostName ? `Waiting for ${hostName} to press START…` : 'Waiting for START…'}</p>
            <button type="button" className="gulp-tg-ab" onClick={p.onBack} data-testid="gulp-select-leave">
              <LeaveIcon size={20} />
              Leave
            </button>
          </div>
        )}

        {p.joinInstead && (
          <button type="button" className="gulp-tg-link" onClick={p.joinInstead} data-testid="gulp-select-join-instead">
            Is a friend starting instead? Join their game
            <ChevIcon size={16} />
          </button>
        )}
      </div>
    </section>
  );
}

function Slot({ index, seat, mine, guest }: { index: number; seat: SelectSeat | null; mine: boolean; guest: boolean }) {
  const testId = `gulp-select-seat-${index}`;
  if (!seat) {
    return (
      <li className={`gulp-tg-slot free${mine ? ' you' : ''}`} data-testid={testId}>
        <span className="pn">{index + 1}P</span>
        <span className="hw">
          <Hole look="free" />
        </span>
        <span className="mid">
          <span className="ins">INSERT COIN</span>
          <span className="sub">Waiting for a friend</span>
        </span>
      </li>
    );
  }
  const sub = seat.state === 'host' ? 'Host' : seat.state === 'coming' ? 'is coming…' : mine ? 'You' : null;
  const [chip, chipClass] =
    seat.state === 'host'
      ? ['HOST', '']
      : seat.state === 'coming'
        ? ['COMING…', ' soon']
        : seat.state === 'away'
          ? ['AWAY', ' away']
          : mine && guest
            ? ['PICKING…', '']
            : ['READY!', ''];
  const look = seat.state === 'coming' ? 'wait' : seat.state === 'away' ? 'off' : undefined;
  return (
    <li
      className={`gulp-tg-slot${mine ? ' you' : ''}${seat.state === 'away' ? ' away' : ''}`}
      data-testid={testId}
    >
      <span className="pn">{index + 1}P</span>
      <span className="hw">
        <Hole colour={skinOf(seat.skin).css} look={look} />
      </span>
      <span className="mid">
        <span className="nm">{seat.name}</span>
        {sub && <span className="sub">{sub}</span>}
        <span className={`st${chipClass}`}>{chip}</span>
      </span>
    </li>
  );
}

/** The host's map, time and level, as the menu has them. */
function SettingsBar({ settings, onSettings }: { settings: RoundSettings; onSettings?: (s: RoundSettings) => void }) {
  const id = useId();
  const length = lengthOf(settings);
  const minutes = MAPS[settings.map].minutes;
  const set = (patch: Partial<RoundSettings>) => onSettings?.({ ...settings, ...patch });
  const times: Array<[Length, string]> = [
    ['short', `${minutes} min`],
    ['long', `${minutes * 2} min`],
    ['endless', 'No limit'],
  ];
  return (
    <div className="gulp-tg-bar" role="group" aria-label="The round">
      <div className="gulp-tg-grp maps">
        <span className="gulp-tg-lab" id={`${id}-map`}>
          Map
        </span>
        <div className="gulp-tg-seg" role="radiogroup" aria-labelledby={`${id}-map`}>
          {MAP_ORDER.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={settings.map === m}
              className={`gulp-tg-opt${settings.map === m ? ' on' : ''}`}
              onClick={() => set({ map: m, duration: durationFor(m, length) })}
              data-testid={`gulp-select-map-${m}`}
            >
              {MAPS[m].label}
            </button>
          ))}
        </div>
      </div>
      <div className="gulp-tg-grp">
        <span className="gulp-tg-lab" id={`${id}-time`}>
          Time
        </span>
        <div className="gulp-tg-seg" role="radiogroup" aria-labelledby={`${id}-time`}>
          {times.map(([len, label]) => (
            <button
              key={len}
              type="button"
              role="radio"
              aria-checked={length === len}
              className={`gulp-tg-opt${length === len ? ' on' : ''}`}
              onClick={() => set({ duration: durationFor(settings.map, len) })}
              data-testid={`gulp-select-time-${len}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="gulp-tg-grp">
        <span className="gulp-tg-lab" id={`${id}-level`}>
          Level
        </span>
        <div className="gulp-tg-seg" role="radiogroup" aria-labelledby={`${id}-level`}>
          {LEVELS.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={settings.difficulty === d}
              className={`gulp-tg-opt${settings.difficulty === d ? ' on' : ''}`}
              onClick={() => set({ difficulty: d })}
              data-testid={`gulp-select-level-${d}`}
            >
              {DIFFICULTY_TITLE[d]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** What a guest sees of the host's choices: the same settings, as labels. */
function RoundChips({ settings, hostName, total }: { settings: RoundSettings; hostName: string; total: number }) {
  return (
    <ul className="gulp-tg-chips" aria-label="The round" data-testid="gulp-select-round">
      {hostName && <li className="gulp-tg-chip">{hostName}’s game</li>}
      <li className="gulp-tg-chip">{MAPS[settings.map].label}</li>
      <li className="gulp-tg-chip">{timeLabel(settings)}</li>
      <li className="gulp-tg-chip">{DIFFICULTY_TITLE[settings.difficulty]}</li>
      <li className="gulp-tg-chip">{total} holes</li>
    </ul>
  );
}

/** The guest's colour: every skin, the ones other children hold marked taken. */
function SkinPicker({
  seats,
  mySeat,
  note,
  onSkin,
}: {
  seats: Array<SelectSeat | null>;
  mySeat: number;
  note: string | null;
  onSkin: (skin: number) => void;
}) {
  const id = useId();
  const mine = seats[mySeat]?.skin;
  const takenBy = new Map<number, string>();
  seats.forEach((s, i) => {
    if (s && i !== mySeat && !takenBy.has(s.skin)) takenBy.set(s.skin, s.name);
  });
  return (
    <div className="gulp-tg-pick">
      <div className="head">
        <span className="gulp-tg-lab" id={id}>
          Pick your colour
        </span>
        {note && (
          <p className="gulp-tg-note" role="status" data-testid="gulp-select-note">
            <CheckIcon size={18} />
            <span>{note}</span>
          </p>
        )}
      </div>
      <div className="gulp-tg-skins" role="radiogroup" aria-labelledby={id}>
        {SKINS.map((s, i) => {
          const holder = takenBy.get(i);
          const on = mine === i;
          return (
            <button
              key={s.name}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={holder ? `${s.name}, taken` : s.name}
              title={s.name}
              disabled={holder !== undefined}
              className={`gulp-tg-skin${on ? ' on' : ''}${holder ? ' taken' : ''}`}
              onClick={() => onSkin(i)}
              data-testid={`gulp-skin-${i}`}
            >
              <Hole colour={s.css} />
              {holder && (
                <span className="by" aria-hidden="true">
                  {holder.charAt(0).toUpperCase()}
                </span>
              )}
              {on && (
                <span className="by">
                  <CheckIcon size={14} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
