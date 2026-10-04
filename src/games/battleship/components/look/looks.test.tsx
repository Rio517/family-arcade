import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { resetUsersStore, setUsersState } from '@shared/profile/usersStore';
import { addUser, emptyUsersState, setActiveUser } from '@shared/profile/users';
import type { PartyValue } from '@shared/party/PartyContext';
import { fakeParty } from '@shared/party/testing';
import type { LookId } from '@games/battleship/state/pitch';

const mockParty = vi.hoisted(() => ({ value: null as unknown as PartyValue }));
vi.mock('@shared/party/PartyContext', () => ({ useParty: () => mockParty.value }));

import { Lobby } from '../Lobby';
import { Placement } from '../Placement';

beforeEach(() => {
  mockParty.value = fakeParty();
  localStorage.clear();
  resetUsersStore();
  setUsersState(setActiveUser(addUser(emptyUsersState(), 'u1', 'Rio'), 'u1'));
});

const lobby = (look?: LookId) =>
  render(<Lobby onHost={vi.fn()} onJoin={vi.fn()} onSolo={vi.fn()} era="classic" onEra={vi.fn()} onHostTable={vi.fn()} look={look} />);

describe('the darker-arcade looks on the start screens', () => {
  it.each([undefined, 'today'] as const)('today (%s) renders none of the look markup', (look) => {
    const { container } = lobby(look);
    expect(screen.queryByTestId('look-hero')).toBeNull();
    expect(container.querySelector('.lk-door-tag')).toBeNull();
    // Today's lobby is the same two taps, with none of the look's markup.
    expect(screen.getByTestId('level-1')).toBeInTheDocument();
    expect(screen.getByTestId('ships-classic')).toBeInTheDocument();
  });

  it.each(['a', 'b', 'c'] as const)('look %s titles the lobby and tags each door', (look) => {
    const { container } = lobby(look);
    expect(screen.getByTestId('look-hero')).toHaveClass(`lk-hero-${look}`);
    expect(screen.getByTestId('look-hero')).not.toHaveClass('compact');
    expect(container.querySelectorAll('.lk-door-tag')).toHaveLength(2);
    // The levels and the ships switch sit on the lobby itself.
    expect(screen.getAllByTestId(/^level-/)).toHaveLength(4);
    expect(screen.getByTestId('ships-modern')).toBeInTheDocument();
    // The join form keeps the title, slimmer.
    fireEvent.click(screen.getByTestId('show-join'));
    expect(screen.getByTestId('look-hero')).toHaveClass('compact');
  });

  it('the placing screen marks the Place step', () => {
    render(<Placement skinId="aqua" fleet={[]} onChange={vi.fn()} onReady={vi.fn()} waiting={false} look="c" />);
    const current = screen.getByTestId('look-steps').querySelector('[aria-current="step"]');
    expect(current).toHaveTextContent('Place');
    expect(screen.getByTestId('look-steps')).not.toHaveTextContent('Fleet');
    expect(screen.getByTestId('auto-place')).toBeInTheDocument();
  });
});
