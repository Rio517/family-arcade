import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Lobby } from './Lobby';

function setup(name = 'Rio') {
  const onName = vi.fn();
  const onHost = vi.fn();
  const onJoin = vi.fn();
  render(<Lobby name={name} onName={onName} onHost={onHost} onJoin={onJoin} />);
  return { onName, onHost, onJoin };
}

describe('<Lobby>', () => {
  it('reports name edits', () => {
    const { onName } = setup('');
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Kid' } });
    expect(onName).toHaveBeenCalledWith('Kid');
  });

  it('creates a game with the entered name', () => {
    const { onHost } = setup('Rio');
    fireEvent.click(screen.getByTestId('create-game'));
    expect(onHost).toHaveBeenCalledWith('Rio');
  });

  it('falls back to a default name when blank', () => {
    const { onHost } = setup('   ');
    fireEvent.click(screen.getByTestId('create-game'));
    expect(onHost).toHaveBeenCalledWith('Captain');
  });

  it('joins with a normalized 4-char code', () => {
    const { onJoin } = setup('Rio');
    fireEvent.click(screen.getByTestId('show-join'));
    const input = screen.getByTestId('code-input') as HTMLInputElement;
    // lowercase + an ambiguous/invalid char get normalized away.
    fireEvent.change(input, { target: { value: 'ab1cd' } });
    expect(input.value).toBe('ABCD'); // '1' filtered, capped at 4
    fireEvent.click(screen.getByTestId('join-game'));
    expect(onJoin).toHaveBeenCalledWith('ABCD', 'Rio');
  });

  it('pre-fills a shared join code', () => {
    render(<Lobby name="Kid" onName={vi.fn()} onHost={vi.fn()} onJoin={vi.fn()} initialJoinCode="wxyz" />);
    expect((screen.getByTestId('code-input') as HTMLInputElement).value).toBe('WXYZ');
  });

  it('offers the family roster as one-tap name chips, in house order', () => {
    const { onName } = setup('');
    const chips = ['rio', 'klara', 'flora', 'mommy', 'papa'].map((n) =>
      screen.getByTestId(`name-chip-${n}`),
    );
    expect(chips.map((c) => c.textContent)).toEqual(['Rio', 'Klara', 'Flora', 'Mommy', 'Papa']);
    fireEvent.click(screen.getByTestId('name-chip-klara'));
    expect(onName).toHaveBeenCalledWith('Klara');
  });
});
