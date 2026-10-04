/**
 * The way out of an empty waiting room: play the computer instead.
 *
 * Shown to a host whose fleet is placed and whose invite nobody has taken —
 * in the invite modal, and on the placement screen behind it once the modal
 * is dismissed. One line of levels, number and word, as in the lobby's
 * "Pick a level": the choice is the same, the room for it is not.
 */

import { CAPTAIN_PERSONAS } from '../domain/bots/personas';
import { BotIcon } from '@shared/ui/icons';

export function CaptainChips({ onPick }: { onPick: (personaId: string) => void }) {
  return (
    <div className="captain-chips" data-testid="captain-chips">
      <p className="captain-chips-lead" id="captain-chips-lead">
        <BotIcon size={15} /> Nobody coming? Play the computer instead
      </p>
      <div className="captain-chips-row" role="group" aria-labelledby="captain-chips-lead">
        {CAPTAIN_PERSONAS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="captain-chip"
            onClick={() => onPick(p.id)}
            aria-label={`Level ${p.rung}, ${p.level}`}
            data-testid={`waiting-captain-${p.id}`}
          >
            <strong>{p.rung}</strong> {p.level}
          </button>
        ))}
      </div>
    </div>
  );
}
