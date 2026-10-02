import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { seededRng } from '@shared/rng';
import { addUser, emptyUsersState, setActiveUser } from '@shared/profile/users';
import { getUsersSnapshot, setUsersState } from '@shared/profile/usersStore';
import type { World } from '../domain/world';
import type { GulpScene as GulpSceneType } from '../three/scene';
import { fakeParty } from '@shared/party/testing';
import type { PartyValue } from '@shared/party/PartyContext';
import { GulpPage } from './GulpPage';

// The page reads the arcade's Play together party; here nobody is linked.
const mockParty = vi.hoisted(() => ({ value: null as PartyValue | null }));
vi.mock('@shared/party/PartyContext', () => ({ useParty: () => mockParty.value }));

// No broker in jsdom: a peer that registers and never hears from anyone.
vi.mock('peerjs', () => ({
  default: class {
    on(): void {}
    connect() {
      return { on() {}, close() {}, removeAllListeners() {}, open: false };
    }
    reconnect(): void {}
    destroy(): void {}
  },
}));

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

/** Rounds already kept on the device, as `gulp:scores:v1` holds them. */
function seedScores(rounds: Array<Record<string, unknown>>) {
  const base = { map: 'city', difficulty: 'easy', level: 5, rank: 2 };
  localStorage.setItem('gulp:scores:v1', JSON.stringify({ v: 1, adopted: [], rounds: rounds.map((r) => ({ ...base, ...r })) }));
}

/** Capture animation frames so a test drives the round's loop by hand. */
function frameDriver() {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    frames.push(cb);
    return frames.length;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  let now = 0;
  return {
    started: () => waitFor(() => expect(frames.length).toBeGreaterThan(0), { timeout: 8000 }),
    pump: async (n: number) => {
      for (let i = 0; i < n; i++) {
        const next = frames.splice(0);
        now += 16;
        await act(async () => {
          for (const cb of next) cb(now);
        });
      }
    },
  };
}

