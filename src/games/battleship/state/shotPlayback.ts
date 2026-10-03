/**
 * Shot playback — how the battle screen shows each shot as it lands.
 *
 * With "Watch the shots" on (and the pitch's guns), a new shot is held back
 * while it plays: our gun trains and fires and the shell flies off to the
 * east and drops onto the radar, or the enemy's attack comes in from the east
 * onto our fleet. The result is revealed on impact. Our result then holds on
 * the radar for a beat before their answer starts, so one exchange never
 * reads as a single shell looping back. Shots that arrive meanwhile wait
 * their turn; a skip reveals everything at once. With it off, every shot is
 * revealed the moment it is in the log, as the game has always done.
 *
 * This is view state only. It reads the log and never writes it: what is
 * "revealed" is a count of the log's shots to draw, and skipping changes
 * nothing but that count. The opponent's next turn never waits on it — the
 * game moves at its own pace, and the playback catches up.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { GameLog, ShotEvent, Side } from '@games/battleship/domain/types';

/** Our salvo: guns train and fire (or planes launch), then the shell drops onto the radar. */
export const OUT_MS = 1100;
/** Our result holds on the radar this long before their answer starts. */
export const BEAT_MS = 900;
/** After we sink one, the hold covers the ship going down on the radar. */
export const SINK_BEAT_MS = 2000;
/** Their attack: the warning ring tightens on our water alone for this long… */
export const WARN_MS = 450;
/** …and the whole of it, warning included, lasts this long (the shell's flight is the rest). */
export const IN_MS = 1350;
/** The last stretch of our shell's flight, drawn coming down on the radar. */
export const DROP_MS = 380;
/** An enemy ship we sank lists, rises and slips under on the radar over this long. */
export const RADAR_SINK_MS = 2600;
/** How long a revealed cell counts as fresh (its board shake, its pop). */
const FRESH_MS = 700;
/** While their carrier is afloat, every this-many-th attack of theirs comes by plane. */
const PLANE_EVERY = 3;

type Kind = 'hit' | 'miss' | 'sunk';
/** What carries an attack in: a shell, or (theirs, while their carrier is afloat) a diving plane's bomb. */
export type Via = 'shell' | 'plane';

export interface Playing {
  id: number;
  /** Index of this shot among the log's shots. */
  index: number;
  shot: ShotEvent;
  mine: boolean;
  kind: Kind;
  ms: number;
}

export interface Revealed {
  id: number;
  index: number;
  shot: ShotEvent;
  mine: boolean;
  kind: Kind;
  /** Played out in full (false: shown at once, or cut short by a skip). */
  watched: boolean;
  /** Still within its moment: the board shakes and the cell pops. */
  fresh: boolean;
}

/** What the 3D ocean should play next, once per id. */
export interface PlaybackCue {
  id: number;
  type: 'fire' | 'incoming' | 'impact' | 'skip';
  row: number;
  col: number;
  kind: Kind;
  ms: number;
  /** For 'incoming': how long the warning ring shows alone before the attack appears. */
  warn: number;
  /** For 'incoming': a shell, or a diving plane's bomb. */
  via: Via;
}

export interface PlaybackSnapshot {
  /** How many of the log's shots to draw. */
  revealed: number;
  current: Playing | null;
  last: Revealed | null;
  cue: PlaybackCue | null;
  /** Our result is holding on the radar; their answer starts when the beat ends. */
  beat: boolean;
}

const kindOf = (s: ShotEvent): Kind => (s.allSunk || s.sunk ? 'sunk' : s.hit ? 'hit' : 'miss');
const shotsOf = (log: GameLog): ShotEvent[] => log.filter((e): e is ShotEvent => e.type === 'shot');

/**
 * How shot `index` (theirs) comes in: every PLANE_EVERY-th attack of theirs,
 * counting from the second, is a plane while their carrier is still afloat
 * (none of our shots before it sank the carrier). Fixed by the log alone, so
 * the same shot always comes the same way.
 */
export function viaOf(shots: ShotEvent[], index: number, side: Side): Via {
  let theirs = 0;
  for (let i = 0; i < index; i++) {
    const s = shots[i];
    if (s.by === side && s.sunk === 'carrier') return 'shell';
    if (s.by !== side) theirs++;
  }
  return (theirs + 1) % PLANE_EVERY === 2 ? 'plane' : 'shell';
}

/** The log as the screen should draw it: every event, but only the first `shots` shots. */
export function logUpTo(log: GameLog, shots: number): GameLog {
  let seen = 0;
  const out: GameLog = [];
  for (const e of log) {
    if (e.type === 'shot') {
      if (seen >= shots) continue;
      seen++;
    }
    out.push(e);
  }
  return out;
}

export class ShotPlayer {
  private snap: PlaybackSnapshot;
  private listeners = new Set<() => void>();
  private shots: ShotEvent[] = [];
  private side: Side = 'host';
  private enabled = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private freshTimer: ReturnType<typeof setTimeout> | null = null;
  private seq = 1;
  /** Until when (Date.now()) our latest result holds the radar before their answer may start. */
  private holdUntil = 0;

