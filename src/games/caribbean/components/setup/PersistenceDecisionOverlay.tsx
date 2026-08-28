import { useRef, type RefObject } from 'react';

import type {
  CaribbeanController,
  SaveCapabilityFailure,
} from '../../state/useCaribbean';
import { useModalFocus } from '../recovery/useModalFocus';

function saveFailureCopy(failure: SaveCapabilityFailure): string {
  if (failure.kind === 'writer-denied') {
    return 'This tab could not acquire safe save ownership. Continue only if you accept a memory-only career.';
  }
  if (failure.kind === 'writer-unavailable') {
    return 'Safe save ownership is unavailable in this browser. Continue only if you accept a memory-only career.';
  }
  if (failure.kind === 'operation-uncertain') {
    return 'The last save operation has an uncertain outcome. Export or continue without saving before proceeding.';
  }
  return 'Campaign storage is unavailable. Continue only if you accept a memory-only career.';
}

function downloadText(raw: string, filename: string): void {
  if (typeof URL.createObjectURL !== 'function') return;
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function PersistenceDecisionControls({
  controller,
  initialFocusRef,
}: {
  controller: CaribbeanController;
  initialFocusRef?: RefObject<HTMLButtonElement>;
}) {
  const persistence = controller.persistence;
  if (persistence.kind === 'consent-required') {
    return (
      <>
        <p>{saveFailureCopy(persistence.failure)}</p>
        <button
          ref={initialFocusRef}
          data-testid="caribbean-continue-without-saving-button"
          type="button"
          onClick={controller.continueWithoutSaving}
        >
          Continue without saving
        </button>
      </>
    );
  }
  if (persistence.kind !== 'save-conflict') return null;
  return (
    <>
      <p>A newer save exists. This tab will not overwrite or adopt it without your choice.</p>
      <div className="caribbean-action-row">
        <button
          ref={initialFocusRef}
          data-testid="caribbean-reload-newer-save-button"
          type="button"
          onClick={() => void controller.reloadExternalSave()}
        >
          Reload newer save
        </button>
        <button
          data-testid="caribbean-export-in-memory-journal-button"
          type="button"
          onClick={() => {
            const raw = controller.exportInMemoryJournal();
            if (raw !== null) downloadText(raw, 'caribbean-in-memory-journal.json');
          }}
        >
          Export in-memory journal
        </button>
        <button data-testid="caribbean-continue-without-saving-button" type="button" onClick={controller.continueWithoutSaving}>
          Continue without saving
        </button>
      </div>
    </>
  );
}

export function PersistenceDecisionOverlay({
  controller,
  backgroundRef,
}: {
  controller: CaribbeanController;
  backgroundRef: RefObject<HTMLElement | null>;
}) {
  const persistence = controller.persistence;
  if (persistence.kind !== 'consent-required' && persistence.kind !== 'save-conflict') {
    throw new Error('PersistenceDecisionOverlay requires a persistence decision');
  }
  const dialogRef = useRef<HTMLElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement>(
    typeof document === 'undefined' || !(document.activeElement instanceof HTMLElement)
      ? null
      : document.activeElement,
  );
  useModalFocus({
    active: true,
    dialogRef,
    initialFocusRef,
    returnFocusRef,
    backgroundRef,
    onDismiss: () => undefined,
  });

  return (
    <section
      ref={dialogRef}
      className="caribbean-dialog caribbean-persistence-dialog"
      data-testid="campaign-persistence-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="campaign-persistence-title"
    >
      <h2 id="campaign-persistence-title">Choose how this campaign continues</h2>
      <div role="alert">
        <PersistenceDecisionControls controller={controller} initialFocusRef={initialFocusRef} />
      </div>
    </section>
  );
}
