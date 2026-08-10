import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RiskPage } from './RiskPage';

const HELP_SEEN_KEY = 'risk-help-seen-v1';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/risk']}>
      <RiskPage />
    </MemoryRouter>,
  );
}

// The svg deliberately has no role="img" (that would hide the territory
// buttons inside it from assistive tech), so grab it by testid.
const boardEl = () => screen.getByTestId('risk-map');
const phaseText = () => screen.getByTestId('risk-phase').textContent ?? '';
const tapEveryTerritory = () => {
  for (const path of boardEl().querySelectorAll<SVGPathElement>('.risk-terr')) fireEvent.click(path);
};

/** Walk the opening deploy: each general places their whole reserve, then passes,
 *  until the campaign opens at the first reinforce. */
function completeDeploy() {
  // Deploy rotates automatically after every army, so sweeping taps across all
  // territories drains every general's reserve without any button presses.
  // Stop the instant the campaign opens so reinforce armies aren't consumed.
  for (let guard = 0; guard < 40 && /Claim|Deploy/i.test(phaseText()); guard++) {
    for (const path of boardEl().querySelectorAll<SVGPathElement>('.risk-terr')) {
      if (!/Claim|Deploy/i.test(phaseText())) return;
      fireEvent.click(path);
    }
  }
}

