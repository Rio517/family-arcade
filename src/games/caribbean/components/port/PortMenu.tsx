import { useRef } from 'react';

import type { PortActivity } from '../../domain/types';
import { voyageBlockedCopy, type VoyageReadiness } from '../../domain/voyage';

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
  readiness: VoyageReadiness;
  busy: boolean;
  onSelect(activity: Exclude<PortActivity, 'menu'>): void;
  onSetSail(): Promise<unknown>;
  registerTrigger?(
    activity: Exclude<PortActivity, 'menu'>,
    element: HTMLButtonElement | null,
  ): void;
  registerSetSailTrigger?(element: HTMLButtonElement | null): void;
}

export function PortMenu({
  activeActivity,
  readiness,
  busy,
  onSelect,
  onSetSail,
  registerTrigger,
  registerSetSailTrigger,
}: PortMenuProps) {
  const setSailInFlight = useRef(false);
  const blocked = readiness.kind === 'blocked';
  const reason = blocked
    ? voyageBlockedCopy(readiness.reason)
    : 'Two provisions cover the outbound leg and guaranteed return.';
  const rumourAvailable = blocked && readiness.reason === 'lead-not-active';
  const depart = () => {
    if (blocked || busy || setSailInFlight.current) return;
    setSailInFlight.current = true;
    void onSetSail().finally(() => {
      setSailInFlight.current = false;
    });
  };
  return (
    <nav className="caribbean-port-menu" aria-label="Bridgetown activities">
      <ol className="caribbean-port-actions">
        {PORT_ACTIONS.map((action) => (
          <li
            key={action.kind === 'activity' ? action.activity : action.kind}
            className={`caribbean-port-action-item${action.kind === 'set-sail' && (blocked || busy) ? ' caribbean-port-action-item--disabled' : ''}`}
          >
            {action.kind === 'activity' ? (
              <button
                ref={(element) => registerTrigger?.(action.activity, element)}
                className="caribbean-port-action"
                data-testid={`port-action-${action.activity}`}
                type="button"
                aria-label={action.label}
                aria-current={activeActivity === action.activity ? 'page' : undefined}
                aria-describedby={action.activity === 'tavern' && rumourAvailable ? 'port-tavern-attention-copy' : undefined}
                onClick={() => onSelect(action.activity)}
              >
                <span className="caribbean-port-action-label">{action.label}</span>
                {action.activity === 'tavern' && rumourAvailable && (
                  <>
                    <span className="caribbean-port-action-attention" aria-hidden="true">
                      <svg width="20" height="20" viewBox="0 0 20 20" focusable="false">
                        <path d="M10 1.8 18.2 10 10 18.2 1.8 10Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
                        <path d="M10 5.7v5.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        <circle cx="10" cy="14.2" r="1" fill="currentColor" />
                      </svg>
                    </span>
                    <span id="port-tavern-attention-copy" className="caribbean-visually-hidden">Rumour available</span>
                  </>
                )}
              </button>
            ) : (
              <button
                ref={registerSetSailTrigger}
                className="caribbean-port-action"
                data-testid="port-action-set-sail"
                type="button"
                aria-label={action.label}
                disabled={blocked || busy}
                aria-describedby="port-set-sail-reason"
                onClick={depart}
              >
                <span className="caribbean-port-action-label">{action.label}</span>
                {rumourAvailable
                  ? <span id="port-set-sail-reason" className="caribbean-visually-hidden">{reason}</span>
                  : <span id="port-set-sail-reason" className="caribbean-port-action-reason">{reason}</span>}
              </button>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
