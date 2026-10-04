import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MOVED_SEEN_KEY, MovedNotice, OLD_HOST } from './MovedNotice';

describe('MovedNotice', () => {
  beforeEach(() => localStorage.clear());

  it('says once, on the old address, that the arcade lives at familyarcade.eu', () => {
    render(<MovedNotice host={OLD_HOST} />);
    const dialog = screen.getByRole('dialog', { name: 'The arcade has a new home!' });
    expect(dialog).toHaveTextContent('This address keeps working, so you can keep playing here too.');
    expect(screen.getByTestId('moved-go')).toHaveAttribute('href', 'https://familyarcade.eu/');
    expect(screen.getByTestId('moved-go')).toHaveFocus();
  });

  it('never shows anywhere else', () => {
    for (const host of ['familyarcade.eu', 'localhost', '100.76.56.13']) {
      const { unmount } = render(<MovedNotice host={host} />);
      expect(screen.queryByTestId('moved-notice')).toBeNull();
      unmount();
    }
  });

  it('Keep playing here closes it, and it stays closed on this device', () => {
    const { unmount } = render(<MovedNotice host={OLD_HOST} />);
    fireEvent.click(screen.getByTestId('moved-stay'));
    expect(screen.queryByTestId('moved-notice')).toBeNull();
    expect(localStorage.getItem(MOVED_SEEN_KEY)).not.toBeNull();
    unmount();
    render(<MovedNotice host={OLD_HOST} />);
    expect(screen.queryByTestId('moved-notice')).toBeNull();
  });

  it('Escape and a tap on the backdrop mean keep playing here', () => {
    const { unmount } = render(<MovedNotice host={OLD_HOST} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('moved-notice')).toBeNull();
    unmount();
    localStorage.clear();
    render(<MovedNotice host={OLD_HOST} />);
    fireEvent.click(screen.getByTestId('moved-notice'));
    expect(screen.queryByTestId('moved-notice')).toBeNull();
    expect(localStorage.getItem(MOVED_SEEN_KEY)).not.toBeNull();
  });

  it('going to the new address counts as seen too', () => {
    render(<MovedNotice host={OLD_HOST} />);
    const go = screen.getByTestId('moved-go');
    // jsdom does not navigate; the click still runs the handler.
    go.addEventListener('click', (e) => e.preventDefault());
    fireEvent.click(go);
    expect(localStorage.getItem(MOVED_SEEN_KEY)).not.toBeNull();
  });

  it('keeps Tab inside the card', () => {
    render(<MovedNotice host={OLD_HOST} />);
    const go = screen.getByTestId('moved-go');
    const stay = screen.getByTestId('moved-stay');
    stay.focus();
    fireEvent.keyDown(stay, { key: 'Tab' });
    expect(go).toHaveFocus();
    fireEvent.keyDown(go, { key: 'Tab', shiftKey: true });
    expect(stay).toHaveFocus();
  });
});
