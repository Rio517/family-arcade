import { useMemo, useState } from 'react';
import { Board, type BoardCell } from './Board';
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

  return (
    <div className="stack">
      {!waiting && (
        <button
          className="btn btn-primary btn-lg btn-block fast-start"
          onClick={fastStart}
          data-testid="fast-start"
        >
          ⚡ Fast Start — random ships, ready to battle
        </button>
      )}

      <div className="placement-layout">
        <div className="panel">
        <div className="board-title">
          <span className="name">Position your fleet</span>
          <span className="hint">{complete ? 'All ships placed' : 'Tap a cell to place'}</span>
        </div>
        <Board
          cells={cells}
          skinId={skinId}
          variant="own"
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
                <span className="nm">{spec.name}</span>
                <span className="pips">
                  {Array.from({ length: spec.size }).map((_, i) => (
                    <span
                      key={i}
                      className="pip"
                      style={{ ['--skin' as string]: skinById(skinId).color }}
                    />
                  ))}
                </span>
                <span className={`status ${placed ? '' : 'todo'}`}>{placed ? '✓' : 'place'}</span>
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
            ⟳ Rotate ({orientation === 'H' ? 'Horizontal' : 'Vertical'})
          </button>
          <button className="btn" onClick={() => onChange(autoPlace())} data-testid="auto-place">
            🎲 Auto-place
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
            {waiting ? 'Ready ✓' : 'Ready to battle'}
          </button>
        </div>
        {waiting && <p className="subtle center" style={{ marginTop: 10 }}>Waiting for your opponent to finish placing…</p>}
        <p className="subtle" style={{ marginTop: 10 }}>
          Selected: <strong>{shipSpec(selected).name}</strong>
          {selectedPlaced ? ' (already placed — tap it on the board to move it)' : ''}
        </p>
        </div>
      </div>
    </div>
  );
}

function buildCells(fleet: Fleet, preview: P | null): BoardCell[][] {
  const grid: BoardCell[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => ({ state: 'water' as const })),
  );
  for (const p of fleet) {
    for (const c of shipCells(p)) grid[c.row][c.col] = { state: 'ship' };
  }
  if (preview) {
    const ok = canPlace(fleet, preview);
    for (const c of shipCells(preview)) {
      if (inBounds(c.row, c.col)) {
        grid[c.row][c.col] = { state: grid[c.row][c.col].state, preview: ok ? 'ok' : 'bad' };
      }
    }
  }
  return grid;
}
