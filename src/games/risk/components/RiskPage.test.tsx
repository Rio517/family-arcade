import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RiskPage } from './RiskPage';

const HELP_SEEN_KEY = 'risk-help-seen-v1';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/risk']}>
      <RiskPage />
    </MemoryRouter>,
  );
}

const boardEl = () => screen.getByRole('img', { name: 'World map' });
const phaseText = () => screen.getByTestId('risk-phase').textContent ?? '';
const tapEveryTerritory = () => {
  for (const path of boardEl().querySelectorAll<SVGPathElement>('.risk-terr')) fireEvent.click(path);
};

/** Walk the opening deploy: each general places their whole reserve, then passes,
 *  until the campaign opens at the first reinforce. */
function completeDeploy() {
  for (let guard = 0; guard < 10 && /Deploy/i.test(phaseText()); guard++) {
    for (let i = 0; i < 80 && /Deploy — place [1-9]/.test(phaseText()); i++) tapEveryTerritory();
    fireEvent.click(screen.getByTestId('end-setup'));
  }
}

describe('<RiskPage>', () => {
  // By default mark the rules as already seen so the first-visit guide doesn't
  // pop over the other flows; the how-to-play tests override this explicitly.
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(HELP_SEEN_KEY, '1');
  });

  it('shows a 2–6 player setup', () => {
    renderPage();
    for (const n of [2, 3, 4, 5, 6]) expect(screen.getByTestId(`count-${n}`)).toBeInTheDocument();
    expect(screen.getByTestId('risk-start')).toBeInTheDocument();
  });

  it('starts a game and opens in the deploy phase over the whole board', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('count-4'));
    fireEvent.click(screen.getByTestId('risk-start'));

    // The board renders every territory and opens in the deploy (setup) phase.
    expect(boardEl().querySelectorAll('.risk-terr').length).toBeGreaterThanOrEqual(30);
    expect(screen.getByTestId('risk-phase')).toHaveTextContent(/Deploy/i);
    // Can't pass the map on until the starting armies are placed.
    expect(screen.getByTestId('end-setup')).toBeDisabled();
  });

  it('deploys the opening armies, reinforces, then begins attacks', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('risk-start'));

    // Opens in deploy, with a starting reserve to place.
    expect(screen.getByTestId('risk-phase')).toHaveTextContent(/Deploy — place/i);
    completeDeploy();

    // Every general has deployed, so the campaign opens at reinforce.
    expect(phaseText()).toMatch(/Reinforce/i);
    const toPlace = Number(phaseText().match(/\d+/)![0]);
    expect(toPlace).toBeGreaterThanOrEqual(3);

    // Tapping every territory only places on the current player's own land, so
    // reinforcements drain to zero and the "begin attacks" button unlocks.
    for (let i = 0; i < 8 && /place [1-9]/.test(phaseText()); i++) tapEveryTerritory();
    expect(screen.getByTestId('risk-phase')).toHaveTextContent(/place 0/i);
    expect(screen.getByTestId('end-reinforce')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('end-reinforce'));
    expect(screen.getByTestId('risk-phase')).toHaveTextContent(/Attack/i);
  });

  it('opens the how-to-play guide automatically on the first ever visit', () => {
    localStorage.removeItem(HELP_SEEN_KEY);
    renderPage();
    const dialog = screen.getByRole('dialog', { name: /how to play/i });
    expect(dialog).toBeInTheDocument();
    // The three turn steps are spelled out.
    expect(dialog).toHaveTextContent(/Reinforce/);
    expect(dialog).toHaveTextContent(/Attack/);
    expect(dialog).toHaveTextContent(/Fortify/);
    // And it only auto-opens once.
    expect(localStorage.getItem(HELP_SEEN_KEY)).toBe('1');
  });

  it('lets a returning player reopen the rules from the top bar', () => {
    renderPage(); // rules already seen → not shown automatically
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByTestId('risk-help-open'));
    expect(screen.getByRole('dialog', { name: /how to play/i })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('risk-help-close'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('plays two full turns end to end and hands off between generals', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('count-2'));
    fireEvent.click(screen.getByTestId('risk-start'));

    // Deploy both generals' opening armies, then the campaign begins at reinforce.
    completeDeploy();

    const phase = () => screen.getByTestId('risk-phase').textContent ?? '';
    const general = () =>
      screen.getByTestId('risk-turn').querySelector('strong')?.textContent ?? '';

    // Run one player's complete turn: reinforce → attack → fortify → end turn.
    function playTurn() {
      // Reinforce: tapping every territory only places on the current player's
      // own land, so reinforcements drain to zero.
      for (let i = 0; i < 8 && !/place 0/i.test(phase()); i++) tapEveryTerritory();
      expect(phase()).toMatch(/place 0/i);
      fireEvent.click(screen.getByTestId('end-reinforce'));
      expect(phase()).toMatch(/Attack/i);

      // Attack: select a source, and if it lights up a legal target, strike.
      // `targets` is computed from the rules (not layout), so it works in jsdom.
      for (let a = 0; a < 6; a++) {
        let launched = false;
        for (const path of boardEl().querySelectorAll<SVGPathElement>('.risk-terr')) {
          fireEvent.click(path);
          const target = boardEl().querySelector<SVGPathElement>('.risk-terr.target');
          if (target) {
            fireEvent.click(target);
            launched = true;
            break;
          }
        }
        if (!launched) break;
      }
      // At least one attack should have been possible from the opening position,
      // so the dice read-out appears.
      expect(screen.getByTestId('dice-row')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('end-attack'));
      expect(phase()).toMatch(/Fortify/i);
      fireEvent.click(screen.getByTestId('end-turn'));
    }

    const first = general();
    expect(first).toBeTruthy();

    playTurn();
    // The turn has passed to the other general, back at the reinforce phase.
    const second = general();
    expect(second).not.toBe(first);
    expect(phase()).toMatch(/Reinforce/i);

    playTurn();
    // Two players alternate, so play returns to the first general.
    expect(general()).toBe(first);
    expect(phase()).toMatch(/Reinforce/i);
  });
});
