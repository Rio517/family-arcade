import { redJackdawView } from '../../domain/leadSelectors';
import type { CampaignStateV1 } from '../../domain/types';

export function CaptainsLog({ state }: { state: CampaignStateV1 }) {
  const view = redJackdawView(state);
  if (view.status === 'available') {
    return <p className="caribbean-log-empty">No leads yet</p>;
  }

  return (
    <article className="caribbean-captains-log" data-testid="captains-log-red-jackdaw">
      <header>
        <h3>Red Jackdaw</h3>
        {view.status === 'active' && <p>{view.daysRemaining} days remaining</p>}
      </header>
      {view.status === 'active' ? (
        <p className="caribbean-log-action">
          <span className="caribbean-log-action-label">Next action</span>
          <span className="caribbean-log-action-copy">{view.nextAction}</span>
        </p>
      ) : (
        <p className="caribbean-log-terminal">{view.terminalCopy}</p>
      )}
    </article>
  );
}
