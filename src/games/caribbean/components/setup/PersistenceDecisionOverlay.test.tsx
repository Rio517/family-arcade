import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CaribbeanController } from '../../state/useCaribbean';

function controller(kind: 'consent-required' | 'save-conflict'): CaribbeanController {
  return {
    persistence: kind === 'consent-required'
      ? { kind, intent: 'event', failure: { kind: 'writer-denied' } }
      : { kind, expected: { currentRaw: 'old', previousRaw: null }, actual: { currentRaw: 'new', previousRaw: 'old' } },
    busy: false,
    continueWithoutSaving: vi.fn(), reloadExternalSave: vi.fn(),
    exportInMemoryJournal: vi.fn(() => '{"journal":"exact"}'),
  } as unknown as CaribbeanController;
}

describe('<PersistenceDecisionOverlay>', () => {
  it.each(['consent-required', 'save-conflict'] as const)(
    'traps focus in the required persistence overlay for %s',
    async (kind) => {
      const modulePath = './PersistenceDecision' + 'Overlay';
      const { PersistenceDecisionOverlay } = await import(/* @vite-ignore */ modulePath);
      const backgroundRef = createRef<HTMLElement>();
      const view = controller(kind);
      const { container } = render(
        <main>
          <section ref={backgroundRef} data-testid="active-route"><button type="button">Route action</button></section>
          <PersistenceDecisionOverlay controller={view} backgroundRef={backgroundRef} />
        </main>,
      );

      const dialog = screen.getByTestId('campaign-persistence-dialog');
      expect(dialog).toHaveAttribute('role', 'dialog');
      expect(screen.getByTestId('active-route')).toHaveAttribute('inert');
      const controls = dialog.querySelectorAll('button');
      expect(controls[0]).toHaveFocus();
      controls[controls.length - 1]?.focus();
      fireEvent.keyDown(window, { key: 'Tab' });
      expect(controls[0]).toHaveFocus();
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.getByTestId('campaign-persistence-dialog')).toBeInTheDocument();
      expect(container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    },
  );

  it('keeps export non-publishing and preserves the active route', async () => {
    const modulePath = './PersistenceDecision' + 'Overlay';
    const { PersistenceDecisionOverlay } = await import(/* @vite-ignore */ modulePath);
    const backgroundRef = createRef<HTMLElement>();
    const view = controller('save-conflict');
    render(
      <main>
        <section ref={backgroundRef} data-testid="active-route">Encounter route</section>
        <PersistenceDecisionOverlay controller={view} backgroundRef={backgroundRef} />
      </main>,
    );
    fireEvent.click(screen.getByTestId('caribbean-export-in-memory-journal-button'));
    expect(view.exportInMemoryJournal).toHaveBeenCalledTimes(1);
    expect(view.continueWithoutSaving).not.toHaveBeenCalled();
    expect(view.reloadExternalSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('active-route')).toHaveTextContent('Encounter route');
  });
});
