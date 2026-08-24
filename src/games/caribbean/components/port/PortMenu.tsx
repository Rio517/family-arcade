import { useRef } from 'react';

import type { PortActivity } from '../../domain/types';
import type { VoyageBlockedReason, VoyageReadiness } from '../../domain/voyage';

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

function portReadinessCopy(reason: VoyageBlockedReason): string {
  switch (reason) {
    case 'not-in-bridgetown': return 'Return to Bridgetown before setting a new course.';
    case 'target-defeated': return 'The Red Jackdaw lead is complete.';
    case 'lead-not-active': return 'Mark the Red Jackdaw rumour in the Tavern first.';
    case 'flagship-unavailable': return 'The flagship record is unavailable.';
    case 'insufficient-provisions': return 'Buy at least 2 provisions for the round trip.';
  }
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
    ? portReadinessCopy(readiness.reason)
    : 'Two provisions cover the outbound leg and guaranteed return.';
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
                aria-current={activeActivity === action.activity ? 'page' : undefined}
                onClick={() => onSelect(action.activity)}
              >
                {action.label}
              </button>
            ) : (
              <>
                <button
                  ref={registerSetSailTrigger}
                  className="caribbean-port-action"
                  data-testid="port-action-set-sail"
                  type="button"
                  disabled={blocked || busy}
                  aria-describedby="port-set-sail-reason"
                  onClick={depart}
                >
                  {action.label}
                </button>
                <span id="port-set-sail-reason" className="caribbean-port-action-reason">
                  {reason}
                </span>
              </>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
