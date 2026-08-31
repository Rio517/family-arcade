import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import type { GameHistoryEntry } from '@shared/profile/profile';
import { activeProfile } from '@shared/profile/users';
import { getUsersSnapshot, resetUsersStore } from '@shared/profile/usersStore';
import { PlayerBooth } from './PlayerBooth';

const boothStyles = readFileSync('src/app/styles/app.css', 'utf8');

/** A fixed local noon, so "today"/"yest." never depend on when the suite runs. */
const NOW = new Date(2026, 7, 29, 12, 0, 0).getTime();
const HOUR = 3_600_000;

type SeedUser = { id: string; name: string; pronouns?: string; history?: GameHistoryEntry[] };

function seedUsers(users: SeedUser[], activeId = users[0]?.id) {
  localStorage.setItem('arcade.users.v1', JSON.stringify({
    users: users.map((user, index) => ({
      id: user.id,
      createdAt: index + 1,
      profile: {
        name: user.name,
        ...(user.pronouns === undefined ? {} : { pronouns: user.pronouns }),
        points: 0,
        wins: 0,
        losses: 0,
        unlocked: [],
        lastSkinId: '',
        history: user.history ?? [],
      },
    })),
    activeId,
  }));
  resetUsersStore();
}

/** One finished game, ready to seed into a profile's history. */
function played(entry: Partial<GameHistoryEntry> & { finishedAt: number }): GameHistoryEntry {
  return {
    code: 'AB12',
    game: 'chess',
    opponent: 'Morgan',
    result: 'win',
    pointsEarned: 100,
    ...entry,
  };
}

