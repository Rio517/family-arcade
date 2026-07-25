import { useRef, useState, type PointerEvent } from 'react';
import { canPlace, placeShip } from '../game/board';
import { shipSpec } from '../game/constants';
import { BOARD_SIZE, type Fleet, type Orientation, type ShipId } from '../game/types';

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
}

const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));

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
      const cell = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest(
        '[data-row]',
      );
      if (!cell) {
        // Off the board: hide the preview but keep the drag alive.
        if (cur.onBoard) {
          const next = { ...cur, onBoard: false, ok: false };
          dragRef.current = next;
          setDrag(next);
        }
        return;
      }
      const hoverRow = Number(cell.getAttribute('data-row'));
      const hoverCol = Number(cell.getAttribute('data-col'));
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
      const next = { ...cur, anchor: { row, col }, ok, onBoard: true };
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
    run({ shipId, size, orientation: p.orientation, grabSeg, anchor: { row: p.row, col: p.col }, ok: true, onBoard: true, isNew: false });
  }

  /** Drag an un-placed ship in from the sidebar; it follows the pointer bow-first. */
  function beginPlace(shipId: ShipId, e: PointerEvent, orientation: Orientation) {
    void e;
    const size = shipSpec(shipId).size;
    run({ shipId, size, orientation, grabSeg: 0, anchor: { row: 0, col: 0 }, ok: false, onBoard: false, isNew: true });
  }

  return { drag, beginDrag, beginPlace };
}
