import type { PortActivity } from '../../domain/types';

// This immutable action contract lives beside its only renderer by design.
// eslint-disable-next-line react-refresh/only-export-components
export const PORT_ACTIONS = [
  { kind: 'activity', activity: 'governor', label: "Governor's House" },
  { kind: 'activity', activity: 'tavern', label: 'Tavern' },
  { kind: 'activity', activity: 'market', label: 'Market' },
  { kind: 'activity', activity: 'shipyard', label: 'Shipyard' },
  { kind: 'activity', activity: 'shares', label: 'Divide Shares' },
  { kind: 'activity', activity: 'log', label: "Captain's Log" },
  { kind: 'set-sail', label: 'Set Sail' },
] as const;

interface PortMenuProps {
  activeActivity: PortActivity;
  onSelect(activity: Exclude<PortActivity, 'menu'>): void;
  registerTrigger?(
    activity: Exclude<PortActivity, 'menu'>,
    element: HTMLButtonElement | null,
  ): void;
}

export function PortMenu({ activeActivity, onSelect, registerTrigger }: PortMenuProps) {
  return (
    <nav className="caribbean-port-menu" aria-label="Bridgetown activities">
      <ol className="caribbean-port-actions">
        {PORT_ACTIONS.map((action) => (
          <li
            key={action.kind === 'activity' ? action.activity : action.kind}
            className={action.kind === 'set-sail' ? 'caribbean-port-action-item caribbean-port-action-item--disabled' : 'caribbean-port-action-item'}
          >
            {action.kind === 'activity' ? (
              <button
                ref={(element) => registerTrigger?.(action.activity, element)}
                className="caribbean-port-action"
                data-testid={`port-action-${action.activity}`}
                type="button"
                aria-current={activeActivity === action.activity ? 'page' : undefined}
                onClick={() => onSelect(action.activity)}
              >
                {action.label}
              </button>
            ) : (
              <>
                <button
                  className="caribbean-port-action"
                  data-testid="port-action-set-sail"
                  type="button"
                  disabled
                  aria-describedby="port-set-sail-reason"
                >
                  {action.label}
                </button>
                <span id="port-set-sail-reason" className="caribbean-port-action-reason">
                  Sea routes open in the next package.
                </span>
              </>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
