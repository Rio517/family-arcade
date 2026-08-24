import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCampaign } from '../../domain/createCampaign';
import { createJournal } from '../../domain/replay';
import { serializeRecoveryExport, type RecoveryContinuation } from '../../storage/recovery';
import type { LoadResult } from '../../storage/persistence';
import type { CaribbeanController, CaribbeanPersistencePhase, ContinuationRequiredRecoveryResult } from '../../state/useCaribbean';
import { RecoveryPanel } from './RecoveryPanel';

const REVISION = { currentRaw: '{corrupt', previousRaw: '{known-good}' };
const UNREADABLE = [{ slot: 'current' as const, raw: '{corrupt', code: 'malformed-json' as const }];

function degradedLoad(): Extract<LoadResult, { kind: 'loaded' }> {
  return {
    kind: 'loaded',
    journal: createJournal(createCampaign({ seed: 1702, name: 'Morgan' })),
    savedAt: 100,
    build: 'fixture',
    recovered: true,
    unreadableSlots: UNREADABLE,
    revision: REVISION,
  };
}

function unreadableLoad(): Extract<LoadResult, { kind: 'unreadable' }> {
  return { kind: 'unreadable', unreadableSlots: UNREADABLE, revision: REVISION };
}

function controller(overrides: Partial<CaribbeanController> = {}): CaribbeanController {
  return {
    load: degradedLoad(),
    journal: null,
    activity: 'menu',
    busy: false,
    persistence: { kind: 'recovery-required' },
    recoveryWriterCapability: 'available',
    recoveryFailure: null,
    start: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    continueWithoutSaving: vi.fn(),
    dispatch: vi.fn().mockResolvedValue(undefined),
    retrySaving: vi.fn().mockResolvedValue(undefined),
    reloadExternalSave: vi.fn().mockResolvedValue(undefined),
    exportInMemoryJournal: vi.fn(() => null),
    recover: vi.fn().mockResolvedValue(undefined),
    continueRecovery: vi.fn().mockResolvedValue(undefined),
    abandon: vi.fn().mockResolvedValue(undefined),
    selectActivity: vi.fn(),
    closeActivity: vi.fn(),
    ...overrides,
  };
}

function withRecoveryState(
  view: CaribbeanController,
  state: Pick<CaribbeanController, 'recoveryWriterCapability' | 'recoveryFailure'>,
): CaribbeanController {
  return Object.assign(view, state);
}

function expectControlIds(container: HTMLElement, expected: string[]): void {
  const controls = [...container.querySelectorAll<HTMLElement>('input, select, button')];
  expect(controls.map((control) => control.dataset.testid)).toEqual(expected);
  expect(new Set(expected).size).toBe(expected.length);
}

const continuation: RecoveryContinuation = {
  action: 'recover',
  stage: 'cleanup',
  quarantineKey: 'caribbean:campaign:quarantine:one',
  quarantineRaw: '{"quarantine":"exact"}',
  sourceRevision: REVISION,
  remaining: { kind: 'known', revision: REVISION },
  republish: {
    journal: degradedLoad().journal,
    build: 'fixture',
    savedAt: 200,
  },
};

function continuationPhase(cause: 'storage-unavailable' | 'partial-cleanup' | 'republish-failed'): CaribbeanPersistencePhase {
  const common = {
    ok: false as const,
    reason: 'continuation-required' as const,
    quarantineKey: continuation.quarantineKey,
    continuation,
  };
  const result: ContinuationRequiredRecoveryResult = cause === 'storage-unavailable'
    ? { ...common, cause, failedOperation: 'read-quarantine' }
    : cause === 'partial-cleanup'
      ? { ...common, cause, failedOperation: 'remove-current' }
      : {
          ...common,
          cause,
          saveFailure: { ok: false, reason: 'storage-unavailable', operation: 'write-current' },
        };
  return { kind: 'recovery-continuation', result };
}

