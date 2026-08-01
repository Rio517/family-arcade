import { FAMILY_NAMES } from '@shared/profile/profile';
import { nameSuggestions } from '@shared/profile/recentNames';

/**
 * One-tap name chips, shown beside any "your name" field. Offers the five most
 * recently-used names (so a returning guest like Kai is one tap away) blended
 * with the household regulars; the text input next to it still handles brand-new
 * names. The chip matching the current value lights up so it doubles as a
 * "who am I right now" readout.
 */
export function NamePicker({
  value,
  onPick,
  exclude = [],
  testIdPrefix = 'name-chip',
}: {
  value: string;
  onPick: (name: string) => void;
  /** Names already taken by another seat (hidden, not just disabled). */
  exclude?: string[];
  testIdPrefix?: string;
}) {
  const taken = exclude.map((n) => n.trim().toLowerCase());
  const current = value.trim().toLowerCase();
  return (
    <div className="name-chips" role="group" aria-label="Pick a player">
      {nameSuggestions(FAMILY_NAMES).filter((n) => !taken.includes(n.toLowerCase())).map((n) => (
        <button
          key={n}
          type="button"
          className={`name-chip${current === n.toLowerCase() ? ' on' : ''}`}
          aria-pressed={current === n.toLowerCase()}
          onClick={() => onPick(n)}
          data-testid={`${testIdPrefix}-${n.toLowerCase()}`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
