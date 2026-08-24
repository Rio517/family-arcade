import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';

import { getBrowserCaribbeanRuntime, type CaribbeanRuntime } from '../state/runtime';
import { useCaribbean } from '../state/useCaribbean';
import { useProfile } from '@shared/profile/useProfile';
import '../styles/production.css';
import { MinimumScreenGate } from './MinimumScreenGate';
import { PortPage } from './port/PortPage';
import { RecoveryPanel } from './recovery/RecoveryPanel';
import { CampaignSetup } from './setup/CampaignSetup';
import { PersistenceDecisionOverlay } from './setup/PersistenceDecisionOverlay';
import { EncounterPage } from './voyage/EncounterPage';
import { SailingPage } from './voyage/SailingPage';

const CampaignNavalBattle = lazy(() => import('./voyage/CampaignNavalBattle'));

function requestedResume(): boolean {
  if (typeof window === 'undefined') return false;
  const query = window.location.hash.split('?')[1] ?? '';
  return new URLSearchParams(query).get('resume') === '1';
}

export function ActiveCampaign({ controller }: { controller: ReturnType<typeof useCaribbean> }) {
  const routeRef = useRef<HTMLDivElement>(null);
  const mode = controller.journal?.state.mode;
  if (mode === undefined) throw new Error('ActiveCampaign requires an active journal');
  const route = (() => {
    switch (mode.kind) {
      case 'port': return <PortPage controller={controller} />;
      case 'sailing': return <SailingPage controller={controller} />;
      case 'encounter': return <EncounterPage controller={controller} />;
      case 'naval': return (
        <Suspense fallback={<p className="caribbean-status" role="status">Loading the engagement…</p>}>
          <CampaignNavalBattle controller={controller} />
        </Suspense>
      );
      default: throw new Error(`Task 4 has no route for ${mode.kind}`);
    }
  })();
  const decisionRequired = controller.persistence.kind === 'consent-required'
    || controller.persistence.kind === 'save-conflict';

  return (
    <>
      <div
        ref={routeRef}
        data-testid="campaign-route"
        aria-hidden={decisionRequired ? 'true' : undefined}
      >
        {route}
      </div>
      {decisionRequired && (
        <PersistenceDecisionOverlay controller={controller} backgroundRef={routeRef} />
      )}
    </>
  );
}

function ControllerPage({ runtime }: { runtime: CaribbeanRuntime }) {
  const controller = useCaribbean(runtime);
  const { profile, setPronouns } = useProfile();
  const identity = useMemo(() => ({
    playerName: profile.name,
    pronouns: profile.pronouns,
    savePronouns: setPronouns,
  }), [profile.name, profile.pronouns, setPronouns]);
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
  const showCampaign = controller.journal !== null
    && !needsRecovery
    && !recoveryPhase;

  return (
    <div className={`caribbean-app caribbean-production${showCampaign ? ' caribbean-production--campaign' : ''}`}>
      {showCampaign ? (
        <ActiveCampaign controller={controller} />
      ) : (
        <>
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
            ) : (
              <CampaignSetup controller={controller} identity={identity} savingAvailable={savingAvailable} />
            )}
          </div>
        </>
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
