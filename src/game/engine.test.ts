import { describe, expect, it } from 'vitest';
import {
  currentTurn,
  hasStarted,
  isGameOver,
  ownBoardView,
  radarGrid,
  resolveIncomingFire,
  resolveShot,
  shotsBy,
  survivingCells,
  sunkByAttacker,
  winner,
} from './engine';
import { stackFleet } from '../test/helpers';
import { TOTAL_SHIP_CELLS } from './constants';
import { shipCells } from './board';
import type { Coord, Fleet, GameLog, ShotEvent } from './types';

/** Build the ordered list of every cell in a fleet (for "fire everything"). */
function allCells(fleet: Fleet): Coord[] {
  return fleet.flatMap((p) => shipCells(p));
}

/**
 * Simulate `attacker` firing at the given targets against `defenderFleet`,
 * appending settled shot events to a log. Mirrors what the two peers do live.
 */
function fireSequence(defenderFleet: Fleet, attacker: 'host' | 'guest', targets: Coord[]): GameLog {
  const log: GameLog = [{ type: 'start', first: attacker }];
  const landed: Coord[] = [];
  for (const target of targets) {
    const event = resolveShot(defenderFleet, landed, target, attacker);
    log.push(event);
    landed.push(target);
    // In a real game the turn would alternate; here we only exercise one
    // attacker, so we drop in a throwaway miss for the defender to keep parity
    // when we need alternating turns. Tests that care about turns build logs
    // explicitly instead.
  }
  return log;
}

describe('start + turn order', () => {
  it('reports no turn before the game starts', () => {
    expect(currentTurn([])).toBeNull();
    expect(hasStarted([])).toBe(false);
  });

  it('gives the first shot to the start.first side', () => {
    const log: GameLog = [{ type: 'start', first: 'guest' }];
    expect(hasStarted(log)).toBe(true);
    expect(currentTurn(log)).toBe('guest');
  });

  it('alternates turns after each shot', () => {
    const log: GameLog = [{ type: 'start', first: 'host' }];
    expect(currentTurn(log)).toBe('host');
    log.push(miss('host', 0, 0));
    expect(currentTurn(log)).toBe('guest');
    log.push(miss('guest', 0, 0));
    expect(currentTurn(log)).toBe('host');
  });
});

describe('resolveShot', () => {
  const fleet = stackFleet(); // carrier on row 0 cols 0-4, etc.

  it('reports a miss on open water', () => {
    const e = resolveShot(fleet, [], { row: 9, col: 9 }, 'host');
    expect(e.hit).toBe(false);
    expect(e.sunk).toBeNull();
    expect(e.allSunk).toBe(false);
  });

  it('reports a hit without sinking a multi-cell ship', () => {
    const e = resolveShot(fleet, [], { row: 0, col: 0 }, 'host');
    expect(e.hit).toBe(true);
    expect(e.sunk).toBeNull();
  });

  it('marks a ship sunk only when its last cell is hit', () => {
    // Destroyer is on row 4, cols 0-1 (size 2) in stackFleet.
    const prior: Coord[] = [{ row: 4, col: 0 }];
    const e = resolveShot(fleet, prior, { row: 4, col: 1 }, 'host');
    expect(e.sunk).toBe('destroyer');
    expect(e.allSunk).toBe(false);
  });

  it('flags allSunk when the final ship cell falls', () => {
    const cells = allCells(fleet);
    const prior = cells.slice(0, -1);
    const last = cells[cells.length - 1];
    const e = resolveShot(fleet, prior, last, 'host');
    expect(e.hit).toBe(true);
    expect(e.allSunk).toBe(true);
  });
});

describe('winner / isGameOver', () => {
  it('has no winner mid-game', () => {
    const log = fireSequence(stackFleet(), 'host', [{ row: 0, col: 0 }]);
    expect(winner(log)).toBeNull();
    expect(isGameOver(log)).toBe(false);
  });

  it('declares the attacker the winner once all ships are sunk', () => {
    const fleet = stackFleet();
    const log = fireSequence(fleet, 'host', allCells(fleet));
    expect(winner(log)).toBe('host');
    expect(isGameOver(log)).toBe(true);
    // Once the game is over there is no current turn.
    expect(currentTurn(log)).toBeNull();
  });
});

