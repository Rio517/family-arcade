/**
 * Shot playback — how the battle screen shows each shot as it lands.
 *
 * With "Watch the shots" on (and the pitch's guns), a new shot is held back
 * while it plays: our gun trains and fires and the shell flies to the radar,
 * or the enemy's shell comes in over the horizon onto our fleet. The result is
 * revealed on impact. Shots that arrive meanwhile wait their turn; a skip
 * reveals everything at once. With it off, every shot is revealed the moment
 * it is in the log, as the game has always done.
 *
 * This is view state only. It reads the log and never writes it: what is
 * "revealed" is a count of the log's shots to draw, and skipping changes
 * nothing but that count. The opponent's next turn never waits on it — the
 * game moves at its own pace, and the playback catches up.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { GameLog, ShotEvent, Side } from '@games/battleship/domain/types';

/** Our salvo: guns train and fire, then the shell drops onto the radar. */
export const OUT_MS = 1100;
/** Their shell, from over the horizon down onto our fleet. */
export const IN_MS = 900;
/** The last stretch of our shell's flight, drawn coming down on the radar. */
export const DROP_MS = 380;
/** How long a revealed cell counts as fresh (its board shake, its pop). */
const FRESH_MS = 700;

type Kind = 'hit' | 'miss' | 'sunk';

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
}

export interface PlaybackSnapshot {
  /** How many of the log's shots to draw. */
  revealed: number;
  current: Playing | null;
  last: Revealed | null;
  cue: PlaybackCue | null;
}

const kindOf = (s: ShotEvent): Kind => (s.allSunk || s.sunk ? 'sunk' : s.hit ? 'hit' : 'miss');
const shotsOf = (log: GameLog): ShotEvent[] => log.filter((e): e is ShotEvent => e.type === 'shot');

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

  constructor(initialShots: number) {
    // Shots already in the log when the screen opens (a resume) went off long ago.
    this.snap = { revealed: initialShots, current: null, last: null, cue: null };
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
      this.set({ revealed: n, current: null, last: null });
      return;
    }
    if (!enabled) {
      if (wasEnabled && this.snap.current) this.stop();
      if (n > this.snap.revealed || this.snap.current) this.revealAll(false);
      return;
    }
    // A playback whose timer was torn down (a remount) starts its shot again.
    if (this.snap.current && !this.timer) this.set({ current: null });
    if (!this.snap.current) this.next();
  }

  /** Skip what's playing (and anything queued): every shot shown at once. Changes no game state. */
  skip(): void {
    if (!this.snap.current) return;
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
    const wasPlaying = this.snap.current;
    if (!lastShot || (n === this.snap.revealed && !wasPlaying)) return;
    const mine = lastShot.by === this.side;
    const kind = kindOf(lastShot);
    const id = this.seq++;
    // After a skip the ocean finishes the job (guns snap round, a shell in the
    // air lands now); shown at once, an enemy shot still lands with a blast.
    const cue: PlaybackCue | null = skipped
      ? { id, type: 'skip', row: lastShot.row, col: lastShot.col, kind, ms: 0 }
      : !mine
        ? { id, type: 'impact', row: lastShot.row, col: lastShot.col, kind, ms: 0 }
        : this.snap.cue;
    this.set({
      revealed: n,
      current: null,
      last: { id, index: n - 1, shot: lastShot, mine, kind, watched: false, fresh: true },
      cue,
    });
    this.settleFresh();
  }

  private next(): void {
    const n = this.shots.length;
    let from = this.snap.revealed;
    if (from >= n) return;
    // Fallen behind (a reconnect delivers a burst of shots): show all but the
    // newest at once and play only that one.
    if (n - from > 1) from = n - 1;
    const shot = this.shots[from];
    const mine = shot.by === this.side;
    const kind = kindOf(shot);
    const ms = mine ? OUT_MS : IN_MS;
    const id = this.seq++;
    this.set({
      revealed: from,
      current: { id, index: from, shot, mine, kind, ms },
      cue: { id, type: mine ? 'fire' : 'incoming', row: shot.row, col: shot.col, kind, ms },
    });
    this.timer = setTimeout(() => {
      this.timer = null;
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
