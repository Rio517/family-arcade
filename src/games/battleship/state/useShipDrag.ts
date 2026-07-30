import { useRef, useState, type PointerEvent } from 'react';
import { canPlace, placeShip } from '@games/battleship/domain/board';
import { shipSpec } from '@games/battleship/domain/constants';
import { BOARD_SIZE, type Fleet, type Orientation, type ShipId } from '@games/battleship/domain/types';

/** Live state of an in-progress ship drag. */
export interface ShipDrag {
  shipId: ShipId;
  size: number;
  orientation: Orientation;
  /** Which hull segment (0..size-1) the pointer grabbed. */
  grabSeg: number;
  /** Top/left-most cell the ship would occupy right now. */
  anchor: { row: number; col: number };
  /** Whether the current anchor is a legal drop. */
  ok: boolean;
  /** Whether the pointer is currently over a board cell. */
  onBoard: boolean;
  /** Dragging an un-placed ship in from the sidebar (vs. moving a placed one). */
  isNew: boolean;
  /** Latest viewport pointer position — drives the off-board "carried" ghost. */
  pointer: { x: number; y: number };
  /** A board cell's pixel size, so the ghost is drawn to scale. */
  cellPx: number;
}

const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));

/** Measure a board cell so an off-board drag ghost can match the grid scale. */
function measureCell(): number {
  const cell = document.querySelector('.board [data-row]');
  return cell ? (cell as HTMLElement).getBoundingClientRect().width : 40;
}

/** The on-screen geometry of the 10×10 cell area, from its corner cells. */
interface GridGeom {
  left: number;
  top: number;
  right: number;
  bottom: number;
  pitchX: number;
  pitchY: number;
}

/**
 * Measure the placement grid (the placement screen has exactly one board, so
 * the corner cells identify it). Measured fresh on every move so it stays
 * correct through scrolls and resizes mid-drag.
 */
function measureGrid(): GridGeom | null {
  const first = document.querySelector('[data-row="0"][data-col="0"]');
  const last = document.querySelector(`[data-row="${BOARD_SIZE - 1}"][data-col="${BOARD_SIZE - 1}"]`);
  if (!first || !last) return null;
  const f = first.getBoundingClientRect();
  const l = last.getBoundingClientRect();
  if (f.width <= 0 || f.height <= 0) return null;
  return {
    left: f.left,
    top: f.top,
    right: l.right,
    bottom: l.bottom,
    pitchX: (l.left - f.left) / (BOARD_SIZE - 1) || f.width,
    pitchY: (l.top - f.top) / (BOARD_SIZE - 1) || f.height,
  };
}

/**
 * Pointer-driven ship dragging, for both moving a placed ship and dragging a
 * fresh ship in from the sidebar. Attaches window pointer listeners and
 * hit-tests with `elementFromPoint` (the board's cells carry `data-row` /
 * `data-col`), so it works with a finger on an iPad, not just a mouse. It only
 * commits (via `onChange`) on a legal drop over the board; the caller renders
 * the live preview from `drag`.
 */
export function useShipDrag(fleet: Fleet, onChange: (fleet: Fleet) => void) {
  const [drag, setDrag] = useState<ShipDrag | null>(null);
  // A ref shadows the state so the window listeners always see the latest drag
  // without re-binding on every pointermove.
  const dragRef = useRef<ShipDrag | null>(null);

  function run(info: ShipDrag) {
    dragRef.current = info;
    setDrag(info);

    const move = (ev: globalThis.PointerEvent) => {
      const cur = dragRef.current;
      if (!cur) return;
      const pointer = { x: ev.clientX, y: ev.clientY };
      // Hit-test against the cell area's GEOMETRY, not per-cell elements. The
      // old elementFromPoint test fell into the 2px gaps between cells, so
      // every time the pointer crossed a grid line the drag briefly counted
      // as off-board and the preview flashed red. Pure math over the grid's
      // rect has no gaps, and a little grace margin keeps the edge friendly.
      const g = measureGrid();
      const grace = g ? Math.max(g.pitchX, g.pitchY) * 0.45 : 0;
      const over =
        g !== null &&
        ev.clientX >= g.left - grace && ev.clientX <= g.right + grace &&
        ev.clientY >= g.top - grace && ev.clientY <= g.bottom + grace;
      if (!g || !over) {
        // Off the board: the in-grid preview hides, but the drag stays alive and
        // the pointer keeps updating so the carried ghost follows the cursor.
        const next = { ...cur, pointer, onBoard: false, ok: false };
        dragRef.current = next;
        setDrag(next);
        return;
      }
      const hoverRow = clamp(Math.floor((ev.clientY - g.top) / g.pitchY), BOARD_SIZE - 1);
      const hoverCol = clamp(Math.floor((ev.clientX - g.left) / g.pitchX), BOARD_SIZE - 1);
      const horiz = cur.orientation === 'H';
      // Back the anchor off by grabSeg *along* the ship's axis so the grabbed
      // segment lands on the hovered cell, then clamp so the whole hull stays
      // on-board: (size-1) cells of headroom along the axis, none across it.
      const row = clamp(horiz ? hoverRow : hoverRow - cur.grabSeg, BOARD_SIZE - (horiz ? 1 : cur.size));
      const col = clamp(horiz ? hoverCol - cur.grabSeg : hoverCol, BOARD_SIZE - (horiz ? cur.size : 1));
      // For a reposition, the ship is still in `fleet` at its old cells, but
      // canPlace lets a ship overlap its own previous footprint (see board.ts),
      // so a one-cell nudge stays legal.
      const ok = canPlace(fleet, { shipId: cur.shipId, row, col, orientation: cur.orientation });
      const next = { ...cur, pointer, anchor: { row, col }, ok, onBoard: true };
      dragRef.current = next;
      setDrag(next);
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      const cur = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (cur && cur.onBoard && cur.ok) {
        onChange(
          placeShip(fleet, {
            shipId: cur.shipId,
            row: cur.anchor.row,
            col: cur.anchor.col,
            orientation: cur.orientation,
          }),
        );
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  /** Reposition an already-placed ship, grabbed on the board. */
  function beginDrag(shipId: ShipId, e: PointerEvent) {
    const p = fleet.find((x) => x.shipId === shipId);
    if (!p) return;
    const size = shipSpec(shipId).size;
    // Which segment along the hull did the pointer grab? Keep it under the
    // finger as the ship follows. `frac` is 0 at the bow end, 1 at the stern.
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const frac =
      p.orientation === 'H' ? (e.clientX - rect.left) / rect.width : (e.clientY - rect.top) / rect.height;
    const grabSeg = clamp(Math.floor(frac * size), size - 1);
    run({ shipId, size, orientation: p.orientation, grabSeg, anchor: { row: p.row, col: p.col }, ok: true, onBoard: true, isNew: false, pointer: { x: e.clientX, y: e.clientY }, cellPx: measureCell() });
  }

  /** Drag an un-placed ship in from the sidebar; it follows the pointer bow-first. */
  function beginPlace(shipId: ShipId, e: PointerEvent, orientation: Orientation) {
    const size = shipSpec(shipId).size;
    run({ shipId, size, orientation, grabSeg: 0, anchor: { row: 0, col: 0 }, ok: false, onBoard: false, isNew: true, pointer: { x: e.clientX, y: e.clientY }, cellPx: measureCell() });
  }

  return { drag, beginDrag, beginPlace };
}
