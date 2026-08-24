import { useRef, useState, type FormEvent, type RefObject } from 'react';

import type { Talent } from '../../domain/types';
import { provisionsMonths } from '../../domain/selectors';
import { CAMPAIGN_LENGTH_LABELS } from '../../state/selectors';
import { normalizePronouns, pronounCodePointLength } from '@shared/profile/profile';
import type {
  CaribbeanController,
  RecoveryActionFailure,
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

export interface CampaignSetupIdentity {
  playerName: string;
  pronouns: string;
  savePronouns(pronouns: string): void;
}

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

function recoveryActionCopy(
  capability: CaribbeanController['recoveryWriterCapability'],
  failure: RecoveryActionFailure | null,
): string | null {
  if (failure?.kind === 'post-result-load') {
    return `Campaign abandonment completed, but campaign storage could not be reread during ${failure.loadFailure.operation}. Reload before continuing.`;
  }
  if (failure?.kind === 'writer') {
    if (failure.failure.kind === 'writer-denied') {
      return 'Safe save ownership was denied. The campaign was not abandoned; you can try again.';
    }
    if (failure.failure.kind === 'writer-unavailable') {
      return 'Safe save ownership is unavailable. Campaign abandonment is disabled in this browser.';
    }
    if (failure.failure.writer.kind === 'operation-threw') {
      return 'The campaign abandonment operation threw before its outcome could be confirmed. Reload before continuing.';
    }
    return 'Safe save ownership returned an invalid protocol result during abandonment. Reload before continuing.';
  }
  return capability === 'unavailable'
    ? 'Safe save ownership is unavailable. Campaign abandonment is disabled in this browser.'
    : null;
}

function recoveryMutationBlocked(controller: CaribbeanController): boolean {
  const { recoveryFailure } = controller;
  if (controller.recoveryWriterCapability === 'unavailable') return true;
  if (recoveryFailure === null) return false;
  return recoveryFailure.kind === 'post-result-load'
    || recoveryFailure.failure.kind !== 'writer-denied';
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
            <button data-testid="caribbean-abandon-cancel-button" ref={cancelRef} type="button" onClick={onClose}>Cancel</button>
            <button
              data-testid="caribbean-abandon-confirm-button"
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
  identity,
  savingAvailable,
}: {
  controller: CaribbeanController;
  identity: CampaignSetupIdentity;
  savingAvailable: boolean;
}) {
  const [name, setName] = useState(() => identity.playerName.trim() || 'Captain');
  const [pronouns, setPronouns] = useState(() => normalizePronouns(identity.pronouns));
  const [talent, setTalent] = useState<Talent>('navigation');
  const [pronounsError, setPronounsError] = useState(false);
  const [abandonOpen, setAbandonOpen] = useState(false);
  const abandonRef = useRef<HTMLButtonElement>(null);
  const backgroundRef = useRef<HTMLDivElement>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalizedPronouns = normalizePronouns(pronouns);
    const captainName = name.trim() || 'Captain';
    try {
      identity.savePronouns(normalizedPronouns);
    } catch {
      // A Caribbean career captures its own pronoun snapshot even if the shared profile is unavailable.
    }
    void controller.start({
      name: captainName,
      pronouns: normalizedPronouns,
      talent,
      length: 'adventure',
    });
  };

  const changePronouns = (value: string) => {
    if (pronounCodePointLength(value) <= 24) {
      setPronouns(value);
      setPronounsError(false);
      return;
    }
    setPronounsError(true);
  };

  const cleanLoad = controller.load.kind === 'loaded'
    && !controller.load.recovered
    && controller.load.unreadableSlots.length === 0
      ? controller.load
      : null;
  const state = cleanLoad?.journal.state ?? controller.journal?.state ?? null;
  const showResume = cleanLoad !== null && controller.journal === null;
  const persistence = controller.persistence;
  const recoveryNotice = recoveryActionCopy(
    controller.recoveryWriterCapability,
    controller.recoveryFailure,
  );
  const recoveryBlocked = recoveryMutationBlocked(controller);
  const postResultLoadFailure = controller.recoveryFailure?.kind === 'post-result-load';
  const resumeBlocked = recoveryBlocked && controller.recoveryFailure !== null;

  return (
    <section className="caribbean-commission-panel" aria-label="Caribbean career setup">
      <div ref={backgroundRef} className="caribbean-commission-content">
        <p className="caribbean-place-line">Bridgetown · 1675</p>

        {state !== null && showResume ? (
          <div className="caribbean-save-summary">
            <h1>{postResultLoadFailure ? 'Campaign storage must be reread' : `${state.captain.name}’s commission`}</h1>
            {postResultLoadFailure ? (
              <p>
                The storage change completed, but this page will not infer the active campaign until storage can be read again.
              </p>
            ) : (
              <>
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
              </>
            )}
            <div className="caribbean-action-row">
              <button
                data-testid="caribbean-resume-career-button"
                className="caribbean-button-primary"
                type="button"
                disabled={controller.busy || resumeBlocked}
                aria-describedby={resumeBlocked ? 'campaign-recovery-action-status' : undefined}
                onClick={() => void controller.resume()}
              >
                Resume career
              </button>
              <button
                data-testid="caribbean-abandon-campaign-button"
                ref={abandonRef}
                type="button"
                disabled={controller.busy || recoveryBlocked}
                aria-describedby={recoveryBlocked ? 'campaign-recovery-action-status' : undefined}
                onClick={() => setAbandonOpen(true)}
              >
                Abandon campaign
              </button>
            </div>
            {recoveryNotice !== null && (
              <p id="campaign-recovery-action-status" className="caribbean-alert" role="alert">
                {recoveryNotice}
              </p>
            )}
          </div>
        ) : state === null ? (
          <form onSubmit={submit} noValidate>
            <h1>Sign a captain’s commission</h1>
            <p className="caribbean-intro">Choose your captain and their starting talent. Adventure begins from Bridgetown.</p>
            <div className="caribbean-form-grid">
              <div className="caribbean-field">
                <label htmlFor="caribbean-captain-name">Captain name</label>
                <input
                  data-testid="caribbean-captain-name-input"
                  id="caribbean-captain-name"
                  name="captain-name"
                  value={name}
                  maxLength={40}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="caribbean-field">
                <label htmlFor="caribbean-pronouns">Player pronouns</label>
                <input
                  data-testid="caribbean-pronouns-input"
                  id="caribbean-pronouns"
                  name="pronouns"
                  value={pronouns}
                  aria-describedby={pronounsError ? 'caribbean-pronouns-error' : undefined}
                  onChange={(event) => changePronouns(event.target.value)}
                />
                <span className="caribbean-field-help">Shared across every arcade game</span>
                {pronounsError && <p id="caribbean-pronouns-error" className="caribbean-field-error" role="alert">Use 24 characters or fewer</p>}
              </div>
              <div className="caribbean-field">
                <label htmlFor="caribbean-talent">Starting talent</label>
                <select data-testid="caribbean-starting-talent-select" id="caribbean-talent" value={talent} onChange={(event) => setTalent(event.target.value as Talent)}>
                  {TALENTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
            </div>
            <button data-testid="caribbean-start-career-button" className="caribbean-button-primary" type="submit" disabled={controller.busy}>Start career</button>
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
            <button data-testid="caribbean-continue-without-saving-button" type="button" onClick={controller.continueWithoutSaving}>Continue without saving</button>
          </div>
        )}
        {persistence.kind === 'save-conflict' && (
          <div className="caribbean-alert" role="alert">
            <p>A newer save exists. This tab will not overwrite or adopt it without your choice.</p>
            <div className="caribbean-action-row">
              <button data-testid="caribbean-reload-newer-save-button" type="button" onClick={() => void controller.reloadExternalSave()}>Reload newer save</button>
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
              <button data-testid="caribbean-continue-without-saving-button" type="button" onClick={controller.continueWithoutSaving}>Continue without saving</button>
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
