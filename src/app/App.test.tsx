import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createCampaign } from '@games/caribbean/domain/createCampaign';
import { createJournal } from '@games/caribbean/domain/replay';
import {
  CURRENT_SAVE_KEY,
  saveCampaign,
} from '@games/caribbean/storage/persistence';
import { defaultProfile } from '@shared/profile/profile';
import { resetUsersStore } from '@shared/profile/usersStore';
import { App } from './App';

const originalWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
const originalHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks');

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

function signIn(): void {
  localStorage.setItem('arcade.users.v1', JSON.stringify({
    users: [{
      id: 'player-rio',
      createdAt: 1,
      profile: { ...defaultProfile(), name: 'Rio' },
    }],
    activeId: 'player-rio',
  }));
  resetUsersStore();
}

function seedCleanCampaign(): void {
  const saved = saveCampaign(
    localStorage,
    createJournal(createCampaign({ seed: 1702, name: 'Morgan' })),
    {
      build: 'app-shell-test',
      savedAt: Date.UTC(2026, 7, 24, 12, 30),
      expectedRevision: { currentRaw: null, previousRaw: null },
    },
  );
  if (!saved.ok) throw new Error(`Unable to seed App campaign: ${saved.reason}`);
}

// The a11y floor for screen-reader navigation: every page lives inside a
// <main> landmark, and the cross-game party bar announces itself as a
// complementary landmark rather than loose content. Checked live by axe
// ("landmark-one-main" / "region"); this pins the shell shape in jsdom.
describe('<App> shell landmarks', () => {
  beforeEach(() => {
    localStorage.clear();
    resetUsersStore();
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: async (
          _name: string,
          _options: { mode: 'exclusive' },
          callback: (lock: unknown) => unknown | PromiseLike<unknown>,
        ) => callback({}),
      },
    });
  });

  afterEach(() => {
    window.location.hash = '';
    if (originalWidth) Object.defineProperty(window, 'innerWidth', originalWidth);
    if (originalHeight) Object.defineProperty(window, 'innerHeight', originalHeight);
    if (originalLocks) Object.defineProperty(navigator, 'locks', originalLocks);
    else Reflect.deleteProperty(navigator, 'locks');
  });

  it('puts the routed page inside a single main landmark', () => {
    render(<App />);
    expect(screen.getByRole('main')).toBeInTheDocument();
    // The landing page's heading is inside it, not floating beside it.
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('heading', { level: 1 }));
  });

  it('marks the party bar as a complementary landmark', () => {
    render(<App />);
    expect(screen.getByRole('complementary', { name: 'Party' })).toBeInTheDocument();
  });

  it('routes a signed-in player to Caribbean setup inside the single main landmark', () => {
    signIn();
    setViewport(1440, 900);
    window.location.hash = '#/caribbean';

    render(<App />);

    const main = screen.getByRole('main');
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(main).toContainElement(
      screen.getByRole('heading', { name: 'Sign a captain’s commission' }),
    );
    expect(screen.queryByTestId('player-gate')).not.toBeInTheDocument();
  });

  it('inerts the complete App shell behind setup abandonment and restores exact prior state on Cancel in StrictMode', () => {
    signIn();
    seedCleanCampaign();
    setViewport(1440, 900);
    window.location.hash = '#/caribbean';

    render(<StrictMode><App /></StrictMode>);

    const opener = screen.getByRole('button', { name: 'Abandon campaign' });
    const partyRoot = screen.getByRole('complementary', { name: 'Party' });
    const partyPill = screen.getByTestId('party-pill');
    const manifest = document.querySelector<HTMLElement>('.caribbean-manifest')!;
    const localBackground = document.querySelector<HTMLElement>('.caribbean-commission-content')!;
    manifest.setAttribute('inert', 'persist');

    fireEvent.click(opener);

    const dialog = screen.getByRole('dialog', { name: 'Abandon this campaign?' });
    expect(localBackground).toHaveAttribute('inert');
    expect(partyPill.closest('[inert]')).toBe(partyRoot);
    expect(dialog.closest('[inert]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(localBackground).not.toHaveAttribute('inert');
    expect(partyRoot).not.toHaveAttribute('inert');
    expect(manifest).toHaveAttribute('inert', 'persist');
    expect(opener).toHaveFocus();
  });

  it('inerts the complete App shell behind recovery abandonment and cleans up on Escape and unmount', () => {
    signIn();
    localStorage.setItem(CURRENT_SAVE_KEY, '{corrupt');
    setViewport(1440, 900);
    window.location.hash = '#/caribbean';

    const rendered = render(<App />);

    const opener = screen.getByRole('button', { name: 'Abandon campaign' });
    const partyRoot = screen.getByRole('complementary', { name: 'Party' });
    const partyPill = screen.getByTestId('party-pill');
    const localBackground = document.querySelector<HTMLElement>('.caribbean-recovery-content')!;
    fireEvent.click(opener);

    let dialog = screen.getByRole('dialog', { name: 'Abandon this campaign?' });
    expect(localBackground).toHaveAttribute('inert');
    expect(partyPill.closest('[inert]')).toBe(partyRoot);
    expect(dialog.closest('[inert]')).toBeNull();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Abandon this campaign?' })).not.toBeInTheDocument();
    expect(localBackground).not.toHaveAttribute('inert');
    expect(partyRoot).not.toHaveAttribute('inert');
    expect(opener).toHaveFocus();

    fireEvent.click(opener);
    dialog = screen.getByRole('dialog', { name: 'Abandon this campaign?' });
    expect(dialog.closest('[inert]')).toBeNull();
    expect(partyRoot).toHaveAttribute('inert');

    rendered.unmount();
    expect(localBackground).not.toHaveAttribute('inert');
    expect(partyRoot).not.toHaveAttribute('inert');
  });
});
