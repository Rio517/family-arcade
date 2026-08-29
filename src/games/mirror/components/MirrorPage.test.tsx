import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MirrorPage } from './MirrorPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <MirrorPage />
    </MemoryRouter>,
  );
}

const stopped: string[] = [];
const fakeStream = {
  getTracks: () => [{ stop: () => stopped.push('video') }],
} as unknown as MediaStream;

function giveCamera(impl: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: impl },
    configurable: true,
  });
}

beforeEach(() => {
  stopped.length = 0;
});
afterEach(() => {
  Reflect.deleteProperty(navigator, 'mediaDevices');
});

describe('MirrorPage', () => {
  it('starts closed, with the privacy promise and no camera request', () => {
    renderPage();
    expect(screen.getByTestId('mirror-start')).toBeInTheDocument();
    expect(screen.getByText(/nothing is recorded or sent/i)).toBeInTheDocument();
    expect(screen.queryByTestId('mirror-video')).not.toBeInTheDocument();
  });

  it('shows the friendly error when the camera is denied', async () => {
    giveCamera(() => Promise.reject(new Error('denied')));
    renderPage();
    fireEvent.click(screen.getByTestId('mirror-start'));
    expect(await screen.findByTestId('mirror-error')).toBeInTheDocument();
    // The button becomes the retry path rather than a dead end.
    expect(screen.getByTestId('mirror-start')).toHaveTextContent(/try again/i);
  });

  it('opens the mirror, wires the stream, and defaults the dragon on', async () => {
    giveCamera(() => Promise.resolve(fakeStream));
    renderPage();
    fireEvent.click(screen.getByTestId('mirror-start'));

    const video = (await screen.findByTestId('mirror-video')) as HTMLVideoElement;
    await waitFor(() => expect(video.srcObject).toBe(fakeStream));
    expect(screen.getByTestId('effect-toggle-dragon')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('effect-toggle-peace')).toHaveAttribute('aria-pressed', 'false');
    // With an effect on, the honest "still in testing" note is visible.
    expect(screen.getByTestId('mirror-beta-note')).toBeInTheDocument();

    // jsdom has no WebGL, so the overlay must land on its graceful fallback
    // instead of crashing the page (same contract as the other 3D scenes).
    expect(await screen.findByTestId('effects-fallback')).toBeInTheDocument();
  });

  it('toggles effects from the chips', async () => {
    giveCamera(() => Promise.resolve(fakeStream));
    renderPage();
    fireEvent.click(screen.getByTestId('mirror-start'));
    const peace = await screen.findByTestId('effect-toggle-peace');
    fireEvent.click(peace);
    expect(peace).toHaveAttribute('aria-pressed', 'true');
    const dragon = screen.getByTestId('effect-toggle-dragon');
    fireEvent.click(dragon);
    expect(dragon).toHaveAttribute('aria-pressed', 'false');
  });

  it('closing the mirror stops the camera tracks', async () => {
    giveCamera(() => Promise.resolve(fakeStream));
    renderPage();
    fireEvent.click(screen.getByTestId('mirror-start'));
    await screen.findByTestId('mirror-video');
    fireEvent.click(screen.getByTestId('mirror-close'));
    expect(stopped).toEqual(['video']);
    expect(screen.getByTestId('mirror-start')).toBeInTheDocument();
  });
});
