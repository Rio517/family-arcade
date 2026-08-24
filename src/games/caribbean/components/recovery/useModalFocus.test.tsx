import { useRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useModalFocus } from './useModalFocus';

function Harness() {
  const [open, setOpen] = useState(false);
  const backgroundRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  useModalFocus({
    active: open,
    dialogRef,
    initialFocusRef: cancelRef,
    returnFocusRef: openerRef,
    backgroundRef,
    onDismiss: () => setOpen(false),
  });

  return (
    <>
      <section ref={backgroundRef} data-testid="background">
        <button ref={openerRef} type="button" onClick={() => setOpen(true)}>Abandon campaign</button>
      </section>
      {open && (
        <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="focus-title">
          <h2 id="focus-title">Abandon campaign?</h2>
          <button ref={cancelRef} type="button" onClick={() => setOpen(false)}>Cancel</button>
          <button type="button">Quarantine and abandon</button>
        </section>
      )}
    </>
  );
}

describe('useModalFocus', () => {
  it('makes the background inert, focuses Cancel, traps both Tab directions, and restores the opener', () => {
    render(<Harness />);

    const opener = screen.getByRole('button', { name: 'Abandon campaign' });
    fireEvent.click(opener);

    const background = screen.getByTestId('background');
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const confirm = screen.getByRole('button', { name: 'Quarantine and abandon' });
    expect(screen.getByRole('dialog', { name: 'Abandon campaign?' })).toHaveAttribute('aria-modal', 'true');
    expect(background).toHaveAttribute('inert');
    expect(cancel).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(cancel).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(background).not.toHaveAttribute('inert');
    expect(opener).toHaveFocus();
  });

  it('restores a pre-existing inert attribute after the dialog lifecycle', () => {
    const { container } = render(<Harness />);
    const background = container.querySelector('[data-testid="background"]')!;
    background.setAttribute('inert', 'persist');

    fireEvent.click(screen.getByRole('button', { name: 'Abandon campaign' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(background).toHaveAttribute('inert', 'persist');
  });
});
