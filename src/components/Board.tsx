import type { PointerEvent } from 'react';
import { skinById } from '../game/constants';
import { COLUMN_LABELS } from '../game/board';
import type { CellState } from '../game/engine';
import type { Orientation, ShipId } from '../game/types';
import { ShipTopDown } from './ships';
import { BoardFX, type Burst } from './BoardFX';
import { CloseIcon, RotateIcon } from './icons';

export interface BoardCell {
  state: 'water' | 'ship' | CellState;
  /** Optional placement preview overlay. */
  preview?: 'ok' | 'bad';
  /** Marks the just-resolved cell so it plays its impact animation once. */
  fresh?: boolean;
}

/** A ship drawn as a top-down overlay spanning its cells. */
export interface PlacedShip {
  shipId: ShipId;
  row: number;
  col: number;
  size: number;
  orientation: Orientation;
  /** True while this ship is being dragged; `ok` styles the drop target. */
  dragging?: boolean;
  ok?: boolean;
  /** Fully destroyed — renders as a charred wreck. */
  sunk?: boolean;
  /** Hit but not yet sunk — renders as a grey, burning hull. */
  damaged?: boolean;
}

interface BoardProps {
  cells: BoardCell[][];
  skinId: string;
  /** Enemy radar boards get a crosshair + glow when it's your turn. */
  variant?: 'own' | 'enemy';
  active?: boolean;
  /** A one-shot board shake on a fresh hit ('soft') or sink ('hard'). */
  shake?: 'soft' | 'hard' | null;
  /** When present, overlays a particle canvas; change `fx.id` to burst. */
  fx?: Burst | null;
  /** Top-down ships to draw over the grid (placement board). */
  ships?: PlacedShip[];
  /** Set while any ship is dragging so overlays let pointer hit-tests reach cells. */
  dragging?: boolean;
  /** Only this ship shows its rotate/remove controls (keeps the board uncluttered). */
  selectedShipId?: ShipId;
  onShipPointerDown?: (shipId: ShipId, e: PointerEvent) => void;
  onShipRotate?: (shipId: ShipId) => void;
  onShipRemove?: (shipId: ShipId) => void;
  onCell?: (row: number, col: number) => void;
  onCellEnter?: (row: number, col: number) => void;
  onCellLeave?: () => void;
  disabled?: boolean;
}

/**
 * A reusable 10×10 grid with A–K / 1–10 headers. Cells are real buttons (so
 * clicks, focus, and accessibility come for free); ships are an SVG overlay
 * layer placed with CSS grid spans on top of the grid.
 */
