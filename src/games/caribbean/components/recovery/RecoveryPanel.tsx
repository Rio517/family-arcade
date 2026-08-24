import { useRef, useState } from 'react';

import { serializeRecoveryExport } from '../../storage/recovery';
import type { CaribbeanController, CaribbeanPersistencePhase } from '../../state/useCaribbean';
import { useModalFocus } from './useModalFocus';

function downloadText(raw: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function continuationMessage(
  phase: Extract<CaribbeanPersistencePhase, { kind: 'recovery-continuation' }>,
): string {
  const result = phase.result;
  if (result.cause === 'storage-unavailable') {
    return `Storage became unavailable during ${result.failedOperation}.`;
  }
  if (result.cause === 'partial-cleanup') {
    return `Cleanup stopped during ${result.failedOperation}.`;
  }
  return `The recovered campaign could not be published during ${result.saveFailure.reason === 'storage-unavailable' ? result.saveFailure.operation : result.saveFailure.reason}.`;
}

function blockedMessage(
  phase: Extract<CaribbeanPersistencePhase, { kind: 'recovery-blocked' }>,
): string {
  const { result } = phase;
  switch (result.reason) {
    case 'active-revision-conflict':
      return 'The active campaign changed before quarantine. Reload before making a new recovery decision.';
    case 'quarantine-collision':
      return 'The selected quarantine key already belongs to a different recovery copy.';
    case 'storage-unavailable':
      return `Storage became unavailable during ${result.operation}, before quarantine was verified.`;
    case 'external-revision-conflict':
      return 'A newer active save appeared after quarantine. The verified copy is preserved; it cannot overwrite the newer save.';
    case 'quarantine-invalidated':
      return result.cause === 'quarantine-missing'
        ? 'The verified quarantine copy is missing. No destructive action is available.'
        : 'The verified quarantine copy changed. No destructive action is available.';
    case 'invalid-recovery-source':
      return 'The loaded save is not a valid recovery source. Export it before choosing another action.';
  }
}

export function RecoveryPanel({ controller }: { controller: CaribbeanController }) {
  const [abandonOpen, setAbandonOpen] = useState(false);
  const [externalCancelled, setExternalCancelled] = useState(false);
  const backgroundRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const abandonRef = useRef<HTMLButtonElement>(null);
  useModalFocus({
    active: abandonOpen,
    dialogRef,
    initialFocusRef: cancelRef,
    returnFocusRef: abandonRef,
    backgroundRef,
    onDismiss: () => setAbandonOpen(false),
  });

  const load = controller.load;
  const phase = controller.persistence;
  const externalConflict = phase.kind === 'recovery-blocked'
    && phase.result.reason === 'external-revision-conflict'
      ? phase.result
      : null;
  const recoveryLoad = load.kind === 'loaded' || load.kind === 'unreadable' ? load : null;
  const exportRecovery = () => {
    if (recoveryLoad === null) return;
    downloadText(
      serializeRecoveryExport(recoveryLoad.revision, recoveryLoad.unreadableSlots),
      'caribbean-recovery.json',
    );
  };

  return (
    <section className="caribbean-recovery-panel" aria-label="Campaign recovery">
      <div ref={backgroundRef} className="caribbean-recovery-content">
        <p className="caribbean-place-line">Bridgetown · save station</p>
        <h1>Campaign recovery required</h1>

        {phase.kind === 'recovery-continuation' ? (
          <div className="caribbean-alert" role="alert">
            <p>{continuationMessage(phase)}</p>
            <p className="caribbean-diagnostic">
              {phase.result.quarantineKey} · {phase.result.continuation.stage}
            </p>
            <div className="caribbean-action-row">
              <button type="button" disabled={controller.busy} onClick={() => void controller.continueRecovery('continue')}>Retry recovery</button>
              <button className="caribbean-button-danger" type="button" disabled={controller.busy} onClick={() => void controller.continueRecovery('abandon')}>Abandon from quarantine</button>
            </div>
          </div>
        ) : phase.kind === 'recovery-blocked' ? (
          <div className="caribbean-alert" role="alert">
            <p>{blockedMessage(phase)}</p>
            {externalConflict !== null && !externalCancelled && (
              <div className="caribbean-action-row">
                <button
                  type="button"
                  onClick={() => downloadText(externalConflict.quarantineRaw, 'caribbean-verified-quarantine.json')}
                >
                  Download verified quarantine
                </button>
                <button type="button" onClick={() => void controller.reloadExternalSave()}>Reload newer save</button>
                <button type="button" onClick={() => setExternalCancelled(true)}>Cancel</button>
              </div>
            )}
          </div>
        ) : (
          <>
            <p>
              The active save could not be used as-is. Download its exact bytes before choosing recovery or abandonment.
            </p>
            <div className="caribbean-action-row">
              <button type="button" onClick={exportRecovery}>Download recovery file</button>
              {load.kind === 'loaded' && (
                <button className="caribbean-button-primary" type="button" disabled={controller.busy} onClick={() => void controller.recover()}>
                  Recover known-good campaign
                </button>
              )}
              <button ref={abandonRef} type="button" disabled={controller.busy} onClick={() => setAbandonOpen(true)}>
                Abandon campaign
              </button>
            </div>
          </>
        )}
      </div>

      {abandonOpen && (
        <section
          ref={dialogRef}
          className="caribbean-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recovery-abandon-title"
          aria-describedby="recovery-abandon-description"
        >
          <h2 id="recovery-abandon-title">Abandon this campaign?</h2>
          <p id="recovery-abandon-description">
            The save will be copied to quarantine before its active slots are removed.
          </p>
          <div className="caribbean-dialog-actions">
            <button ref={cancelRef} type="button" onClick={() => setAbandonOpen(false)}>Cancel</button>
            <button
              className="caribbean-button-danger"
              type="button"
              onClick={() => { setAbandonOpen(false); void controller.abandon(); }}
            >
              Quarantine and abandon
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