describe('<RecoveryPanel>', () => {
  let capturedBlob: { parts: unknown[] } | null;

  beforeEach(() => {
    capturedBlob = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.stubGlobal('Blob', class {
      parts: unknown[];
      constructor(parts: unknown[]) {
        this.parts = parts;
        capturedBlob = { parts };
      }
    });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:recovery'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('offers exact export, known-good recovery, and confirmed abandonment for a degraded save', () => {
    const view = controller();
    render(<RecoveryPanel controller={view} />);

    expect(screen.getByRole('heading', { name: 'Campaign recovery required' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Download recovery file' }));
    expect(capturedBlob?.parts).toEqual([serializeRecoveryExport(REVISION, UNREADABLE)]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:recovery');

    fireEvent.click(screen.getByRole('button', { name: 'Recover known-good campaign' }));
    expect(view.recover).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Abandon campaign' }));
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Quarantine and abandon' }));
    expect(view.abandon).toHaveBeenCalledTimes(1);
  });

  it('offers export and abandonment but no false recovery when both slots are unreadable', () => {
    const view = controller({ load: unreadableLoad() });
    render(<RecoveryPanel controller={view} />);
    expect(screen.getByRole('button', { name: 'Download recovery file' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abandon campaign' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recover known-good campaign' })).not.toBeInTheDocument();
  });

  it.each([
    ['storage-unavailable', 'Storage became unavailable during read-quarantine.'],
    ['partial-cleanup', 'Cleanup stopped during remove-current.'],
    ['republish-failed', 'The recovered campaign could not be published during write-current.'],
  ] as const)('keeps truthful %s continuation diagnostics and reuses the same continuation', (cause, copy) => {
    const view = controller({ persistence: continuationPhase(cause) });
    render(<RecoveryPanel controller={view} />);

    expect(screen.getByRole('alert')).toHaveTextContent(copy);
    expect(screen.getByText(/quarantine:one · cleanup/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry recovery' }));
    expect(view.continueRecovery).toHaveBeenCalledWith('continue');
    fireEvent.click(screen.getByRole('button', { name: 'Abandon from quarantine' }));
    expect(view.continueRecovery).toHaveBeenCalledWith('abandon');
  });

  it('removes destructive continuation actions when quarantine was invalidated', () => {
    const persistence: CaribbeanPersistencePhase = {
      kind: 'recovery-blocked',
      result: {
        ok: false,
        reason: 'quarantine-invalidated',
        cause: 'quarantine-changed',
        quarantineKey: continuation.quarantineKey,
        expectedRaw: continuation.quarantineRaw,
        actualRaw: '{foreign}',
        stage: 'cleanup',
        sourceRevision: REVISION,
      },
    };
    render(<RecoveryPanel controller={controller({ persistence })} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/quarantine copy changed/i);
    expect(screen.queryByRole('button', { name: /retry recovery/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /abandon from quarantine/i })).not.toBeInTheDocument();
  });

  it.each([
    [
      'active revision conflict',
      { ok: false, reason: 'active-revision-conflict', expected: REVISION, actual: { currentRaw: '{new}', previousRaw: null } },
      'The active campaign changed before quarantine.',
    ],
    [
      'quarantine collision',
      { ok: false, reason: 'quarantine-collision', quarantineKey: continuation.quarantineKey, expectedRaw: continuation.quarantineRaw, actualRaw: '{foreign}' },
      'The selected quarantine key already belongs to a different recovery copy.',
    ],
    [
      'storage failure before verification',
      { ok: false, reason: 'storage-unavailable', stage: 'before-quarantine', operation: 'verify-quarantine' },
      'Storage became unavailable during verify-quarantine, before quarantine was verified.',
    ],
    [
      'invalid recovery source',
      { ok: false, reason: 'invalid-recovery-source' },
      'The loaded save is not a valid recovery source.',
    ],
  ] as const)('retains truthful blocked diagnostics for %s', (_label, result, copy) => {
    const persistence = { kind: 'recovery-blocked', result } as CaribbeanPersistencePhase;
    render(<RecoveryPanel controller={controller({ persistence })} />);

    expect(screen.getByRole('alert')).toHaveTextContent(copy);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers only verified download, reload, or cancel after an external revision conflict', () => {
    const persistence: CaribbeanPersistencePhase = {
      kind: 'recovery-blocked',
      result: {
        ok: false,
        reason: 'external-revision-conflict',
        cause: 'active-revision-conflict',
        quarantineKey: continuation.quarantineKey,
        quarantineRaw: continuation.quarantineRaw,
        stage: 'cleanup',
        sourceRevision: REVISION,
        actualRevision: { currentRaw: '{external}', previousRaw: null },
      },
    };
    const view = controller({ persistence });
    render(<RecoveryPanel controller={view} />);

    expect(screen.getByRole('button', { name: 'Download verified quarantine' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reload newer save' }));
    expect(view.reloadExternalSave).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /abandon/i })).not.toBeInTheDocument();
  });

  it('disables recovery mutations with an adjacent reason when safe writer ownership is unavailable', () => {
    const view = withRecoveryState(controller(), {
      recoveryWriterCapability: 'unavailable',
      recoveryFailure: null,
    });
    render(<RecoveryPanel controller={view} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/safe save ownership is unavailable/i);
    expect(screen.getByRole('button', { name: 'Download recovery file' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Recover known-good campaign' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Abandon campaign' })).toBeDisabled();
  });

  it('renders denied ownership truthfully while leaving a safe retry available', () => {
    const view = withRecoveryState(controller(), {
      recoveryWriterCapability: 'available',
      recoveryFailure: {
        kind: 'writer', action: 'recover', failure: { kind: 'writer-denied', error: new Error('denied') },
      },
    });
    render(<RecoveryPanel controller={view} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/ownership was denied/i);
    expect(screen.getByRole('button', { name: 'Recover known-good campaign' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Abandon campaign' })).toBeEnabled();
  });

  it('retains a completed recovery plus typed post-result read failure and disables stale actions', () => {
    const view = withRecoveryState(controller(), {
      recoveryWriterCapability: 'available',
      recoveryFailure: {
        kind: 'post-result-load',
        action: 'recover',
        result: {
          ok: true,
          kind: 'recovered',
          quarantineKey: continuation.quarantineKey,
          revision: REVISION,
          journal: degradedLoad().journal,
        },
        loadFailure: { kind: 'storage-unavailable', operation: 'read-current' },
      },
    });
    render(<RecoveryPanel controller={view} />);

    expect(screen.getByRole('heading', { name: 'Campaign storage must be reread' })).toBeInTheDocument();
    expect(screen.queryByText(/active save could not be used as-is/i)).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/recovery completed/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/read-current/i);
    expect(screen.getByRole('button', { name: 'Recover known-good campaign' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Abandon campaign' })).toBeDisabled();
  });

  it('gives every recovery, continuation, conflict, and modal control a stable semantic test id', () => {
    let rendered = render(<RecoveryPanel controller={controller()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abandon campaign' }));
    expectControlIds(rendered.container, [
      'caribbean-download-recovery-button',
      'caribbean-recover-known-good-button',
      'caribbean-abandon-campaign-button',
      'caribbean-abandon-cancel-button',
      'caribbean-abandon-confirm-button',
    ]);
    cleanup();

    rendered = render(<RecoveryPanel controller={controller({
      persistence: continuationPhase('partial-cleanup'),
    })} />);
    expectControlIds(rendered.container, [
      'caribbean-retry-recovery-button',
      'caribbean-abandon-from-quarantine-button',
    ]);
    cleanup();

    const persistence: CaribbeanPersistencePhase = {
      kind: 'recovery-blocked',
      result: {
        ok: false,
        reason: 'external-revision-conflict',
        cause: 'active-revision-conflict',
        quarantineKey: continuation.quarantineKey,
        quarantineRaw: continuation.quarantineRaw,
        stage: 'cleanup',
        sourceRevision: REVISION,
        actualRevision: { currentRaw: '{external}', previousRaw: null },
      },
    };
    rendered = render(<RecoveryPanel controller={controller({ persistence })} />);
    expectControlIds(rendered.container, [
      'caribbean-download-verified-quarantine-button',
      'caribbean-reload-newer-save-button',
      'caribbean-recovery-cancel-button',
    ]);
  });
});