export function Board({
  cells,
  skinId,
  variant = 'own',
  active = false,
  shake = null,
  fx,
  ships,
  dragging = false,
  selectedShipId,
  onShipPointerDown,
  onShipRotate,
  onShipRemove,
  onCell,
  onCellEnter,
  onCellLeave,
  disabled = false,
}: BoardProps) {
  const skin = skinById(skinId);
  const clickable = !!onCell && !disabled;
  const shakeClass = shake ? `shake-${shake}` : '';
  const showControls = !!onShipRotate || !!onShipRemove;
  // On the battle board ships are just a read-out (no drag, no grab cursor).
  const interactive = !!onShipPointerDown;

  return (
    <div
      className={`board ${variant} ${active ? 'active' : ''} ${shakeClass} ${dragging ? 'dragging' : ''}`}
      style={{ ['--skin' as string]: skin.color }}
      onMouseLeave={onCellLeave}
    >
      {/* Every grid item is placed explicitly (line n+2 for 0-indexed cell n;
          line 1 is the label track). Auto-flow is avoided on purpose: the ship
          overlays are explicitly-placed items too, and an auto-flowed cell would
          skip past the cells they occupy, shifting the whole grid out of line. */}
      <div className="hdr" aria-hidden="true" style={{ gridColumn: 1, gridRow: 1 }} />
      {COLUMN_LABELS.map((c, ci) => (
        <div key={`col-${c}`} className="hdr" style={{ gridColumn: ci + 2, gridRow: 1 }}>
          {c}
        </div>
      ))}

      {cells.map((rowCells, r) => (
        <Row
          key={`row-${r}`}
          index={r}
          rowCells={rowCells}
          variant={variant}
          clickable={clickable}
          onCell={onCell}
          onCellEnter={onCellEnter}
        />
      ))}

      {ships?.map((ship) => {
        // Grid line for cell (0-indexed) c is c+2 (line 1 is the label column).
        const span = (start: number, n: number) => `${start + 2} / span ${n}`;
        const style =
          ship.orientation === 'H'
            ? { gridColumn: span(ship.col, ship.size), gridRow: `${ship.row + 2}` }
            : { gridRow: span(ship.row, ship.size), gridColumn: `${ship.col + 2}` };
        const selected = ship.shipId === selectedShipId;
        const cls = [
          'ship-overlay',
          selected && 'selected',
          ship.dragging && 'dragging',
          ship.dragging && !ship.ok && 'bad',
          ship.sunk && 'sunk',
          ship.damaged && !ship.sunk && 'damaged',
          !interactive && 'static',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <div
            key={ship.shipId}
            className={cls}
            style={{ ...style, ['--skin' as string]: skin.color }}
            data-testid={`ship-overlay-${ship.shipId}`}
            onPointerDown={onShipPointerDown ? (e) => onShipPointerDown(ship.shipId, e) : undefined}
          >
            <ShipTopDown shipId={ship.shipId} size={ship.size} orientation={ship.orientation} />
            {showControls && !ship.dragging && (
              // Controls live at the two ends so the middle stays a drag handle.
              // onPointerDown stops the tap from starting a ship drag.
              <>
                <button
                  className={`ship-ctrl start ${ship.orientation === 'H' ? 'h' : 'v'}`}
                  aria-label={`Rotate ${ship.shipId}`}
                  data-testid={`board-rotate-${ship.shipId}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onShipRotate?.(ship.shipId)}
                >
                  <RotateIcon size={12} />
                </button>
                <button
                  className={`ship-ctrl end danger ${ship.orientation === 'H' ? 'h' : 'v'}`}
                  aria-label={`Remove ${ship.shipId}`}
                  data-testid={`board-remove-${ship.shipId}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onShipRemove?.(ship.shipId)}
                >
                  <CloseIcon size={12} />
                </button>
              </>
            )}
          </div>
        );
      })}

      {fx !== undefined && <BoardFX burst={fx} />}
    </div>
  );
}

function Row({
  index,
  rowCells,
  variant,
  clickable,
  onCell,
  onCellEnter,
}: {
  index: number;
  rowCells: BoardCell[];
  variant: 'own' | 'enemy';
  clickable: boolean;
  onCell?: (row: number, col: number) => void;
  onCellEnter?: (row: number, col: number) => void;
}) {
  return (
    <>
      <div className="hdr" style={{ gridColumn: 1, gridRow: index + 2 }}>
        {index + 1}
      </div>
      {rowCells.map((cell, c) => {
        const cls = ['cell'];
        if (cell.state === 'ship') cls.push('ship');
        if (cell.state === 'miss') cls.push('miss');
        if (cell.state === 'hit') cls.push('hit');
        if (cell.state === 'sunk') cls.push('sunk');
        if (cell.preview === 'ok') cls.push('preview');
        if (cell.preview === 'bad') cls.push('preview', 'bad');
        if (cell.fresh) cls.push('fresh');
        if (clickable) cls.push('clickable');
        if (clickable && variant === 'enemy') cls.push('target');

        const label = `${COLUMN_LABELS[c]}${index + 1}`;
        return (
          <button
            key={`c-${index}-${c}`}
            type="button"
            className={cls.join(' ')}
            style={{ gridColumn: c + 2, gridRow: index + 2 }}
            aria-label={label}
            data-testid={`cell-${variant}-${index}-${c}`}
            data-row={index}
            data-col={c}
            disabled={!clickable}
            onClick={clickable ? () => onCell?.(index, c) : undefined}
            onMouseEnter={onCellEnter ? () => onCellEnter(index, c) : undefined}
          />
        );
      })}
    </>
  );
}