  constructor(initialShots: number) {
    // Shots already in the log when the screen opens (a resume) went off long ago.
    this.snap = { revealed: initialShots, current: null, last: null, cue: null, beat: false };
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.snap;

  private set(next: Partial<PlaybackSnapshot>) {
    this.snap = { ...this.snap, ...next };
    for (const fn of this.listeners) fn();
  }

  /** Bring the playback level with the log. Call whenever the log or the setting changes. */
  sync(log: GameLog, side: Side, enabled: boolean): void {
    this.shots = shotsOf(log);
    this.side = side;
    const wasEnabled = this.enabled;
    this.enabled = enabled;
    const n = this.shots.length;
    if (n < this.snap.revealed) {
      // A new game (a rematch's empty log): nothing left to play.
      this.stop();
      this.holdUntil = 0;
      this.set({ revealed: n, current: null, last: null, beat: false });
      return;
    }
    if (!enabled) {
      // Off: whatever is playing or holding shows at once.
      if (wasEnabled) this.stop();
      if (this.snap.beat) this.set({ beat: false });
      if (n > this.snap.revealed || this.snap.current) this.revealAll(false);
      return;
    }
    // A playback whose timer was torn down (a remount) starts its shot again.
    if (this.snap.current && !this.timer) this.set({ current: null });
    if (this.snap.beat && !this.timer) this.set({ beat: false });
    if (!this.snap.current) this.next();
  }

  /** Skip what's playing or holding (and anything queued): every shot shown at once. Changes no game state. */
  skip(): void {
    if (!this.snap.current && !this.snap.beat) return;
    this.stop();
    this.revealAll(true);
  }

  dispose(): void {
    this.stop();
    if (this.freshTimer) clearTimeout(this.freshTimer);
    this.listeners.clear();
  }

  private stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private revealAll(skipped: boolean): void {
    const n = this.shots.length;
    const lastShot = this.shots[n - 1];
    const wasPlaying = this.snap.current || this.snap.beat;
    if (!lastShot || (n === this.snap.revealed && !wasPlaying)) return;
    const mine = lastShot.by === this.side;
    const kind = kindOf(lastShot);
    const id = this.seq++;
    // After a skip the ocean finishes the job (guns snap round, a shell in the
    // air lands now); shown at once, an enemy shot still lands with a blast.
    const at = { row: lastShot.row, col: lastShot.col, kind, ms: 0, warn: 0, via: 'shell' as const };
    const cue: PlaybackCue | null = skipped
      ? { id, type: 'skip', ...at }
      : !mine
        ? { id, type: 'impact', ...at }
        : this.snap.cue;
    // Shown at once, our result still holds a beat before their next shell.
    this.holdUntil = mine ? Date.now() + BEAT_MS : 0;
    this.set({
      revealed: n,
      current: null,
      beat: false,
      last: { id, index: n - 1, shot: lastShot, mine, kind, watched: false, fresh: true },
      cue,
    });
    this.settleFresh();
  }

  private next(): void {
    // A beat is already counting down to their shot.
    if (this.timer) return;
    const n = this.shots.length;
    let from = this.snap.revealed;
    if (from >= n) return;
    // Fallen behind (a reconnect delivers a burst of shots): show all but the
    // newest at once and play only that one.
    if (n - from > 1) from = n - 1;
    const shot = this.shots[from];
    const mine = shot.by === this.side;
    // Our result holds the radar for a beat before their answer comes in.
    const wait = mine ? 0 : this.holdUntil - Date.now();
    if (wait > 0) {
      this.set({ beat: true });
      this.timer = setTimeout(() => {
        this.timer = null;
        this.holdUntil = 0;
        this.set({ beat: false });
        if (this.enabled) this.next();
      }, wait);
      return;
    }
    const kind = kindOf(shot);
    const ms = mine ? OUT_MS : IN_MS;
    const id = this.seq++;
    this.set({
      revealed: from,
      current: { id, index: from, shot, mine, kind, ms },
      cue: {
        id,
        type: mine ? 'fire' : 'incoming',
        row: shot.row,
        col: shot.col,
        kind,
        ms,
        warn: mine ? 0 : WARN_MS,
        via: mine ? 'shell' : viaOf(this.shots, from, this.side),
      },
    });
    this.timer = setTimeout(() => {
      this.timer = null;
      this.holdUntil = mine ? Date.now() + (kind === 'sunk' ? SINK_BEAT_MS : BEAT_MS) : 0;
      this.set({
        revealed: from + 1,
        current: null,
        last: { id: this.seq++, index: from, shot, mine, kind, watched: true, fresh: true },
      });
      this.settleFresh();
      if (this.enabled) this.next();
    }, ms);
  }

  private settleFresh(): void {
    if (this.freshTimer) clearTimeout(this.freshTimer);
    this.freshTimer = setTimeout(() => {
      this.freshTimer = null;
      if (this.snap.last?.fresh) this.set({ last: { ...this.snap.last, fresh: false } });
    }, FRESH_MS);
  }
}

/**
 * The playback for one battle screen. `enabled`: the pitch's guns are on and
 * the player watches the shots. Returns what to draw and a skip.
 */
export function useShotPlayback(log: GameLog, side: Side, enabled: boolean): PlaybackSnapshot & { shown: number; skip: () => void } {
  const [player] = useState(() => new ShotPlayer(shotsOf(log).length));
  const snap = useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
  useEffect(() => {
    player.sync(log, side, enabled);
  }, [player, log, side, enabled]);
  useEffect(() => () => player.dispose(), [player]);
  const total = useMemo(() => shotsOf(log).length, [log]);
  // Until the playback has seen a new shot, keep it hidden — never flash a
  // result for a frame before its shell has flown.
  const shown = enabled ? Math.min(snap.revealed, total) : total;
  return { ...snap, shown, skip: () => player.skip() };
}
