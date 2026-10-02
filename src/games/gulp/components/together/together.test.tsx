import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RoundSettings } from '../../net/protocol';
import { CodeKeys } from './CodeKeys';
import { JoinCard } from './JoinCard';
import { PlayerSelect, type PlayerSelectProps } from './PlayerSelect';
import { PlayRow } from './PlayRow';
import { WhoStarts } from './WhoStarts';

const key = (k: string) => fireEvent.keyDown(window, { key: k });
const tiles = () => screen.getByTestId('gulp-code-tiles').textContent;

const SETTINGS: RoundSettings = { map: 'city', difficulty: 'medium', duration: 240, powerups: true, fightBack: true };

const select = (over: Partial<PlayerSelectProps> = {}) => {
  const props: PlayerSelectProps = {
    role: 'host',
    code: 'KQZT',
    seats: [{ name: 'Klara', skin: 1, state: 'host' }, null, null, null],
    mySeat: 0,
    settings: SETTINGS,
    onSettings: vi.fn(),
    onSkin: vi.fn(),
    holesLeft: 5,
    canStart: false,
    onStart: vi.fn(),
    onBack: vi.fn(),
    ...over,
  };
  return { props, ...render(<PlayerSelect {...props} />) };
};

describe('CodeKeys', () => {
  it('types code letters from the keyboard, uppercased, and ignores I, L, O and digits', () => {
    render(<CodeKeys onCode={() => {}} onBack={() => {}} />);
    for (const k of ['k', 'I', 'l', 'O', '1', '0', 'q']) key(k);
    expect(tiles()).toBe('KQ');
    key('Backspace');
    expect(tiles()).toBe('K');
  });

  it('wakes GO only at four letters, and stops at four', () => {
    const onCode = vi.fn();
    render(<CodeKeys onCode={onCode} onBack={() => {}} />);
    const go = screen.getByTestId('gulp-code-go');
    for (const k of ['K', 'Q', 'Z']) key(k);
    expect(go).toBeDisabled();
    key('Enter');
    expect(onCode).not.toHaveBeenCalled();
    key('T');
    key('W');
    expect(tiles()).toBe('KQZT');
    expect(go).toBeEnabled();
    key('Enter');
    expect(onCode).toHaveBeenCalledWith('KQZT');
    fireEvent.click(go);
    expect(onCode).toHaveBeenCalledTimes(2);
  });

  it('has keys for the 23 code letters only, and they type too', () => {
    render(<CodeKeys onCode={() => {}} onBack={() => {}} />);
    expect(screen.getAllByTestId(/^gulp-code-key-/)).toHaveLength(23);
    for (const gone of ['I', 'L', 'O']) expect(screen.queryByTestId(`gulp-code-key-${gone}`)).toBeNull();
    fireEvent.click(screen.getByTestId('gulp-code-key-M'));
    fireEvent.click(screen.getByTestId('gulp-code-key-N'));
    fireEvent.click(screen.getByTestId('gulp-code-del'));
    expect(tiles()).toBe('M');
  });

  it('says Joining… while busy and does not send twice', () => {
    const onCode = vi.fn();
    const { rerender } = render(<CodeKeys onCode={onCode} onBack={() => {}} />);
    for (const k of 'ABCD') key(k);
    rerender(<CodeKeys onCode={onCode} onBack={() => {}} busy />);
    const go = screen.getByTestId('gulp-code-go');
    expect(go).toHaveTextContent('Joining…');
    fireEvent.click(go);
    key('Enter');
    key('Backspace');
    expect(onCode).not.toHaveBeenCalled();
    expect(tiles()).toBe('ABCD');
  });

  it('shows the error and goes back on Escape', () => {
    const onBack = vi.fn();
    render(<CodeKeys onCode={() => {}} onBack={onBack} error="No game has those letters." />);
    expect(screen.getByRole('alert')).toHaveTextContent('No game has those letters.');
    key('Escape');
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('WhoStarts', () => {
  it('Escape goes back', () => {
    const onBack = vi.fn();
    render(<WhoStarts onMe={() => {}} onFriend={() => {}} onBack={onBack} />);
    key('Escape');
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('asks who is starting, with the two answers', () => {
    const onMe = vi.fn();
    const onFriend = vi.fn();
    render(<WhoStarts onMe={onMe} onFriend={onFriend} onBack={() => {}} />);
    expect(screen.getByRole('heading')).toHaveTextContent('Who’s starting the game?');
    fireEvent.click(screen.getByTestId('gulp-who-me'));
    fireEvent.click(screen.getByTestId('gulp-who-friend'));
    expect(onMe).toHaveBeenCalledTimes(1);
    expect(onFriend).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('gulp-who-friend')).toHaveTextContent('A friend. I’ll type their code');
  });
});

describe('PlayerSelect', () => {
  it('a guest gets no working settings and no START', () => {
    select({
      role: 'guest',
      mySeat: 1,
      seats: [{ name: 'Klara', skin: 1, state: 'host' }, { name: 'Oskar', skin: 3, state: 'ready' }, null, null],
      onSettings: undefined,
      onStart: undefined,
    });
    expect(screen.queryByTestId('gulp-select-start')).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Map' })).toBeNull();
    expect(screen.queryByTestId('gulp-select-map-city')).toBeNull();
    // The host's choices are still there to read.
    expect(screen.getByTestId('gulp-select-round')).toHaveTextContent('Klara’s gameCity4 minMedium6 holes');
    expect(screen.getByText('Waiting for Klara to press START…')).toBeInTheDocument();
  });

  it('the host’s START follows canStart', () => {
    const { props, rerender } = select();
    const start = screen.getByTestId('gulp-select-start');
    expect(start).toBeDisabled();
    expect(screen.getByText('Waiting for a friend to join…')).toBeInTheDocument();
    rerender(<PlayerSelect {...props} seats={[props.seats[0], { name: 'Mina', skin: 2, state: 'ready' }, null, null]} holesLeft={4} canStart />);
    expect(start).toBeEnabled();
    expect(screen.getByText('City has 6 holes: 2 children and 4 computer holes.')).toBeInTheDocument();
    fireEvent.click(start);
    expect(props.onStart).toHaveBeenCalledTimes(1);
  });

  it('the host changes the settings, keeping the length when the map changes', () => {
    const { props } = select();
    fireEvent.click(screen.getByTestId('gulp-select-map-region'));
    expect(props.onSettings).toHaveBeenLastCalledWith({ ...SETTINGS, map: 'region', duration: 360 });
    fireEvent.click(screen.getByTestId('gulp-select-time-endless'));
    expect(props.onSettings).toHaveBeenLastCalledWith({ ...SETTINGS, duration: 0 });
    fireEvent.click(screen.getByTestId('gulp-select-level-hard'));
    expect(props.onSettings).toHaveBeenLastCalledWith({ ...SETTINGS, difficulty: 'hard' });
  });

  it('the skin picker marks the colours other children hold as taken', () => {
    const { props } = select({
      role: 'guest',
      mySeat: 2,
      seats: [
        { name: 'Klara', skin: 1, state: 'host' },
        { name: 'Mina', skin: 2, state: 'ready' },
        { name: 'Oskar', skin: 3, state: 'ready' },
        null,
      ],
      note: 'Bubblegum was taken, so you got Grape',
    });
    for (const i of [1, 2]) {
      expect(screen.getByTestId(`gulp-skin-${i}`)).toBeDisabled();
      expect(screen.getByTestId(`gulp-skin-${i}`)).toHaveAccessibleName(/taken/);
    }
    expect(screen.getByTestId('gulp-skin-3')).toBeEnabled();
    expect(screen.getByTestId('gulp-skin-3')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('gulp-select-note')).toHaveTextContent('Bubblegum was taken, so you got Grape');
    fireEvent.click(screen.getByTestId('gulp-skin-1'));
    expect(props.onSkin).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('gulp-skin-5'));
    expect(props.onSkin).toHaveBeenCalledWith(5);
  });

  it('shows the code, the line for the other iPads, the slots and the banner', () => {
    select({ status: 'Reconnecting…', joinInstead: vi.fn() });
    expect(screen.getByTestId('gulp-select-code')).toHaveAccessibleName('Join code K Q Z T');
    expect(screen.getByText('On the other iPads:')).toBeInTheDocument();
    expect(screen.getByTestId('gulp-select-seat-0')).toHaveTextContent('1PKlaraHostHOST');
    expect(screen.getByTestId('gulp-select-seat-1')).toHaveTextContent('INSERT COIN');
    expect(screen.getByTestId('gulp-select-status')).toHaveTextContent('Reconnecting…');
    expect(screen.getByTestId('gulp-select-join-instead')).toHaveTextContent('Is a friend starting instead? Join their game');
  });

  it('a linked friend on the way wakes START when they tap Join', () => {
    select({ code: '', seats: [{ name: 'Klara', skin: 1, state: 'host' }, { name: 'Mina', skin: 2, state: 'coming' }, null, null] });
    expect(screen.queryByTestId('gulp-select-code')).toBeNull();
    expect(screen.getByTestId('gulp-select-seat-1')).toHaveTextContent('Minais coming…COMING…');
    expect(screen.getByText('Start wakes up when Mina taps Join.')).toBeInTheDocument();
  });
});

describe('the menu pieces', () => {
  it('PLAY and PLAY WITH FRIENDS', () => {
    const onPlay = vi.fn();
    const onFriends = vi.fn();
    render(<PlayRow onPlay={onPlay} onFriends={onFriends} />);
    fireEvent.click(screen.getByTestId('gulp-play'));
    fireEvent.click(screen.getByTestId('gulp-friends'));
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onFriends).toHaveBeenCalledTimes(1);
  });

  it('the join card names the friend, waits while busy and shows the error under the button', () => {
    const onJoin = vi.fn();
    const { rerender } = render(<JoinCard name="Mina" onJoin={onJoin} />);
    expect(screen.getByTestId('gulp-join-card')).toHaveTextContent('Mina is starting a game!');
    fireEvent.click(screen.getByRole('button', { name: 'Join Mina' }));
    expect(onJoin).toHaveBeenCalledTimes(1);
    rerender(<JoinCard name="Mina" onJoin={onJoin} busy error="Mina’s game is full." />);
    fireEvent.click(screen.getByRole('button', { name: 'Joining…' }));
    expect(onJoin).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Mina’s game is full.');
  });
});
