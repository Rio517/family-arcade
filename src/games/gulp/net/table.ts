/**
 * A Gulp Universe table for up to four devices: who is sitting at it, and the
 * round they share (docs/plans/2026-10-02-gulp-play-together.md).
 *
 * The host's device registers the table's code with `GameHost` and runs the
 * one real round. It steps the world with its own child's input and each
 * guest's reported position, and every 50 ms sends every guest a tick: the
 * holes and everything that happened since the last one. A guest dials the
 * code with `GameConnection`, builds the same city from the round's seed,
 * steers its own hole on its own screen and reports where it is, 20 times a
 * second. Its copy of the round (the mirror) only ever changes by the host's
 * word.
 *
 * Seats: the host is seat 0, guests take seats 1 to 3 as they arrive. Each
 * device keeps a seat token, so a guest who drops or reloads and dials back
 * in sits down in its own seat and gets its own hole back: a snapshot if it
 * still has the round, the round's start and then a snapshot if it reloaded.
 *
 * Plain TypeScript with the links handed in, so the whole table can be tested
 * with fake links; `useGulpTable` wraps it for React.
 */
import { GameHost } from '@shared/net/host';
import { GameConnection, type ConnStatus } from '@shared/net/peer';
import { stepWorld, type HoleReport, type Input, type Racer, type World, type WorldEvent } from '../domain/world';
import { reportFrom, snapshotOf, tickOf } from './codec';
import { applySnapshot, applyTick, createMirror, reportOf, stepMirror, type Mirror } from './mirror';
import { GULP_PREFIX, MAX_CHILDREN, isGulpMsg, type GulpMsg, type RoundSettings, type Seat, type SnapshotMsg, type StartMsg, type TickMsg } from './protocol';
import { buildRound } from './round';

export type Role = 'host' | 'guest';

/** How often the host ticks and a guest reports, in seconds (20 a second). */
export const SEND_EVERY = 0.05;

/** What the host's link must do: `GameHost` in the game, a fake in tests. */
export interface HostLink {
  host(code: string): void;
  send(guestId: string, msg: GulpMsg): boolean;
  broadcast(msg: GulpMsg): number;
  kick(guestId: string): void;
  destroy(): void;
}

/** What a guest's link must do: `GameConnection` in the game, a fake in tests. */
export interface GuestLink {
  join(code: string): void;
  send(msg: GulpMsg): boolean;
  destroy(): void;
}

export interface TableEvents {
  /** Anything the screens show changed: seats, settings, the link, the round. */
  onChange: () => void;
  /** Guest: a round began; `mirror.world` is the world to show, seat `mirror.you` is mine. */
  onRound?: (mirror: Mirror) => void;
  /** Host: a guest asked for another round from the results card. */
  onAgain?: () => void;
}

/** A child at the table, as the lobby shows them. */
export interface TableSeat extends Seat {
  /** Still linked (the host always is to itself). */
  connected: boolean;
}

interface HostSeat extends TableSeat {
  token: string;
  /** The guest's link id; null for the host's own seat. */
  guestId: string | null;
  /** Its hole in the running round, or null if it is not in it. */
  hole: number | null;
}

export interface Me {
  name: string;
  skin: number;
  /** Kept by the device, so a reload sits back down in the same seat. */
  token: string;
}

export interface Links {
  host: (events: { onStatus: (s: ConnStatus, detail?: string) => void; onGuestOpen: (id: string) => void; onGuestClose: (id: string) => void; onMessage: (id: string, m: GulpMsg) => void }) => HostLink;
  guest: (events: { onStatus: (s: ConnStatus, detail?: string) => void; onOpen: () => void; onMessage: (m: GulpMsg) => void }) => GuestLink;
}

/** The real links. A guest keeps dialling for a minute: the host's iPad may still be opening Gulp. */
const realLinks: Links = {
  host: (events) => new GameHost<GulpMsg>(events, { prefix: GULP_PREFIX, isMessage: isGulpMsg, maxGuests: MAX_CHILDREN - 1 }),
  guest: (events) => new GameConnection<GulpMsg>(events, { prefix: GULP_PREFIX, isMessage: isGulpMsg, dialTimeoutMs: 60000 }),
};

