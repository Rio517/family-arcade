import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { resetUsersStore, setUsersState } from '@shared/profile/usersStore';
import { addUser, emptyUsersState, setActiveUser } from '@shared/profile/users';
import { defaultProfile } from '@shared/profile/profile';
import type { PartyValue } from '@shared/party/PartyContext';
import { fakeParty } from '@shared/party/testing';
import type { LookId } from '@games/battleship/state/pitch';

const mockParty = vi.hoisted(() => ({ value: null as unknown as PartyValue }));
vi.mock('@shared/party/PartyContext', () => ({ useParty: () => mockParty.value }));

import { Lobby } from '../Lobby';
import { FleetSelect } from '../FleetSelect';
import { Placement } from '../Placement';

beforeEach(() => {
  mockParty.value = fakeParty();
  localStorage.clear();
  resetUsersStore();
  setUsersState(setActiveUser(addUser(emptyUsersState(), 'u1', 'Rio'), 'u1'));
});

const lobby = (look?: LookId) =>
  render(<Lobby onHost={vi.fn()} onJoin={vi.fn()} onSolo={vi.fn()} onHostTable={vi.fn()} look={look} />);

const fleet = (look?: LookId) =>
  render(
    <FleetSelect
      profile={defaultProfile()}
      selectedSkinId="aqua"
      era="classic"
      onEra={vi.fn()}
      onSelect={vi.fn()}
      onUnlock={() => false}
      onContinue={vi.fn()}
      look={look}
    />,
  );

describe('the darker-arcade looks on the start screens', () => {
  it.each([undefined, 'today'] as const)('today (%s) renders none of the look markup', (look) => {
    const { container } = lobby(look);
    expect(screen.queryByTestId('look-hero')).toBeNull();
    expect(container.querySelector('.lk-door-tag')).toBeNull();
    fireEvent.click(screen.getByTestId('solo-game'));
    expect(screen.queryByTestId('look-hero')).toBeNull();
  });

  it.each(['a', 'b', 'c'] as const)('look %s titles the lobby and tags each door', (look) => {
    const { container } = lobby(look);
    expect(screen.getByTestId('look-hero')).toHaveClass(`lk-hero-${look}`);
    expect(screen.getByTestId('look-hero')).not.toHaveClass('compact');
    expect(container.querySelectorAll('.lk-door-tag')).toHaveLength(2);
    // The ladder keeps the title, slimmer, and the door still works.
    fireEvent.click(screen.getByTestId('solo-game'));
    expect(screen.getByTestId('look-hero')).toHaveClass('compact');
    expect(screen.getByTestId('captain-bobble')).toBeInTheDocument();
  });

  it('the fleet screen shows the steps and each navy as ships, only under a look', () => {
    const today = fleet('today');
    expect(screen.queryByTestId('look-steps')).toBeNull();
    expect(today.container.querySelector('.lk-navy')).toBeNull();
    today.unmount();

    const { container } = fleet('a');
    const current = screen.getByTestId('look-steps').querySelector('[aria-current="step"]');
    expect(current).toHaveTextContent('Fleet');
    expect(container.querySelectorAll('.era-card .lk-navy')).toHaveLength(2);
    // The era cards are still the same buttons with the same names.
    expect(screen.getByTestId('era-modern')).toHaveTextContent('Modern');
  });

  it('the placing screen marks the Place step', () => {
    render(<Placement skinId="aqua" fleet={[]} onChange={vi.fn()} onReady={vi.fn()} waiting={false} look="c" />);
    const current = screen.getByTestId('look-steps').querySelector('[aria-current="step"]');
    expect(current).toHaveTextContent('Place');
    expect(screen.getByTestId('auto-place')).toBeInTheDocument();
  });
});
