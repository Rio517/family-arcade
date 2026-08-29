import { afterEach, describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RiskPage } from './RiskPage';
import { LINEUP_KEY, resetLineupStore } from '@shared/profile/lineupStore';
import { resetUsersStore, setUsersState } from '@shared/profile/usersStore';
import { addUser, emptyUsersState, setActiveUser } from '@shared/profile/users';

const HELP_SEEN_KEY = 'risk-help-seen-v1';
const CAMPAIGN_KEY = 'risk-campaign-v1';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/risk']}>
      <RiskPage />
    </MemoryRouter>,
  );
}

/** Three tickets on this iPad, with Rio signed in. */
function seedRoster() {
  const roster = addUser(addUser(addUser(emptyUsersState(), 'u1', 'Rio'), 'u2', 'Klara'), 'u3', 'Flora');
  setUsersState(setActiveUser(roster, 'u1'));
}

const savedPlayers = () =>
  (JSON.parse(localStorage.getItem(CAMPAIGN_KEY) ?? 'null')?.state.players ?? []) as {
    name: string;
    bot?: string;
  }[];

// The svg deliberately has no role="img" (that would hide the territory
// buttons inside it from assistive tech), so grab it by testid.
const boardEl = () => screen.getByTestId('risk-map');
// The plaque's name line ("Mario attacks") is always present; the quieter
// count line ("3 left") only exists while there is a count to give.
const turnText = () => screen.getByTestId('risk-turn').textContent ?? '';
const phaseText = () => screen.queryByTestId('risk-phase')?.textContent ?? '';
const tapEveryTerritory = () => {
  for (const path of boardEl().querySelectorAll<SVGPathElement>('.risk-terr')) fireEvent.click(path);
};

/** Walk the opening deploy: each general places their whole reserve, then passes,
 *  until the campaign opens at the first reinforce. */
function completeDeploy() {
  // Deploy rotates automatically after every army, so sweeping taps across all
  // territories drains every general's reserve without any button presses.
  // The Done button only exists once the campaign reaches reinforce — stop
  // there so reinforce armies aren't consumed.
  for (let guard = 0; guard < 40 && !screen.queryByTestId('end-reinforce'); guard++) {
    for (const path of boardEl().querySelectorAll<SVGPathElement>('.risk-terr')) {
      if (screen.queryByTestId('end-reinforce')) return;
      fireEvent.click(path);
    }
  }
}