describe('<PlayerBooth>', () => {
  beforeEach(() => {
    localStorage.clear();
    resetUsersStore();
  });

  afterEach(() => {
    delete window.__ARCADE_TEST_NOW__;
  });

  it('shows the normalized legacy pronouns on the active ticket', () => {
    seedUsers([{ id: 'mario', name: 'Mario' }]);
    render(<PlayerBooth />);

    expect(screen.getByText('he/him')).toBeVisible();
    // The "Shared across every arcade game." tagline was dropped from the booth.
    expect(screen.queryByText('Shared across every arcade game.')).not.toBeInTheDocument();
  });

  it('opens a labeled two-field profile editor', () => {
    seedUsers([{ id: 'mario', name: 'Mario', pronouns: 'he/him' }]);
    render(<PlayerBooth />);

    fireEvent.click(screen.getByTestId('booth-edit-profile'));

    expect(screen.getByTestId('booth-profile-name')).toHaveAccessibleName('Name');
    expect(screen.getByTestId('booth-profile-pronouns')).toHaveAccessibleName('Pronouns');
    expect(screen.getByTestId('booth-profile-save')).toHaveTextContent('Save profile');
  });

  it('persists both profile fields and closes the editor', () => {
    seedUsers([{ id: 'mario', name: 'Mario', pronouns: 'he/him' }]);
    render(<PlayerBooth />);

    fireEvent.click(screen.getByTestId('booth-edit-profile'));
    fireEvent.change(screen.getByTestId('booth-profile-name'), { target: { value: 'Morgan' } });
    fireEvent.change(screen.getByTestId('booth-profile-pronouns'), { target: { value: 'they/them' } });
    fireEvent.click(screen.getByTestId('booth-profile-save'));

    expect(activeProfile(getUsersSnapshot())).toMatchObject({ name: 'Morgan', pronouns: 'they/them' });
    expect(screen.queryByTestId('booth-profile-name')).not.toBeInTheDocument();
  });

  it('normalizes blank pronouns when saving the profile', () => {
    seedUsers([{ id: 'mario', name: 'Mario', pronouns: 'they/them' }]);
    render(<PlayerBooth />);

    fireEvent.click(screen.getByTestId('booth-edit-profile'));
    fireEvent.change(screen.getByTestId('booth-profile-pronouns'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('booth-profile-save'));

    expect(activeProfile(getUsersSnapshot())).toMatchObject({ pronouns: 'he/him' });
  });

  it('keeps the last valid 24-code-point pronouns when a 25th is entered', () => {
    seedUsers([{ id: 'mario', name: 'Mario', pronouns: 'he/him' }]);
    render(<PlayerBooth />);

    fireEvent.click(screen.getByTestId('booth-edit-profile'));
    const input = screen.getByTestId('booth-profile-pronouns') as HTMLInputElement;
    const valid = '😀'.repeat(24);
    fireEvent.change(input, { target: { value: valid } });
    fireEvent.change(input, { target: { value: `${valid}😀` } });

    expect(input).toHaveValue(valid);
    expect(screen.getByRole('alert')).toHaveTextContent('Use 24 characters or fewer');
  });

  it('changes the displayed pronouns when a different player signs in', () => {
    seedUsers([
      { id: 'mario', name: 'Mario', pronouns: 'he/him' },
      { id: 'morgan', name: 'Morgan', pronouns: 'they/them' },
    ]);
    render(<PlayerBooth />);

    fireEvent.click(screen.getByTestId('booth-switch'));
    fireEvent.click(screen.getByTestId('booth-user-morgan'));

    expect(screen.getByText('they/them')).toBeVisible();
    expect(screen.queryByText('he/him')).not.toBeInTheDocument();
  });

  it('Switch player is the ticket list: filter, tap, or make a new one', () => {
    seedUsers([
      { id: 'mario', name: 'Mario' },
      { id: 'morgan', name: 'Morgan' },
    ]);
    render(<PlayerBooth />);
    // One list everywhere — no separate "New player" form at the booth.
    expect(screen.queryByTestId('booth-new')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('booth-switch'));
    expect(screen.getByTestId('booth-user-mario')).toHaveTextContent(/you/i);
    fireEvent.change(screen.getByTestId('booth-name'), { target: { value: 'mo' } });
    expect(screen.queryByTestId('booth-user-mario')).not.toBeInTheDocument();
    expect(screen.getByTestId('booth-user-morgan')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('booth-name'), { target: { value: 'Nana' } });
    fireEvent.click(screen.getByTestId('booth-create'));
    expect(activeProfile(getUsersSnapshot())?.name).toBe('Nana');
    expect(screen.queryByTestId('booth-name')).not.toBeInTheDocument();
  });

  it('threads the history: when it happened, which game, and the ticket chip', () => {
    // The booth samples arcadeNow() once per mount (shared/time/clock.ts), so
    // pinning it here makes "today" / "yest." deterministic.
    window.__ARCADE_TEST_NOW__ = () => NOW;
    seedUsers([{
      id: 'mario',
      name: 'Mario',
      history: [
        played({ game: 'chess', opponent: 'Morgan', result: 'win', pointsEarned: 100, finishedAt: NOW - 2 * HOUR }),
        // 26 hours back crosses exactly one midnight — the "yest." boundary.
        played({ game: '', opponent: 'Nana', result: 'loss', pointsEarned: 25, finishedAt: NOW - 26 * HOUR }),
      ],
    }]);
    render(<PlayerBooth />);

    const rows = within(screen.getByTestId('booth-history')).getAllByRole('listitem');
    expect(rows).toHaveLength(2);

    // Newest first: this morning's chess win, named from the registry (not 'chess').
    expect(within(rows[0]).getByText('today')).toBeVisible();
    expect(within(rows[0]).getByText('Chess')).toBeVisible();
    expect(within(rows[0]).getByText('vs Morgan')).toBeVisible();
    expect(within(rows[0]).getByText('WIN +100')).toBeVisible();

    // Yesterday's loss, on a row saved before we recorded which game it was.
    expect(within(rows[1]).getByText('yest.')).toBeVisible();
    expect(within(rows[1]).getByText('Game')).toBeVisible();
    expect(within(rows[1]).getByText('vs Nana')).toBeVisible();
    expect(within(rows[1]).getByText('LOSS +25')).toBeVisible();
  });

  it('keeps the editor controls at 44px with an explicit keyboard-focus indicator', () => {
    expect(boothStyles).toMatch(/\.booth-actions button\s*{[\s\S]*?min-height: 44px;/);
    expect(boothStyles).toMatch(/\.booth-form-fields input\s*{[\s\S]*?min-height: 44px;/);
    expect(boothStyles).toMatch(/\.booth-form-row button\s*{[\s\S]*?min-height: 44px;/);
    expect(boothStyles).toContain('.booth-form-fields input:focus-visible');
    expect(boothStyles).toContain('.booth-form-row button:focus-visible');
  });
});
