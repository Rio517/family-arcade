import { FAMILY_NAMES } from '@shared/profile/profile';

/**
 * One-tap family name chips, shown beside any "your name" field. Tapping a
 * chip is the whole flow for the five household regulars; the text input
 * next to it still handles guests. The chip matching the current value
 * lights up so it doubles as a "who am I right now" readout.
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
      {FAMILY_NAMES.filter((n) => !taken.includes(n.toLowerCase())).map((n) => (
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
