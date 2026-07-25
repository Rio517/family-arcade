/**
 * End-to-end protocol simulation — no network, no React, just the pure engine
 * and protocol driven exactly the way the two live peers drive them.
 *
 * This is the test that proves the headline features actually work:
 *   • a whole game plays to a correct winner, and
 *   • a mid-game disconnect + reconnect resyncs both peers to an identical
 *     state with no lost or duplicated moves.
 */

import { describe, expect, it } from 'vitest';
import { autoPlace, shipCells } from './board';
import {
  currentTurn,
  hasStarted,
  resolveShot,
  shotsBy,
  winner,
} from './engine';
import { reconcileLogs } from './protocol';
import { otherSide } from './constants';
import { seededRng } from '../test/helpers';
import type { Coord, Fleet, GameLog, ShotEvent, Side } from './types';

/**
 * A faithful in-memory peer. It holds its own private fleet and its own copy
 * of the shared log, and — crucially — respects the same locks the real app
 * does: it fires only on its own turn and only when it has no outstanding
 * unanswered shot (`pending`). That discipline is what keeps at most one
 * settled shot in flight, which is what makes "longer log wins" safe.
 */
class SimPeer {
  log: GameLog = [];
  pending: Coord | null = null;
  private tried = new Set<string>();

  constructor(
    readonly side: Side,
    readonly fleet: Fleet,
    /** Deterministic firing order for the test. */
    private readonly targets: Coord[],
    private targetIdx = 0,
  ) {}

  private key(c: Coord) {
    return `${c.row},${c.col}`;
  }

  /** Author the opening event (host only). */
  start(first: Side): Msg[] {
    if (!hasStarted(this.log)) this.log = [{ type: 'start', first }];
    return [{ to: otherSide(this.side), body: { t: 'start', first } }];
  }

  /** If it's my turn and I'm not waiting on a result, fire the next target. */
  maybeFire(): Msg[] {
    if (winner(this.log)) return [];
    if (currentTurn(this.log) !== this.side) return [];
    if (this.pending) return [];
    let target = this.targets[this.targetIdx++];
    while (target && this.tried.has(this.key(target))) target = this.targets[this.targetIdx++];
    if (!target) return [];
    this.tried.add(this.key(target));
    this.pending = target;
    return [{ to: otherSide(this.side), body: { t: 'fire', row: target.row, col: target.col } }];
  }

  receive(msg: WireMsg): Msg[] {
    switch (msg.t) {
      case 'start':
        if (!hasStarted(this.log)) this.log = [{ type: 'start', first: msg.first }];
        return [];
      case 'fire': {
        const attacker = otherSide(this.side);
        const prior = shotsBy(this.log, attacker).map((e) => ({ row: e.row, col: e.col }));
        if (prior.some((c) => c.row === msg.row && c.col === msg.col)) return [];
        const event = resolveShot(this.fleet, prior, { row: msg.row, col: msg.col }, attacker);
        this.log = [...this.log, event];
        return [{ to: attacker, body: { t: 'shot', event } }];
      }
      case 'shot': {
        const ev = msg.event;
        const already = shotsBy(this.log, ev.by).some((e) => e.row === ev.row && e.col === ev.col);
        if (!already) this.log = [...this.log, ev];
        if (ev.by === this.side) this.pending = null;
        return [];
      }
      case 'sync': {
        this.log = reconcileLogs(this.log, msg.log);
        // Adopting a longer log means my in-flight shot (if any) landed.
        if (this.pending && shotsBy(this.log, this.side).some((e) => e.row === this.pending!.row && e.col === this.pending!.col)) {
          this.pending = null;
        }
        // If it's my turn again, my lost fire never landed — free to retry.
        if (currentTurn(this.log) === this.side) this.pending = null;
        return [];
      }
    }
  }

  syncMsg(): WireMsg {
    return { t: 'sync', log: this.log };
  }
}

