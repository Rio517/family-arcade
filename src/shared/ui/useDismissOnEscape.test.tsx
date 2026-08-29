import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { useDismissOnEscape } from './useDismissOnEscape';

function Dialog({ open, onDismiss }: { open: boolean; onDismiss: () => void }) {
  useDismissOnEscape(open, onDismiss);
  return <div data-testid="dialog">{open ? 'open' : 'closed'}</div>;
}

const escape = () => fireEvent.keyDown(window, { key: 'Escape' });

describe('useDismissOnEscape', () => {
  it('dismisses on Escape while open', () => {
    const onDismiss = vi.fn();
    render(<Dialog open onDismiss={onDismiss} />);
    escape();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape while closed', () => {
    const onDismiss = vi.fn();
    render(<Dialog open={false} onDismiss={onDismiss} />);
    escape();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('ignores other keys', () => {
    const onDismiss = vi.fn();
    render(<Dialog open onDismiss={onDismiss} />);
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 'a' });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('stops listening once closed', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<Dialog open onDismiss={onDismiss} />);
    rerender(<Dialog open={false} onDismiss={onDismiss} />);
    escape();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('closes only the dialog opened last when two are open', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    const { rerender } = render(
      <>
        <Dialog open onDismiss={outer} />
        <Dialog open onDismiss={inner} />
      </>,
    );
    escape();
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();

    // The inner one closes; the next Escape reaches the outer one.
    rerender(
      <>
        <Dialog open onDismiss={outer} />
        <Dialog open={false} onDismiss={inner} />
      </>,
    );
    escape();
    expect(outer).toHaveBeenCalledTimes(1);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('calls the latest callback without resubscribing', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Dialog open onDismiss={first} />);
    rerender(<Dialog open onDismiss={second} />);
    escape();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
