import { describe, expect, it } from 'vitest';
import { seededRng } from '@test/helpers';
import { decideShot } from './gunner';
import { captainById } from './personas';
import { BOARD_SIZE, type GameLog, type ShipId, type Side } from '../types';

const start: GameLog[number] = { type: 'start', first: 'host' };
const shot = (
  by: Side,
  row: number,
  col: number,
  hit: boolean,
  sunk: ShipId | null = null,
): GameLog[number] => ({ type: 'shot', by, row, col, hit, sunk, allSunk: false });

const bobble = captainById('bobble');
const marlin = captainById('marlin');
const wake = captainById('wake');
const grimtide = captainById('grimtide');

describe('decideShot', () => {
  it('never repeats a cell already tried, at any rung', () => {
    const log: GameLog = [start];
    for (let c = 0; c < BOARD_SIZE; c++) {
      (log as GameLog[number][]).push(shot('host', 0, c, false));
      (log as GameLog[number][]).push(shot('host', 1, c, false));
    }
    for (const p of [bobble, marlin, wake, grimtide]) {
      for (let seed = 1; seed <= 20; seed++) {
        const t = decideShot(log, 'host', p, seededRng(seed));
        expect(t.row).toBeGreaterThan(1);
      }
    }
  });

  it('rung 2 follows up a fresh hit on an orthogonal neighbour', () => {
    const log: GameLog = [start, shot('host', 5, 5, true)];
    for (let seed = 1; seed <= 10; seed++) {
      const t = decideShot(log, 'host', marlin, seededRng(seed));
      const dist = Math.abs(t.row - 5) + Math.abs(t.col - 5);
      expect(dist).toBe(1);
    }
  });

  it('rung 2 shoots the line ends once two hits align', () => {
    const log: GameLog = [start, shot('host', 5, 4, true), shot('host', 5, 5, true)];
    for (let seed = 1; seed <= 10; seed++) {
      const t = decideShot(log, 'host', marlin, seededRng(seed));
      expect(t.row).toBe(5);
      expect([3, 6]).toContain(t.col);
    }
  });

  it('rung 3 hunts on the checkerboard', () => {
    const log: GameLog = [start];
    for (let seed = 1; seed <= 10; seed++) {
      const t = decideShot(log, 'host', wake, seededRng(seed));
      expect((t.row + t.col) % 2).toBe(0);
    }
  });

  it('rung 3 falls back to off-parity cells once the checkerboard is spent', () => {
    const log: GameLog[number][] = [start];
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if ((r + c) % 2 === 0) log.push(shot('host', r, c, false));
      }
    }
    const t = decideShot(log as GameLog, 'host', wake, seededRng(1));
    expect((t.row + t.col) % 2).toBe(1);
  });

  it('rung 4 fires at the only cell that can extend a blocked pair', () => {
    // Hits at (5,4)-(5,5); (5,6) is a miss, so any surviving ship covering the
    // pair must extend left through (5,3).
    const log: GameLog = [
      start,
      shot('host', 5, 4, true),
      shot('host', 5, 5, true),
      shot('host', 5, 6, false),
    ];
    for (let seed = 1; seed <= 10; seed++) {
      const t = decideShot(log, 'host', grimtide, seededRng(seed));
      expect(t).toEqual({ row: 5, col: 3 });
    }
  });

  it('a sink clears the target list — the next shot is a hunt again', () => {
    // Destroyer (size 2) found and sunk at (2,2)-(2,3): nothing forces the
    // next shot to hug those cells.
    const log: GameLog = [
      start,
      shot('host', 2, 2, true),
      shot('host', 2, 3, true, 'destroyer'),
    ];
    const t = decideShot(log, 'host', marlin, seededRng(7));
    const nearSunk = Math.abs(t.row - 2) <= 1 && t.col >= 1 && t.col <= 4;
    expect(nearSunk).toBe(false);
  });

  it('is deterministic for the same log and seed', () => {
    const log: GameLog = [start, shot('host', 4, 4, true)];
    expect(decideShot(log, 'host', grimtide, seededRng(3)))
      .toEqual(decideShot(log, 'host', grimtide, seededRng(3)));
  });
});
