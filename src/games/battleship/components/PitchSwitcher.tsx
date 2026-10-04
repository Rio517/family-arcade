import { useState } from 'react';
import { ChevronDownIcon } from '@shared/ui/icons';
import type { FxPackId, LookId } from '../state/pitch';

interface PitchSwitcherProps {
  look: LookId;
  fx: FxPackId;
  onChoose: (change: { look?: LookId; fx?: FxPackId }) => void;
}

const LOOK_LABEL: Record<LookId, string> = { today: 'Today', a: 'A', b: 'B', c: 'C' };
const FX_LABEL: Record<FxPackId, string> = { default: 'Picked', today: 'Today', a: 'A', b: 'B' };

/**
 * The reviewer's switcher, shown only while a pitch is being reviewed (a
 * `look` or `fx` parameter was given in this tab). Flips between the options
 * on the device itself, so nobody has to edit an address on an iPad.
 */
export function PitchSwitcher({ look, fx, onChoose }: PitchSwitcherProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`bs-pitchbar ${open ? 'open' : ''}`} data-testid="pitch-switcher">
      <button
        type="button"
        className="bs-pitchbar-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-testid="pitch-toggle"
      >
        Pitch · look {LOOK_LABEL[look]} · fx {FX_LABEL[fx]}
        <ChevronDownIcon size={14} />
      </button>
      {open && (
        <div className="bs-pitchbar-body">
          <div className="bs-pitchbar-row" role="group" aria-label="Start screens">
            <span className="bs-pitchbar-k">Start screens</span>
            {(Object.keys(LOOK_LABEL) as LookId[]).map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={look === id}
                onClick={() => onChoose({ look: id })}
                data-testid={`pitch-look-${id}`}
              >
                {LOOK_LABEL[id]}
              </button>
            ))}
          </div>
          <div className="bs-pitchbar-row" role="group" aria-label="Effects">
            <span className="bs-pitchbar-k">Effects</span>
            {(Object.keys(FX_LABEL) as FxPackId[]).map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={fx === id}
                onClick={() => onChoose({ fx: id })}
                data-testid={`pitch-fx-${id}`}
              >
                {FX_LABEL[id]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
