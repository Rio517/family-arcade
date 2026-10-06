import { useRef, type RefObject } from 'react';

import type {
  CaribbeanController,
  SaveCapabilityFailure,
} from '../../state/useCaribbean';
import { useModalFocus } from '../recovery/useModalFocus';

function saveFailureCopy(failure: SaveCapabilityFailure): string {
  if (failure.kind === 'writer-denied') {
    return 'This tab can’t save right now. You can play on, but progress is lost when you close the tab.';
  }
  if (failure.kind === 'writer-unavailable') {
    return 'This browser can’t save games here. You can play on, but progress is lost when you close the tab.';
  }
  if (failure.kind === 'operation-uncertain') {
    return 'The last save may not have gone through. Keep this tab open and play on without saving.';
  }
  return 'Saving isn’t available in this browser. You can play on, but progress is lost when you close the tab.';
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
      <p>A newer save exists. Nothing was overwritten, and this game is safe.</p>
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
          Export this game
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
      <h2 id="campaign-persistence-title">
        {persistence.kind === 'save-conflict' ? 'Newer save found' : 'Can’t save'}
      </h2>
      <div role="alert">
        <PersistenceDecisionControls controller={controller} initialFocusRef={initialFocusRef} />
      </div>
    </section>
  );
}