describe('radarGrid', () => {
  it('records misses, hits, and sunk silhouettes from the attacker view', () => {
    const fleet = stackFleet();
    const log: GameLog = [
      { type: 'start', first: 'host' },
      resolveShot(fleet, [], { row: 9, col: 9 }, 'host'), // miss
      resolveShot(fleet, [{ row: 9, col: 9 }], { row: 4, col: 0 }, 'host'), // hit destroyer
      resolveShot(fleet, [{ row: 9, col: 9 }, { row: 4, col: 0 }], { row: 4, col: 1 }, 'host'), // sinks it
    ];
    const grid = radarGrid(log, 'host');
    expect(grid[9][9]).toBe('miss');
    // Intentional: only the finishing shot reads 'sunk'. The attacker can't
    // light up the whole silhouette — the log doesn't tell them which earlier
    // hits belonged to that ship. So the first destroyer cell stays 'hit'.
    expect(grid[4][0]).toBe('hit');
    expect(grid[4][1]).toBe('sunk');
    expect(grid[0][0]).toBe('unknown');
  });
});

describe('resolveIncomingFire', () => {
  const myFleet = stackFleet(); // I am the defender ('host'); attacker is 'guest'

  it('resolves a fresh incoming shot against my fleet', () => {
    const log: GameLog = [{ type: 'start', first: 'guest' }];
    const { event, isResend } = resolveIncomingFire(log, myFleet, 'host', { row: 0, col: 0 });
    expect(isResend).toBe(false);
    expect(event.by).toBe('guest'); // authored on behalf of the attacker
    expect(event.hit).toBe(true); // carrier occupies row 0
  });

  it('re-sends the existing settled shot on a duplicate, without re-appending', () => {
    const first = resolveShot(myFleet, [], { row: 0, col: 0 }, 'guest');
    const log: GameLog = [{ type: 'start', first: 'guest' }, first];
    const { event, isResend } = resolveIncomingFire(log, myFleet, 'host', { row: 0, col: 0 });
    expect(isResend).toBe(true);
    expect(event).toBe(first); // same event object, so the caller won't duplicate it
  });
});

describe('ownBoardView', () => {
  it("shows my ships and the enemy's incoming fire", () => {
    const myFleet = stackFleet();
    // Enemy (guest) fires at my carrier twice.
    const log: GameLog = [
      { type: 'start', first: 'guest' },
      resolveShot(myFleet, [], { row: 0, col: 0 }, 'guest'),
      resolveShot(myFleet, [{ row: 0, col: 0 }], { row: 5, col: 5 }, 'guest'), // miss
    ];
    const view = ownBoardView(log, myFleet, 'host');
    expect(view.incoming[0][0]).toBe('hit');
    expect(view.incoming[5][5]).toBe('miss');
    expect(view.sunkShips.size).toBe(0);
  });

  it('marks my whole ship as sunk when its last cell is hit', () => {
    const myFleet = stackFleet();
    const log: GameLog = [
      { type: 'start', first: 'guest' },
      resolveShot(myFleet, [], { row: 4, col: 0 }, 'guest'),
      resolveShot(myFleet, [{ row: 4, col: 0 }], { row: 4, col: 1 }, 'guest'),
    ];
    const view = ownBoardView(log, myFleet, 'host');
    expect(view.sunkShips.has('destroyer')).toBe(true);
    expect(view.incoming[4][0]).toBe('sunk');
    expect(view.incoming[4][1]).toBe('sunk');
  });
});

describe('scoring helpers', () => {
  it('counts surviving cells for the defender', () => {
    const myFleet = stackFleet();
    const log: GameLog = [
      { type: 'start', first: 'guest' },
      resolveShot(myFleet, [], { row: 0, col: 0 }, 'guest'), // 1 hit
    ];
    expect(survivingCells(log, myFleet, 'host')).toBe(TOTAL_SHIP_CELLS - 1);
  });

  it('lists ships sunk by an attacker in order', () => {
    const fleet = stackFleet();
    const log = fireSequence(fleet, 'host', [
      { row: 4, col: 0 },
      { row: 4, col: 1 }, // destroyer down
    ]);
    expect(sunkByAttacker(log, 'host')).toEqual(['destroyer']);
    expect(shotsBy(log, 'host')).toHaveLength(2);
  });
});

// ── helpers ────────────────────────────────────────────────────────────────

function miss(by: 'host' | 'guest', row: number, col: number): ShotEvent {
  return { type: 'shot', by, row, col, hit: false, sunk: null, allSunk: false };
}
