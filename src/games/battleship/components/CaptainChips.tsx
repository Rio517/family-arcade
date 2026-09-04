/**
 * The way out of an empty waiting room: a computer captain instead.
 *
 * Shown to a host whose fleet is placed and whose invite nobody has taken —
 * in the invite modal, and on the placement screen behind it once the modal
 * is dismissed. One line of captains, level and name, rather than the lobby's
 * full ladder: the choice is the same, the room for it is not.
 */

import { CAPTAIN_PERSONAS } from '../domain/bots/personas';
import { BotIcon } from '@shared/ui/icons';

export function CaptainChips({ onPick }: { onPick: (personaId: string) => void }) {
  return (
    <div className="captain-chips" data-testid="captain-chips">
      <p className="captain-chips-lead">
        <BotIcon size={15} /> Nobody coming? Battle a captain instead
      </p>
      <div className="captain-chips-row" role="group" aria-label="Computer captains">
        {CAPTAIN_PERSONAS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="captain-chip"
            onClick={() => onPick(p.id)}
            data-testid={`waiting-captain-${p.id}`}
          >
            <strong>Lv {p.rung}</strong> {p.name.split(' ').pop()}
          </button>
        ))}
      </div>
    </div>
  );
}
