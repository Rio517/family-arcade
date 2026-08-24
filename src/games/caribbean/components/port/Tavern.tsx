import { useRef, useState } from 'react';

import type { CampaignEventDraftFor } from '../../domain/events';
import { redJackdawView } from '../../domain/leadSelectors';
import type { CampaignStateV1 } from '../../domain/types';

export interface TavernProps {
  state: CampaignStateV1;
  busy: boolean;
  onAccept(draft: CampaignEventDraftFor<'lead-accepted'>): Promise<void>;
}

export function Tavern({ state, busy, onAccept }: TavernProps) {
  const view = redJackdawView(state);
  const acceptingRef = useRef(false);
  const [accepting, setAccepting] = useState(false);

  const markOnChart = (): void => {
    if (view.status !== 'available' || busy || acceptingRef.current) return;
    acceptingRef.current = true;
    setAccepting(true);
    void onAccept({
      type: 'lead-accepted',
      payload: { leadId: 'red-jackdaw' },
    }).catch(() => undefined).finally(() => {
      acceptingRef.current = false;
      setAccepting(false);
    });
  };

  return (
    <div className="caribbean-tavern">
      <article className="caribbean-tavern-rumour" data-testid="tavern-rumour-card">
        <blockquote>{view.sentence}</blockquote>
        {view.status === 'available' && (
          <button
            className="caribbean-tavern-mark"
            data-testid="tavern-mark-red-jackdaw"
            type="button"
            disabled={busy || accepting}
            onClick={markOnChart}
          >
            Mark on chart
          </button>
        )}
        <p className="caribbean-tavern-status" role="status" aria-live="polite" aria-atomic="true">
          {view.status === 'active'
            ? "Marked in the Captain's Log"
            : view.status === 'available'
              ? ''
              : view.terminalCopy}
        </p>
      </article>
    </div>
  );
}
