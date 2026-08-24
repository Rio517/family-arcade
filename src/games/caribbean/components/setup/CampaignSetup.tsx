import { useRef, useState, type FormEvent, type RefObject } from 'react';

import type { CampaignLength, Talent } from '../../domain/types';
import { provisionsMonths } from '../../domain/selectors';
import { CAMPAIGN_LENGTH_LABELS } from '../../state/selectors';
import type {
  CaribbeanController,
  SaveCapabilityFailure,
} from '../../state/useCaribbean';
import { useModalFocus } from '../recovery/useModalFocus';

const TALENTS = [
  ['fencing', 'Fencing'],
  ['gunnery', 'Gunnery'],
  ['navigation', 'Navigation'],
  ['charm', 'Charm'],
  ['medicine', 'Medicine'],
] as const satisfies readonly (readonly [Talent, string])[];

const LENGTHS = (Object.entries(CAMPAIGN_LENGTH_LABELS)) as [CampaignLength, string][];

function downloadText(raw: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

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

function AbandonDialog({
  open,
  openerRef,
  backgroundRef,
  onClose,
  onConfirm,
}: {
  open: boolean;
  openerRef: RefObject<HTMLButtonElement | null>;
  backgroundRef: RefObject<HTMLElement | null>;
  onClose(): void;
  onConfirm(): void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useModalFocus({
    active: open,
    dialogRef,
    initialFocusRef: cancelRef,
    returnFocusRef: openerRef,
    backgroundRef,
    onDismiss: onClose,
  });

  return (
    <>
      {open && (
        <section
          ref={dialogRef}
          className="caribbean-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="campaign-abandon-title"
          aria-describedby="campaign-abandon-description"
        >
          <h2 id="campaign-abandon-title">Abandon this campaign?</h2>
          <p id="campaign-abandon-description">
            The save will be copied to quarantine before its active slots are removed.
          </p>
          <div className="caribbean-dialog-actions">
            <button ref={cancelRef} type="button" onClick={onClose}>Cancel</button>
            <button
              className="caribbean-button-danger"
              type="button"
              onClick={() => { onClose(); onConfirm(); }}
            >
              Quarantine and abandon
            </button>
          </div>
        </section>
      )}
    </>
  );
}

export function CampaignSetup({
  controller,
  savingAvailable,
}: {
  controller: CaribbeanController;
  savingAvailable: boolean;
}) {
  const [name, setName] = useState('Captain');
  const [pronouns, setPronouns] = useState('they/them');
  const [talent, setTalent] = useState<Talent>('navigation');
  const [length, setLength] = useState<CampaignLength>('adventure');
  const [nameError, setNameError] = useState(false);
  const [abandonOpen, setAbandonOpen] = useState(false);
  const abandonRef = useRef<HTMLButtonElement>(null);
  const backgroundRef = useRef<HTMLDivElement>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalizedName = name.trim();
    if (normalizedName.length === 0) {
      setNameError(true);
      return;
    }
    setNameError(false);
    const normalizedPronouns = pronouns.trim();
    void controller.start({
      name: normalizedName,
      ...(normalizedPronouns.length > 0 ? { pronouns: normalizedPronouns } : {}),
      talent,
      length,
    });
  };

  const cleanLoad = controller.load.kind === 'loaded'
    && !controller.load.recovered
    && controller.load.unreadableSlots.length === 0
      ? controller.load
      : null;
  const state = cleanLoad?.journal.state ?? controller.journal?.state ?? null;
  const showResume = cleanLoad !== null && controller.journal === null;
  const persistence = controller.persistence;

  return (
    <section className="caribbean-commission-panel" aria-label="Caribbean career setup">
      <div ref={backgroundRef} className="caribbean-commission-content">
        <p className="caribbean-place-line">Bridgetown · 1675</p>

        {state !== null && showResume ? (
          <div className="caribbean-save-summary">
            <h1>{state.captain.name}’s commission</h1>
            <p className="caribbean-summary-course">
              {CAMPAIGN_LENGTH_LABELS[state.career.length]} · Bridgetown
            </p>
            <p className="caribbean-save-time">
              Last saved {new Date(cleanLoad.savedAt).toLocaleString()}
            </p>
            <dl>
              <div>
                <dt>Flagship</dt>
                <dd>{state.fleet.ships[0]?.name ?? 'No flagship'} · Hull {state.fleet.ships[0]?.hull ?? 0} · Sails {state.fleet.ships[0]?.sails ?? 0}</dd>
              </div>
              <div><dt>Cash</dt><dd>{state.wealth.gold} gold</dd></div>
              <div>
                <dt>Stores</dt>
                <dd>{provisionsMonths(state)?.toFixed(1) ?? '—'} months provisions</dd>
              </div>
            </dl>
            <div className="caribbean-action-row">
              <button className="caribbean-button-primary" type="button" disabled={controller.busy} onClick={() => void controller.resume()}>
                Resume career
              </button>
              <button ref={abandonRef} type="button" disabled={controller.busy} onClick={() => setAbandonOpen(true)}>
                Abandon campaign
              </button>
            </div>
          </div>
        ) : state === null ? (
          <form onSubmit={submit} noValidate>
            <h1>Sign a captain’s commission</h1>
            <p className="caribbean-intro">Set a name and course. Every field already carries the recommended starting choice.</p>
            <div className="caribbean-form-grid">
              <div className="caribbean-field">
                <label htmlFor="caribbean-captain-name">Captain name</label>
                <input
                  id="caribbean-captain-name"
                  name="captain-name"
                  value={name}
                  maxLength={40}
                  aria-invalid={nameError ? 'true' : undefined}
                  aria-describedby={nameError ? 'captain-name-error' : undefined}
                  onChange={(event) => { setName(event.target.value); if (nameError) setNameError(false); }}
                />
                {nameError && <span id="captain-name-error" className="caribbean-field-error">Enter a captain name.</span>}
              </div>
              <div className="caribbean-field">
                <label htmlFor="caribbean-pronouns">Pronouns</label>
                <input id="caribbean-pronouns" name="pronouns" value={pronouns} maxLength={24} onChange={(event) => setPronouns(event.target.value)} />
              </div>
              <div className="caribbean-field">
                <label htmlFor="caribbean-talent">Starting talent</label>
                <select id="caribbean-talent" value={talent} onChange={(event) => setTalent(event.target.value as Talent)}>
                  {TALENTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <div className="caribbean-field">
                <label htmlFor="caribbean-length">Career length</label>
                <select id="caribbean-length" value={length} onChange={(event) => setLength(event.target.value as CampaignLength)}>
                  {LENGTHS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
            </div>
            <button className="caribbean-button-primary" type="submit" disabled={controller.busy}>Start career</button>
          </form>
        ) : null}

        {!savingAvailable && persistence.kind === 'persisted' && (
          <p className="caribbean-status" role="status">
            {cleanLoad === null
              ? 'Saving disabled. No campaign has been created yet.'
              : 'Saving disabled. Resume requires explicit memory-only consent.'}
          </p>
        )}
        {persistence.kind === 'consent-required' && (
          <div className="caribbean-alert" role="alert">
            <p>{saveFailureCopy(persistence.failure)}</p>
            <button type="button" onClick={controller.continueWithoutSaving}>Continue without saving</button>
          </div>
        )}
        {persistence.kind === 'save-conflict' && (
          <div className="caribbean-alert" role="alert">
            <p>A newer save exists. This tab will not overwrite or adopt it without your choice.</p>
            <div className="caribbean-action-row">
              <button type="button" onClick={() => void controller.reloadExternalSave()}>Reload newer save</button>
              <button
                type="button"
                onClick={() => {
                  const raw = controller.exportInMemoryJournal();
                  if (raw !== null) downloadText(raw, 'caribbean-in-memory-journal.json');
                }}
              >
                Export in-memory journal
              </button>
              <button type="button" onClick={controller.continueWithoutSaving}>Continue without saving</button>
            </div>
          </div>
        )}
      </div>

      <AbandonDialog
        open={abandonOpen}
        openerRef={abandonRef}
        backgroundRef={backgroundRef}
        onClose={() => setAbandonOpen(false)}
        onConfirm={() => void controller.abandon()}
      />
    </section>
  );
}
