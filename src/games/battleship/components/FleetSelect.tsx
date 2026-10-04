import type { LookId } from '@games/battleship/state/pitch';
import type { FleetEra } from '@games/battleship/domain/types';
import { LookSteps } from './look/LookParts';
import { arcadeLook } from './look/arcadeLook';
import { NavyLineup } from './look/NavyLineup';

interface FleetSelectProps {
  /** Which navy this captain sails in 3D. */
  era: FleetEra;
  onEra: (era: FleetEra) => void;
  onContinue: () => void;
  /** The darker-arcade pitch's start-screen look under review; 'today' is the shipped one. */
  look?: LookId;
}

/** The two navies, spelled out so every captain knows what they're picking. */
const ERAS: { id: FleetEra; name: string; sub: string; ships: string }[] = [
  {
    id: 'classic',
    name: 'Classic',
    sub: 'The great warships of 1942',
    ships: 'Shōkaku · Iowa · Cleveland · U-boat · Fletcher',
  },
  {
    id: 'modern',
    name: 'Modern',
    sub: 'Today’s navy',
    ships: 'Ford · Kirov · Type 055 · Virginia · Hobart',
  },
];

/** Screen 1 of setup: choose which navy you sail, then deploy. */
export function FleetSelect({ era, onEra, onContinue, look }: FleetSelectProps) {
  const arcade = arcadeLook(look);

  return (
    <div className="stack fleet-setup">
      {arcade && <LookSteps at="fleet" />}
      <div className="panel">
        <div className="fleet-sect">
          <h2>Choose your navy</h2>
          <p className="subtle era-note">
            Which ships sail for you in the 3D view. Every captain picks their own —
            classic and modern fleets can battle each other.
          </p>
          <div className="eras" role="group" aria-label="Fleet era">
            {ERAS.map((e) => (
              <button
                key={e.id}
                type="button"
                className="era-card"
                data-selected={era === e.id}
                aria-pressed={era === e.id}
                onClick={() => onEra(e.id)}
                data-testid={`era-${e.id}`}
              >
                {arcade && <NavyLineup era={e.id} />}
                <div className="era-name">{e.name}</div>
                <div className="era-sub">{e.sub}</div>
                <div className="era-ships">{e.ships}</div>
              </button>
            ))}
          </div>
        </div>

        <button className="btn btn-primary btn-lg btn-block" onClick={onContinue} data-testid="fleet-continue">
          Deploy the fleet →
        </button>
      </div>
    </div>
  );
}
