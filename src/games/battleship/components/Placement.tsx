import { useMemo, useState, type PointerEvent } from 'react';
import { Board, type BoardCell, type PlacedShip } from './Board';
import { CaptainChips } from './CaptainChips';
import { FLEET, shipSpec, skinById } from '@games/battleship/domain/constants';
import {
  autoPlace,
  canPlace,
  inBounds,
  isFleetComplete,
  occupantAt,
  placeShip,
  removeShip,
  shipCells,
} from '@games/battleship/domain/board';
import { BOARD_SIZE, type Fleet, type Orientation, type Placement as ShipPlacement, type ShipId } from '@games/battleship/domain/types';
import { useShipDrag } from '@games/battleship/state/useShipDrag';
import { BoltIcon, CloseIcon, RotateIcon, ShuffleIcon } from '@shared/ui/icons';
import { ShipProfile, ShipTopDown } from './ships';

interface PlacementProps {
  skinId: string;
  fleet: Fleet;
  onChange: (fleet: Fleet) => void;
  onReady: () => void;
  waiting: boolean;
  /** Set while the host waits on an empty table: a computer captain instead. */
  onPlayComputer?: (personaId: string) => void;
}

/** Screen 2 of setup: position your ships on your own board. */
export function Placement({ skinId, fleet, onChange, onReady, waiting, onPlayComputer }: PlacementProps) {
  const firstUnplaced = FLEET.find((s) => !fleet.some((p) => p.shipId === s.id))?.id ?? FLEET[0].id;
  const [selected, setSelected] = useState<ShipId>(firstUnplaced);
  const [orientation, setOrientation] = useState<Orientation>('H');
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null);

  const complete = isFleetComplete(fleet);
  const selectedPlaced = fleet.some((p) => p.shipId === selected);

  const previewPlacement: ShipPlacement | null = useMemo(() => {
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
    const placement: ShipPlacement = { shipId: selected, row, col, orientation };
    if (!canPlace(fleet, placement)) return;
    const next = placeShip(fleet, placement);
    onChange(next);
    // Drop the hover so the next auto-selected ship doesn't immediately paint a
    // stale (usually red) preview under the ship we just placed.
    setHover(null);
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

  // Rotate a placed ship in place. Rotating about the bow can push the far end
  // off the board (e.g. a horizontal ship along the bottom edge rotating to
  // vertical) — so we first pull the anchor back inward just enough that the
  // rotated footprint fits, then confirm nothing else is in the way.
  function rotatePlaced(shipId: ShipId) {
    const p = fleet.find((x) => x.shipId === shipId);
    if (!p) return;
    const orientation: Orientation = p.orientation === 'H' ? 'V' : 'H';
    const size = shipSpec(shipId).size;
    const row = orientation === 'V' ? Math.min(p.row, BOARD_SIZE - size) : p.row;
    const col = orientation === 'H' ? Math.min(p.col, BOARD_SIZE - size) : p.col;
    const rotated: ShipPlacement = { shipId, row, col, orientation };
    if (canPlace(fleet, rotated)) onChange(placeShip(fleet, rotated));
  }

  // Drag placed ships around, and drag un-placed ships in from the sidebar.
  const { drag, beginDrag, beginPlace } = useShipDrag(fleet, onChange);
  // Grabbing a placed ship also selects it, so its on-board controls show.
  const grabShip = (shipId: ShipId, e: PointerEvent) => {
    setSelected(shipId);
    beginDrag(shipId, e);
  };
  const grabNewShip = (shipId: ShipId, e: PointerEvent) => {
    setSelected(shipId);
    beginPlace(shipId, e, orientation);
  };

  // Ships drawn on the board — the dragged one follows the pointer as a preview.
  const boardShips: PlacedShip[] = fleet.map((p) => {
    const size = shipSpec(p.shipId).size;
    if (drag && !drag.isNew && drag.shipId === p.shipId) {
      return { shipId: p.shipId, row: drag.anchor.row, col: drag.anchor.col, size, orientation: drag.orientation, dragging: true, ok: drag.ok };
    }
    return { shipId: p.shipId, row: p.row, col: p.col, size, orientation: p.orientation };
  });
  // A fresh ship being dragged in from the sidebar previews only while over the board.
  if (drag && drag.isNew && drag.onBoard) {
    boardShips.push({ shipId: drag.shipId, row: drag.anchor.row, col: drag.anchor.col, size: drag.size, orientation: drag.orientation, dragging: true, ok: drag.ok });
  }

  const skinColor = skinById(skinId).color;

  return (
    <div className="stack">
      {/* A "carried" ship that follows the cursor from the sidebar until it
          reaches the board, where the in-grid preview takes over. */}
      {drag?.isNew && !drag.onBoard && (
        <div
          className="drag-ghost"
          aria-hidden="true"
          style={{
            left: drag.pointer.x,
            top: drag.pointer.y,
            width: (drag.orientation === 'H' ? drag.size : 1) * drag.cellPx,
            height: (drag.orientation === 'H' ? 1 : drag.size) * drag.cellPx,
            color: skinColor,
          }}
        >
          <ShipTopDown shipId={drag.shipId} size={drag.size} orientation={drag.orientation} />
        </div>
      )}

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
          onShipPointerDown={grabShip}
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
                // A chip picks a ship, so it behaves as a button — but it also
                // starts a pointer-drag onto the grid, which a real <button>
                // fights with. Keep the div and give it the button semantics.
                role="button"
                tabIndex={0}
                aria-pressed={selected === spec.id}
                data-selected={selected === spec.id}
                data-placed={placed}
                onClick={() => setSelected(spec.id)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault(); // Space would scroll the placement panel.
                  setSelected(spec.id);
                }}
                onPointerDown={placed ? undefined : (e) => grabNewShip(spec.id, e)}
                style={placed ? undefined : { touchAction: 'none' }}
                data-testid={`ship-chip-${spec.id}`}
              >
                <span
                  className="ship-art"
                  // Placed ships go dark with a soft grey halo to read as "done".
                  style={
                    placed
                      ? { color: '#04070d', filter: 'drop-shadow(0 0 4px rgba(148, 163, 184, 0.85))' }
                      : { color: skinColor }
                  }
                >
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
                    <span className="status todo">tap / drag</span>
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
        {waiting && (
          <p className="subtle center" style={{ marginTop: 10 }}>
            {onPlayComputer ? 'Waiting for your opponent to join…' : 'Waiting for your opponent to finish placing…'}
          </p>
        )}
        {waiting && onPlayComputer && <CaptainChips onPick={onPlayComputer} />}
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
function buildCells(fleet: Fleet, preview: ShipPlacement | null): BoardCell[][] {
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
