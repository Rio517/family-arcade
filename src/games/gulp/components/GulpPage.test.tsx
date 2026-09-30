import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { seededRng } from '@shared/rng';
import { addUser, emptyUsersState, setActiveUser } from '@shared/profile/users';
import { getUsersSnapshot, setUsersState } from '@shared/profile/usersStore';
import type { GulpScene as GulpSceneType } from '../three/scene';
import { GulpPage } from './GulpPage';

/**
 * jsdom has no WebGL, so a real scene can't be built. The page takes the
 * scene loader as a prop: `broken` behaves like a device without 3D (the
 * constructor throws, the stage shows its fallback); `inert` stands in for a
 * working scene, so the frame loop runs the round.
 */
class InertScene {
  sync(): void {}
  render(): void {}
  dispose(): void {}
}
class BrokenScene extends InertScene {
  constructor() {
    super();
    throw new Error('Error creating WebGL context.');
  }
}
const inert = () => Promise.resolve({ GulpScene: InertScene as unknown as typeof GulpSceneType });
const broken = () => Promise.resolve({ GulpScene: BrokenScene as unknown as typeof GulpSceneType });
const fake3d = { enabled: false };

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/gulp']}>
      <GulpPage rng={seededRng(3)} load={fake3d.enabled ? inert : broken} />
    </MemoryRouter>,
  );
}

const rio = () => getUsersSnapshot().users.find((u) => u.id === 'u1')?.profile;

beforeEach(() => {
  localStorage.clear();
  fake3d.enabled = false;
  // Rio is signed in — in the app the router's ticket gate guarantees it.
  setUsersState(setActiveUser(addUser(emptyUsersState(), 'u1', 'Rio'), 'u1'));
});

describe('GulpPage', () => {
  it('opens on the menu over the city, with a fallback where 3D is missing', async () => {
    renderPage();
    expect(screen.getByTestId('gulp-menu')).toBeInTheDocument();
    expect(screen.getByTestId('gulp-play')).toBeInTheDocument();
    expect(screen.getAllByRole('radio', { name: /Blueberry|Bubblegum|Lime/ })).toHaveLength(3);
    for (const m of ['town', 'city', 'mega', 'region']) expect(screen.getByTestId(`gulp-map-${m}`)).toBeInTheDocument();
    expect(await screen.findByTestId('gulp3d-fallback', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('remembers the choices made on the menu', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('gulp-map-region'));
    fireEvent.click(screen.getByTestId('gulp-skin-3'));
    fireEvent.click(screen.getByTestId('gulp-fightback'));
    fireEvent.click(screen.getByTestId('gulp-powerups'));
    fireEvent.click(screen.getByTestId('gulp-time-long'));
    expect(screen.getByTestId('gulp-map-region')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('gulp-fightback')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('gulp-powerups')).toHaveAttribute('aria-pressed', 'false');
    // The Region's own round is 5 minutes, so the long one is 10.
    expect(screen.getByTestId('gulp-time-long')).toHaveTextContent('10 min');
    const saved = JSON.parse(localStorage.getItem('gulp:settings:v1') ?? '{}');
    expect(saved).toMatchObject({ map: 'region', skin: 3, fightBack: true, powerups: false, length: 'long' });
  });

  it('PLAY starts a round: countdown, then the leaderboard with the rivals for the map', async () => {
    fake3d.enabled = true;
    renderPage();
    fireEvent.click(screen.getByTestId('gulp-map-town'));
    fireEvent.click(screen.getByTestId('gulp-play'));
    expect(screen.queryByTestId('gulp-menu')).not.toBeInTheDocument();
    expect(screen.getByTestId('gulp-hud')).toBeInTheDocument();
    expect(screen.getByTestId('gulp-countdown')).toHaveTextContent('3');
    // Town: the child and three computer holes.
    expect(screen.getByTestId('gulp-board').querySelectorAll('li')).toHaveLength(4);
    expect(screen.getByTestId('gulp-board')).toHaveTextContent('You');
    expect(screen.getByTestId('gulp-clock')).toHaveTextContent('2:00');
  });

  it('pauses from the button and from Escape, and goes back to the menu', async () => {
    fake3d.enabled = true;
    renderPage();
    fireEvent.click(screen.getByTestId('gulp-play'));
    fireEvent.click(screen.getByTestId('gulp-pause'));
    expect(screen.getByTestId('gulp-paused')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('gulp-paused')).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('gulp-paused')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('gulp-menu-btn'));
    expect(screen.getByTestId('gulp-menu')).toBeInTheDocument();
  });

  it('an endless round ends from the pause card, shows the results and records them once', async () => {
    fake3d.enabled = true;
    // Capture animation frames so the test drives the loop by hand.
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    let now = 0;
    const pump = async (n: number) => {
      for (let i = 0; i < n; i++) {
        const next = frames.splice(0);
        now += 16;
        await act(async () => {
          for (const cb of next) cb(now);
        });
      }
    };
    renderPage();
    fireEvent.click(screen.getByTestId('gulp-time-endless'));
    fireEvent.click(screen.getByTestId('gulp-play'));
    // The scene module loads asynchronously; then the loop asks for frames.
    await waitFor(() => expect(frames.length).toBeGreaterThan(0), { timeout: 8000 });
    await pump(5);
    fireEvent.click(screen.getByTestId('gulp-pause'));
    fireEvent.click(screen.getByTestId('gulp-end'));
    await pump(3);
    const results = screen.getByTestId('gulp-results');
    expect(results).toHaveTextContent('Round over');
    expect(results.querySelectorAll('li')).toHaveLength(5);
    expect(rio()?.history?.filter((h) => h.game === 'gulp')).toHaveLength(1);
    // More frames go by: still one record.
    await pump(10);
    expect(rio()?.history?.filter((h) => h.game === 'gulp')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('gulp-results-menu'));
    expect(screen.getByTestId('gulp-menu')).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
