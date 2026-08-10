/**
 * A computer captain behind the network interface (ADR 0009). Implements the
 * same four-method surface as GameConnection, but the "peer" is a second pure
 * SessionState living in-process: every message the human's session sends is
 * applied to the captain's session, and the captain's replies come back
 * through handlers.onMessage after a short, human-feeling delay. The session
 * machine, the protocol, and the single-writer invariants never learn the
 * opponent isn't real.
 *
 * The gunner (domain/bots) is loaded via dynamic import(), so games against
 * people never download it.
 */
import { autoPlace } from '../domain/board';
import * as Session from '../domain/session';
import type { Message } from '../domain/protocol';
import type { ConnectionHandlers } from '@shared/net/peer';
import type { Fleet, GameLog } from '../domain/types';

type Cancel = () => void;
type Schedule = (fn: () => void, ms: number) => Cancel;

/** How long the captain "thinks" before shots / placement. */
const THINK_MIN_MS = 700;
const THINK_JITTER_MS = 500;
/** Wire latency for message delivery, so the exchange reads naturally. */
const LATENCY_MS = 120;

export interface LoopbackResume {
  fleet: Fleet;
  log: GameLog;
  myReady: boolean;
}

export interface LoopbackOptions {
  personaId: string;
  rng?: () => number;
  /** Injectable scheduler for tests; production uses setTimeout. */
  schedule?: Schedule;
  /** Restore a mid-game captain from a saved solo session. */
  resume?: LoopbackResume;
}

const timeoutSchedule: Schedule = (fn, ms) => {
  const t = setTimeout(fn, ms);
  return () => clearTimeout(t);
};

export class LoopbackConnection {
  /** Resolves once the captain's brain is imported and the session exists. */
  readonly ready: Promise<void>;
  private resolveReady!: () => void;

  private bot: Session.SessionState | null = null;
  private dead = false;
  private cancels = new Set<Cancel>();
  private fireQueued = false;
  private placeQueued = false;
  /** Rises while scheduled work (or work it schedules) is still pending. */
  private pendingCount = 0;
  private idleResolvers: (() => void)[] = [];

  private bots = import('../domain/bots');

  constructor(
    private handlers: ConnectionHandlers<Message>,
    private opts: LoopbackOptions,
  ) {
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  /** Test helper: resolves when no scheduled work remains. */
  idle(): Promise<void> {
    if (this.pendingCount === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleResolvers.push(resolve));
  }

  host(code: string): void {
    void this.start(code);
  }

  /** Solo humans always host; joining a computer game is the same thing. */
  join(code: string): void {
    void this.start(code);
  }

  send(msg: Message): boolean {
    if (this.dead || !this.bot) return this.dead ? false : true; // pre-ready sends can't happen: onOpen fires after start()
    this.later(() => {
      if (!this.bot) return;
      this.apply(Session.applyMessage(this.bot, msg, this.rng));
    }, LATENCY_MS);
    return true;
  }

  destroy(): void {
    this.dead = true;
    for (const cancel of this.cancels) cancel();
    this.cancels.clear();
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private get rng(): () => number {
    return this.opts.rng ?? Math.random;
  }

  private async start(code: string): Promise<void> {
    this.handlers.onStatus('dialing');
    const { captainById } = await this.bots;
    if (this.dead) return;
    const persona = captainById(this.opts.personaId);
    const fresh = Session.createSession('guest', code, persona.name, persona.skinId);
    const r = this.opts.resume;
    this.bot = r
      ? {
          ...fresh,
          myFleet: r.fleet,
          myReady: r.myReady,
          log: r.log,
          setupPhase: r.myReady ? 'waiting' : 'placing',
        }
      : fresh;
    this.handlers.onStatus('connected');
    this.handlers.onOpen();
    this.deliver(Session.connectHandshake(this.bot));
    this.afterChange();
    this.resolveReady();
  }

  private later(fn: () => void, ms: number): void {
    if (this.dead) return;
    this.pendingCount++;
    let settled = false;
    let wrapped: Cancel | null = null;
    const settle = () => {
      if (settled) return;
      settled = true;
      if (wrapped) this.cancels.delete(wrapped);
      this.pendingCount--;
      if (this.pendingCount === 0) {
        const resolvers = this.idleResolvers;
        this.idleResolvers = [];
        for (const resolve of resolvers) resolve();
      }
    };
    const scheduler = this.opts.schedule ?? timeoutSchedule;
    // NB: a test scheduler may run the callback synchronously, before this
    // call even returns — everything the callback touches is declared above.
    const cancel = scheduler(() => {
      if (!this.dead) fn();
      settle();
    }, ms);
    if (!settled) {
      wrapped = () => {
        cancel();
        settle();
      };
      this.cancels.add(wrapped);
    }
  }

  private thinkMs(): number {
    return THINK_MIN_MS + this.rng() * THINK_JITTER_MS;
  }

  private apply(o: Session.Outcome): void {
    this.bot = o.state;
    this.deliver(o.outgoing);
    this.afterChange();
  }

  private deliver(msgs: Message[]): void {
    if (msgs.length === 0) return;
    this.later(() => {
      for (const m of msgs) this.handlers.onMessage(m);
    }, LATENCY_MS);
  }

  /** After every state change: place a fleet, agree to rematches, take a turn. */
  private afterChange(): void {
    const bot = this.bot;
    if (!bot) return;
    const phase = Session.phase(bot);

    if ((phase === 'fleet' || phase === 'placing') && !bot.myReady && !this.placeQueued) {
      this.placeQueued = true;
      this.later(() => {
        this.placeQueued = false;
        if (!this.bot || this.bot.myReady) return;
        const placed = Session.setFleet(Session.toPlacing(this.bot), autoPlace(this.rng));
        this.apply(Session.confirmReady(placed, this.rng));
      }, this.thinkMs());
      return;
    }

    if (phase === 'over' && bot.oppWantsRematch && !bot.iWantRematch) {
      this.later(() => {
        if (!this.bot || this.bot.iWantRematch) return;
        this.apply(Session.proposeRematch(this.bot));
      }, this.thinkMs());
      return;
    }

    if (phase === 'battle' && Session.isMyTurn(bot) && !this.fireQueued) {
      this.fireQueued = true;
      this.later(() => {
        this.fireQueued = false;
        void this.takeShot();
      }, this.thinkMs());
    }
  }

  private async takeShot(): Promise<void> {
    const { decideShot, captainById } = await this.bots;
    const bot = this.bot;
    if (this.dead || !bot) return;
    if (Session.phase(bot) !== 'battle' || !Session.isMyTurn(bot)) return;
    const target = decideShot(bot.log, bot.side, captainById(this.opts.personaId), this.rng);
    this.apply(Session.fireAt(bot, target));
  }

  /** For persistence: enough to resume this captain after a reload. */
  snapshot(): LoopbackResume | null {
    const bot = this.bot;
    if (!bot) return null;
    return { fleet: bot.myFleet, log: bot.log, myReady: bot.myReady };
  }
}
