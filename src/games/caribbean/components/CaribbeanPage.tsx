import { useEffect, useState } from 'react';

import { getBrowserCaribbeanRuntime, type CaribbeanRuntime } from '../state/runtime';
import { useCaribbean } from '../state/useCaribbean';
import '../styles/production.css';
import { MinimumScreenGate } from './MinimumScreenGate';
import { RecoveryPanel } from './recovery/RecoveryPanel';
import { CampaignSetup } from './setup/CampaignSetup';

function requestedResume(): boolean {
  if (typeof window === 'undefined') return false;
  const query = window.location.hash.split('?')[1] ?? '';
  return new URLSearchParams(query).get('resume') === '1';
}

function ControllerPage({ runtime }: { runtime: CaribbeanRuntime }) {
  const controller = useCaribbean(runtime);
  const load = controller.load;
  const { busy, journal, persistence, resume } = controller;
  const needsRecovery = load.kind === 'unreadable'
    || load.kind === 'loaded' && (load.recovered || load.unreadableSlots.length > 0);

  useEffect(() => {
    if (
      !requestedResume()
      || journal !== null
      || busy
      || persistence.kind !== 'persisted'
      || load.kind !== 'loaded'
      || load.recovered
      || load.unreadableSlots.length > 0
    ) return;
    let active = true;
    queueMicrotask(() => {
      if (active) void resume();
    });
    return () => { active = false; };
  }, [busy, journal, persistence.kind, resume, load]);

  const savingAvailable = runtime.storageCapability.kind === 'available'
    && runtime.writer.capability === 'available'
    && load.kind !== 'storage-unavailable';
  const recoveryPhase = controller.persistence.kind === 'recovery-required'
    || controller.persistence.kind === 'recovery-continuation'
    || controller.persistence.kind === 'recovery-blocked';

  return (
    <div className="caribbean-app caribbean-production">
      <header className="caribbean-manifest" aria-label="Bridgetown commission manifest">
        <div>
          <span>13°06′ N</span>
          <strong>Bridgetown</strong>
          <span>59°37′ W</span>
        </div>
        <p>Captain’s commission · 1675</p>
        <span className="caribbean-course-axis" aria-hidden="true" />
      </header>

      <div className="caribbean-production-main">
        {needsRecovery || recoveryPhase ? (
          <RecoveryPanel controller={controller} />
        ) : controller.journal === null || controller.persistence.kind === 'consent-required' || controller.persistence.kind === 'save-conflict' ? (
          <CampaignSetup controller={controller} savingAvailable={savingAvailable} />
        ) : (
          <section className="caribbean-ready" data-testid="caribbean-career-ready">
            <p className="caribbean-place-line">Bridgetown · 1675</p>
            <h1>{controller.journal.state.captain.name}</h1>
            <p>Commission signed. Your career is ready in Bridgetown.</p>
          </section>
        )}

        {controller.journal !== null && controller.persistence.kind === 'memory-only' && (
          <aside className="caribbean-status caribbean-memory-warning" role="status">
            <p>This career is not being saved. Keep this tab open.</p>
            {controller.persistence.canRetrySaving && (
              <button data-testid="caribbean-retry-saving-button" type="button" disabled={controller.busy} onClick={() => void controller.retrySaving()}>
                Retry saving
              </button>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

export function CaribbeanPage({ runtime: suppliedRuntime }: { runtime?: CaribbeanRuntime }) {
  const [runtime] = useState(() => suppliedRuntime ?? getBrowserCaribbeanRuntime());
  return (
    <MinimumScreenGate>
      <ControllerPage runtime={runtime} />
    </MinimumScreenGate>
  );
}
