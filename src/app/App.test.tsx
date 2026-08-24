import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { defaultProfile } from '@shared/profile/profile';
import { resetUsersStore } from '@shared/profile/usersStore';
import { App } from './App';

const originalWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
const originalHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

// The a11y floor for screen-reader navigation: every page lives inside a
// <main> landmark, and the cross-game party bar announces itself as a
// complementary landmark rather than loose content. Checked live by axe
// ("landmark-one-main" / "region"); this pins the shell shape in jsdom.
describe('<App> shell landmarks', () => {
  beforeEach(() => localStorage.clear());

  afterEach(() => {
    window.location.hash = '';
    if (originalWidth) Object.defineProperty(window, 'innerWidth', originalWidth);
    if (originalHeight) Object.defineProperty(window, 'innerHeight', originalHeight);
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
    localStorage.setItem('arcade.users.v1', JSON.stringify({
      users: [{
        id: 'player-rio',
        createdAt: 1,
        profile: { ...defaultProfile(), name: 'Rio' },
      }],
      activeId: 'player-rio',
    }));
    resetUsersStore();
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
});
