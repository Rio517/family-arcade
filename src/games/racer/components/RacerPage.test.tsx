import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RacerPage } from './RacerPage';

/**
 * jsdom has no WebGL, so the real RacerScene constructor throws and Track3D
 * shows its fallback — which is exactly what the setup/HUD tests assert. The
 * win overlay, however, only appears after the animation loop runs, and the
 * loop never starts when scene construction fails. So the scene module is
 * wrapped: by default it defers to the real (throwing) constructor, and the
 * win-overlay tests flip `fake3d.enabled` to get an inert scene that lets the
 * loop drive the race to 20 coins.
 */
const fake3d = vi.hoisted(() => ({ enabled: false }));

vi.mock('../three/scene', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../three/scene')>();
  class RacerScene {
    constructor(...args: ConstructorParameters<typeof actual.RacerScene>) {
      if (!fake3d.enabled) {
        // The genuine no-WebGL failure path: the real constructor throws.
        return new actual.RacerScene(...args) as unknown as RacerScene;
      }
    }
    sync(): void {}
    render(): void {}
    dispose(): void {}
  }
  return { ...actual, RacerScene: RacerScene as unknown as typeof actual.RacerScene };
});

function renderRacer() {
  return render(
    <MemoryRouter>
      <RacerPage />
    </MemoryRouter>,
  );
}

/** Mode screen → driver picker. */
function goToPicker() {
  fireEvent.click(screen.getByTestId('racer-mode-solo'));
}

/** Mode screen → picker → pick a driver, which starts a solo race at once. */
function startSoloRace(driverId: string) {
  goToPicker();
  fireEvent.click(screen.getByTestId(`racer-driver-${driverId}`));
}

afterEach(() => vi.restoreAllMocks());

describe('<RacerPage> — solo setup flow', () => {
  it('offers 1-player and 2-player modes, and picking solo advances to the driver picker', () => {
    renderRacer();
    expect(screen.getByTestId('racer-mode-solo')).toHaveTextContent('1 Player');
    expect(screen.getByTestId('racer-mode-net')).toHaveTextContent('2 Players');

    goToPicker();
    expect(screen.getByText('Pick your racer')).toBeInTheDocument();
    expect(screen.queryByTestId('racer-mode-solo')).toBeNull();
  });

  it('lists all four drivers and starts a race when one is picked (3D falls back in jsdom)', async () => {
    // The failed scene construction is logged; keep the test output quiet.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderRacer();
    goToPicker();
    for (const id of ['unicorn', 'dragon', 'fairy', 'butterfly']) {
      expect(screen.getByTestId(`racer-driver-${id}`)).toBeInTheDocument();
    }

    fireEvent.click(screen.getByTestId('racer-driver-fairy'));
    // The race screen mounts; the 3D scene loads async and, without WebGL,
    // resolves to its fallback message.
    expect(await screen.findByTestId('racer3d-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('racer-driver-fairy')).toBeNull();
  });

  it('returns from the driver picker to the mode screen via the ‹ Menu button', () => {
    renderRacer();
    goToPicker();
    expect(screen.getByTestId('racer-driver-unicorn')).toBeInTheDocument();

    // On the picker the shell's ‹ Menu button steps back a phase, it does not navigate.
    fireEvent.click(screen.getByTestId('racer-back'));
    expect(screen.getByTestId('racer-mode-solo')).toBeInTheDocument();
    expect(screen.queryByTestId('racer-driver-unicorn')).toBeNull();
  });

  it('shows the picked driver and a 0/20 coin count in the race HUD', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderRacer();
    startSoloRace('dragon');
    await screen.findByTestId('racer3d-fallback');

    // The HUD scoreline: the dragon face, a bold coin count of 0, the /20 target,
    // and the elapsed-time readout.
    expect(screen.getByText('🐉')).toBeInTheDocument();
    expect(screen.getByText('0', { selector: 'b' })).toBeInTheDocument();
    expect(screen.getByText('/20')).toBeInTheDocument();
    expect(screen.getByText('⏱ 0.0s')).toBeInTheDocument();
  });
});

describe('<RacerPage> — solo win overlay', () => {
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    fake3d.enabled = true;
    frames = [];
    // Capture animation frames so the test drives the game loop by hand.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    // With rng pinned to 0 every coin spawns at the arena centre — right under
    // the kart's start spot — so each loop tick scoops a full field of 16.
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    fake3d.enabled = false;
  });

  /** Run the loop until the 20-coin target is passed (16 coins per tick). */
  async function winTheRace() {
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    await act(async () => {
      frames.shift()!(0); // collects 16 coins, field refills in place
      frames.shift()!(16); // collects 16 more → 32 ≥ 20 → race over
    });
  }

  it('shows the win overlay with the solo title once 20 coins are collected', async () => {
    renderRacer();
    startSoloRace('unicorn');
    await winTheRace();

    expect(screen.getByTestId('racer-win')).toBeInTheDocument();
    expect(screen.getByText('You got all 20 coins!')).toBeInTheDocument();
    expect(screen.getByText(/Your time:/)).toBeInTheDocument();
  });

  it('starts a fresh race from the win overlay via Race again', async () => {
    renderRacer();
    startSoloRace('unicorn');
    await winTheRace();

    fireEvent.click(screen.getByTestId('racer-again'));
    expect(screen.queryByTestId('racer-win')).toBeNull();
    // A brand-new race context: the coin count is back to 0.
    expect(screen.getByText('0', { selector: 'b' })).toBeInTheDocument();
    // Wait for the remounted scene to build (still faked) so its async import
    // doesn't land after this test's mocks are torn down.
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
  });

  it('returns from the win overlay to the mode screen via its Menu button', async () => {
    renderRacer();
    startSoloRace('unicorn');
    await winTheRace();

    fireEvent.click(screen.getByTestId('racer-win-menu'));
    expect(screen.getByTestId('racer-mode-solo')).toBeInTheDocument();
    expect(screen.queryByTestId('racer-win')).toBeNull();
  });
});