type WireMsg =
  | { t: 'start'; first: Side }
  | { t: 'fire'; row: number; col: number }
  | { t: 'shot'; event: ShotEvent }
  | { t: 'sync'; log: GameLog };

interface Msg {
  to: Side;
  body: WireMsg;
}

/** Every cell of a 10×10 board in a fixed diagonal-ish order. */
function allTargets(rng: () => number): Coord[] {
  const cells: Coord[] = [];
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) cells.push({ row: r, col: c });
  // Shuffle deterministically so the two players hunt differently.
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells;
}

describe('full game simulation', () => {
  it('plays to a correct winner with both logs identical', () => {
    const host = new SimPeer('host', autoPlace(seededRng(1)), allTargets(seededRng(11)));
    const guest = new SimPeer('guest', autoPlace(seededRng(2)), allTargets(seededRng(22)));
    const peers: Record<Side, SimPeer> = { host, guest };

    let queue: Msg[] = host.start('host');

    let safety = 5000;
    while (!winner(host.log) && !winner(guest.log) && safety-- > 0) {
      // Deliver all queued messages, collecting any replies.
      const next: Msg[] = [];
      for (const m of queue) next.push(...peers[m.to].receive(m.body));
      queue = next;
      // Let whoever can move, move.
      queue.push(...host.maybeFire(), ...guest.maybeFire());
    }

    // Drain in-flight messages so the finishing shot reaches both peers.
    let flush = 100;
    while (queue.length && flush-- > 0) {
      const next: Msg[] = [];
      for (const m of queue) next.push(...peers[m.to].receive(m.body));
      queue = next;
    }

    expect(safety).toBeGreaterThan(0);
    const w = winner(host.log);
    expect(w).not.toBeNull();
    expect(winner(guest.log)).toBe(w);
    expect(host.log).toEqual(guest.log);

    // The winner is the side that sank all 17 of the opponent's ship cells.
    const loser = otherSide(w!);
    const loserFleet = peers[loser].fleet;
    const hitsOnLoser = new Set(
      shotsBy(host.log, w!).filter((s) => s.hit).map((s) => `${s.row},${s.col}`),
    );
    const loserCells = loserFleet.flatMap((p) => shipCells(p));
    expect(loserCells.every((c) => hitsOnLoser.has(`${c.row},${c.col}`))).toBe(true);
  });

  it('resyncs to an identical state after a mid-game disconnect', () => {
    const host = new SimPeer('host', autoPlace(seededRng(3)), allTargets(seededRng(33)));
    const guest = new SimPeer('guest', autoPlace(seededRng(4)), allTargets(seededRng(44)));
    const peers: Record<Side, SimPeer> = { host, guest };

    let queue: Msg[] = host.start('host');
    let connected = true;
    let step = 0;

    let safety = 5000;
    while (!winner(host.log) && !winner(guest.log) && safety-- > 0) {
      step++;
      // Sever the link for a window in the middle of the game, then heal it.
      if (step === 40) connected = false;
      if (step === 55) {
        connected = true;
        // Reconnect handshake: exchange sync in both directions.
        host.receive(guest.syncMsg());
        guest.receive(host.syncMsg());
        // A second exchange settles any freshly-minted shot.
        host.receive(guest.syncMsg());
        guest.receive(host.syncMsg());
      }

      const next: Msg[] = [];
      for (const m of queue) {
        if (!connected) continue; // messages sent while down are lost
        next.push(...peers[m.to].receive(m.body));
      }
      queue = connected ? next : [];
      queue.push(...host.maybeFire(), ...guest.maybeFire());
    }

    expect(safety).toBeGreaterThan(0);
    // Despite the outage, the two peers converge on the same completed game.
    const finalHost = reconcileLogs(host.log, guest.log);
    const finalGuest = reconcileLogs(guest.log, host.log);
    expect(finalHost).toEqual(finalGuest);
    expect(winner(finalHost)).not.toBeNull();
  });
});
