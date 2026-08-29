import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LINEUP_KEY, resetLineupStore, setLineup } from '@shared/profile/lineupStore';
import { addUser, emptyUsersState, setActiveUser } from '@shared/profile/users';
import { resetUsersStore, setUsersState } from '@shared/profile/usersStore';
import { createGame } from '../domain/engine';
import { UnicornPage } from './UnicornPage';

// Wrap the engine's `createGame` in a transparent spy: the live game sits in
// a ref the page never exposes, so the one way to see which players the chairs
// produced is to watch them go in. Every call still runs the real engine.
vi.mock('../domain/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../domain/engine')>();
  return { ...actual, createGame: vi.fn(actual.createGame) };
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/unicorn']}>
      <UnicornPage />
    </MemoryRouter>,
  );
}

// ----- a hand-cranked animation loop -----
// The game loop runs on requestAnimationFrame. We capture every scheduled
// frame and fire them ourselves, so a test can march the round forward one
// frame at a time. Rendering is a no-op in jsdom (getContext returns null and
// renderScene bails out), but the physics and win check are pure JS — so the
// round really plays out and really ends.

const pendingFrames = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;

/** Run the newest scheduled frame at the given timestamp (ms). */
function pumpFrame(ts: number) {
  const ids = [...pendingFrames.keys()];
  const id = ids[ids.length - 1];
  const cb = pendingFrames.get(id);
  if (!cb) throw new Error('no animation frame scheduled — is the game running?');
  pendingFrames.delete(id);
  act(() => cb(ts));
}

/** Crank frames until the win overlay appears (bounded so a bug cannot hang). */
function pumpUntilWin() {
  for (let i = 0; i < 20 && !screen.queryByTestId('uni-win'); i++) pumpFrame(i * 100);
  expect(screen.getByTestId('uni-win')).toBeInTheDocument();
}

/** Click through the pickers: 1 player, the table, a world, a character. */
function startSolo(world: 'sky' | 'ocean' = 'sky', charId = 'fairy') {
  fireEvent.click(screen.getByTestId('uni-players-1'));
  fireEvent.click(screen.getByTestId('uni-seats-next'));
  fireEvent.click(screen.getByTestId(`uni-world-${world}`));
  fireEvent.click(screen.getByTestId(`uni-char-${charId}`));
}

/**
 * Pin Math.random to 0.5 so every coin spawns dead-centre of the field —
 * exactly where a solo player starts. The player then scoops the whole
 * respawning pile without moving, and reaches the target in a few frames.
 */
function pinLuck() {
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
}

/** Rio is signed in; Klara has a ticket on this iPad too. */
function seedRoster() {
  setUsersState(setActiveUser(addUser(addUser(emptyUsersState(), 'u1', 'Rio'), 'u2', 'Klara'), 'u1'));
}

