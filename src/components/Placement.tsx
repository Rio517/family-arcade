import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { Board, type BoardCell, type PlacedShip } from './Board';
import { FLEET, shipSpec, skinById } from '../game/constants';
import {
  autoPlace,
  canPlace,
  inBounds,
  isFleetComplete,
  occupantAt,
  placeShip,
  removeShip,
  shipCells,
} from '../game/board';
import { BOARD_SIZE, type Fleet, type Orientation, type Placement as P, type ShipId } from '../game/types';
import { BoltIcon, CloseIcon, RotateIcon, ShuffleIcon } from './icons';
import { ShipProfile } from './ships';

interface PlacementProps {
  skinId: string;
  fleet: Fleet;
  onChange: (fleet: Fleet) => void;
  onReady: () => void;
  waiting: boolean;
}

/** Screen 2 of setup: position your ships on your own board. */
export function Placement({ skinId, fleet, onChange, onReady, waiting }: PlacementProps) {
  const firstUnplaced = FLEET.find((s) => !fleet.some((p) => p.shipId === s.id))?.id ?? FLEET[0].id;
  const [selected, setSelected] = useState<ShipId>(firstUnplaced);
  const [orientation, setOrientation] = useState<Orientation>('H');
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null);

  const complete = isFleetComplete(fleet);
  const selectedPlaced = fleet.some((p) => p.shipId === selected);

  const previewPlacement: P | null = useMemo(() => {
    if (!hover || selectedPlaced) return null;
    return { shipId: selected, row: hover.row, col: hover.col, orientation };
  }, [hover, selected, orientation, selectedPlaced]);

  const cells = useMemo(() => buildCells(fleet, previewPlacement), [fleet, previewPlacement]);

  function handleCell(row: number, col: number) {
    const occ = occupantAt(fleet, row, col);
    if (occ) {
      // Pick the ship back up to reposition it.
      onChange(removeShip(fleet, occ));
      setSelected(occ);
      return;
    }
    if (selectedPlaced) return; // selected ship already on the board elsewhere
    const placement: P = { shipId: selected, row, col, orientation };
    if (!canPlace(fleet, placement)) return;
    const next = placeShip(fleet, placement);
    onChange(next);
    const nextShip = FLEET.find((s) => !next.some((p) => p.shipId === s.id));
    if (nextShip) setSelected(nextShip.id);
  }

  // One-tap express lane: randomly place the whole fleet (guaranteed no
  // overlaps) and immediately declare ready.
  function fastStart() {
    onChange(autoPlace());
    onReady();
  }

  // Remove a placed ship back to its un-placed state and re-select it.
  function unplace(shipId: ShipId) {
    onChange(removeShip(fleet, shipId));
    setSelected(shipId);
  }

  // Rotate a placed ship about its bow, if the rotated footprint still fits.
  function rotatePlaced(shipId: ShipId) {
    const p = fleet.find((x) => x.shipId === shipId);
    if (!p) return;
    const rotated: P = { ...p, orientation: p.orientation === 'H' ? 'V' : 'H' };
    if (canPlace(fleet, rotated)) onChange(placeShip(fleet, rotated));
  }

  // ── Drag a placed ship to a new location ────────────────────────────────
  // Uses pointer events + elementFromPoint hit-testing so it works with a
  // finger on an iPad, not just a mouse. The ship snaps cell-to-cell; the drop
  // only commits if the target is legal.
  interface DragInfo {
    shipId: ShipId;
    size: number;
    orientation: Orientation;
    grabSeg: number;
    anchor: { row: number; col: number };
    ok: boolean;
  }
  const [drag, setDrag] = useState<DragInfo | null>(null);
  const dragRef = useRef<DragInfo | null>(null);

  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));

  function beginDrag(shipId: ShipId, e: PointerEvent) {
    const p = fleet.find((x) => x.shipId === shipId);
    if (!p) return;
    setSelected(shipId);
    const size = shipSpec(shipId).size;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const frac = p.orientation === 'H' ? (e.clientX - rect.left) / rect.width : (e.clientY - rect.top) / rect.height;
    const grabSeg = clamp(Math.floor(frac * size), size - 1);
    const info: DragInfo = { shipId, size, orientation: p.orientation, grabSeg, anchor: { row: p.row, col: p.col }, ok: true };
    dragRef.current = info;
    setDrag(info);

    const move = (ev: globalThis.PointerEvent) => {
      const cur = dragRef.current;
      if (!cur) return;
      const cell = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('[data-row]');
      if (!cell) return;
      const hr = Number(cell.getAttribute('data-row'));
      const hc = Number(cell.getAttribute('data-col'));
      const horiz = cur.orientation === 'H';
      const row = clamp(horiz ? hr : hr - cur.grabSeg, BOARD_SIZE - (horiz ? 1 : cur.size));
      const col = clamp(horiz ? hc - cur.grabSeg : hc, BOARD_SIZE - (horiz ? cur.size : 1));
      const ok = canPlace(fleet, { shipId: cur.shipId, row, col, orientation: cur.orientation });
      const next = { ...cur, anchor: { row, col }, ok };
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
      if (cur && cur.ok) {
        onChange(placeShip(fleet, { shipId: cur.shipId, row: cur.anchor.row, col: cur.anchor.col, orientation: cur.orientation }));
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  // Ships drawn on the board — the dragged one follows the pointer as a preview.
  const boardShips: PlacedShip[] = fleet.map((p) => {
    const size = shipSpec(p.shipId).size;
    if (drag && drag.shipId === p.shipId) {
      return { shipId: p.shipId, row: drag.anchor.row, col: drag.anchor.col, size, orientation: drag.orientation, dragging: true, ok: drag.ok };
    }
    return { shipId: p.shipId, row: p.row, col: p.col, size, orientation: p.orientation };
  });

  const skinColor = skinById(skinId).color;

  return (
    <div className="stack">
      <div className="placement-layout">
        <div className="panel">
        <div className="board-title">
          <span className="name">Position your fleet</span>
          <span className="hint">{complete ? 'Drag to adjust, or ready up' : 'Tap a cell to place'}</span>
        </div>
        <Board
          cells={cells}
          skinId={skinId}
          variant="own"
          ships={boardShips}
          dragging={drag !== null}
          selectedShipId={selected}
          onShipPointerDown={beginDrag}
          onShipRotate={rotatePlaced}
          onShipRemove={unplace}
          onCell={handleCell}
          onCellEnter={(r, c) => setHover({ row: r, col: c })}
          onCellLeave={() => setHover(null)}
        />
      </div>

      <div className="panel">
        <h2>Your ships</h2>
        <div className="ship-list">
          {FLEET.map((spec) => {
            const placed = fleet.some((p) => p.shipId === spec.id);
            return (
              <div
                key={spec.id}
                className="ship-chip"
                data-selected={selected === spec.id}
                data-placed={placed}
                onClick={() => setSelected(spec.id)}
                data-testid={`ship-chip-${spec.id}`}
              >
                <span className="ship-art" style={{ color: skinColor }}>
                  <ShipProfile shipId={spec.id} height={20} />
                </span>
                <span className="nm">{spec.name}</span>
                <span className="chip-actions">
                  {placed ? (
                    <>
                      <button
                        className="chip-btn"
                        aria-label={`Rotate ${spec.name}`}
                        data-testid={`rotate-${spec.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          rotatePlaced(spec.id);
                        }}
                      >
                        <RotateIcon size={15} />
                      </button>
                      <button
                        className="chip-btn danger"
                        aria-label={`Remove ${spec.name}`}
                        data-testid={`unplace-${spec.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          unplace(spec.id);
                        }}
                      >
                        <CloseIcon size={15} />
                      </button>
                    </>
                  ) : (
                    <span className="status todo">place</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>

        <div className="row-actions" style={{ marginTop: 12 }}>
          <button
            className="btn"
            onClick={() => setOrientation((o) => (o === 'H' ? 'V' : 'H'))}
            data-testid="rotate"
          >
            <RotateIcon size={16} /> Rotate ({orientation === 'H' ? 'Horizontal' : 'Vertical'})
          </button>
          <button className="btn" onClick={() => onChange(autoPlace())} data-testid="auto-place">
            <ShuffleIcon size={16} /> Auto-place
          </button>
        </div>
        <div className="row-actions" style={{ marginTop: 10 }}>
          <button className="btn btn-danger" onClick={() => onChange([])} data-testid="clear-fleet">
            Clear
          </button>
          <button
            className="btn btn-primary"
            disabled={!complete || waiting}
            onClick={onReady}
            data-testid="ready"
          >
            {waiting ? 'Ready' : 'Ready to battle'}
          </button>
        </div>
        {waiting && <p className="subtle center" style={{ marginTop: 10 }}>Waiting for your opponent to finish placing…</p>}
        <p className="subtle" style={{ marginTop: 10 }}>
          Selected: <strong>{shipSpec(selected).name}</strong>
          {selectedPlaced ? ' (already placed — tap it on the board to move it)' : ''}
        </p>

        {!waiting && (
          <>
            <div className="or-divider"><span>or</span></div>
            <button className="btn btn-block fast-start" onClick={fastStart} data-testid="fast-start">
              <BoltIcon size={16} /> Fast Start — auto-place everything &amp; ready up
            </button>
          </>
        )}
        </div>
      </div>
    </div>
  );
}

// Placed ships are drawn as SVG overlays (see boardShips), so the grid cells
// themselves stay water — only the live placement preview tints cells.
function buildCells(fleet: Fleet, preview: P | null): BoardCell[][] {
  const grid: BoardCell[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => ({ state: 'water' as const })),
  );
  if (preview) {
    const ok = canPlace(fleet, preview);
    for (const c of shipCells(preview)) {
      if (inBounds(c.row, c.col)) {
        grid[c.row][c.col] = { state: 'water', preview: ok ? 'ok' : 'bad' };
      }
    }
  }
  return grid;
}
