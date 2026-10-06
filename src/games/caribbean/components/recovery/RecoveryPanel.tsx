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
    return 'Saving stopped partway. Your backup copy is safe. Try recovery again.';
  }
  if (result.cause === 'partial-cleanup') {
    return 'Cleanup stopped partway. Your backup copy is safe. Try again.';
  }
  return 'The recovered campaign could not be saved. Your backup copy is safe. Try again.';
}

function blockedMessage(
  phase: Extract<CaribbeanPersistencePhase, { kind: 'recovery-blocked' }>,
): string {
  const { result } = phase;
  switch (result.reason) {
    case 'active-revision-conflict':
      return 'The campaign changed before the backup finished. Nothing was removed. Reload the page and try again.';
    case 'quarantine-collision':
      return 'A different backup already uses this name. Nothing was removed.';
    case 'storage-unavailable':
      return 'Saving stopped before the backup was checked. Nothing was removed. Reload the page and try again.';
    case 'external-revision-conflict':
      return 'A newer save appeared. Your backup copy is safe and won’t overwrite it. Pick what to do next.';
    case 'quarantine-invalidated':
      return result.cause === 'quarantine-missing'
        ? 'The backup copy is missing, so nothing can be removed. Reload the page and try again.'
        : 'The backup copy changed, so nothing can be removed. Reload the page and try again.';
    case 'invalid-recovery-source':
      return 'This save can’t be recovered from. Download it before you do anything else.';
  }
}

function recoveryActionCopy(
  capability: CaribbeanController['recoveryWriterCapability'],
  failure: RecoveryActionFailure | null,
): string | null {
  if (failure?.kind === 'post-result-load') {
    return failure.action === 'recover' || failure.action === 'continue-recovery'
      ? 'Recovery finished, but saves could not be read again. Reload the page to continue.'
      : 'The campaign was abandoned, but saves could not be read again. Reload the page to continue.';
  }
  if (failure?.kind === 'writer') {
    if (failure.failure.kind === 'writer-denied') {
      return 'Couldn’t change saves. Nothing was changed. Try again.';
    }
    if (failure.failure.kind === 'writer-unavailable') {
      return 'This browser can’t change saves, so recovery is off here. Nothing was changed.';
    }
    if (failure.failure.writer.kind === 'operation-threw') {
      return 'Couldn’t confirm what happened. Reload the page to check your save.';
    }
    return 'Something went wrong with saves. Reload the page, then try again.';
  }
  return capability === 'unavailable'
    ? 'This browser can’t change saves, so recovery is off here. Nothing was changed.'
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
        <h1>{postResultLoadFailure ? 'Reload to continue' : 'Save needs repair'}</h1>

        {recoveryNotice !== null && (
          <p id="caribbean-recovery-action-status" className="caribbean-alert" role="alert">
            {recoveryNotice}
          </p>
        )}

        {postResultLoadFailure ? (
          <>
            <p>
              The change went through. Reload the page to see your saved campaign.
            </p>
            <div className="caribbean-action-row">
              <button data-testid="caribbean-download-recovery-button" type="button" onClick={exportRecovery}>Download recovery file</button>
              {load.kind === 'loaded' && (
                <button data-testid="caribbean-recover-known-good-button" className="caribbean-button-primary" type="button" disabled aria-describedby={mutationReasonId}>
                  Recover last save
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
              <button data-testid="caribbean-abandon-from-quarantine-button" className="caribbean-button-danger" type="button" disabled={mutationDisabled} aria-describedby={mutationReasonId} onClick={() => void controller.continueRecovery('abandon')}>Abandon campaign</button>
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
                  Download backup
                </button>
                <button data-testid="caribbean-reload-newer-save-button" type="button" onClick={() => void controller.reloadExternalSave()}>Reload newer save</button>
                <button data-testid="caribbean-recovery-cancel-button" type="button" onClick={() => setExternalCancelled(true)}>Cancel</button>
              </div>
            )}
          </div>
        ) : (
          <>
            <p>
              This save can’t be opened as it is. Download a recovery file first, then choose to recover or abandon.
            </p>
            <div className="caribbean-action-row">
              <button data-testid="caribbean-download-recovery-button" type="button" onClick={exportRecovery}>Download recovery file</button>
              {load.kind === 'loaded' && (
                <button data-testid="caribbean-recover-known-good-button" className="caribbean-button-primary" type="button" disabled={mutationDisabled} aria-describedby={mutationReasonId} onClick={() => void controller.recover()}>
                  Recover last save
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
            A copy of the save is kept first, then the campaign is removed.
          </p>
          <div className="caribbean-dialog-actions">
            <button data-testid="caribbean-abandon-cancel-button" ref={cancelRef} type="button" onClick={() => setAbandonOpen(false)}>Cancel</button>
            <button
              data-testid="caribbean-abandon-confirm-button"
              className="caribbean-button-danger"
              type="button"
              onClick={() => { setAbandonOpen(false); void controller.abandon(); }}
            >
              Abandon it
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
