import { skinById } from '../game/constants';
import { COLUMN_LABELS } from '../game/board';
import type { CellState } from '../game/engine';

export interface BoardCell {
  state: 'water' | 'ship' | CellState;
  /** Optional placement preview overlay. */
  preview?: 'ok' | 'bad';
}

interface BoardProps {
  cells: BoardCell[][];
  skinId: string;
  /** Enemy radar boards get a crosshair + glow when it's your turn. */
  variant?: 'own' | 'enemy';
  active?: boolean;
  onCell?: (row: number, col: number) => void;
  onCellEnter?: (row: number, col: number) => void;
  onCellLeave?: () => void;
  disabled?: boolean;
}

/**
 * A reusable 10×10 grid with A–K / 1–10 headers. Purely presentational: the
 * caller maps game state to a grid of `BoardCell`s and handles clicks.
 */
export function Board({
  cells,
  skinId,
  variant = 'own',
  active = false,
  onCell,
  onCellEnter,
  onCellLeave,
  disabled = false,
}: BoardProps) {
  const skin = skinById(skinId);
  const clickable = !!onCell && !disabled;

  return (
    <div
      className={`board ${variant} ${active ? 'active' : ''}`}
      style={{ ['--skin' as string]: skin.color }}
      onMouseLeave={onCellLeave}
    >
      <div className="hdr" aria-hidden="true" />
      {COLUMN_LABELS.map((c) => (
        <div key={`col-${c}`} className="hdr">
          {c}
        </div>
      ))}

      {cells.map((rowCells, r) => (
        <Row
          key={`row-${r}`}
          index={r}
          rowCells={rowCells}
          skinIcon={skin.icon}
          variant={variant}
          clickable={clickable}
          onCell={onCell}
          onCellEnter={onCellEnter}
        />
      ))}
    </div>
  );
}

function Row({
  index,
  rowCells,
  skinIcon,
  variant,
  clickable,
  onCell,
  onCellEnter,
}: {
  index: number;
  rowCells: BoardCell[];
  skinIcon: string;
  variant: 'own' | 'enemy';
  clickable: boolean;
  onCell?: (row: number, col: number) => void;
  onCellEnter?: (row: number, col: number) => void;
}) {
  return (
    <>
      <div className="hdr">{index + 1}</div>
      {rowCells.map((cell, c) => {
        const cls = ['cell'];
        if (cell.state === 'ship') cls.push('ship');
        if (cell.state === 'miss') cls.push('miss');
        if (cell.state === 'hit') cls.push('hit');
        if (cell.state === 'sunk') cls.push('sunk');
        if (cell.preview === 'ok') cls.push('preview');
        if (cell.preview === 'bad') cls.push('preview', 'bad');
        if (clickable) cls.push('clickable');
        if (clickable && variant === 'enemy') cls.push('target');

        const label = `${COLUMN_LABELS[c]}${index + 1}`;
        return (
          <button
            key={`c-${index}-${c}`}
            type="button"
            className={cls.join(' ')}
            aria-label={label}
            data-testid={`cell-${variant}-${index}-${c}`}
            disabled={!clickable}
            onClick={clickable ? () => onCell?.(index, c) : undefined}
            onMouseEnter={onCellEnter ? () => onCellEnter(index, c) : undefined}
          >
            {variant === 'own' && cell.state === 'ship' ? skinIcon : ''}
          </button>
        );
      })}
    </>
  );
}
