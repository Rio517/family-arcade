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
    // Kid-friendly guarantee: no "Defeat"/"Loss"/skull anywhere on the screen.
    expect(screen.queryByText(/defeat/i)).toBeNull();
    expect(screen.queryByText(/💀/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/💀|defeat/i);
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
