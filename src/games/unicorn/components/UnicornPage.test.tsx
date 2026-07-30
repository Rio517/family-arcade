import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { UnicornPage } from './UnicornPage';

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

/** Click through the pickers: 1 player, a world, a character. */
function startSolo(world: 'sky' | 'ocean' = 'sky', charId = 'fairy') {
  fireEvent.click(screen.getByTestId('uni-players-1'));
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

beforeEach(() => {
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

    it('choosing a player count moves on to the world picker', () => {
      renderPage();
      fireEvent.click(screen.getByTestId('uni-players-2'));
      expect(screen.getByTestId('uni-world-sky')).toBeInTheDocument();
      expect(screen.getByTestId('uni-world-ocean')).toBeInTheDocument();
    });

    it('each world offers its own cast of characters', () => {
      const first = renderPage();
      fireEvent.click(screen.getByTestId('uni-players-1'));
      fireEvent.click(screen.getByTestId('uni-world-sky'));
      for (const id of ['fairy', 'butterfly', 'dragon', 'princess']) {
        expect(screen.getByTestId(`uni-char-${id}`)).toBeInTheDocument();
      }
      first.unmount();

      renderPage();
      fireEvent.click(screen.getByTestId('uni-players-1'));
      fireEvent.click(screen.getByTestId('uni-world-ocean'));
      for (const id of ['mermaid', 'seahorse', 'turtle', 'princess']) {
        expect(screen.getByTestId(`uni-char-${id}`)).toBeInTheDocument();
      }
      expect(screen.queryByTestId('uni-char-fairy')).not.toBeInTheDocument();
    });

    it('the character pick rotates through every seat, then the game starts', () => {
      renderPage();
      fireEvent.click(screen.getByTestId('uni-players-3'));
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
