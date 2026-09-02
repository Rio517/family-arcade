import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { MirrorPage } from './MirrorPage';

/** The mirror sits on a route, so "close" can be seen to leave it. */
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/mirror']}>
      <Routes>
        <Route path="/" element={<p>Family game console</p>} />
        <Route path="/mirror" element={<MirrorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The mirror opened from somewhere else — a game, say, mid-play. */
function renderFromGame() {
  return render(
    <MemoryRouter initialEntries={['/chess']}>
      <Routes>
        <Route path="/" element={<p>Family game console</p>} />
        <Route path="/chess" element={<Link to="/mirror">Camera effects</Link>} />
        <Route path="/mirror" element={<MirrorPage />} />
      </Routes>
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
  it('opens the camera with the page and wires the stream up', async () => {
    let asked = 0;
    giveCamera(() => {
      asked++;
      return Promise.resolve(fakeStream);
    });
    renderPage();

    const video = (await screen.findByTestId('mirror-video')) as HTMLVideoElement;
    await waitFor(() => expect(video.srcObject).toBe(fakeStream));
    expect(asked).toBe(1);
    expect(screen.getByTestId('effect-toggle-dragon')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('effect-toggle-peace')).toHaveAttribute('aria-pressed', 'false');
    // With an effect on, the honest "still in testing" note is visible.
    expect(screen.getByTestId('mirror-beta-note')).toBeInTheDocument();

    // jsdom has no WebGL, so the overlay must land on its graceful fallback
    // instead of crashing the page (same contract as the other 3D scenes).
    expect(await screen.findByTestId('effects-fallback')).toBeInTheDocument();
  });

  it('says where the camera goes, on the glass', async () => {
    giveCamera(() => Promise.resolve(fakeStream));
    renderPage();
    await screen.findByTestId('mirror-video');
    expect(screen.getByText(/runs on this device alone/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing is recorded, saved, or sent/i)).toBeInTheDocument();
  });

  it('shows the friendly error when the camera is refused, and opens on a retry', async () => {
    let allow = false;
    giveCamera(() => (allow ? Promise.resolve(fakeStream) : Promise.reject(new Error('denied'))));
    renderPage();

    expect(await screen.findByTestId('mirror-error')).toBeInTheDocument();
    // The button becomes the retry path rather than a dead end.
    expect(screen.getByTestId('mirror-start')).toHaveTextContent(/try again/i);

    allow = true;
    fireEvent.click(screen.getByTestId('mirror-start'));
    expect(await screen.findByTestId('mirror-video')).toBeInTheDocument();
  });

  it('toggles effects from the chips', async () => {
    giveCamera(() => Promise.resolve(fakeStream));
    renderPage();
    const peace = await screen.findByTestId('effect-toggle-peace');
    fireEvent.click(peace);
    expect(peace).toHaveAttribute('aria-pressed', 'true');
    const dragon = screen.getByTestId('effect-toggle-dragon');
    fireEvent.click(dragon);
    expect(dragon).toHaveAttribute('aria-pressed', 'false');
  });

  it('tucks the controls away and brings them back', async () => {
    giveCamera(() => Promise.resolve(fakeStream));
    renderPage();
    const toggle = await screen.findByTestId('mirror-controls-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('effect-toggle-dragon')).not.toBeInTheDocument();
    // Tucked away, the effects keep running — only the panel is gone.
    expect(screen.getByTestId('mirror-video')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByTestId('effect-toggle-dragon')).toBeInTheDocument();
  });

  it('closes the panel on Escape', async () => {
    giveCamera(() => Promise.resolve(fakeStream));
    renderPage();
    await screen.findByTestId('mirror-controls-toggle');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.getByTestId('mirror-controls-toggle')).toHaveAttribute('aria-expanded', 'false'),
    );
  });

  it('closing the mirror stops the camera and goes back where you came from', async () => {
    giveCamera(() => Promise.resolve(fakeStream));
    renderFromGame();
    fireEvent.click(screen.getByText('Camera effects'));
    await screen.findByTestId('mirror-video');

    fireEvent.click(screen.getByTestId('mirror-close'));
    expect(stopped).toEqual(['video']);
    // Back to the game that opened it, not to the front page.
    expect(await screen.findByText('Camera effects')).toBeInTheDocument();
  });

  it('closing a mirror opened straight from a link goes to the arcade', async () => {
    giveCamera(() => Promise.resolve(fakeStream));
    renderPage();
    await screen.findByTestId('mirror-video');
    fireEvent.click(screen.getByTestId('mirror-close'));
    expect(stopped).toEqual(['video']);
    expect(screen.getByText('Family game console')).toBeInTheDocument();
  });
});