describe('<RiskPage>', () => {
  // By default mark the rules as already seen so the first-visit guide doesn't
  // pop over the other flows; the how-to-play tests override this explicitly.
  beforeEach(() => {
    localStorage.clear();
    // The roster and the remembered lineup live in module-level stores, so a
    // cleared localStorage isn't enough — re-read them, empty, for every case.
    resetUsersStore();
    resetLineupStore();
    localStorage.setItem(HELP_SEEN_KEY, '1');
  });
  afterEach(() => vi.restoreAllMocks());

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
    expect(phaseBefore).toMatch(/lands free/i);
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

  it('offers wild vs balanced dice, defaulting to balanced', () => {
    renderPage();
    expect(screen.getByTestId('dice-balanced').className).toContain('on');

    fireEvent.click(screen.getByTestId('dice-random'));
    expect(screen.getByTestId('dice-random').className).toContain('on');
    expect(screen.getByTestId('dice-balanced').className).not.toContain('on');

    // A wild-dice game still starts and plays normally.
    fireEvent.click(screen.getByTestId('risk-start'));
    expect(turnText()).toMatch(/picks a land/i);
  });

  it('starts a game and opens in the deploy phase over the whole board', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('count-4'));
    fireEvent.click(screen.getByTestId('risk-start'));

    // The board renders every territory and opens in the deploy (setup) phase,
    // with the stage + turn plaque making the active general unmistakable.
    expect(boardEl().querySelectorAll('.risk-terr').length).toBeGreaterThanOrEqual(30);
    expect(turnText()).toMatch(/picks a land/i);
    expect(phaseText()).toMatch(/lands free/i);
    expect(screen.getByTestId('risk-stage')).toBeInTheDocument();

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
    expect(turnText()).toMatch(/picks a land|places armies/i);
  });

  it('deploys the opening armies, reinforces, then begins attacks', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('risk-start'));

    // Opens in the claim stage, with the free-land count on the plaque.
    expect(turnText()).toMatch(/picks a land/i);
    expect(phaseText()).toMatch(/lands free/i);
    completeDeploy();

    // Every general has deployed, so the campaign opens at reinforce.
    expect(turnText()).toMatch(/places armies/i);
    const toPlace = Number(phaseText().match(/\d+/)![0]);
    expect(toPlace).toBeGreaterThanOrEqual(3);

    // Tapping every territory only places on the current player's own land, so
    // reinforcements drain to zero and the "begin attacks" button unlocks.
    for (let i = 0; i < 8 && /[1-9]\d* left/.test(phaseText()); i++) tapEveryTerritory();
    expect(phaseText()).toMatch(/All placed/i);
    expect(screen.getByTestId('end-reinforce')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('end-reinforce'));
    expect(turnText()).toMatch(/attacks/i);
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

  it('inks each continent bonus onto the map instead of a legend strip', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('count-2'));
    fireEvent.click(screen.getByTestId('risk-start'));

    // Every continent carries its income right on the parchment…
    const bonuses = boardEl().querySelectorAll('.risk-bonus');
    expect(bonuses.length).toBeGreaterThanOrEqual(4);
    for (const b of bonuses) expect(b.textContent).toMatch(/^\+\d+$/);
    // …and the old cartouche in the war bar is gone.
    expect(document.querySelector('.risk-legend')).toBeNull();
  });

  it('after a capture from a tall stack, the general chooses how many march in', () => {
    // Loaded dice: the attacker draws 6s, the defender 1s (three attack dice +
    // two defence dice consume exactly one cycle, so the split never drifts).
    const seq = [0.99, 0.99, 0.99, 0.01, 0.01];
    let at = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => seq[at++ % seq.length]);

    renderPage();
    fireEvent.click(screen.getByTestId('count-2'));
    // Pin wild dice: balanced is the default now, and its bag shuffles would
    // consume the loaded sequence and drift the split.
    fireEvent.click(screen.getByTestId('dice-random'));
    fireEvent.click(screen.getByTestId('risk-start'));
    completeDeploy();

    const armiesOf = (p: SVGPathElement) =>
      Number(/(\d+) arm/.exec(p.getAttribute('aria-label') ?? '')?.[1] ?? 0);
    const name = () => screen.getByTestId('risk-turn').querySelector('strong')?.textContent ?? '';
    const mine = () =>
      [...boardEl().querySelectorAll<SVGPathElement>('.risk-terr')].filter((p) =>
        (p.getAttribute('aria-label') ?? '').includes(`— ${name()},`),
      );

    // Pile every fresh army onto one land so the attack comes from a tall stack
    // (the dice only march 3 in by themselves — extras need armies to spare).
    for (let guard = 0; guard < 30 && !/All placed/i.test(phaseText()); guard++) {
      fireEvent.click(mine()[0]);
    }
    fireEvent.click(screen.getByTestId('end-reinforce'));

    // Attack from the stack until a land falls and the march panel opens.
    fireEvent.click(mine().sort((a, b) => armiesOf(b) - armiesOf(a))[0]);
    for (let a = 0; a < 30 && !screen.queryByTestId('advance-panel'); a++) {
      const target = boardEl().querySelector<SVGPathElement>('.risk-terr.target');
      if (!target) break;
      fireEvent.click(target);
    }

    // The panel offers every spare army, opening at "everyone forward".
    const range = screen.getByTestId('advance-range') as HTMLInputElement;
    expect(Number(range.max)).toBeGreaterThan(0);
    expect(range.value).toBe(range.max);

    // Confirming marches them and settles the conquest — the panel goes away.
    fireEvent.click(screen.getByTestId('advance-confirm'));
    expect(screen.queryByTestId('advance-panel')).toBeNull();
  });

  it('musters a computer general from the war council', async () => {
    renderPage();
    fireEvent.click(screen.getByTestId('count-2'));

    // Toggling seat 2 to a computer swaps its chair for the persona ladder.
    fireEvent.click(screen.getByTestId('seat-bot-1'));
    expect(screen.getByTestId('seat-1')).not.toHaveTextContent(/tap a ticket/i);
    fireEvent.click(screen.getByTestId('persona-1-flint'));
    fireEvent.click(screen.getByTestId('risk-start'));

    // The human claims one land; the plaque hands off to General Flint…
    fireEvent.click(boardEl().querySelectorAll<SVGPathElement>('.risk-terr')[0]);
    const general = () => screen.getByTestId('risk-turn').querySelector('strong')?.textContent ?? '';
    expect(general()).toBe('General Flint');

    // …who thinks for a moment, claims a land of his own, and hands back.
    await waitFor(() => expect(general()).not.toBe('General Flint'), { timeout: 3000 });
  });

  it('toggling a computer seat back frees the chair for a ticket', () => {
    renderPage();
    fireEvent.click(screen.getByTestId('seat-bot-0'));
    expect(screen.getByTestId('persona-0-cadet')).toBeInTheDocument();
    expect(screen.getByTestId('seat-bot-0')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByTestId('seat-bot-0'));
    expect(screen.queryByTestId('persona-0-cadet')).toBeNull();
    expect(screen.getByTestId('seat-0')).toHaveTextContent(/tap a ticket/i);
    expect(screen.getByTestId('seat-bot-0')).toHaveAttribute('aria-pressed', 'false');
  });

  describe('the war council takes its tickets', () => {
    beforeEach(seedRoster);

    it('seats the signed-in general first and invites a tap for the rest', () => {
      renderPage();
      expect(screen.getByTestId('seat-0')).toHaveTextContent('Rio');
      expect(screen.getByTestId('seat-1')).toHaveTextContent(/tap a ticket/i);
      expect(screen.getByTestId('seat-2')).toHaveTextContent(/tap a ticket/i);
      // The chairs come from the roster now — nothing is typed.
      expect(screen.queryByTestId('name-0')).toBeNull();
    });

    it('tapping a ticket in the strip fills the next free chair', () => {
      renderPage();
      fireEvent.click(screen.getByTestId('strip-user-u2'));
      expect(screen.getByTestId('seat-1')).toHaveTextContent('Klara');
      // Seated tickets grey out, and × hands the chair back.
      expect(screen.getByTestId('strip-user-u2')).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(screen.getByTestId('seat-1-clear'));
      expect(screen.getByTestId('seat-1')).toHaveTextContent(/tap a ticket/i);
      expect(screen.getByTestId('strip-user-u2')).toHaveAttribute('aria-disabled', 'false');
    });

    it('changing the number of generals keeps the chairs already filled', () => {
      renderPage();
      fireEvent.click(screen.getByTestId('count-6'));
      fireEvent.click(screen.getByTestId('strip-user-u3'));
      expect(screen.getByTestId('seat-1')).toHaveTextContent('Flora');

      // Shrinking the council and opening it back up doesn't re-deal the
      // table: Flora is still in the chair she took.
      fireEvent.click(screen.getByTestId('count-2'));
      expect(screen.getByTestId('seat-1')).toHaveTextContent('Flora');
      expect(screen.queryByTestId('seat-2')).toBeNull();

      fireEvent.click(screen.getByTestId('count-6'));
      expect(screen.getByTestId('seat-0')).toHaveTextContent('Rio');
      expect(screen.getByTestId('seat-1')).toHaveTextContent('Flora');
      expect(screen.getByTestId('seat-2')).toHaveTextContent(/tap a ticket/i);
    });

    it('handing a seated chair to a computer frees the ticket, and handing it back empties the chair', () => {
      renderPage();
      fireEvent.click(screen.getByTestId('strip-user-u2'));
      expect(screen.getByTestId('seat-1')).toHaveTextContent('Klara');
      expect(screen.getByTestId('strip-user-u2')).toHaveAttribute('aria-disabled', 'true');

      // The chair goes to a computer general — Klara's ticket is handed back
      // to the strip, tappable into any other chair.
      fireEvent.click(screen.getByTestId('seat-bot-1'));
      expect(screen.getByTestId('persona-1-cadet')).toBeInTheDocument();
      expect(screen.getByTestId('strip-user-u2')).toHaveAttribute('aria-disabled', 'false');

      // Turning it back over to a person leaves the chair open rather than
      // re-seating whoever was there — it's a fresh invitation.
      fireEvent.click(screen.getByTestId('seat-bot-1'));
      expect(screen.queryByTestId('persona-1-cadet')).toBeNull();
      expect(screen.getByTestId('seat-1')).toHaveTextContent(/tap a ticket/i);
      expect(screen.getByTestId('strip-user-u2')).toHaveAttribute('aria-disabled', 'false');
    });

    it('a chair handed to a computer shows the persona ladder', () => {
      renderPage();
      fireEvent.click(screen.getByTestId('seat-bot-2'));
      expect(screen.getByTestId('seat-2')).toHaveTextContent('Cadet Pip');
      for (const id of ['cadet', 'wren', 'flint', 'vex']) {
        expect(screen.getByTestId(`persona-2-${id}`)).toBeInTheDocument();
      }
      fireEvent.click(screen.getByTestId('persona-2-vex'));
      expect(screen.getByTestId('persona-2-vex')).toHaveAttribute('aria-checked', 'true');
    });

    it('takes the field with the seated tickets and remembers the lineup', () => {
      const first = renderPage();
      fireEvent.click(screen.getByTestId('strip-user-u2'));
      fireEvent.click(screen.getByTestId('seat-bot-2'));
      fireEvent.click(screen.getByTestId('risk-start'));

      // The rail lists exactly the three chairs, in order.
      const rail = screen.getByTestId('risk-rail');
      expect(rail).toHaveTextContent('Rio');
      expect(rail).toHaveTextContent('Klara');
      expect(rail).toHaveTextContent('Cadet Pip');
      expect(savedPlayers().map((p) => p.name)).toEqual(['Rio', 'Klara', 'Cadet Pip']);
      expect(savedPlayers().map((p) => p.bot ?? null)).toEqual([null, null, 'cadet']);

      // The lineup — tickets and the computer general alike — is remembered.
      expect(JSON.parse(localStorage.getItem(LINEUP_KEY) ?? '{}')).toEqual({
        risk: [{ userId: 'u1' }, { userId: 'u2' }, { bot: 'cadet' }],
      });

      // …so the next war council opens with the same three chairs.
      first.unmount();
      renderPage();
      expect(screen.getByTestId('seat-0')).toHaveTextContent('Rio');
      expect(screen.getByTestId('seat-1')).toHaveTextContent('Klara');
      expect(screen.getByTestId('seat-2')).toHaveTextContent('Cadet Pip');
      expect(screen.getByTestId('persona-2-cadet')).toHaveAttribute('aria-checked', 'true');
    });

    it('a general picks a tincture, and picking one another chair holds swaps them', () => {
      renderPage();
      // Chair 1 (Rio) marches under Crimson; tap the seal and choose Cobalt.
      fireEvent.click(screen.getByTestId('seat-color-0'));
      const cobalt = screen.getByTestId('tincture-0-cobalt');
      expect(cobalt).toHaveAccessibleName(/Cobalt — chair 2 has it; tap to swap/);
      fireEvent.click(cobalt);
      expect(screen.queryByTestId('tincture-0-cobalt')).toBeNull(); // the picker folds away
      // Chair 2 took Crimson in the swap, so no two chairs share a colour.
      fireEvent.click(screen.getByTestId('seat-color-1'));
      expect(screen.getByTestId('tincture-1-crimson')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByTestId('tincture-1-cobalt')).toHaveAccessibleName(/Rio has it; tap to swap/);
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByTestId('tincture-1-crimson')).toBeNull();

      fireEvent.click(screen.getByTestId('risk-start'));
      const saved = JSON.parse(localStorage.getItem(CAMPAIGN_KEY) ?? 'null')?.state.players as { name: string; color: string }[];
      expect(saved[0]).toMatchObject({ name: 'Rio', color: '#3f78bd' });
      expect(saved[1].color).toBe('#cf3a30');
      // An unclaimed chair marches under the tincture it now wears.
      expect(saved[1].name).toBe('Crimson');
      expect(new Set(saved.map((p) => p.color)).size).toBe(saved.length);
      // Remembered for next war night.
      expect(JSON.parse(localStorage.getItem('risk:colors:v1') ?? '[]')[0]).toBe('#3f78bd');
    });

    it('an empty chair still plays, under its banner name', () => {
      renderPage();
      fireEvent.click(screen.getByTestId('count-2'));
      fireEvent.click(screen.getByTestId('risk-start'));
      expect(savedPlayers().map((p) => p.name)).toEqual(['Rio', 'Cobalt']);
    });
  });

  it('opens the how-to-play guide automatically on the first ever visit', () => {
    localStorage.removeItem(HELP_SEEN_KEY);
    renderPage();
    const dialog = screen.getByRole('dialog', { name: /how to play/i });
    expect(dialog).toBeInTheDocument();
    // The three turn steps are spelled out — in words a kid already knows.
    expect(dialog).toHaveTextContent(/Place armies/);
    expect(dialog).toHaveTextContent(/Attack/);
    expect(dialog).toHaveTextContent(/Move armies/);
    expect(dialog).not.toHaveTextContent(/Fortify|Muster/i);
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

    const general = () =>
      screen.getByTestId('risk-turn').querySelector('strong')?.textContent ?? '';

    // Run one player's complete turn: place → attack → move → end turn.
    function playTurn() {
      // Placing: tapping every territory only places on the current player's
      // own land, so the fresh armies drain to zero.
      for (let i = 0; i < 8 && !/All placed/i.test(phaseText()); i++) tapEveryTerritory();
      expect(phaseText()).toMatch(/All placed/i);
      fireEvent.click(screen.getByTestId('end-reinforce'));
      expect(turnText()).toMatch(/attacks/i);

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
      expect(turnText()).toMatch(/moves armies/i);
      fireEvent.click(screen.getByTestId('end-turn'));
    }

    const first = general();
    expect(first).toBeTruthy();

    playTurn();
    // The turn has passed to the other general, back at placing armies.
    const second = general();
    expect(second).not.toBe(first);
    expect(turnText()).toMatch(/places armies/i);

    playTurn();
    // Two players alternate, so play returns to the first general.
    expect(general()).toBe(first);
    expect(turnText()).toMatch(/places armies/i);
  });
});
