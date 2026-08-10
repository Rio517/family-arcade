/**
 * The captain's gunner: choose the next shot from nothing but the game log —
 * the same information a human in that seat sees (ADR 0009). Pure and seeded;
 * the rung picks the algorithm:
 *
 *   1  random fire
 *   2  hunt/target — follow up hits, shoot the ends of a found line
 *   3  + checkerboard hunting (no ship is shorter than 2)
 *   4  + probability density — count every placement of every surviving ship
 *
 * Statelessness matters: the engine marks only a ship's FINISHING cell as
 * sunk, so "which hits still need chasing" is recovered by replaying my shots
 * and clearing the chase list at every sink.
 */
import { radarGrid, shotsBy, type CellState } from '../engine';
import { FLEET } from '../constants';
import { BOARD_SIZE, type Coord, type GameLog, type Side } from '../types';
import type { CaptainPersona } from './personas';

interface View {
  grid: CellState[][];
  candidates: Coord[];
  activeHits: Coord[];
  survivingSizes: number[];
}

function viewOf(log: GameLog, mySide: Side): View {
  const grid = radarGrid(log, mySide);
  const candidates: Coord[] = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (grid[row][col] === 'unknown') candidates.push({ row, col });
    }
  }
  const sunkSizes: number[] = [];
  let activeHits: Coord[] = [];
  for (const ev of shotsBy(log, mySide)) {
    if (ev.hit) activeHits.push({ row: ev.row, col: ev.col });
    if (ev.sunk) {
      sunkSizes.push(FLEET.find((s) => s.id === ev.sunk)?.size ?? 0);
      activeHits = [];
    }
  }
  const survivingSizes = FLEET.map((s) => s.size);
  for (const size of sunkSizes) {
    const at = survivingSizes.indexOf(size);
    if (at !== -1) survivingSizes.splice(at, 1);
  }
  return { grid, candidates, activeHits, survivingSizes };
}

const pick = <T>(list: T[], rng: () => number): T => list[Math.floor(rng() * list.length)];

/** Untried orthogonal neighbours of the active hits; line ends when aligned. */
function targetCandidates(view: View): Coord[] {
  const hits = view.activeHits;
  if (hits.length === 0) return [];
  const untried = (row: number, col: number) =>
    row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE && view.grid[row][col] === 'unknown';

  if (hits.length >= 2) {
    const sameRow = hits.every((h) => h.row === hits[0].row);
    const sameCol = hits.every((h) => h.col === hits[0].col);
    if (sameRow) {
      const row = hits[0].row;
      const cols = hits.map((h) => h.col);
      const ends = [
        { row, col: Math.min(...cols) - 1 },
        { row, col: Math.max(...cols) + 1 },
      ].filter((c) => untried(c.row, c.col));
      if (ends.length > 0) return ends;
    } else if (sameCol) {
      const col = hits[0].col;
      const rows = hits.map((h) => h.row);
      const ends = [
        { row: Math.min(...rows) - 1, col },
        { row: Math.max(...rows) + 1, col },
      ].filter((c) => untried(c.row, c.col));
      if (ends.length > 0) return ends;
    }
  }
  const out: Coord[] = [];
  for (const h of hits) {
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const row = h.row + dr;
      const col = h.col + dc;
      if (untried(row, col) && !out.some((c) => c.row === row && c.col === col)) out.push({ row, col });
    }
  }
  return out;
}

/** Vote for every candidate by counting surviving-ship placements over it. */
function densityShot(view: View, rng: () => number): Coord | null {
  const chasing = view.activeHits.length > 0;
  const votes = new Map<string, number>();
  const key = (row: number, col: number) => `${row},${col}`;
  const placeable = (state: CellState) => state === 'unknown' || state === 'hit';

  for (const size of view.survivingSizes) {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        for (const [dr, dc] of [[0, 1], [1, 0]] as const) {
          const endRow = row + dr * (size - 1);
          const endCol = col + dc * (size - 1);
          if (endRow >= BOARD_SIZE || endCol >= BOARD_SIZE) continue;
          let ok = true;
          let covered = 0;
          for (let i = 0; i < size; i++) {
            const r = row + dr * i;
            const c = col + dc * i;
            if (!placeable(view.grid[r][c])) {
              ok = false;
              break;
            }
            if (view.activeHits.some((h) => h.row === r && h.col === c)) covered++;
          }
          if (!ok) continue;
          if (chasing && covered === 0) continue;
          const weight = chasing ? Math.pow(8, covered) : 1;
          for (let i = 0; i < size; i++) {
            const r = row + dr * i;
            const c = col + dc * i;
            if (view.grid[r][c] !== 'unknown') continue;
            votes.set(key(r, c), (votes.get(key(r, c)) ?? 0) + weight);
          }
        }
      }
    }
  }
  let best = -1;
  let ties: Coord[] = [];
  for (const cell of view.candidates) {
    const v = votes.get(key(cell.row, cell.col)) ?? 0;
    if (v > best) {
      best = v;
      ties = [cell];
    } else if (v === best) {
      ties.push(cell);
    }
  }
  if (best <= 0 || ties.length === 0) return null;
  return pick(ties, rng);
}

export function decideShot(log: GameLog, mySide: Side, persona: CaptainPersona, rng: () => number): Coord {
  const view = viewOf(log, mySide);
  if (view.candidates.length === 0) return { row: 0, col: 0 }; // game is over

  if (persona.rung >= 2) {
    const targets = targetCandidates(view);
    if (targets.length > 0 && persona.rung < 4) return pick(targets, rng);
  }
  if (persona.rung === 4) {
    const dense = densityShot(view, rng);
    if (dense) return dense;
  }
  if (persona.rung === 3) {
    const parity = view.candidates.filter((c) => (c.row + c.col) % 2 === 0);
    if (parity.length > 0) return pick(parity, rng);
  }
  return pick(view.candidates, rng);
}
