import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { round } from '../domain/testing';
import { GulpHud } from './GulpHud';
import { hudOf, type Banner } from './round';

const show = (banners: Banner[]) =>
  render(<GulpHud hud={hudOf(round(), 0)} banners={banners} muted={false} onMute={() => {}} onPause={() => {}} touch={false} />);

const swallow: Banner = { id: 2, kind: 'good', text: 'You swallowed Big Gulp!', points: 25 };

describe('GulpHud', () => {
  it('a swallow says what it scored, and beats the level-up it brings', () => {
    show([{ id: 1, kind: 'level', text: 'Level 3!', sub: 'Now you can eat cars' }, swallow]);
    expect(screen.getByTestId('gulp-banner')).toHaveTextContent('You swallowed Big Gulp!+25 points');
  });

  it('a warning still wins the banner spot over a swallow', () => {
    show([swallow, { id: 3, kind: 'warn', text: 'Look out! A fuel truck!' }]);
    expect(screen.getByTestId('gulp-banner')).toHaveTextContent('Look out! A fuel truck!');
  });

  it('shows no star or hole counters during a round', () => {
    show([]);
    expect(screen.queryByTestId('gulp-kills')).toBeNull();
    expect(screen.queryByTestId('gulp-wonders')).toBeNull();
  });
});
