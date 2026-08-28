import { useRef, useState } from 'react';

import { serializeRecoveryExport } from '../../storage/recovery';
import type {
  CaribbeanController,
  CaribbeanPersistencePhase,
  RecoveryActionFailure,
} from '../../state/useCaribbean';
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

function recoveryActionCopy(
  capability: CaribbeanController['recoveryWriterCapability'],
  failure: RecoveryActionFailure | null,
): string | null {
  if (failure?.kind === 'post-result-load') {
    const action = failure.action === 'recover' || failure.action === 'continue-recovery'
      ? 'Recovery'
      : 'Campaign abandonment';
    return `${action} completed, but campaign storage could not be reread during ${failure.loadFailure.operation}. Reload before taking another recovery action.`;
  }
  if (failure?.kind === 'writer') {
    if (failure.failure.kind === 'writer-denied') {
      return 'Safe save ownership was denied. No recovery action ran; you can try again.';
    }
    if (failure.failure.kind === 'writer-unavailable') {
      return 'Safe save ownership is unavailable. Recovery and abandonment are disabled in this browser.';
    }
    if (failure.failure.writer.kind === 'operation-threw') {
      return 'The recovery operation threw before its outcome could be confirmed. Reload before taking another recovery action.';
    }
    return 'Safe save ownership returned an invalid protocol result. Reload before taking another recovery action.';
  }
  return capability === 'unavailable'
    ? 'Safe save ownership is unavailable. Recovery and abandonment are disabled in this browser.'
    : null;
}

function recoveryMutationBlocked(controller: CaribbeanController): boolean {
  const { recoveryFailure } = controller;
  if (controller.recoveryWriterCapability === 'unavailable') return true;
  if (recoveryFailure === null) return false;
  return recoveryFailure.kind === 'post-result-load'
    || recoveryFailure.failure.kind !== 'writer-denied';
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
  const recoveryNotice = recoveryActionCopy(
    controller.recoveryWriterCapability,
    controller.recoveryFailure,
  );
  const postResultLoadFailure = controller.recoveryFailure?.kind === 'post-result-load';
  const mutationDisabled = controller.busy || recoveryMutationBlocked(controller);
  const mutationReasonId = recoveryNotice === null ? undefined : 'caribbean-recovery-action-status';
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
        <h1>{postResultLoadFailure ? 'Campaign storage must be reread' : 'Campaign recovery required'}</h1>

        {recoveryNotice !== null && (
          <p id="caribbean-recovery-action-status" className="caribbean-alert" role="alert">
            {recoveryNotice}
          </p>
        )}

        {postResultLoadFailure ? (
          <>
            <p>
              The storage change completed, but this page will not infer or repeat the result until the active slots can be read again.
            </p>
            <div className="caribbean-action-row">
              <button data-testid="caribbean-download-recovery-button" type="button" onClick={exportRecovery}>Download recovery file</button>
              {load.kind === 'loaded' && (
                <button data-testid="caribbean-recover-known-good-button" className="caribbean-button-primary" type="button" disabled aria-describedby={mutationReasonId}>
                  Recover known-good campaign
                </button>
              )}
              <button data-testid="caribbean-abandon-campaign-button" ref={abandonRef} type="button" disabled aria-describedby={mutationReasonId}>
                Abandon campaign
              </button>
            </div>
          </>
        ) : phase.kind === 'recovery-continuation' ? (
          <div className="caribbean-alert" role={recoveryNotice === null ? 'alert' : undefined}>
            <p>{continuationMessage(phase)}</p>
            <p className="caribbean-diagnostic">
              {phase.result.quarantineKey} · {phase.result.continuation.stage}
            </p>
            <div className="caribbean-action-row">
              <button data-testid="caribbean-retry-recovery-button" type="button" disabled={mutationDisabled} aria-describedby={mutationReasonId} onClick={() => void controller.continueRecovery('continue')}>Retry recovery</button>
              <button data-testid="caribbean-abandon-from-quarantine-button" className="caribbean-button-danger" type="button" disabled={mutationDisabled} aria-describedby={mutationReasonId} onClick={() => void controller.continueRecovery('abandon')}>Abandon from quarantine</button>
            </div>
          </div>
        ) : phase.kind === 'recovery-blocked' ? (
          <div className="caribbean-alert" role={recoveryNotice === null ? 'alert' : undefined}>
            <p>{blockedMessage(phase)}</p>
            {externalConflict !== null && !externalCancelled && (
              <div className="caribbean-action-row">
                <button
                  data-testid="caribbean-download-verified-quarantine-button"
                  type="button"
                  onClick={() => downloadText(externalConflict.quarantineRaw, 'caribbean-verified-quarantine.json')}
                >
                  Download verified quarantine
                </button>
                <button data-testid="caribbean-reload-newer-save-button" type="button" onClick={() => void controller.reloadExternalSave()}>Reload newer save</button>
                <button data-testid="caribbean-recovery-cancel-button" type="button" onClick={() => setExternalCancelled(true)}>Cancel</button>
              </div>
            )}
          </div>
        ) : (
          <>
            <p>
              The active save could not be used as-is. Download its exact bytes before choosing recovery or abandonment.
            </p>
            <div className="caribbean-action-row">
              <button data-testid="caribbean-download-recovery-button" type="button" onClick={exportRecovery}>Download recovery file</button>
              {load.kind === 'loaded' && (
                <button data-testid="caribbean-recover-known-good-button" className="caribbean-button-primary" type="button" disabled={mutationDisabled} aria-describedby={mutationReasonId} onClick={() => void controller.recover()}>
                  Recover known-good campaign
                </button>
              )}
              <button data-testid="caribbean-abandon-campaign-button" ref={abandonRef} type="button" disabled={mutationDisabled} aria-describedby={mutationReasonId} onClick={() => setAbandonOpen(true)}>
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
            <button data-testid="caribbean-abandon-cancel-button" ref={cancelRef} type="button" onClick={() => setAbandonOpen(false)}>Cancel</button>
            <button
              data-testid="caribbean-abandon-confirm-button"
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
