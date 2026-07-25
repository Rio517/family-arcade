import type { ConnStatus } from '@shared/net/peer';
import { WarningIcon } from '@shared/ui/icons';

const LABEL: Record<ConnStatus, string> = {
  idle: 'Offline',
  hosting: 'Waiting for opponent',
  dialing: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  error: 'Connection error',
};

// States where the two devices are NOT yet linked get a warning treatment so
// it's obvious you're still waiting / not connected.
const WARN: Record<ConnStatus, boolean> = {
  idle: false,
  hosting: true,
  dialing: true,
  connected: false,
  reconnecting: true,
  error: true,
};

export function ConnectionBadge({ status, detail }: { status: ConnStatus; detail?: string }) {
  return (
    <span className="conn" data-s={status} title={detail ?? LABEL[status]}>
      {WARN[status] ? <WarningIcon size={14} /> : <span className="dot" />}
      {LABEL[status]}
    </span>
  );
}
