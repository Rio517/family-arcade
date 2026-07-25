import type { ConnStatus } from '../net/peer';

const LABEL: Record<ConnStatus, string> = {
  idle: 'Offline',
  hosting: 'Waiting for opponent…',
  dialing: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  error: 'Connection error',
};

export function ConnectionBadge({ status, detail }: { status: ConnStatus; detail?: string }) {
  return (
    <span className="conn" data-s={status} title={detail ?? LABEL[status]}>
      <span className="dot" />
      {LABEL[status]}
    </span>
  );
}