beforeEach(() => {
  mockParty.value = fakeParty();
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
    for (const m of ['town', 'city', 'mega', 'region']) expect(screen.getByTestId(`gulp-map-${m}`)).toBeInTheDocument();
    // Only the map and the time on the card: the rest is behind Options.
    expect(screen.queryByTestId('gulp-skin-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('gulp-powerups')).not.toBeInTheDocument();
    expect(await screen.findByTestId('gulp3d-fallback', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('remembers the choices made on the menu and under Options', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('gulp-map-region'));
    fireEvent.click(screen.getByTestId('gulp-time-long'));
    fireEvent.click(screen.getByTestId('gulp-options'));
    expect(screen.getAllByRole('radio', { name: /Blueberry|Bubblegum|Lime/ })).toHaveLength(3);
    fireEvent.click(screen.getByTestId('gulp-skin-3'));
    fireEvent.click(screen.getByTestId('gulp-fightback'));
    fireEvent.click(screen.getByTestId('gulp-powerups'));
    fireEvent.click(screen.getByTestId('gulp-regrow'));
    expect(screen.getByTestId('gulp-map-region')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('gulp-fightback')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('gulp-powerups')).toHaveAttribute('aria-pressed', 'false');
    // The Region's own round is 6 minutes, so the long one is 12.
    expect(screen.getByTestId('gulp-time-long')).toHaveTextContent('12 min');
    const saved = JSON.parse(localStorage.getItem('gulp:settings:v1') ?? '{}');
    expect(saved).toMatchObject({ map: 'region', skin: 3, fightBack: true, powerups: false, regrow: false, length: 'long' });
    // Escape closes the options.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('gulp-options-dialog')).not.toBeInTheDocument();
  });

  it('the difficulty starts on Easy, is chosen under Options, remembered and named on the card', () => {
    // Settings saved before there was a choice still play Easy.
    localStorage.setItem('gulp:settings:v1', JSON.stringify({ map: 'town', length: 'short' }));
    renderPage();
    expect(screen.getByTestId('gulp-difficulty-shown')).toHaveTextContent('Easy');
    fireEvent.click(screen.getByTestId('gulp-options'));
    expect(screen.getByRole('radiogroup', { name: 'Difficulty' })).toBeInTheDocument();
    expect(screen.getByTestId('gulp-difficulty-easy')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('gulp-difficulty-hard')).toHaveTextContent('They hunt you!');
    fireEvent.click(screen.getByTestId('gulp-difficulty-hard'));
    expect(screen.getByTestId('gulp-difficulty-hard')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('gulp-difficulty-easy')).toHaveAttribute('aria-checked', 'false');
    expect(JSON.parse(localStorage.getItem('gulp:settings:v1') ?? '{}')).toMatchObject({ map: 'town', difficulty: 'hard' });
    fireEvent.click(screen.getByTestId('gulp-options-done'));
    expect(screen.getByTestId('gulp-difficulty-shown')).toHaveTextContent('Hard');
  });

  it('PLAY starts a round: countdown, then the leaderboard with the rivals for the map', async () => {
    fake3d.enabled = true;
    renderPage();
    fireEvent.click(screen.getByTestId('gulp-map-town'));
    fireEvent.click(screen.getByTestId('gulp-play'));
    expect(screen.queryByTestId('gulp-menu')).not.toBeInTheDocument();
    expect(screen.getByTestId('gulp-hud')).toBeInTheDocument();
    expect(screen.getByTestId('gulp-countdown')).toHaveTextContent('3');
    // Town: the child and four computer holes.
    expect(screen.getByTestId('gulp-board').querySelectorAll('li')).toHaveLength(5);
    // The child's row carries their name from the arcade's player screen.
    expect(screen.getByTestId('gulp-board').querySelector('li.me')).toHaveTextContent('Rio');
    expect(screen.getByTestId('gulp-clock')).toHaveTextContent('3:00');
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
    expect(results.querySelectorAll('.gulp-results-list li')).toHaveLength(6);
    expect(rio()?.history?.filter((h) => h.game === 'gulp')).toHaveLength(1);
    // More frames go by: still one record.
    await pump(10);
    expect(rio()?.history?.filter((h) => h.game === 'gulp')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('gulp-results-menu'));
    expect(screen.getByTestId('gulp-menu')).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('a finished round joins the family scores, and the results card shows the board with it picked out', async () => {
    fake3d.enabled = true;
    seedScores([
      { userId: 'u2', name: 'Milo', score: 5_000, at: 1_000 },
      { userId: 'u3', name: 'Clara', score: 500, at: 2_000 },
    ]);
    // Rio's best from before rounds were kept comes along under Rio's name.
    localStorage.setItem('gulp:best:v1', JSON.stringify({ 'u1:city': 800 }));
    const loop = frameDriver();
    renderPage();
    expect(screen.getByTestId('gulp-best')).toHaveTextContent('800');
    fireEvent.click(screen.getByTestId('gulp-time-endless'));
    fireEvent.click(screen.getByTestId('gulp-play'));
    await loop.started();
    await loop.pump(5);
    // Give Rio a score worth a place, then end the round.
    const world = (window as unknown as { __gulp: World }).__gulp;
    world.holes[0].score = 2_000;
    fireEvent.click(screen.getByTestId('gulp-pause'));
    fireEvent.click(screen.getByTestId('gulp-end'));
    await loop.pump(3);

    const family = screen.getByTestId('gulp-results-family');
    expect(family).toHaveTextContent('City · Easy');
    expect(screen.getByTestId('gulp-family-place')).toHaveTextContent("You're #2 in the family!");
    const rows = [...screen.getByTestId('gulp-results-board').querySelectorAll('li')];
    expect(rows.map((li) => li.querySelector('.gulp-name')?.textContent)).toEqual(['Milo', 'Rio', 'Rio', 'Clara']);
    expect(rows[1]).toHaveClass('me');
    expect(rows[1]).toHaveTextContent('2,000');
    expect(rows[2]).not.toHaveClass('me');
    expect(screen.getByTestId('gulp-results')).toHaveTextContent('New best!');

    const saved = JSON.parse(localStorage.getItem('gulp:scores:v1') ?? '{}');
    expect(saved.adopted).toEqual(['u1']);
    const mine = saved.rounds.filter((r: { userId: string; at: number }) => r.userId === 'u1' && r.at > 0);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ name: 'Rio', map: 'city', difficulty: 'easy', score: 2_000, rank: expect.any(Number) });
    expect(mine[0].level).toBeGreaterThan(0);

    // Back on the menu, the best has moved up.
    fireEvent.click(screen.getByTestId('gulp-results-menu'));
    expect(screen.getByTestId('gulp-best')).toHaveTextContent('2,000');
    vi.restoreAllMocks();
  });

  it('a record-breaking round says so', async () => {
    fake3d.enabled = true;
    seedScores([{ userId: 'u2', name: 'Milo', score: 900, at: 1_000 }]);
    const loop = frameDriver();
    renderPage();
    fireEvent.click(screen.getByTestId('gulp-time-endless'));
    fireEvent.click(screen.getByTestId('gulp-play'));
    await loop.started();
    await loop.pump(3);
    (window as unknown as { __gulp: World }).__gulp.holes[0].score = 1_500;
    fireEvent.click(screen.getByTestId('gulp-pause'));
    fireEvent.click(screen.getByTestId('gulp-end'));
    await loop.pump(3);
    expect(screen.getByTestId('gulp-family-place')).toHaveTextContent('New family record!');
    expect(screen.getByTestId('gulp-results-board').querySelector('li')).toHaveClass('me');
    vi.restoreAllMocks();
  });

  it('the Scores dialog shows the family top 5 for any map and level, and my own rounds', () => {
    seedScores([
      { userId: 'u2', name: 'Milo', score: 5_000, at: 1_000 },
      { userId: 'u1', name: 'Rio', score: 1_200, at: 2_000 },
      { userId: 'u1', name: 'Rio', score: 700, at: 3_000, map: 'town', difficulty: 'hard', rank: 1 },
    ]);
    renderPage();
    const opener = screen.getByTestId('gulp-scores-open');
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByTestId('gulp-scores');
    expect(dialog).toHaveAttribute('role', 'dialog');
    // The family tab first, on the map and level chosen on the menu, with focus on it.
    expect(screen.getByTestId('gulp-scores-family')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('gulp-scores-family')).toHaveFocus();
    expect(screen.getByTestId('gulp-scores-map-city')).toHaveAttribute('aria-checked', 'true');
    const names = () => [...screen.getByTestId('gulp-scores-board').querySelectorAll('.gulp-name')].map((n) => n.textContent);
    expect(names()).toEqual(['Milo', 'Rio']);
    // Another board: empty until someone plays it.
    fireEvent.click(screen.getByTestId('gulp-scores-map-town'));
    expect(screen.getByTestId('gulp-scores-board-empty')).toHaveTextContent('Nobody has played Town on Easy yet');
    fireEvent.click(screen.getByTestId('gulp-scores-level-hard'));
    expect(names()).toEqual(['Rio']);
    // The menu's own choice is untouched.
    expect(screen.getByTestId('gulp-map-city')).toHaveAttribute('aria-checked', 'true');

    // My rounds: Rio's, newest first. The right arrow moves between the tabs.
    fireEvent.keyDown(screen.getByTestId('gulp-scores-family'), { key: 'ArrowRight' });
    expect(screen.getByTestId('gulp-scores-mine')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('gulp-scores-mine')).toHaveFocus();
    const mine = [...screen.getByTestId('gulp-scores-mine-list').querySelectorAll('li')];
    expect(mine).toHaveLength(2);
    expect(mine[0]).toHaveTextContent('Town · Hard');
    expect(mine[0]).toHaveTextContent('1st');
    expect(mine[1]).toHaveTextContent('1,200');

    // Escape closes it and focus goes back to the Scores button.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('gulp-scores')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(screen.getByTestId('gulp-menu')).toBeInTheDocument();

    // The close button and the backdrop close it too.
    fireEvent.click(opener);
    fireEvent.click(screen.getByTestId('gulp-scores-close'));
    expect(screen.queryByTestId('gulp-scores')).not.toBeInTheDocument();
    fireEvent.click(opener);
    fireEvent.click(screen.getByTestId('gulp-scores-backdrop'));
    expect(screen.queryByTestId('gulp-scores')).not.toBeInTheDocument();
  });

  it('with nothing played, both tabs say what to do', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('gulp-scores-open'));
    expect(screen.getByTestId('gulp-scores-board-empty')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('gulp-scores-mine'));
    expect(screen.getByTestId('gulp-scores-mine-empty')).toBeInTheDocument();
  });

  describe('playing with friends', () => {
    it("asks who's starting when no friend is linked, then shows my player select and its letters", () => {
      renderPage();
      fireEvent.click(screen.getByTestId('gulp-friends'));
      expect(screen.queryByTestId('gulp-menu')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('gulp-who-me'));
      expect(screen.getByTestId('gulp-select')).toBeInTheDocument();
      expect(screen.getByTestId('gulp-select-code').textContent).toMatch(/^[A-HJKMNP-Z]{4}/);
      // Nobody has joined yet, so there is no starting.
      expect(screen.getByTestId('gulp-select-start')).toBeDisabled();
    });

    it("a friend's letters are typed on the big keys", () => {
      renderPage();
      fireEvent.click(screen.getByTestId('gulp-friends'));
      fireEvent.click(screen.getByTestId('gulp-who-friend'));
      for (const ch of 'KQZT') fireEvent.click(screen.getByTestId(`gulp-code-key-${ch}`));
      expect(screen.getByTestId('gulp-code-go')).toBeEnabled();
    });

    it('with a friend linked, PLAY WITH FRIENDS opens the table through the party and the friend is on their way', () => {
      mockParty.value = fakeParty({ inParty: true, role: 'host', theirName: 'Mina' });
      renderPage();
      fireEvent.click(screen.getByTestId('gulp-friends'));
      expect(mockParty.value.openTable).toHaveBeenCalledWith('gulp', expect.stringMatching(/^[A-HJKMNP-Z]{4}$/));
      expect(screen.getByTestId('gulp-select-seat-1')).toHaveTextContent('Mina');
    });

    it("a linked friend's game shows on the menu, ready to join with one tap", () => {
      mockParty.value = fakeParty({ inParty: true, role: 'guest', theirName: 'Klara', table: { game: 'gulp', code: 'WXYZ', hostSide: 'KQZT' } });
      renderPage();
      expect(screen.getByTestId('gulp-join-card')).toHaveTextContent('Klara');
    });
  });
});