export class GulpTable {
  role: Role | null = null;
  code = '';
  status: ConnStatus = 'idle';
  statusDetail: string | undefined;
  settings: RoundSettings | null = null;
  /** Host: everyone at the table. Guest: the children the host last told us about. */
  seats: TableSeat[] = [];
  /** The round in play: the host's real world, or the guest's mirror's. */
  world: World | null = null;
  mirror: Mirror | null = null;
  /** The standings the host sent when the round ended (hole ids, best first). */
  order: number[] | null = null;
  /** My seat at the table: 0 for the host, the one the host gave a guest. */
  mySeat = 0;

  private hostSeats: HostSeat[] = [];
  private hostLink: HostLink | null = null;
  private guestLink: GuestLink | null = null;
  private reports = new Map<number, HoleReport>();
  private lastPos = new Map<number, number>();
  private pending: WorldEvent[] = [];
  private seq = 0;
  private since = 0;
  private overSent = false;
  private inbox: Array<TickMsg | SnapshotMsg> = [];
  private posSeq = 0;
  /** Guest: a snapshot has been asked for and not yet come. */
  private asked = false;
  private lastStart: Omit<StartMsg, 'you'> | null = null;

  constructor(
    private me: Me,
    private readonly events: TableEvents,
    private readonly links: Links = realLinks,
  ) {}

  /** Open a table under `code` with this device as its host. */
  host(code: string, settings: RoundSettings): void {
    this.leave();
    this.role = 'host';
    this.code = code;
    this.settings = settings;
    this.hostSeats = [{ name: this.me.name, skin: this.me.skin, human: true, token: this.me.token, guestId: null, connected: true, hole: null }];
    this.syncSeats();
    this.hostLink = this.links.host({
      onStatus: (s, detail) => this.setStatus(s, detail),
      onGuestOpen: () => {
        // The guest says hello first; its seat is settled then.
      },
      onGuestClose: (id) => this.guestLeft(id),
      onMessage: (id, m) => this.fromGuest(id, m),
    });
    this.hostLink.host(code);
    this.events.onChange();
  }

  /** Sit down at the table under `code`. */
  join(code: string): void {
    this.leave();
    this.role = 'guest';
    this.code = code;
    this.guestLink = this.links.guest({
      onStatus: (s, detail) => this.setStatus(s, detail),
      onOpen: () => this.guestLink?.send({ t: 'hello', name: this.me.name, skin: this.me.skin, token: this.me.token, inRound: !!this.mirror && this.world?.status !== 'over' }),
      onMessage: (m) => this.fromHost(m),
    });
    this.guestLink.join(code);
    this.events.onChange();
  }

  leave(): void {
    this.hostLink?.destroy();
    this.guestLink?.destroy();
    this.hostLink = null;
    this.guestLink = null;
    this.role = null;
    this.code = '';
    this.mySeat = 0;
    this.status = 'idle';
    this.seats = [];
    this.hostSeats = [];
    this.world = null;
    this.mirror = null;
    this.order = null;
    this.inbox = [];
    this.reports.clear();
    this.lastPos.clear();
  }

  /** Host: the menu changed. */
  setSettings(settings: RoundSettings): void {
    this.settings = settings;
    this.sendLobby();
  }

  /** Change this device's colour (the host settles clashes). */
  setSkin(skin: number): void {
    this.me = { ...this.me, skin };
    if (this.role === 'guest') this.guestLink?.send({ t: 'pick', skin });
    else if (this.role === 'host') {
      this.hostSeats[0].skin = this.freeSkin(skin, 0);
      this.sendLobby();
    }
  }