describe('<RiskPage>', () => {
  // By default mark the rules as already seen so the first-visit guide doesn't
  // pop over the other flows; the how-to-play tests override this explicitly.
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(HELP_SEEN_KEY, '1');
  });

  it('shows a 2–6 player setup', () => {
    renderPage();
    for (const n of [2, 3, 4, 5, 6]) expect(screen.getByTestId(`count-${n}`)).toBeInTheDocument();
    expect(screen.getByTestId('risk-start')).toBeInTheDocument();
  });

  it('saves the campaign automatically and resumes it after a reload', () => {
    const first = renderPage();
    fireEvent.click(screen.getByTestId('count-2'));
    fireEvent.click(screen.getByTestId('risk-start'));

    // Claim three lands, note where the draft stands, then "close the app".
    let clicks = 0;
    for (const path of boardEl().querySelectorAll<SVGPathElement>('.risk-terr')) {
      if (clicks >= 3) break;
      fireEvent.click(path);
      clicks++;
    }
    const phaseBefore = phaseText();
    expect(phaseBefore).toMatch(/Claim/i);
    first.unmount();

    // A fresh visit offers the unfinished campaign…
    renderPage();
    const card = screen.getByTestId('risk-resume');
    expect(card).toHaveTextContent(/2 generals/i);

    // …and resuming lands exactly where the family left off.
    fireEvent.click(screen.getByTestId('risk-resume-btn'));
    expect(phaseText()).toBe(phaseBefore);
  });

  it('abandoning a saved campaign removes it for good', () => {
    const first = renderPage();
    fireEvent.click(screen.getByTestId('count-2'));
    fireEvent.click(screen.getByTestId('risk-start'));
    fireEvent.click(boardEl().querySelectorAll<SVGPathElement>('.risk-terr')[0]);
    first.unmount();

    renderPage();
    fireEvent.click(screen.getByTestId('risk-resume-discard'));
    expect(screen.queryByTestId('risk-resume')).toBeNull();
    expect(localStorage.getItem('risk-campaign-v1')).toBeNull();
  });

  it('offers wild vs balanced dice, defaulting to wild', () => {
    renderPage();
    expect(screen.getByTestId('dice-random').className).toContain('on');

    fireEvent.click(screen.getByTestId('dice-balanced'));
    expect(screen.getByTestId('dice-balanced').className).toContain('on');
    expect(screen.getByTestId('dice-random').className).not.toContain('on');

    // A balanced game still starts and plays normally.
    fireEvent.click(screen.getByTestId('risk-start'));
    expect(screen.getByTestId('risk-phase')).toHaveTextContent(/Claim/i);
  });

  it('starts a game and opens in the deploy phase over the whole board', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('count-4'));
    fireEvent.click(screen.getByTestId('risk-start'));

    // The board renders every territory and opens in the deploy (setup) phase,
    // with the stage + turn banner making the active general unmistakable.
    expect(boardEl().querySelectorAll('.risk-terr').length).toBeGreaterThanOrEqual(30);
    expect(screen.getByTestId('risk-phase')).toHaveTextContent(/Claim/i);
    expect(screen.getByTestId('risk-stage')).toBeInTheDocument();
    expect(screen.getByTestId('risk-turn')).toBeInTheDocument();

    // The parchment is a baked bitmap, never a live feTurbulence filter — the
    // filter re-generated its noise on every zoom-scale change, which is what
    // made pinch cost seconds per frame on tablets.
    expect(boardEl().querySelector('feTurbulence')).toBeNull();
    expect(boardEl().querySelector('.risk-sea')?.getAttribute('filter')).toBeNull();
  });

  it('deploy alternates generals automatically after each army', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('count-2'));
    fireEvent.click(screen.getByTestId('risk-start'));

    const general = () => screen.getByTestId('risk-turn').querySelector('strong')?.textContent ?? '';
    const first = general();

    // Place a single army on the current general's land → the banner flips to
    // the other general without any button press.
    for (const path of boardEl().querySelectorAll<SVGPathElement>('.risk-terr')) {
      fireEvent.click(path);
      if (general() !== first) break;
    }
    expect(general()).not.toBe(first);
    expect(phaseText()).toMatch(/Claim|Deploy/i);
  });

  it('deploys the opening armies, reinforces, then begins attacks', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('risk-start'));

    // Opens in deploy, with a starting reserve to place.
    expect(screen.getByTestId('risk-phase')).toHaveTextContent(/Claim — /i);
    completeDeploy();

    // Every general has deployed, so the campaign opens at reinforce.
    expect(phaseText()).toMatch(/Reinforce/i);
    const toPlace = Number(phaseText().match(/\d+/)![0]);
    expect(toPlace).toBeGreaterThanOrEqual(3);

    // Tapping every territory only places on the current player's own land, so
    // reinforcements drain to zero and the "begin attacks" button unlocks.
    for (let i = 0; i < 8 && /place [1-9]/.test(phaseText()); i++) tapEveryTerritory();
    expect(screen.getByTestId('risk-phase')).toHaveTextContent(/place 0/i);
    expect(screen.getByTestId('end-reinforce')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('end-reinforce'));
    expect(screen.getByTestId('risk-phase')).toHaveTextContent(/Attack/i);
  });

  it('territories are labelled keyboard buttons — Enter and Space both claim', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('count-2'));
    fireEvent.click(screen.getByTestId('risk-start'));

    const terrs = boardEl().querySelectorAll<SVGPathElement>('.risk-terr');
    const first = terrs[0];
    expect(first).toHaveAttribute('role', 'button');
    expect(first).toHaveAttribute('tabindex', '0');
    expect(first.getAttribute('aria-label')).toMatch(/— unclaimed$/);

    // Enter claims the land for the first general (1 army raises the flag)…
    fireEvent.keyDown(first, { key: 'Enter' });
    expect(first.getAttribute('aria-label')).toMatch(/, 1 army$/);

    // …and Space works just the same for the next general.
    const second = terrs[1];
    fireEvent.keyDown(second, { key: ' ' });
    expect(second.getAttribute('aria-label')).toMatch(/, 1 army$/);
  });

  it('every territory gets a generous hit token, even before it is claimed', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('count-2'));
    fireEvent.click(screen.getByTestId('risk-start'));

    const board = boardEl();
    const terrCount = board.querySelectorAll('.risk-terr').length;
    const hits = board.querySelectorAll<SVGCircleElement>('.risk-token-hit');
    // During the claim phase — the tappiest phase — nothing is owned yet, but
    // every single territory still has an enlarged invisible tap circle.
    expect(hits.length).toBe(terrCount);
    for (const c of hits) expect(Number(c.getAttribute('r'))).toBeGreaterThanOrEqual(22);

    // Tapping a hit token claims the land just like tapping the shape.
    const firstTerr = board.querySelector<SVGPathElement>('.risk-terr')!;
    const tid = firstTerr.getAttribute('data-testid')!.replace(/^terr-/, 'token-');
    fireEvent.click(screen.getByTestId(tid));
    expect(firstTerr.getAttribute('aria-label')).toMatch(/, 1 army$/);
  });

  it('musters a computer general from the war council', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('count-2'));

    // Toggling seat 2 to a computer swaps its name box for the persona ladder.
    fireEvent.click(screen.getByTestId('seat-bot-1'));
    expect(screen.queryByTestId('name-1')).toBeNull();
    fireEvent.click(screen.getByTestId('persona-1-flint'));
    fireEvent.click(screen.getByTestId('risk-start'));

    // The human claims one land; the plaque hands off to General Flint…
    fireEvent.click(boardEl().querySelectorAll<SVGPathElement>('.risk-terr')[0]);
    const general = () => screen.getByTestId('risk-turn').querySelector('strong')?.textContent ?? '';
    expect(general()).toBe('General Flint');

    // …who thinks for a moment, claims a land of his own, and hands back.
    await waitFor(() => expect(general()).not.toBe('General Flint'), { timeout: 3000 });
  });

  it('toggling a computer seat back restores the name box', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('seat-bot-0'));
    expect(screen.queryByTestId('name-0')).toBeNull();
    fireEvent.click(screen.getByTestId('seat-bot-0'));
    expect(screen.getByTestId('name-0')).toBeInTheDocument();
  });

  it('opens the how-to-play guide automatically on the first ever visit', () => {
    localStorage.removeItem(HELP_SEEN_KEY);
    renderPage();
    const dialog = screen.getByRole('dialog', { name: /how to play/i });
    expect(dialog).toBeInTheDocument();
    // The three turn steps are spelled out.
    expect(dialog).toHaveTextContent(/Reinforce/);
    expect(dialog).toHaveTextContent(/Attack/);
    expect(dialog).toHaveTextContent(/Fortify/);
    // And it only auto-opens once.
    expect(localStorage.getItem(HELP_SEEN_KEY)).toBe('1');
  });

  it('lets a returning player reopen the rules from the top bar', () => {
    renderPage(); // rules already seen → not shown automatically
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByTestId('risk-help-open'));
    expect(screen.getByRole('dialog', { name: /how to play/i })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('risk-help-close'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('plays two full turns end to end and hands off between generals', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('count-2'));
    fireEvent.click(screen.getByTestId('risk-start'));

    // Deploy both generals' opening armies, then the campaign begins at reinforce.
    completeDeploy();

    const phase = () => screen.getByTestId('risk-phase').textContent ?? '';
    const general = () =>
      screen.getByTestId('risk-turn').querySelector('strong')?.textContent ?? '';

    // Run one player's complete turn: reinforce → attack → fortify → end turn.
    function playTurn() {
      // Reinforce: tapping every territory only places on the current player's
      // own land, so reinforcements drain to zero.
      for (let i = 0; i < 8 && !/place 0/i.test(phase()); i++) tapEveryTerritory();
      expect(phase()).toMatch(/place 0/i);
      fireEvent.click(screen.getByTestId('end-reinforce'));
      expect(phase()).toMatch(/Attack/i);

      // Attack: select a source, and if it lights up a legal target, strike.
      // `targets` is computed from the rules (not layout), so it works in jsdom.
      for (let a = 0; a < 6; a++) {
        let launched = false;
        for (const path of boardEl().querySelectorAll<SVGPathElement>('.risk-terr')) {
          fireEvent.click(path);
          const target = boardEl().querySelector<SVGPathElement>('.risk-terr.target');
          if (target) {
            fireEvent.click(target);
            launched = true;
            break;
          }
        }
        if (!launched) break;
      }
      // At least one attack should have been possible from the opening position,
      // so the dice read-out appears.
      expect(screen.getByTestId('dice-row')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('end-attack'));
      expect(phase()).toMatch(/Fortify/i);
      fireEvent.click(screen.getByTestId('end-turn'));
    }

    const first = general();
    expect(first).toBeTruthy();

    playTurn();
    // The turn has passed to the other general, back at the reinforce phase.
    const second = general();
    expect(second).not.toBe(first);
    expect(phase()).toMatch(/Reinforce/i);

    playTurn();
    // Two players alternate, so play returns to the first general.
    expect(general()).toBe(first);
    expect(phase()).toMatch(/Reinforce/i);
  });
});
