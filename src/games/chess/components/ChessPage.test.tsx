import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { resetUsersStore, setUsersState } from '@shared/profile/usersStore';
import { LINEUP_KEY, resetLineupStore } from '@shared/profile/lineupStore';
import { addUser, emptyUsersState, setActiveUser } from '@shared/profile/users';
import { ChessPage } from './ChessPage';

function renderPage(entry = '/chess') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ChessPage />
    </MemoryRouter>,
  );
}

describe('<ChessPage> — local flow', () => {
  beforeEach(() => {
    localStorage.clear();
    // A game route always has somebody signed in (the PlayerGate sees to it),
    // so every case here plays as Rio's ticket — with Flora's ticket sitting
    // on the same browser, ready to take the other chair.
    resetUsersStore();
    resetLineupStore();
    setUsersState(
      setActiveUser(addUser(addUser(emptyUsersState(), 'u1', 'Rio'), 'u2', 'Flora'), 'u1'),
    );
  });

  it('offers a mode picker with both same-device and online options', () => {
    renderPage();
    expect(screen.getByTestId('mode-local')).toBeInTheDocument();
    expect(screen.getByTestId('mode-online')).toBeInTheDocument();
  });

  it('starts a same-device game and shows the board', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('mode-local'));
    fireEvent.click(screen.getByTestId('start-local'));
    expect(screen.getByTestId('chess-board')).toBeInTheDocument();
    // White's chair starts on the signed-in player's ticket name.
    expect(screen.getByTestId('chess-turn')).toHaveTextContent(/Rio to move/);
  });

  it('plays a move and hands the turn to Black', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('mode-local'));
    fireEvent.click(screen.getByTestId('start-local'));

    fireEvent.click(screen.getByTestId('sq-e2'));
    fireEvent.click(screen.getByTestId('sq-e4'));

    // The pawn has moved (a piece SVG now sits on e4) and it's Black's turn.
    expect(screen.getByTestId('sq-e4').querySelector('svg')).toBeTruthy();
    expect(screen.getByTestId('sq-e2').querySelector('svg')).toBeNull();
    expect(screen.getByTestId('chess-turn')).toHaveTextContent(/Black to move/);
  });

  it('names the player whose move it is, and takes moves back', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('mode-local'));

    // Both chairs come from the roster: White already holds the signed-in
    // ticket, and Flora takes Black with one tap.
    fireEvent.click(screen.getByTestId('strip-user-u2'));
    fireEvent.click(screen.getByTestId('start-local'));

    expect(screen.getByTestId('chess-turn')).toHaveTextContent(/Rio to move/);

    // Nothing to undo before the first move.
    expect(screen.getByTestId('chess-undo')).toBeDisabled();

    fireEvent.click(screen.getByTestId('sq-e2'));
    fireEvent.click(screen.getByTestId('sq-e4'));
    expect(screen.getByTestId('chess-turn')).toHaveTextContent(/Flora to move/);
    expect(screen.getByTestId('sq-e4').querySelector('svg')).toBeTruthy();

    // Undo restores the pawn and hands the turn back to Rio.
    fireEvent.click(screen.getByTestId('chess-undo'));
    expect(screen.getByTestId('sq-e4').querySelector('svg')).toBeNull();
    expect(screen.getByTestId('sq-e2').querySelector('svg')).toBeTruthy();
    expect(screen.getByTestId('chess-turn')).toHaveTextContent(/Rio to move/);
    expect(screen.getByTestId('chess-undo')).toBeDisabled();
  });

  it('shows the move log and can return to an earlier move', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('mode-local'));
    fireEvent.click(screen.getByTestId('start-local'));

    // Play 1.e4 e5 2.Nf3.
    for (const [from, to] of [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3']]) {
      fireEvent.click(screen.getByTestId(`sq-${from}`));
      fireEvent.click(screen.getByTestId(`sq-${to}`));
    }
    expect(screen.getByTestId('sq-f3').querySelector('svg')).toBeTruthy();

    // Open the log (it lives in the ☰ menu now) — three plies are listed.
    fireEvent.click(screen.getByTestId('chess-menu'));
    fireEvent.click(screen.getByTestId('chess-log-open'));
    expect(screen.getByRole('dialog', { name: /move log/i })).toBeInTheDocument();
    expect(screen.getByTestId('log-ply-0')).toHaveTextContent('e4');
    expect(screen.getByTestId('log-ply-2')).toHaveTextContent(/Nf3/);

    // Pick the position after 1.e4 and rewind to it.
    fireEvent.click(screen.getByTestId('log-ply-0'));
    fireEvent.click(screen.getByTestId('chess-log-return'));

    // The knight move is undone, the board is back to Black-to-move after 1.e4.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('sq-f3').querySelector('svg')).toBeNull();
    expect(screen.getByTestId('sq-e4').querySelector('svg')).toBeTruthy();
    expect(screen.getByTestId('chess-turn')).toHaveTextContent(/Black to move/);
  });

  it('offers exactly two views — flat (the default) and 3D — behind the ☰ menu', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('mode-local'));
    fireEvent.click(screen.getByTestId('start-local'));
    expect(screen.getByTestId('chess-board')).toBeInTheDocument();

    // The view options live in the ☰ menu now, as labelled rows.
    fireEvent.click(screen.getByTestId('chess-menu'));
    expect(screen.getByTestId('view-flat')).toBeInTheDocument();
    expect(screen.getByTestId('view-3d')).toBeInTheDocument();
    expect(screen.queryByTestId('view-table')).toBeNull();
    expect(screen.getByTestId('view-flat')).toHaveAttribute('data-selected', 'true');

    // Re-picking Flat persists the choice and closes the menu.
    fireEvent.click(screen.getByTestId('view-flat'));
    expect(localStorage.getItem('chess-view-v1')).toBe('flat');
    expect(screen.queryByTestId('view-flat')).toBeNull();
  });

  it('free play: place, move, clear, and end the sandbox', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('mode-free'));

    // Tap a white queen in the tray — it becomes a stamp: every square tapped
    // gets a queen, without re-picking from the tray.
    fireEvent.click(screen.getByTestId('fp-tray-w-q'));
    fireEvent.click(screen.getByTestId('fp-sq-e5'));
    fireEvent.click(screen.getByTestId('fp-sq-a1'));
    fireEvent.click(screen.getByTestId('fp-sq-h8'));
    expect(screen.getByTestId('fp-sq-e5').querySelector('svg')).toBeTruthy();
    expect(screen.getByTestId('fp-sq-a1').querySelector('svg')).toBeTruthy();
    expect(screen.getByTestId('fp-sq-h8').querySelector('svg')).toBeTruthy();

    // Tapping the tray piece again puts the stamp down.
    fireEvent.click(screen.getByTestId('fp-tray-w-q'));

    // Now board pieces can be picked up and moved — a one-shot, not a stamp.
    fireEvent.click(screen.getByTestId('fp-sq-e5'));
    fireEvent.click(screen.getByTestId('fp-sq-b2'));
    expect(screen.getByTestId('fp-sq-e5').querySelector('svg')).toBeNull();
    expect(screen.getByTestId('fp-sq-b2').querySelector('svg')).toBeTruthy();

    // The eraser deletes specific pieces: toggle it on, tap pieces, they're
    // gone; it stays on until toggled off, and empty squares are no-ops.
    fireEvent.click(screen.getByTestId('fp-eraser-w'));
    fireEvent.click(screen.getByTestId('fp-sq-a1'));
    expect(screen.getByTestId('fp-sq-a1').querySelector('svg')).toBeNull();
    fireEvent.click(screen.getByTestId('fp-sq-h8'));
    expect(screen.getByTestId('fp-sq-h8').querySelector('svg')).toBeNull();
    fireEvent.click(screen.getByTestId('fp-sq-b2'));
    expect(screen.getByTestId('fp-sq-b2').querySelector('svg')).toBeNull();
    fireEvent.click(screen.getByTestId('fp-eraser-w')); // off again

    // Views, resets, and exit live in the ☰ menu.
    fireEvent.click(screen.getByTestId('fp-menu'));
    expect(screen.getByTestId('fp-view-3d')).toBeInTheDocument();

    // Starting lineup asks first (it replaces the whole board), then fills 32.
    fireEvent.click(screen.getByTestId('fp-lineup'));
    expect(screen.getByTestId('fp-confirm-lineup')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('fp-confirm-lineup'));
    expect(screen.getByTestId('fp-board').querySelectorAll('svg').length).toBe(32);

    // Clear also confirms — and cancelling leaves the board alone.
    fireEvent.click(screen.getByTestId('fp-menu'));
    fireEvent.click(screen.getByTestId('fp-clear'));
    fireEvent.click(screen.getByTestId('fp-confirm-cancel'));
    expect(screen.getByTestId('fp-board').querySelectorAll('svg').length).toBe(32);
    fireEvent.click(screen.getByTestId('fp-clear'));
    fireEvent.click(screen.getByTestId('fp-confirm-clear'));
    expect(screen.getByTestId('fp-board').querySelectorAll('svg').length).toBe(0);

    // Exit (in the menu) returns to the mode picker.
    fireEvent.click(screen.getByTestId('fp-menu'));
    fireEvent.click(screen.getByTestId('fp-end'));
    expect(screen.getByTestId('mode-free')).toBeInTheDocument();
  });

  it('switches the whole set to the unicorn theme and remembers it', () => {
    const { container } = renderPage();
    fireEvent.click(screen.getByTestId('mode-local'));
    fireEvent.click(screen.getByTestId('start-local'));

    // Classic by default.
    expect(container.querySelector('.chess-theme-classic')).toBeTruthy();
    expect(screen.getByTestId('sq-e2').querySelector('svg')?.getAttribute('data-piece-theme')).toBeNull();

    // Via the ☰ menu: pink board class + unicorn piece art everywhere,
    // persisted; picking a world closes the menu so the change is visible.
    fireEvent.click(screen.getByTestId('chess-menu'));
    fireEvent.click(screen.getByTestId('theme-unicorn'));
    expect(container.querySelector('.chess-theme-unicorn')).toBeTruthy();
    expect(screen.getByTestId('sq-e2').querySelector('svg')?.getAttribute('data-piece-theme')).toBe('unicorn');
    expect(localStorage.getItem('chess-theme-v1')).toBe('unicorn');

    // And the Galaxy Fleet is two more taps away.
    fireEvent.click(screen.getByTestId('chess-menu'));
    fireEvent.click(screen.getByTestId('theme-galaxy'));
    expect(container.querySelector('.chess-theme-galaxy')).toBeTruthy();
    expect(screen.getByTestId('sq-e2').querySelector('svg')?.getAttribute('data-piece-theme')).toBe('galaxy');
    expect(localStorage.getItem('chess-theme-v1')).toBe('galaxy');
  });

  it('autosaves a hotseat game and resumes it later — names, moves and all', () => {
    const first = renderPage();
    fireEvent.click(screen.getByTestId('mode-local'));
    fireEvent.click(screen.getByTestId('strip-user-u2'));
    fireEvent.click(screen.getByTestId('start-local'));
    fireEvent.click(screen.getByTestId('sq-e2'));
    fireEvent.click(screen.getByTestId('sq-e4'));
    first.unmount(); // dinner time — everyone walks away

    // Back at the mode picker, the saved game is offered…
    renderPage();
    const card = screen.getByTestId('chess-resume-local');
    expect(card).toHaveTextContent('Rio vs Flora');
    expect(card).toHaveTextContent(/1 move in/);

    // …and resuming restores the position and the turn.
    fireEvent.click(card);
    expect(screen.getByTestId('sq-e4').querySelector('svg')).toBeTruthy();
    expect(screen.getByTestId('sq-e2').querySelector('svg')).toBeNull();
    expect(screen.getByTestId('chess-turn')).toHaveTextContent(/Flora to move/);
  });

  it('deep-links straight into the saved hotseat game (?resume=local)', () => {
    const first = renderPage();
    fireEvent.click(screen.getByTestId('mode-local'));
    fireEvent.click(screen.getByTestId('start-local'));
    fireEvent.click(screen.getByTestId('sq-d2'));
    fireEvent.click(screen.getByTestId('sq-d4'));
    first.unmount();

    renderPage('/chess?resume=local');
    expect(screen.getByTestId('chess-board')).toBeInTheDocument();
    expect(screen.getByTestId('sq-d4').querySelector('svg')).toBeTruthy();
    expect(screen.getByTestId('chess-turn')).toHaveTextContent(/Black to move/);
  });

  it('restores a stored galaxy theme on load', () => {
    localStorage.setItem('chess-theme-v1', 'galaxy');
    const { container } = renderPage();
    fireEvent.click(screen.getByTestId('mode-local'));
    fireEvent.click(screen.getByTestId('start-local'));
    expect(container.querySelector('.chess-theme-galaxy')).toBeTruthy();
    expect(screen.getByTestId('sq-e2').querySelector('svg')?.getAttribute('data-piece-theme')).toBe('galaxy');
  });

  it('free play can promote its setup into a real rules-bound game', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('mode-free'));

    // No kings on the board yet — starting is refused with a friendly reason.
    fireEvent.click(screen.getByTestId('fp-start-game'));
    expect(screen.getByTestId('fp-start-issue')).toHaveTextContent(/king/i);

    // Place the two kings and a white queen (tray pieces stamp, so tap the
    // tray again to stop before switching pieces).
    fireEvent.click(screen.getByTestId('fp-tray-w-k'));
    fireEvent.click(screen.getByTestId('fp-sq-e1'));
    fireEvent.click(screen.getByTestId('fp-tray-w-k'));
    fireEvent.click(screen.getByTestId('fp-tray-b-k'));
    fireEvent.click(screen.getByTestId('fp-sq-e8'));
    fireEvent.click(screen.getByTestId('fp-tray-b-k'));
    fireEvent.click(screen.getByTestId('fp-tray-w-q'));
    fireEvent.click(screen.getByTestId('fp-sq-d4'));
    fireEvent.click(screen.getByTestId('fp-start-game'));

    // A real game now: the rules board is up, White (Rio) to move, position live.
    expect(screen.getByTestId('chess-board')).toBeInTheDocument();
    expect(screen.getByTestId('chess-turn')).toHaveTextContent(/Rio to move/);
    expect(screen.getByTestId('sq-d4').querySelector('svg')).toBeTruthy();

    // And it IS rules-bound: the queen may not hop like a knight.
    fireEvent.click(screen.getByTestId('sq-d4'));
    fireEvent.click(screen.getByTestId('sq-e6'));
    expect(screen.getByTestId('sq-e6').querySelector('svg')).toBeNull();
    // …but slides legally, handing the turn to Black.
    fireEvent.click(screen.getByTestId('sq-d4'));
    fireEvent.click(screen.getByTestId('sq-d6'));
    expect(screen.getByTestId('sq-d6').querySelector('svg')).toBeTruthy();
    expect(screen.getByTestId('chess-turn')).toHaveTextContent(/Black to move/);
  });

  it('refuses to start a free-play game that is already checkmate', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('mode-free'));

    // Ka1 trapped by Qb2 guarded by Kb3 — mate before move one.
    fireEvent.click(screen.getByTestId('fp-tray-w-k'));
    fireEvent.click(screen.getByTestId('fp-sq-a1'));
    fireEvent.click(screen.getByTestId('fp-tray-w-k'));
    fireEvent.click(screen.getByTestId('fp-tray-b-q'));
    fireEvent.click(screen.getByTestId('fp-sq-b2'));
    fireEvent.click(screen.getByTestId('fp-tray-b-q'));
    fireEvent.click(screen.getByTestId('fp-tray-b-k'));
    fireEvent.click(screen.getByTestId('fp-sq-b3'));
    fireEvent.click(screen.getByTestId('fp-tray-b-k'));

    fireEvent.click(screen.getByTestId('fp-start-game'));
    expect(screen.getByTestId('fp-start-issue')).toHaveTextContent(/checkmated/);
    // Still in the sandbox, not a game.
    expect(screen.queryByTestId('chess-board')).toBeNull();
  });

  it('free play offers the theme picker too (in the menu)', () => {
    localStorage.setItem('chess-theme-v1', 'unicorn');
    const { container } = renderPage();
    fireEvent.click(screen.getByTestId('mode-free'));

    // The stored choice applies, and the sandbox can switch back.
    expect(container.querySelector('.chess-theme-unicorn')).toBeTruthy();
    fireEvent.click(screen.getByTestId('fp-tray-w-q'));
    fireEvent.click(screen.getByTestId('fp-sq-e5'));
    expect(screen.getByTestId('fp-sq-e5').querySelector('svg')?.getAttribute('data-piece-theme')).toBe('unicorn');

    fireEvent.click(screen.getByTestId('fp-menu'));
    fireEvent.click(screen.getByTestId('fp-theme-galaxy'));
    expect(container.querySelector('.chess-theme-galaxy')).toBeTruthy();

    fireEvent.click(screen.getByTestId('fp-theme-classic'));
    expect(container.querySelector('.chess-theme-classic')).toBeTruthy();
  });

  it('the online lobby plays as your ticket — no name box in sight', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('mode-online'));
    // Who you are is the ticket you signed in with; nothing asks again.
    expect(screen.getByTestId('playing-as')).toHaveTextContent("You're Rio");
    expect(screen.queryByTestId('chess-name')).toBeNull();
    expect(screen.getByTestId('chess-create')).toBeInTheDocument();
    expect(screen.getByTestId('chess-join-code')).toBeInTheDocument();
  });

  it('same-device chairs come from the roster — seating someone signs nobody in', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('mode-local'));

    // Chair one opens on the signed-in ticket; the other waits for a tap.
    expect(screen.getByTestId('seat-0')).toHaveTextContent('Rio');
    expect(screen.getByTestId('seat-1')).toHaveTextContent(/tap a ticket/i);
    // The old free-text boxes are gone, and the screen never announces a chair
    // as "you" the way the online lobby does.
    expect(screen.queryByTestId('white-name')).toBeNull();
    expect(screen.queryByTestId('black-name')).toBeNull();
    expect(screen.queryByTestId('playing-as')).toBeNull();

    // Flora takes the other chair from the ticket strip.
    fireEvent.click(screen.getByTestId('strip-user-u2'));
    expect(screen.getByTestId('seat-1')).toHaveTextContent('Flora');

    fireEvent.click(screen.getByTestId('start-local'));
    expect(screen.getByTestId('chess-board')).toBeInTheDocument();
    expect(screen.getByTestId('chess-turn')).toHaveTextContent(/Rio to move/);

    // Sitting down at a chair is not signing in: Rio still holds the device,
    // and nobody was renamed.
    const roster = JSON.parse(localStorage.getItem('arcade.users.v1') ?? '{}');
    expect(roster.activeId).toBe('u1');
    expect(roster.users.map((u: { profile: { name: string } }) => u.profile.name)).toEqual([
      'Rio',
      'Flora',
    ]);
  });

  it('swaps the sides at the table', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('mode-local'));
    fireEvent.click(screen.getByTestId('strip-user-u2'));
    expect(screen.getByTestId('seat-0')).toHaveTextContent('Rio');

    // One tap trades the chairs — no clearing both and re-seating.
    fireEvent.click(screen.getByTestId('chess-swap-sides'));
    expect(screen.getByTestId('seat-0')).toHaveTextContent('Flora');
    expect(screen.getByTestId('seat-1')).toHaveTextContent('Rio');

    fireEvent.click(screen.getByTestId('start-local'));
    expect(screen.getByTestId('chess-turn')).toHaveTextContent(/Flora to move/);
  });

  it('next visit opens with the same chairs', () => {
    const first = renderPage();
    fireEvent.click(screen.getByTestId('mode-local'));
    fireEvent.click(screen.getByTestId('strip-user-u2'));
    fireEvent.click(screen.getByTestId('start-local'));
    first.unmount();

    // Same browser, next visit: the lineup the game started with is remembered.
    renderPage();
    fireEvent.click(screen.getByTestId('mode-local'));
    expect(screen.getByTestId('seat-0')).toHaveTextContent('Rio');
    expect(screen.getByTestId('seat-1')).toHaveTextContent('Flora');
  });

  it('a picker left half-filled and abandoned changes nothing for next time', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('mode-local'));
    fireEvent.click(screen.getByTestId('strip-user-u2'));
    expect(screen.getByTestId('seat-1')).toHaveTextContent('Flora');

    // Walking back out of the picker without starting: nothing was played, so
    // nothing is remembered — the next visit is as blank as this one was.
    fireEvent.click(screen.getByRole('button', { name: /←\s*Back/ }));
    expect(screen.getByTestId('mode-local')).toBeInTheDocument();
    expect(localStorage.getItem(LINEUP_KEY)).toBeNull();
  });

  it('swapping the sides before the game is what the next visit opens with', () => {
    const first = renderPage();
    fireEvent.click(screen.getByTestId('mode-local'));
    fireEvent.click(screen.getByTestId('strip-user-u2'));
    fireEvent.click(screen.getByTestId('chess-swap-sides'));
    fireEvent.click(screen.getByTestId('start-local'));
    expect(screen.getByTestId('chess-turn')).toHaveTextContent(/Flora to move/);
    first.unmount();

    // The chairs the game actually started with — swapped — are the ones the
    // table opens with next time, White and Black the same way round.
    renderPage();
    fireEvent.click(screen.getByTestId('mode-local'));
    expect(screen.getByTestId('seat-0')).toHaveTextContent('Flora');
    expect(screen.getByTestId('seat-1')).toHaveTextContent('Rio');
  });
});
