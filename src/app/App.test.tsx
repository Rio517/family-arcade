import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

// The a11y floor for screen-reader navigation: every page lives inside a
// <main> landmark, and the cross-game party bar announces itself as a
// complementary landmark rather than loose content. Checked live by axe
// ("landmark-one-main" / "region"); this pins the shell shape in jsdom.
describe('<App> shell landmarks', () => {
  beforeEach(() => localStorage.clear());

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
});
