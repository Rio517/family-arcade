import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { activeProfile } from '@shared/profile/users';
import { getUsersSnapshot, resetUsersStore } from '@shared/profile/usersStore';
import { PlayerBooth } from './PlayerBooth';

const boothStyles = readFileSync('src/app/styles/app.css', 'utf8');

function seedUsers(users: Array<{ id: string; name: string; pronouns?: string }>, activeId = users[0]?.id) {
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
        history: [],
      },
    })),
    activeId,
  }));
  resetUsersStore();
}

describe('<PlayerBooth>', () => {
  beforeEach(() => {
    localStorage.clear();
    resetUsersStore();
  });

  it('shows the normalized legacy pronouns on the active ticket', () => {
    seedUsers([{ id: 'mario', name: 'Mario' }]);
    render(<PlayerBooth />);

    expect(screen.getByText('he/him')).toBeVisible();
    expect(screen.getByText('Shared across every arcade game.')).toBeVisible();
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

  it('keeps the editor controls at 44px with an explicit keyboard-focus indicator', () => {
    expect(boothStyles).toMatch(/\.booth-actions button\s*{[\s\S]*?min-height: 44px;/);
    expect(boothStyles).toMatch(/\.booth-form-fields input\s*{[\s\S]*?min-height: 44px;/);
    expect(boothStyles).toMatch(/\.booth-form-row button\s*{[\s\S]*?min-height: 44px;/);
    expect(boothStyles).toContain('.booth-form-fields input:focus-visible');
    expect(boothStyles).toContain('.booth-form-row button:focus-visible');
  });
});