  /**
   * Host: start a round for everyone linked now. The children are the linked
   * seats, in seat order; `rivals` fill the computer seats. Returns the
   * host's world.
   */
  startRound(seed: number, wonders: StartMsg['wonders'], rivals: readonly Racer[]): World {
    if (this.role !== 'host' || !this.settings) throw new Error('Only the host starts a round');
    const playing = this.hostSeats.filter((s) => s.connected);
    this.hostSeats.forEach((s) => (s.hole = null));
    playing.forEach((s, i) => (s.hole = i));
    const seats: Seat[] = [...playing.map(({ name, skin }) => ({ name, skin, human: true })), ...rivals.map((r) => ({ name: r.name, skin: r.skin, human: false }))];
    this.lastStart = { t: 'start', seed, settings: this.settings, wonders: [...wonders], seats };
    this.world = buildRound(this.lastStart);
    this.reports.clear();
    this.lastPos.clear();
    this.pending = [];
    this.seq = 0;
    this.since = 0;
    this.overSent = false;
    this.order = null;
    for (const s of playing) if (s.guestId) this.hostLink?.send(s.guestId, { ...this.lastStart, you: s.hole! });
    this.syncSeats();
    this.events.onChange();
    return this.world;
  }

  /** Host, every frame: step the real round and, 20 times a second, tell everyone. */
  hostStep(dt: number, input: Input | null): WorldEvent[] {
    const w = this.world;
    if (!w) return [];
    const events = stepWorld(w, dt, input, this.reports);
    this.pending.push(...events);
    this.since += dt;
    if (this.since >= SEND_EVERY) {
      this.since = 0;
      this.hostLink?.broadcast(tickOf(w, this.pending, this.seq++));
      this.pending = [];
    }
    if (w.status === 'over' && !this.overSent) {
      this.overSent = true;
      this.order = [...w.holes].sort((a, b) => b.score - a.score).map((h) => h.id);
      this.hostLink?.broadcast({ t: 'over', order: this.order });
      this.events.onChange();
    }
    return events;
  }

  /** Guest, every frame: take in what the host said, move my own hole, and report it. */
  guestStep(dt: number, input: Input | null): WorldEvent[] {
    const m = this.mirror;
    if (!m) return [];
    const events: WorldEvent[] = [];
    for (const msg of this.inbox.splice(0)) {
      if (msg.t === 'tick') events.push(...applyTick(m, msg));
      else {
        applySnapshot(m, msg);
        this.asked = false;
      }
    }
    // Drifted from the host's round: ask once, and the snapshot puts it right.
    if (m.needSnapshot && !this.asked) {
      this.asked = true;
      this.guestLink?.send({ t: 'resync' });
    }
    events.push(...stepMirror(m, dt, input));
    this.since += dt;
    if (this.since >= SEND_EVERY) {
      this.since = 0;
      this.guestLink?.send(reportOf(m, this.posSeq++));
    }
    return events;
  }

  /** Guest: another round, please. */
  askAgain(): void {
    this.guestLink?.send({ t: 'again' });
  }

  // ── host side ─────────────────────────────────────────────────────────

  private fromGuest(guestId: string, m: GulpMsg): void {
    if (m.t === 'hello') return this.hello(guestId, m.name, m.skin, m.token, m.inRound);
    const seat = this.hostSeats.find((s) => s.guestId === guestId);
    if (!seat) return;
    switch (m.t) {
      case 'pick':
        seat.skin = this.freeSkin(m.skin, this.hostSeats.indexOf(seat));
        this.sendLobby();
        break;
      case 'pos': {
        if (seat.hole === null || !this.world) return;
        // A late report is older news than the one already in hand.
        if (m.seq <= (this.lastPos.get(seat.hole) ?? -1)) return;
        this.lastPos.set(seat.hole, m.seq);
        // With the life it was sent in, so one from before a respawn is ignored.
        this.reports.set(seat.hole, reportFrom(m));
        break;
      }
      case 'resync':
        if (this.world) this.hostLink?.send(guestId, snapshotOf(this.world, this.seq));
        break;
      case 'again':
        this.events.onAgain?.();
        break;
      default:
        // Guests never get to say what the round holds.
        break;
    }
  }

