import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RiskPage } from './RiskPage';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/risk']}>
      <RiskPage />
    </MemoryRouter>,
  );
}

describe('<RiskPage>', () => {
  it('shows a 2–6 player setup', () => {
    renderPage();
    for (const n of [2, 3, 4, 5, 6]) expect(screen.getByTestId(`count-${n}`)).toBeInTheDocument();
    expect(screen.getByTestId('risk-start')).toBeInTheDocument();
  });

  it('starts a game and renders the whole world board', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('count-4'));
    fireEvent.click(screen.getByTestId('risk-start'));

    // The board renders every territory and opens in the reinforce phase.
    const board = screen.getByRole('img', { name: 'World map' });
    expect(board.querySelectorAll('.risk-terr').length).toBeGreaterThanOrEqual(30);
    expect(screen.getByTestId('risk-phase')).toHaveTextContent(/Reinforce/i);
    // Can't begin attacks until reinforcements are placed.
    expect(screen.getByTestId('end-reinforce')).toBeDisabled();
  });

  it('places reinforcements and then lets the player begin attacks', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('risk-start'));

    const before = Number(screen.getByTestId('risk-phase').textContent!.match(/\d+/)![0]);
    expect(before).toBeGreaterThanOrEqual(3);

    // Clicking every territory only places on the current player's own land, so
    // reinforcements drain to zero and the "begin attacks" button unlocks.
    const board = screen.getByRole('img', { name: 'World map' });
    for (const path of Array.from(board.querySelectorAll<SVGPathElement>('.risk-terr'))) {
      fireEvent.click(path);
    }
    expect(screen.getByTestId('risk-phase')).toHaveTextContent(/place 0/i);
    expect(screen.getByTestId('end-reinforce')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('end-reinforce'));
    expect(screen.getByTestId('risk-phase')).toHaveTextContent(/Attack/i);
  });

  it('plays two full turns end to end and hands off between generals', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('count-2'));
    fireEvent.click(screen.getByTestId('risk-start'));

    const board = () => screen.getByRole('img', { name: 'World map' });
    const phase = () => screen.getByTestId('risk-phase').textContent ?? '';
    const general = () =>
      screen.getByTestId('risk-turn').querySelector('strong')?.textContent ?? '';

    // Run one player's complete turn: reinforce → attack → fortify → end turn.
    function playTurn() {
      // Reinforce: tapping every territory only places on the current player's
      // own land, so reinforcements drain to zero.
      for (let i = 0; i < 8 && !/place 0/i.test(phase()); i++) {
        for (const path of board().querySelectorAll<SVGPathElement>('.risk-terr')) {
          fireEvent.click(path);
        }
      }
      expect(phase()).toMatch(/place 0/i);
      fireEvent.click(screen.getByTestId('end-reinforce'));
      expect(phase()).toMatch(/Attack/i);

      // Attack: select a source, and if it lights up a legal target, strike.
      // `targets` is computed from the rules (not layout), so it works in jsdom.
      for (let a = 0; a < 6; a++) {
        let launched = false;
        for (const path of board().querySelectorAll<SVGPathElement>('.risk-terr')) {
          fireEvent.click(path);
          const target = board().querySelector<SVGPathElement>('.risk-terr.target');
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
