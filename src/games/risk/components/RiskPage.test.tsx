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
});