  private hello(guestId: string, name: string, skin: number, token: string, inRound: boolean): void {
    let seat = this.hostSeats.find((s) => s.token === token);
    if (seat) {
      // Back again, maybe from a reloaded app under a new link: the old link goes.
      if (seat.guestId && seat.guestId !== guestId) this.hostLink?.kick(seat.guestId);
    } else {
      if (this.hostSeats.length >= MAX_CHILDREN) {
        this.hostLink?.kick(guestId);
        return;
      }
      seat = { name, skin: this.freeSkin(skin, this.hostSeats.length), human: true, token, guestId, connected: true, hole: null };
      this.hostSeats.push(seat);
    }
    seat.guestId = guestId;
    seat.connected = true;
    seat.name = name;
    this.hostLink?.send(guestId, { t: 'hello', name: this.me.name, skin: this.hostSeats[0].skin, token: this.me.token, inRound: !!this.world });
    this.sendLobby();
    const w = this.world;
    if (w && seat.hole !== null && w.status !== 'over' && this.lastStart) {
      // Its own round: the start first if it lost it, then where things stand.
      if (!inRound) this.hostLink?.send(guestId, { ...this.lastStart, you: seat.hole });
      this.lastPos.delete(seat.hole);
      this.hostLink?.send(guestId, snapshotOf(w, this.seq));
    }
  }

  private guestLeft(guestId: string): void {
    const seat = this.hostSeats.find((s) => s.guestId === guestId);
    if (!seat) return;
    seat.connected = false;
    seat.guestId = null;
    // In the lobby the seat is given up; in a round it is kept for the child's return.
    if (seat.hole === null || !this.world || this.world.status === 'over') this.hostSeats.splice(this.hostSeats.indexOf(seat), 1);
    else this.reports.delete(seat.hole);
    this.sendLobby();
  }

  /** The colour asked for, or the next one nobody else at the table has. */
  private freeSkin(want: number, seatIndex: number): number {
    const taken = new Set(this.hostSeats.filter((_, i) => i !== seatIndex).map((s) => s.skin));
    for (let k = 0; k < 10; k++) {
      const skin = (want + k) % 10;
      if (!taken.has(skin)) return skin;
    }
    return want;
  }

  private sendLobby(): void {
    this.syncSeats();
    if (this.role === 'host' && this.settings) {
      const children = this.seats.map(({ name, skin, human }) => ({ name, skin, human }));
      // Each guest is told which seat is theirs.
      this.hostSeats.forEach((s, you) => {
        if (s.guestId && s.connected) this.hostLink?.send(s.guestId, { t: 'lobby', settings: this.settings!, children, you });
      });
    }
    this.events.onChange();
  }

  private syncSeats(): void {
    if (this.role === 'host') this.seats = this.hostSeats.map(({ name, skin, human, connected }) => ({ name, skin, human, connected }));
  }

  // ── guest side ────────────────────────────────────────────────────────

  private fromHost(m: GulpMsg): void {
    switch (m.t) {
      case 'lobby':
        this.settings = m.settings;
        this.seats = m.children.map((c) => ({ ...c, connected: true }));
        this.mySeat = m.you;
        this.events.onChange();
        break;
      case 'start':
        this.mirror = createMirror(m);
        this.world = this.mirror.world;
        this.inbox = [];
        this.order = null;
        this.posSeq = 0;
        this.since = 0;
        this.asked = false;
        this.events.onRound?.(this.mirror);
        this.events.onChange();
        break;
      case 'tick':
      case 'snap':
        // Played in the frame loop, in order, so the scene sees them as they land.
        if (this.mirror) this.inbox.push(m);
        break;
      case 'over':
        this.order = m.order;
        this.events.onChange();
        break;
      default:
        break;
    }
  }

  private setStatus(s: ConnStatus, detail?: string): void {
    this.status = s;
    this.statusDetail = detail;
    this.events.onChange();
  }
}
