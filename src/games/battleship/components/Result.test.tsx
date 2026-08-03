import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Result } from './Result';

function renderResult(props: Partial<Parameters<typeof Result>[0]> = {}) {
  const onRematch = vi.fn();
  const onExit = vi.fn();
  render(
    <Result
      won={props.won ?? true}
      pointsEarned={props.pointsEarned ?? 130}
      totalPoints={props.totalPoints ?? 430}
      myName={props.myName ?? 'Kid'}
      oppName={props.oppName ?? 'Dad'}
      iWantRematch={props.iWantRematch ?? false}
      oppWantsRematch={props.oppWantsRematch ?? false}
      onRematch={onRematch}
      onExit={onExit}
    />,
  );
  return { onRematch, onExit };
}

describe('<Result>', () => {
  it('celebrates the winner with points', () => {
    renderResult({ won: true, pointsEarned: 130, totalPoints: 430 });
    expect(screen.getByText(/You Win!/)).toBeInTheDocument();
    expect(screen.getByText(/\+130 points!/)).toBeInTheDocument();
    expect(screen.getByText(/430 points/)).toBeInTheDocument();
  });

  it('encourages the loser — never uses harsh language', () => {
    renderResult({ won: false, pointsEarned: 25 });
    expect(screen.getByText(/Good Game!/)).toBeInTheDocument();
    expect(screen.getByText(/\+25 points for a great battle/)).toBeInTheDocument();
    // Kid-friendly guarantee: no "Defeat" wording and no emoji/pictographs.
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/defeat/i);
    // The variation selector sits outside the class: mixing it with the
    // astral ranges makes the class match surrogate halves misleadingly.
    expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]|\u{FE0F}/u);
  });

  it('shows a trophy emblem on a win and a wreck emblem on a loss', () => {
    const { container } = render(
      <Result
        won
        pointsEarned={130}
        totalPoints={430}
        myName="Kid"
        oppName="Dad"
        iWantRematch={false}
        oppWantsRematch={false}
        onRematch={vi.fn()}
        onExit={vi.fn()}
      />,
    );
    expect(container.querySelector('.result-emblem.win')).toBeInTheDocument();
    expect(container.querySelector('.result-emblem.loss')).toBeNull();
  });

  it('shows a wreck emblem (not a trophy) on a loss', () => {
    const { container } = render(
      <Result
        won={false}
        pointsEarned={25}
        totalPoints={100}
        myName="Kid"
        oppName="Dad"
        iWantRematch={false}
        oppWantsRematch={false}
        onRematch={vi.fn()}
        onExit={vi.fn()}
      />,
    );
    expect(container.querySelector('.result-emblem.loss')).toBeInTheDocument();
    expect(container.querySelector('.result-emblem.win')).toBeNull();
  });

  it('fires rematch and exit callbacks', () => {
    const { onRematch, onExit } = renderResult();
    fireEvent.click(screen.getByTestId('rematch'));
    fireEvent.click(screen.getByTestId('exit'));
    expect(onRematch).toHaveBeenCalled();
    expect(onExit).toHaveBeenCalled();
  });

  it('reflects a pending rematch request', () => {
    renderResult({ iWantRematch: true, oppName: 'Dad' });
    expect(screen.getByTestId('rematch')).toBeDisabled();
    expect(screen.getByText(/Waiting for Dad/)).toBeInTheDocument();
  });

  it('shows when the opponent wants a rematch', () => {
    renderResult({ oppWantsRematch: true, oppName: 'Dad' });
    expect(screen.getByText(/Dad wants a rematch/)).toBeInTheDocument();
  });
});
