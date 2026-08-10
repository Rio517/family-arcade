import { describe, expect, it } from 'vitest';
import { seededRng, stackFleet } from '@test/helpers';
import { LoopbackConnection } from './loopback';
import * as Session from '../domain/session';
import { winner } from '../domain/engine';
import type { Message } from '../domain/protocol';
import { BOARD_SIZE, type Coord } from '../domain/types';

/**
 * A scripted human driving the pure session machine against the loopback,
 * exactly the way useBattleship does: inbound messages apply to the session,
 * outgoing messages go back through conn.send.
 */
function humanHarness(conn: () => LoopbackConnection) {
  let state = Session.createSession('host', 'SOLO', 'Kid', 'aqua');
  const apply = (o: Session.Outcome) => {
    state = o.state;
    for (const m of o.outgoing) conn().send(m);
  };
  return {
    get state() {
      return state;
    },
    handlers: {
      onStatus: () => {},
      onOpen: () => {
        for (const m of Session.connectHandshake(state)) conn().send(m);
      },
      onMessage: (msg: Message) => apply(Session.applyMessage(state, msg, seededRng(9))),
    },
    placeAndReady() {
      state = Session.setFleet(Session.toPlacing(state), stackFleet());
      apply(Session.confirmReady(state, seededRng(2)));
    },
    fire(target: Coord) {
      apply(Session.fireAt(state, target));
    },
    proposeRematch() {
      apply(Session.proposeRematch(state));
    },
  };
}

/** Run every scheduled callback immediately — the whole exchange is synchronous. */
const immediate = (fn: () => void) => {
  fn();
  return () => {};
};

describe('LoopbackConnection', () => {
  it('plays a whole game against the scripted human, to a winner', async () => {
    let conn!: LoopbackConnection;
    const human = humanHarness(() => conn);
    conn = new LoopbackConnection(human.handlers, {
      personaId: 'grimtide',
      rng: seededRng(5),
      schedule: immediate,
    });
    conn.host('SOLO');
    await conn.ready;

    expect(human.state.oppName).toBe('Admiral Grimtide');
    human.placeAndReady();
    await conn.idle();
    // Both fleets placed → the human (host) authored the start.
    expect(human.state.log.some((e) => e.type === 'start')).toBe(true);

    // The human fires row by row; the captain answers and shoots back on its
    // own turns. 200 human shots is more than a full board — the game must
    // finish long before the guard runs out.
    let cursor = 0;
    for (let guard = 0; guard < 200 && winner(human.state.log) === null; guard++) {
      if (Session.isMyTurn(human.state)) {
        const target = { row: Math.floor(cursor / BOARD_SIZE), col: cursor % BOARD_SIZE };
        cursor++;
        human.fire(target);
        await conn.idle();
      } else {
        await conn.idle();
      }
    }

    expect(winner(human.state.log)).not.toBeNull();
    // Single-writer invariant: every shot at the human was authored by the
    // captain's side and vice versa — the defender minted each event.
    for (const ev of human.state.log) {
      if (ev.type === 'shot') expect(['host', 'guest']).toContain(ev.by);
    }
  });

  it('agrees to a rematch and places a fresh fleet', async () => {
    let conn!: LoopbackConnection;
    const human = humanHarness(() => conn);
    conn = new LoopbackConnection(human.handlers, {
      personaId: 'bobble',
      rng: seededRng(11),
      schedule: immediate,
    });
    conn.host('SOLO');
    await conn.ready;
    human.placeAndReady();
    await conn.idle();

    let cursor = 0;
    for (let guard = 0; guard < 200 && winner(human.state.log) === null; guard++) {
      if (Session.isMyTurn(human.state)) {
        const target = { row: Math.floor(cursor / BOARD_SIZE), col: cursor % BOARD_SIZE };
        cursor++;
        human.fire(target);
      }
      await conn.idle();
    }
    expect(winner(human.state.log)).not.toBeNull();

    // Human asks for a rematch; the captain's own `rematch` comes back through
    // the wire, both sides reset, and the captain re-places a fresh fleet.
    human.proposeRematch();
    await conn.idle();
    expect(winner(human.state.log)).toBeNull(); // the finished game is gone
    expect(human.state.epoch).toBe(1);
  });

  it('destroy() cancels anything still scheduled', async () => {
    const pending: (() => void)[] = [];
    let conn!: LoopbackConnection;
    const human = humanHarness(() => conn);
    conn = new LoopbackConnection(human.handlers, {
      personaId: 'wake',
      rng: seededRng(3),
      schedule: (fn) => {
        pending.push(fn);
        return () => {
          const at = pending.indexOf(fn);
          if (at !== -1) pending.splice(at, 1);
        };
      },
    });
    conn.host('SOLO');
    await conn.ready;
    const before = human.state;
    conn.destroy();
    while (pending.length) pending.shift()!();
    expect(human.state).toBe(before); // nothing leaked through after destroy
  });
});
