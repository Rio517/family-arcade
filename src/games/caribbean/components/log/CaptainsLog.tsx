import { redJackdawView } from '../../domain/leadSelectors';
import type { CampaignStateV1, LastVoyageSummary } from '../../domain/types';

const SAFE_RETURN_COPY = 'Bridgetown’s harbour crew made Mistral ready for the next departure; the battle outcome remains in this log, but its damage is not carried onto the ready flagship.';

function lastVoyageCopy(lastVoyage: LastVoyageSummary): string {
  let result: string;
  switch (lastVoyage.result) {
    case 'avoided': result = 'Avoided contact'; break;
    case 'withdrew': result = 'Withdrawn from battle'; break;
    case 'victory': {
      const outcome = lastVoyage.outcome;
      if (outcome?.kind === 'surrender') result = 'Victory — Red Jackdaw surrendered';
      else if (outcome?.kind === 'sunk') result = 'Victory — Red Jackdaw sunk';
      else if (outcome?.kind === 'boarding-ready') result = 'Victory — Red Jackdaw ready to board';
      else result = 'Victory over Red Jackdaw';
      break;
    }
    case 'defeat': result = 'Defeat at sea'; break;
    case 'unresolved': result = 'Contact ended without a decision'; break;
  }
  return `${result} · Returned${lastVoyage.result === 'avoided' ? ' to Bridgetown' : ''} on day ${lastVoyage.returnedDay}.`;
}

export function CaptainsLog({ state }: { state: CampaignStateV1 }) {
  const view = redJackdawView(state);
  const lastVoyage = state.world.lastVoyage;
  if (view.status === 'available') {
    return <p className="caribbean-log-empty">No leads yet</p>;
  }

  return (
    <>
      {lastVoyage !== undefined && (
        <section className="caribbean-last-voyage" data-testid="captains-log-last-voyage" aria-label="Last voyage">
          <h3>Last voyage</h3>
          <p>{lastVoyageCopy(lastVoyage)}</p>
          {lastVoyage.battleId !== null && <p>{SAFE_RETURN_COPY}</p>}
        </section>
      )}
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
    </>
  );
}