beforeEach(() => {
  // No roster and no remembered lineup unless a test asks for one, so the
  // chairs fall back to Player 1/2/3.
  localStorage.clear();
  resetUsersStore();
  resetLineupStore();
  pendingFrames.clear();
  nextFrameId = 1;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    pendingFrames.set(nextFrameId, cb);
    return nextFrameId++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => void pendingFrames.delete(id));
  // jsdom has no canvas — return null quietly instead of logging "not implemented".
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('<UnicornPage>', () => {
  describe('setup flow', () => {
    it('offers a 1, 2, or 3 player game', () => {
      renderPage();
      for (const n of [1, 2, 3]) expect(screen.getByTestId(`uni-players-${n}`)).toBeInTheDocument();
    });

    it('choosing a player count opens the table, and Next moves on to the world picker', () => {
      renderPage();
      fireEvent.click(screen.getByTestId('uni-players-2'));
      expect(screen.getByTestId('seat-0')).toBeInTheDocument();
      expect(screen.getByTestId('seat-1')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('uni-seats-next'));
      expect(screen.getByTestId('uni-world-sky')).toBeInTheDocument();
      expect(screen.getByTestId('uni-world-ocean')).toBeInTheDocument();
    });

    it('each world offers its own cast of characters', () => {
      const first = renderPage();
      fireEvent.click(screen.getByTestId('uni-players-1'));
      fireEvent.click(screen.getByTestId('uni-seats-next'));
      fireEvent.click(screen.getByTestId('uni-world-sky'));
      for (const id of ['fairy', 'butterfly', 'dragon', 'princess']) {
        expect(screen.getByTestId(`uni-char-${id}`)).toBeInTheDocument();
      }
      first.unmount();

      renderPage();
      fireEvent.click(screen.getByTestId('uni-players-1'));
      fireEvent.click(screen.getByTestId('uni-seats-next'));
      fireEvent.click(screen.getByTestId('uni-world-ocean'));
      for (const id of ['mermaid', 'seahorse', 'turtle', 'princess']) {
        expect(screen.getByTestId(`uni-char-${id}`)).toBeInTheDocument();
      }
      expect(screen.queryByTestId('uni-char-fairy')).not.toBeInTheDocument();
    });

    it('the character pick rotates through every seat, then the game starts', () => {
      renderPage();
      fireEvent.click(screen.getByTestId('uni-players-3'));
      fireEvent.click(screen.getByTestId('uni-seats-next'));
      fireEvent.click(screen.getByTestId('uni-world-sky'));

      expect(screen.getByRole('heading', { name: /Player 1, pick your character/ })).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('uni-char-fairy'));

      expect(screen.getByRole('heading', { name: /Player 2, pick your character/ })).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('uni-char-dragon'));

      expect(screen.getByRole('heading', { name: /Player 3, pick your character/ })).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('uni-char-princess'));

      // All seats filled → the play field appears with a score pill per player.
      expect(screen.getByTestId('uni-canvas')).toBeInTheDocument();
      expect(screen.getByTestId('uni-score-0').textContent).toContain('🧚');
      expect(screen.getByTestId('uni-score-1').textContent).toContain('🐉');
      // The princess rides a unicorn — the scoreboard shows her mount.
      expect(screen.getByTestId('uni-score-2').textContent).toContain('🦄');
    });

    it('the back button abandons the setup and returns to the player picker', () => {
      renderPage();
      fireEvent.click(screen.getByTestId('uni-players-2'));
      fireEvent.click(screen.getByTestId('uni-back'));
      expect(screen.getByTestId('uni-players-1')).toBeInTheDocument();
    });

    it('the back button on the world picker returns to the table', () => {
      renderPage();
      fireEvent.click(screen.getByTestId('uni-players-2'));
      fireEvent.click(screen.getByTestId('uni-seats-next'));
      fireEvent.click(screen.getByTestId('uni-back'));
      expect(screen.getByTestId('seat-0')).toBeInTheDocument();
    });
  });

  describe("who's playing", () => {
    beforeEach(seedRoster);

    it('seats the tickets, names the character picks, and remembers the table', () => {
      renderPage();
      fireEvent.click(screen.getByTestId('uni-players-2'));

      // Chair 1 opens with the signed-in ticket; chair 2 waits for a tap.
      expect(screen.getByTestId('seat-0')).toHaveTextContent('Rio');
      expect(screen.getByTestId('seat-1')).toHaveTextContent(/tap a ticket/i);

      fireEvent.click(screen.getByTestId('strip-user-u2'));
      expect(screen.getByTestId('seat-1')).toHaveTextContent('Klara');

      fireEvent.click(screen.getByTestId('uni-seats-next'));
      fireEvent.click(screen.getByTestId('uni-world-sky'));

      // Each chair is asked for its character by name.
      expect(screen.getByRole('heading', { name: /Rio, pick your character/ })).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('uni-char-fairy'));
      expect(screen.getByRole('heading', { name: /Klara, pick your character/ })).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('uni-char-dragon'));

      // The round is live, the scoreboard carries the ticket names…
      expect(screen.getByTestId('uni-canvas')).toBeInTheDocument();
      // …and the table is remembered for next time.
      expect(JSON.parse(localStorage.getItem(LINEUP_KEY) ?? '{}')).toEqual({
        unicorn: [{ userId: 'u1' }, { userId: 'u2' }],
      });
    });

    it('every ticket keeps its id on its player; an empty chair has none', () => {
      vi.mocked(createGame).mockClear();
      renderPage();
      fireEvent.click(screen.getByTestId('uni-players-3'));
      fireEvent.click(screen.getByTestId('strip-user-u2'));
      fireEvent.click(screen.getByTestId('uni-seats-next'));
      fireEvent.click(screen.getByTestId('uni-world-sky'));
      fireEvent.click(screen.getByTestId('uni-char-fairy')); // Rio
      fireEvent.click(screen.getByTestId('uni-char-dragon')); // Klara
      fireEvent.click(screen.getByTestId('uni-char-princess')); // the open chair

      expect(createGame).toHaveBeenCalledTimes(1);
      const { players } = vi.mocked(createGame).mock.calls[0][0];
      expect(players.map((p) => p.name)).toEqual(['Rio', 'Klara', 'Player 3']);
      // The id rides on the player so a won round can credit the right ticket.
      expect(players.map((p) => p.userId ?? null)).toEqual(['u1', 'u2', null]);
    });

    it('a solo game still opens the table — one tap through for the signed-in ticket', () => {
      renderPage();
      fireEvent.click(screen.getByTestId('uni-players-1'));
      expect(screen.getByTestId('seat-0')).toHaveTextContent('Rio');
      expect(screen.queryByTestId('seat-1')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('uni-seats-next'));
      expect(screen.getByTestId('uni-world-sky')).toBeInTheDocument();
    });

    it('an empty chair simply plays as its player number', () => {
      pinLuck();
      renderPage();
      fireEvent.click(screen.getByTestId('uni-players-1'));
      fireEvent.click(screen.getByTestId('seat-0-clear'));
      fireEvent.click(screen.getByTestId('uni-seats-next'));
      fireEvent.click(screen.getByTestId('uni-world-sky'));
      fireEvent.click(screen.getByTestId('uni-char-fairy'));

      pumpUntilWin();
      expect(screen.getByTestId('uni-win')).toHaveTextContent('Player 1 wins!');
      expect(JSON.parse(localStorage.getItem(LINEUP_KEY) ?? '{}')).toEqual({ unicorn: [null] });
    });

    it('a remembered two-chair table restores both chairs, count chosen after mount', () => {
      // Magic Coins asks "how many players?" only after the page is up, so the
      // table has no chairs to seed at mount — last week's pair must still come
      // back the moment the count is picked, without a single tap.
      setLineup('unicorn', [{ userId: 'u2' }, { userId: 'u1' }]);
      renderPage();
      fireEvent.click(screen.getByTestId('uni-players-2'));

      expect(screen.getByTestId('seat-0')).toHaveTextContent('Klara');
      expect(screen.getByTestId('seat-1')).toHaveTextContent('Rio');
    });

    it('three chairs with two tickets: the spare chair plays as Player 3', () => {
      renderPage();
      fireEvent.click(screen.getByTestId('uni-players-3'));

      // Rio is already sitting down; Klara takes the next chair, and the third
      // stays open for whoever grabs the third set of keys.
      expect(screen.getByTestId('seat-0')).toHaveTextContent('Rio');
      fireEvent.click(screen.getByTestId('strip-user-u2'));
      expect(screen.getByTestId('seat-1')).toHaveTextContent('Klara');
      expect(screen.getByTestId('seat-2')).toHaveTextContent(/tap a ticket/i);

      fireEvent.click(screen.getByTestId('uni-seats-next'));
      fireEvent.click(screen.getByTestId('uni-world-sky'));

      // The character pick asks each chair by the name it has — the empty one
      // simply by its player number.
      expect(screen.getByRole('heading', { name: /Rio, pick your character/ })).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('uni-char-fairy'));
      expect(screen.getByRole('heading', { name: /Klara, pick your character/ })).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('uni-char-dragon'));
      expect(screen.getByRole('heading', { name: /Player 3, pick your character/ })).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('uni-char-princess'));

      expect(screen.getByTestId('uni-canvas')).toBeInTheDocument();
    });

    it('"Play again" keeps the ticket names at the table', () => {
      pinLuck();
      renderPage();
      fireEvent.click(screen.getByTestId('uni-players-2'));
      fireEvent.click(screen.getByTestId('strip-user-u2'));
      fireEvent.click(screen.getByTestId('uni-seats-next'));
      fireEvent.click(screen.getByTestId('uni-world-sky'));
      fireEvent.click(screen.getByTestId('uni-char-fairy')); // Rio
      fireEvent.click(screen.getByTestId('uni-char-dragon')); // Klara

      // Pinned luck stacks every coin dead-centre; Rio (arrow keys) flies into
      // the pile and takes the round.
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      for (let i = 0; i < 24 && !screen.queryByTestId('uni-win'); i++) pumpFrame(i * 100);
      expect(screen.getByTestId('uni-win')).toHaveTextContent('Rio wins!');
      fireEvent.keyUp(window, { key: 'ArrowRight' });

      fireEvent.click(screen.getByTestId('uni-again'));

      // A fresh round with the same two characters and the scores back to nil…
      expect(screen.getByTestId('uni-score-0').textContent).toMatch(/\D0\/20/);
      expect(screen.getByTestId('uni-score-1').textContent).toMatch(/\D0\/20/);
      expect(screen.getByTestId('uni-score-0').textContent).toContain('🧚');
      expect(screen.getByTestId('uni-score-1').textContent).toContain('🐉');

      // …and both chairs still hold their ticket rather than falling back to
      // "Player 1"/"Player 2": this time Klara (W A S D) scoops the pile, and
      // the round is announced in her name.
      fireEvent.keyDown(window, { key: 'a' });
      for (let i = 0; i < 24 && !screen.queryByTestId('uni-win'); i++) pumpFrame(5000 + i * 100);
      expect(screen.getByTestId('uni-win')).toHaveTextContent('Klara wins!');
      fireEvent.keyUp(window, { key: 'a' });
    });

    it('the winner is announced by ticket name', () => {
      pinLuck();
      renderPage();
      startSolo();
      pumpUntilWin();
      expect(screen.getByTestId('uni-win')).toHaveTextContent('Rio wins!');
    });
  });

  describe('the win overlay', () => {
    it('appears when a player collects the target number of coins', () => {
      pinLuck();
      renderPage();
      startSolo();
      pumpUntilWin();
      expect(screen.getByTestId('uni-win')).toHaveTextContent('Player 1 wins!');
    });

    it('"Play again" keeps the same character and world and resets the score', () => {
      pinLuck();
      renderPage();
      startSolo('ocean', 'mermaid');
      pumpUntilWin();
      expect(screen.getByTestId('uni-score-0').textContent).toMatch(/2\d\/20/);

      fireEvent.click(screen.getByTestId('uni-again'));

      // No pickers in between — straight into a fresh round with the same crew.
      expect(screen.queryByTestId('uni-win')).not.toBeInTheDocument();
      expect(screen.getByTestId('uni-canvas')).toBeInTheDocument();
      const score = screen.getByTestId('uni-score-0');
      expect(score.textContent).toContain('🧜‍♀️');
      expect(score.textContent).toContain('0/20');

      // …and the fresh round is really live: it can be played and won again.
      for (let i = 0; i < 20 && screen.queryByTestId('uni-win') === null; i++) pumpFrame(5000 + i * 100);
      expect(screen.getByTestId('uni-win')).toBeInTheDocument();
    });

    it('"New game" walks back to the player picker', () => {
      pinLuck();
      renderPage();
      startSolo();
      pumpUntilWin();

      fireEvent.click(screen.getByTestId('uni-new'));

      expect(screen.queryByTestId('uni-win')).not.toBeInTheDocument();
      expect(screen.getByTestId('uni-players-1')).toBeInTheDocument();
    });
  });
});
