#!/usr/bin/env node
/**
 * Build the app, serve it, and screenshot each view into docs/screenshots/.
 *
 *   npm run shots                  # every shot
 *   npm run shots -- landing menu  # only shots whose name contains an argument
 *
 * Three things make this worth a script rather than ad-hoc Playwright calls:
 *
 * 1. `saveIfChanged` — a PNG is written only when its bytes actually differ,
 *    so re-running doesn't churn git with visually identical images.
 * 2. It serves the *production* build on its own port and tears it down, so a
 *    shot never depends on whichever dev server happened to be running (the
 *    dev server also injects CSS in a different order than the build, which
 *    once hid a specificity bug).
 * 3. A shot can fail. `expect` names something that must be on the page and
 *    `fits` says the page must not scroll, so a wrong route or a layout that
 *    overflows a monitor is a red run instead of a plausible-looking picture.
 *    The run exits non-zero if any shot failed; the rest are still written.
 *
 * Browsers: Playwright's bundled Chromium, and WebKit for the shots that ask
 * for it (`engines`). The family plays on iPads, and WebKit composites canvas
 * alpha differently from Chromium — an overlay can look right in one and lose
 * its colour in the other. Install once: `npx playwright install webkit`.
 * PW_CHROMIUM / PW_WEBKIT point at explicit executables (the cloud sandbox has
 * a Chromium at /opt/pw-browsers/...).
 *
 * Camera: the fake device shows a still, dark frame (written here — Chromium's
 * own test pattern carries a clock, which changed the mirror shot every
 * run), enough for the mirror's frame and controls but no face for the
 * dragon to sit on. Set MIRROR_PORTRAIT to a front-facing photo (any jpg/png;
 * ffmpeg must be installed) and the `mirror-face*` shots run against it,
 * straight and tilted, so a new mask or a pose fix can be judged on a head.
 * They are for looking at, not for the repo — a photo of someone is nobody's
 * documentation — so they land in the OS temp directory and the run prints
 * where. Without a portrait they are skipped.
 */

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = path.join(ROOT, 'docs', 'screenshots');
const PORT = Number(process.env.SHOTS_PORT ?? 4317);
const BASE = `http://localhost:${PORT}`;

/**
 * Phone-ish and tablet-ish — the family plays on iPads and phones — and the
 * two monitor sizes a layout has to fill without scrolling.
 */
const PHONE = { width: 430, height: 932 };
const TABLET = { width: 1180, height: 820 };
/** The smaller phones (393×852), where the racer's cast has least room. */
const PHONE_SMALL = { width: 393, height: 852 };
const LAPTOP = { width: 1920, height: 1080 };
const MONITOR = { width: 2560, height: 1440 };

/**
 * The darker-arcade pitch (docs/mockups/20261003-battle-arcade): each
 * start-screen look — today, A, B, C — on the lobby (ships switch and the
 * four levels), the join form and the placing screen at tablet size, and the
 * three new looks at phone size too. `bar=0` keeps the reviewer's switcher out of the picture.
 */
const LOOK_SCREENS = {
  lobby: {
    expect: '[data-testid="level-1"]',
    dressed: '[data-testid="look-hero"]',
    prep: async (page) => {
      await page.getByTestId('level-1').waitFor();
      await page.waitForTimeout(400);
    },
  },
  join: {
    expect: '[data-testid="code-input"]',
    dressed: '[data-testid="look-hero"]',
    prep: async (page) => {
      await page.getByTestId('show-join').click();
      await page.getByTestId('code-input').fill('K7QX');
      await page.waitForTimeout(400);
    },
  },
  placing: {
    expect: '[data-testid="ready"]',
    dressed: '[data-testid="look-steps"]',
    prep: async (page) => {
      await page.getByTestId('level-4').click();
      await page.getByTestId('auto-place').click();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(400);
    },
  },
};
const LOOK_SHOTS = [];
for (const look of ['today', 'a', 'b', 'c']) {
  for (const [screen, s] of Object.entries(LOOK_SCREENS)) {
    LOOK_SHOTS.push({
      name: `bs-look-${look}-${screen}`,
      path: `/#/play?look=${look}&bar=0`,
      viewport: TABLET,
      noSideScroll: true,
      // Masks, reflections and clipped-text titles: checked where the family plays.
      engines: (look !== 'today' && screen === 'lobby') || (look === 'c' && screen === 'placing') ? ['chromium', 'webkit'] : undefined,
      // Today must render no look markup at all; a look must render its own.
      expect: look === 'today' ? s.expect : s.dressed,
      prep: s.prep,
    });
  }
}
for (const look of ['a', 'b', 'c']) {
  for (const screen of ['lobby', 'placing']) {
    const s = LOOK_SCREENS[screen];
    LOOK_SHOTS.push({
      name: `bs-look-${look}-${screen}-phone`,
      path: `/#/play?look=${look}&bar=0`,
      viewport: PHONE,
      fullPage: true,
      noSideScroll: true,
      expect: s.dressed,
      prep: s.prep,
    });
  }
}

/**
 * The darker-arcade pitch's effects (?fx=), on preview-guns.html: the real
 * battle screen fed shots on demand through `window.__bs`. Effects only exist
 * in motion, so these shots run without reduced motion (`motion`) and are
 * timed from the moment the shot goes into the log: a salvo mid-flight and
 * its trail, the carrier's planes, the enemy's shell (and bomber) coming in,
 * the blast, a sinking and the wreck it leaves, a splash, and on the radar
 * the dark water, our hit and an enemy ship going down. Close-ups move the
 * ocean's camera through the harness's `__fleet` hook.
 */
const FX_READY = async (page) => {
  await page.waitForSelector('[data-testid="fleet3d"], [data-testid="fleet3d-fallback"]', { timeout: 20000 });
  await page.waitForTimeout(3000);
};
/**
 * Fire one harness shot (`mine` or `theirs`, a kind; theirs can ask to come
 * by 'plane'), then wait until `ms` after it landed in the log.
 */
const fxShot = async (page, who, kind, ms, via) => {
  const t0 = await page.evaluate(([w, k, v]) => {
    window.__bs[w](k, v);
    return performance.now();
  }, [who, kind, via]);
  const now = await page.evaluate(() => performance.now());
  if (ms - (now - t0) > 0) await page.waitForTimeout(ms - (now - t0));
};
const fxCamera = (page, at, look) =>
  page.evaluate(([p, t]) => {
    const f = window.__fleet;
    f.controls.minDistance = 1;
    f.camera.position.set(...p);
    f.controls.target.set(...t);
    f.controls.update();
  }, [at, look]);
// The harness's first shot goes to the carrier (its planes); the second to
// the battleship's guns, after their answer (the beat, their shell) has played.
const fxSalvo = (ms, camera) => async (page) => {
  await FX_READY(page);
  await fxShot(page, 'mine', 'miss', 1300);
  await fxShot(page, 'theirs', 'miss', 2500);
  if (camera) {
    await fxCamera(page, ...camera);
    await page.waitForTimeout(300);
  }
  await fxShot(page, 'mine', 'hit', ms);
};
const FX_SHOTS = [];
for (const fx of ['today', 'a', 'b']) {
  const path = `/preview-guns.html?fx=${fx}&bar=0`;
  const both = ['chromium', 'webkit'];
  FX_SHOTS.push(
    { name: `bs-fx-${fx}-board`, path, viewport: TABLET, motion: true, engines: both, expect: '[data-testid="fleet3d"]', prep: FX_READY },
    {
      name: `bs-fx-${fx}-board-phone`,
      path,
      viewport: PHONE,
      motion: true,
      engines: both,
      expect: '[data-testid="fleet3d"]',
      prep: async (page) => {
        await page.getByRole('button', { name: 'My Fleet' }).click();
        await FX_READY(page);
      },
    },
    {
      // Our shot coming down on the radar: today it lands at once.
      name: `bs-fx-${fx}-radar-hit`,
      path,
      viewport: TABLET,
      motion: true,
      engines: both,
      prep: async (page) => {
        await FX_READY(page);
        await fxShot(page, 'mine', 'hit', fx === 'today' ? 140 : 1230);
      },
    },
  );
}
for (const fx of ['a', 'b']) {
  const path = `/preview-guns.html?fx=${fx}&bar=0`;
  const both = ['chromium', 'webkit'];
  const close = { path, viewport: TABLET, motion: true, engines: both, selector: '[data-testid="fleet3d"]' };
  const radar = { path, viewport: TABLET, motion: true, engines: both, selector: '.board.enemy' };
  FX_SHOTS.push(
    // Our salvo in the default view: the battleship's shells climbing away
    // to the right, toward the enemy in the east.
    { ...close, name: `bs-fx-${fx}-salvo`, prep: fxSalvo(650) },
    { ...close, name: `bs-fx-${fx}-salvo-modern`, path: `${path}&era=modern`, prep: fxSalvo(650) },
    // The trail up close: the head, the tapering streak, the smoke left hanging.
    { ...close, name: `bs-fx-${fx}-trail`, prep: fxSalvo(640, [[2.6, 1.7, 5.2], [-0.9, 1.5, -1.2]]) },
    {
      // The carrier's turn: planes off the deck, climbing away east.
      ...close,
      name: `bs-fx-${fx}-carrier`,
      prep: async (page) => {
        await FX_READY(page);
        await fxShot(page, 'mine', 'hit', 1000);
      },
    },
    {
      // Their shell, in their colour, coming in high from the east.
      ...close,
      name: `bs-fx-${fx}-incoming`,
      prep: async (page) => {
        await FX_READY(page);
        await fxShot(page, 'theirs', 'hit', 1000);
      },
    },
    {
      ...close,
      name: `bs-fx-${fx}-blast`,
      prep: async (page) => {
        await FX_READY(page);
        // The harness's next hit lands on the carrier's third cell (D2).
        await fxCamera(page, [1.4, 2.5, 0.2], [-1.5, 0.3, -3.3]);
        await fxShot(page, 'theirs', 'hit', 1470);
      },
    },
    {
      ...close,
      name: `bs-fx-${fx}-sinking`,
      prep: async (page) => {
        await FX_READY(page);
        await fxShot(page, 'theirs', 'sunk', 1600);
      },
    },
    {
      // A ship we lost, settled as a dark wreck low in the water, smouldering.
      ...close,
      name: `bs-fx-${fx}-wreck`,
      prep: async (page) => {
        await FX_READY(page);
        await fxCamera(page, [2.2, 2.0, 0.4], [-0.6, 0.2, -3.5]);
        await fxShot(page, 'theirs', 'sunk', 5600);
      },
    },
    {
      ...close,
      name: `bs-fx-${fx}-splash`,
      prep: async (page) => {
        await FX_READY(page);
        // The harness's next miss falls on E8.
        await fxCamera(page, [1.2, 2.4, 6.4], [-0.5, 0.3, 2.5]);
        await fxShot(page, 'theirs', 'miss', 1570);
      },
    },
    {
      // The radar's dark water, with a miss, two sunk ships and the sweep on it.
      ...radar,
      name: `bs-fx-${fx}-radar-sea`,
      prep: async (page) => {
        await FX_READY(page);
        await fxShot(page, 'mine', 'miss', 1300);
        await fxShot(page, 'theirs', 'miss', 2600);
      },
    },
    {
      // An enemy ship we sank going down on the radar, over its own cells.
      ...radar,
      name: `bs-fx-${fx}-radar-sink`,
      prep: async (page) => {
        await FX_READY(page);
        await fxShot(page, 'mine', 'sunk', 2150);
      },
    },
    {
      ...close,
      name: `bs-fx-${fx}-fire`,
      prep: async (page) => {
        await FX_READY(page);
        await fxCamera(page, [-0.2, 1.9, -0.1], [-2.6, 0.3, -2.8]);
        await page.waitForTimeout(400);
      },
    },
  );
}
{
  // The modern carrier's jets, and the enemy's dive bomber (while their
  // carrier is afloat, every third attack of theirs comes by plane).
  const path = '/preview-guns.html?fx=a&bar=0';
  const close = { viewport: TABLET, motion: true, engines: ['chromium', 'webkit'], selector: '[data-testid="fleet3d"]' };
  FX_SHOTS.push(
    {
      ...close,
      name: 'bs-fx-a-carrier-modern',
      path: `${path}&era=modern`,
      prep: async (page) => {
        await FX_READY(page);
        await fxShot(page, 'mine', 'hit', 900);
      },
    },
    {
      ...close,
      name: 'bs-fx-a-bomber',
      path,
      prep: async (page) => {
        await FX_READY(page);
        await fxShot(page, 'theirs', 'hit', 1000, 'plane');
      },
    },
  );
}

/**
 * Each shot: where to go, how big, and an optional `prep` that runs before
 * the capture (dismiss an overlay, wait for a canvas to paint, …).
 *
 *   expect    a selector that must be on the page after `prep`; the shot
 *             fails without it (a shot of the wrong page is worse than none)
 *   fits      the page must not scroll in either direction at this viewport
 *   noSideScroll  the page may scroll down but never across (a long phone page)
 *   engines   ['chromium'] by default; add 'webkit' for canvas and alpha work
 *             (saved as <name>.webkit.png)
 *   scale     device pixel ratio, 2 by default; 1 keeps monitor shots small
 *   motion    run without reduced motion (effects caught mid-flight)
 *   camera    'portrait' | 'portrait-tilt' — a real face in the fake camera,
 *             from MIRROR_PORTRAIT; saved outside the repo; skipped when
 *             it isn't set
 */
const SHOTS = [
  {
    name: 'arcade-landing',
    path: '/',
    viewport: TABLET,
    fullPage: true,
    expect: '[data-testid="ticket-open-chess"]',
  },
  {
    name: 'arcade-landing-phone',
    path: '/',
    viewport: PHONE,
    fullPage: true,
    expect: '[data-testid="ticket-open-chess"]',
  },
  {
    // A ticket opened to its poster: picture, facts, blurb, Play.
    name: 'arcade-ticket-open',
    path: '/',
    viewport: TABLET,
    fullPage: true,
    prep: async (page) => {
      await page.getByTestId('ticket-open-chess').click();
      await page.getByTestId('ticket-poster-chess').waitFor();
      await page.waitForTimeout(400);
    },
  },
  {
    name: 'arcade-ticket-open-phone',
    path: '/',
    viewport: PHONE,
    prep: async (page) => {
      await page.getByTestId('ticket-open-racer').click();
      await page.getByTestId('ticket-poster-racer').waitFor();
      await page.getByTestId('ticket-poster-racer').scrollIntoViewIfNeeded();
      // Leave the pill's strip at the bottom clear of the Play button.
      await page.evaluate(() => window.scrollBy(0, 110));
      await page.waitForTimeout(400);
    },
  },
  {
    // Hash route, like every other page: '/privacy' is served the SPA shell
    // and lands on the front page, which is what this shot used to be.
    name: 'privacy',
    path: '/#/privacy',
    viewport: TABLET,
    fullPage: true,
    expect: 'h1:has-text("Privacy")',
  },
  {
    name: 'battle-view',
    path: '/preview-b.html',
    viewport: TABLET,
    // The fleet tile opens on the 3D ocean by default now — wait for the
    // hulls to decode and the hit/miss markers to settle.
    prep: async (page) => {
      await page.waitForSelector('[data-testid="fleet3d"], [data-testid="fleet3d-fallback"]', {
        timeout: 20000,
      });
      await page.waitForTimeout(2500);
    },
  },
  {
    // The battle on a monitor: the radar takes the square the height allows,
    // the ocean the width that's left, and nothing scrolls. One of the two
    // sizes a desk actually has; the wide one below is the other.
    name: 'battle-laptop',
    path: '/preview-b.html',
    viewport: LAPTOP,
    scale: 1,
    fits: true,
    prep: async (page) => {
      await page.waitForSelector('[data-testid="fleet3d"], [data-testid="fleet3d-fallback"]', {
        timeout: 20000,
      });
      await page.waitForTimeout(2500);
    },
  },
  {
    name: 'battle-monitor',
    path: '/preview-b.html',
    viewport: MONITOR,
    scale: 1,
    fits: true,
    prep: async (page) => {
      await page.waitForSelector('[data-testid="fleet3d"], [data-testid="fleet3d-fallback"]', {
        timeout: 20000,
      });
      await page.waitForTimeout(2500);
    },
  },
  {
    // Close-up of the 3D ocean alone — this is where ship meshes get judged.
    name: 'battle-fleet-3d-closeup',
    path: '/preview-b.html',
    viewport: { width: 1500, height: 1000 },
    selector: '[data-testid="fleet3d"]',
    prep: async (page) => {
      await page.click('[data-testid="fleet-view-3d"]');
      await page.waitForSelector('[data-testid="fleet3d"], [data-testid="fleet3d-fallback"]', {
        timeout: 20000,
      });
      await page.waitForTimeout(2500);
    },
  },
  {
    name: 'battle-fleet-3d',
    path: '/preview-b.html',
    viewport: TABLET,
    // Switch the fleet board to the 3D ocean, then wait for three.js to load,
    // the ship meshes to decode, and the water to settle.
    prep: async (page) => {
      await page.click('[data-testid="fleet-view-3d"]');
      await page.waitForSelector('[data-testid="fleet3d"], [data-testid="fleet3d-fallback"]', {
        timeout: 20000,
      });
      await page.waitForTimeout(2500);
    },
  },
  {
    // The same close-up sailing the MODERN navy — Ford, Kirov, Type 055,
    // Virginia, Hobart — so both eras stay reviewable side by side.
    name: 'battle-fleet-3d-modern',
    path: '/preview-b.html?era=modern',
    viewport: { width: 1500, height: 1000 },
    selector: '[data-testid="fleet3d"]',
    prep: async (page) => {
      await page.click('[data-testid="fleet-view-3d"]');
      await page.waitForSelector('[data-testid="fleet3d"], [data-testid="fleet3d-fallback"]', {
        timeout: 20000,
      });
      await page.waitForTimeout(2500);
    },
  },
  {
    // The Ship Battle lobby: the Ships switch, Create/Join, and the four levels.
    name: 'battle-lobby',
    path: '/#/play',
    viewport: TABLET,
    expect: '[data-testid="level-4"]',
    prep: async (page) => {
      await page.getByTestId('level-4').waitFor();
    },
  },
  ...LOOK_SHOTS,
  ...FX_SHOTS,
  {
    // The galaxy set in 3D — where the family's generated ships live (the
    // arrow-fighter pawns lead; more authored pieces land here as they're made).
    name: 'chess-galaxy-3d',
    path: '/#/chess',
    viewport: TABLET,
    prep: async (page) => {
      await page.evaluate(() => {
        localStorage.setItem('chess-view-v1', '3d');
        localStorage.setItem('chess-theme-v1', 'galaxy');
      });
      await page.reload();
      await page.getByTestId('mode-local').click();
      await page.getByTestId('start-local').click();
      await page.getByTestId('chess3d').waitFor();
      // Scene, starfield, and the async piece models all need to land.
      await page.waitForTimeout(3500);
    },
  },
  {
    // The war council with a computer general seated, so the persona ladder
    // and the person/computer toggles are captured.
    name: 'risk-setup',
    path: '/#/risk',
    viewport: TABLET,
    prep: async (page) => {
      const help = page.getByTestId('risk-help-close');
      if (await help.count()) await help.click();
      await page.getByTestId('seat-bot-2').click();
      await page.waitForTimeout(200);
    },
  },
  {
    // The war council with a chair's tincture picker open — no two alike.
    name: 'risk-tinctures',
    path: '/#/risk',
    viewport: TABLET,
    prep: async (page) => {
      const help = page.getByTestId('risk-help-close');
      if (await help.count()) await help.click();
      await page.getByTestId('seat-color-0').click();
      await page.getByTestId('tincture-0-cobalt').waitFor();
    },
  },
  {
    name: 'risk-board',
    path: '/#/risk',
    viewport: TABLET,
    prep: playRiskToAttack,
  },
  {
    name: 'risk-board-phone',
    path: '/#/risk',
    viewport: PHONE,
    prep: playRiskToAttack,
  },
  {
    // Chess same-device: two chairs filled from the roster, White and Black.
    name: 'chess-seats',
    path: '/#/chess',
    viewport: TABLET,
    prep: async (page) => {
      await page.getByTestId('mode-local').click();
      await page.getByTestId('seat-0').waitFor();
      await page.getByTestId('strip-user-seed-flora').click();
    },
  },
  {
    // Free play: the board owns the window; trays, hint and Start/Menu float
    // over its edges. A few pieces placed so the trays' drag path is visible.
    name: 'chess-freeplay',
    path: '/#/chess',
    viewport: TABLET,
    prep: async (page) => {
      await page.getByTestId('mode-free').click();
      await page.getByTestId('fp-board').waitFor();
      await page.getByTestId('fp-tray-w-q').click();
      await page.getByTestId('fp-sq-d1').click();
      await page.getByTestId('fp-tray-w-q').click();
      await page.getByTestId('fp-tray-b-k').click();
      await page.getByTestId('fp-sq-e8').click();
      await page.getByTestId('fp-tray-b-k').click();
    },
  },
  {
    name: 'chess-freeplay-phone',
    path: '/#/chess',
    viewport: PHONE,
    prep: async (page) => {
      await page.getByTestId('mode-free').click();
      await page.getByTestId('fp-board').waitFor();
    },
  },
  {
    // Magic Coins: who's playing, by ticket, before picking a world.
    name: 'unicorn-seats',
    path: '/#/unicorn',
    viewport: TABLET,
    prep: async (page) => {
      await page.getByTestId('uni-players-2').click();
      await page.getByTestId('seat-0').waitFor();
      await page.getByTestId('strip-user-seed-rio').click();
    },
  },
  {
    // The ticket booth gate at a game door: players exist, nobody signed in.
    name: 'player-gate',
    path: '/#/chess',
    viewport: PHONE,
    seed: 'signedOut',
    expect: '[data-testid="pgate-name"]',
  },
  {
    // The party panel wears the signed-in ticket — "You're Klara · Change" —
    // where a name box and five-name chips used to be.
    name: 'party-panel',
    path: '/',
    viewport: PHONE,
    prep: async (page) => {
      await page.getByTestId('party-pill').click();
      await page.getByTestId('playing-as').waitFor();
    },
  },
  {
    // In a party, the friend opened Chess somewhere you aren't: the pill glows
    // gold with the game's name and the panel offers "Join ›". A harness page,
    // because a real party needs a second device.
    name: 'party-invite',
    path: '/preview-lobbies.html?scene=invite#/',
    viewport: PHONE,
    prep: async (page) => {
      await page.getByTestId('party-badge').waitFor();
      await page.getByTestId('party-pill').click();
      await page.getByTestId('party-invite').waitFor();
    },
  },
  {
    // The host's side: the friend knocked on Rainbow Racer's door.
    name: 'party-knock',
    path: '/preview-lobbies.html?scene=knock#/',
    viewport: PHONE,
    prep: async (page) => {
      await page.getByTestId('party-badge').waitFor();
      await page.getByTestId('party-pill').click();
      await page.getByTestId('party-knock').waitFor();
    },
  },
  {
    // The big video call with the camera on, wearing the dragon: the effect
    // chips live here (one tile of the party-states gallery).
    name: 'party-effects',
    path: '/preview-party-states.html',
    viewport: { width: 1400, height: 1000 },
    selector: '[data-testid="state-Big call — wearing the dragon"]',
    prep: async (page) => {
      await page.getByTestId('call-effect-dragon').first().waitFor();
      await page.waitForTimeout(600);
    },
  },
  {
    // The whole party layer on one page: every panel, pill and video state.
    name: 'party-states',
    path: '/preview-party-states.html',
    viewport: { width: 1400, height: 1000 },
    fullPage: true,
    prep: async (page) => {
      await page.getByTestId('state-Video, both cameras').waitFor();
      await page.waitForTimeout(600);
    },
  },
  // ── The party is the table: each online lobby in a party (harness page) ──
  {
    // Chess, host in a party: pick a colour, one tap — no code doors.
    name: 'chess-party-host',
    path: '/preview-lobbies.html?scene=host#/chess',
    viewport: TABLET,
    prep: async (page) => {
      await page.getByTestId('mode-online').click();
      await page.getByTestId('chess-party-play').waitFor();
    },
  },
  {
    // Chess, guest in a party: knocked, waiting for the friend to open it.
    name: 'chess-party-guest',
    path: '/preview-lobbies.html?scene=guest#/chess',
    viewport: TABLET,
    prep: async (page) => {
      await page.getByTestId('mode-online').click();
      await page.getByTestId('chess-party-waiting').waitFor();
    },
  },
  {
    name: 'battle-party-host',
    path: '/preview-lobbies.html?scene=host#/play',
    viewport: TABLET,
    prep: async (page) => {
      await page.getByTestId('battle-party-play').waitFor();
    },
  },
  {
    name: 'battle-party-guest',
    path: '/preview-lobbies.html?scene=guest#/play',
    viewport: TABLET,
    prep: async (page) => {
      await page.getByTestId('battle-party-waiting').waitFor();
      await page.waitForTimeout(300);
    },
  },
  {
    name: 'racer-party-host',
    path: '/preview-lobbies.html?scene=host#/racer',
    viewport: TABLET,
    prep: async (page) => {
      await page.getByTestId('racer-mode-net').click();
      await page.getByTestId('racer-driver-unicorn').click();
      await page.getByTestId('racer-party-play').waitFor();
    },
  },
  {
    name: 'racer-party-guest',
    path: '/preview-lobbies.html?scene=guest#/racer',
    viewport: TABLET,
    prep: async (page) => {
      await page.getByTestId('racer-mode-net').click();
      await page.getByTestId('racer-driver-unicorn').click();
      await page.getByTestId('racer-party-waiting').waitFor();
    },
  },
  // Who can race and how each one flies; what a princess or the bunny rides;
  // the open sky a few seconds after Go (the unicorn, three rivals, rings,
  // islands). The racers' pictures and the sky are canvas and 3D, so both
  // engines, at the iPad and a small phone. Pickups land randomly, so the sky's
  // pixels churn a little on every regeneration; that's expected.
  ...[
    {
      name: 'racer-cast',
      expect: '[data-testid="racer-driver-princess"]',
      prep: async (page) => {
        await page.getByTestId('racer-mode-solo').click();
      },
    },
    {
      name: 'racer-rides',
      expect: '[data-testid="racer-mount-bird"]',
      prep: async (page) => {
        await page.getByTestId('racer-mode-solo').click();
        await page.getByTestId('racer-driver-bunny').click();
      },
    },
    {
      name: 'racer-sky',
      expect: '[data-testid="racer-score-3"]',
      prep: async (page) => {
        await page.getByTestId('racer-mode-solo').click();
        await page.getByTestId('racer-driver-unicorn').click();
        await page.waitForSelector('.racer-canvas canvas', { timeout: 20000 });
        // The countdown, then a moment of flight so the pack spreads out.
        await page.waitForTimeout(5200);
      },
    },
  ].flatMap((shot) =>
    [
      { suffix: '', viewport: TABLET },
      { suffix: '-phone', viewport: PHONE_SMALL },
    ].map(({ suffix, viewport }) => ({
      ...shot,
      name: `${shot.name}${suffix}`,
      path: '/#/racer',
      viewport,
      engines: ['chromium', 'webkit'],
    })),
  ),
  // The whole cast in look B (docs/mockups/20261003-racer-chunky), on the
  // harness: each racer turning round (on their usual ride, then the other
  // rides), every pick card, and the four in the race sky at race size. At
  // the iPad and a small phone, in both engines: the race is the game's canvas.
  ...[
    { name: 'racer-cast-turntable', view: 'turntable', fits: true },
    { name: 'racer-cast-turntable-rides', view: 'turntable&cast=rides', fits: true },
    { name: 'racer-cast-pick', view: 'pick', fits: true },
    { name: 'racer-cast-race', view: 'race', fits: true },
  ].flatMap(({ name, view, fits }) =>
    [
      { suffix: '', viewport: TABLET },
      { suffix: '-phone', viewport: PHONE_SMALL },
    ].map(({ suffix, viewport }) => {
      const tall = suffix && view === 'pick';
      return {
        name: `${name}${suffix}`,
        path: `/preview-racer-cast.html?view=${view}`,
        viewport,
        // Eight cards are taller than a phone: the whole page, then.
        fits: tall ? undefined : fits,
        fullPage: tall ? true : undefined,
        selector: tall ? undefined : `[data-testid="cast-${view.split('&')[0]}"]`,
        expect: '[data-ready="1"]',
        engines: ['chromium', 'webkit'],
        prep: async (page) => {
          await page.waitForSelector('[data-ready="1"]', { timeout: 30000 });
        },
      };
    }),
  ),
  {
    // The mode screen on a phone: "Play together", and the rainbow heading
    // with its outline.
    name: 'racer-mode-phone',
    path: '/#/racer',
    viewport: PHONE,
    expect: '[data-testid="racer-mode-net"]',
  },
  {
    // The lobby on a phone: "Play together" and a readable "Switch player".
    name: 'racer-lobby-phone',
    path: '/#/racer',
    viewport: PHONE,
    expect: '[data-testid="racer-create"]',
    prep: async (page) => {
      await page.getByTestId('racer-mode-net').click();
      await page.getByTestId('racer-driver-unicorn').click();
    },
  },
  {
    // The controls hint, clear of the Play together pill, on a phone.
    name: 'racer-hint-phone',
    path: '/#/racer',
    viewport: PHONE,
    expect: '.racer-hint',
    prep: async (page) => {
      await page.getByTestId('racer-mode-solo').click();
      await page.getByTestId('racer-driver-unicorn').click();
      await page.waitForSelector('.racer-canvas canvas', { timeout: 20000 });
      await page.waitForTimeout(1500);
    },
  },
  {
    // The same on an iPad.
    name: 'racer-hint',
    path: '/#/racer',
    viewport: TABLET,
    expect: '.racer-hint',
    prep: async (page) => {
      await page.getByTestId('racer-mode-solo').click();
      await page.getByTestId('racer-driver-unicorn').click();
      await page.waitForSelector('.racer-canvas canvas', { timeout: 20000 });
      await page.waitForTimeout(1500);
    },
  },
  {
    // The corner ‹ in a race asks "Leave the race?" first.
    name: 'racer-leave-phone',
    path: '/#/racer',
    viewport: PHONE,
    expect: '[data-testid="racer-leave"]',
    prep: async (page) => {
      await page.getByTestId('racer-mode-solo').click();
      await page.getByTestId('racer-driver-unicorn').click();
      await page.waitForSelector('.racer-canvas canvas', { timeout: 20000 });
      await page.waitForTimeout(1500);
      await page.getByTestId('racer-back').click();
    },
  },
  {
    name: 'racer-leave',
    path: '/#/racer',
    viewport: TABLET,
    expect: '[data-testid="racer-leave"]',
    prep: async (page) => {
      await page.getByTestId('racer-mode-solo').click();
      await page.getByTestId('racer-driver-unicorn').click();
      await page.waitForSelector('.racer-canvas canvas', { timeout: 20000 });
      await page.waitForTimeout(1500);
      await page.getByTestId('racer-back').click();
    },
  },
  {
    // The Magic Mirror: the glass itself, with the effects panel on it. The
    // glass is cut to the window, so this page never scrolls — on an iPad in
    // landscape least of all.
    name: 'mirror-page',
    path: '/#/mirror',
    viewport: TABLET,
    fits: true,
    expect: '[data-testid="mirror-video"]',
  },
  {
    // The effects themselves, driven by a scripted tracking frame (no camera
    // in CI): two dragons — one breathing fire — plus a peace-sign burst.
    // In both engines: the fire once vanished at the mask's edge on WebKit
    // alone, and this is the shot that would have shown it.
    name: 'mirror-effects',
    path: '/preview-mirror.html',
    viewport: { width: 960, height: 700 },
    selector: '[data-testid="mirror-harness"]',
    engines: ['chromium', 'webkit'],
    prep: async (page) => {
      await page.waitForSelector('[data-ready="1"]', { timeout: 20000 });
    },
  },
  {
    // The dragon on a real head, through the real tracker: does the mask sit
    // on the face, is it the right size, does the fire start at the mouth?
    // Needs MIRROR_PORTRAIT (see the header); skipped otherwise, and never
    // written into docs/.
    name: 'mirror-face',
    path: '/#/mirror',
    viewport: TABLET,
    camera: 'portrait',
    selector: '.mirror-stage',
    prep: waitForMask,
  },
  {
    // The same head, the frame turned 14° clockwise before the camera sees
    // it. The mask must lean with the head; it once leaned against it.
    name: 'mirror-face-tilt',
    path: '/#/mirror',
    viewport: TABLET,
    camera: 'portrait-tilt',
    selector: '.mirror-stage',
    prep: waitForMask,
  },
  {
    // Gulp Universe's menu over the live city, computer holes roaming it. The
    // city is seeded fresh each load, so the picture behind the card churns.
    name: 'gulp',
    path: '/#/gulp',
    viewport: TABLET,
    fits: true,
    expect: '[data-testid="gulp-play"]',
    prep: async (page) => {
      await page.waitForSelector('.gulp-canvas canvas', { timeout: 20000 });
      await page.waitForTimeout(2500);
    },
  },
  {
    // A round under way: the hole, the leaderboard, the clock and the level meter.
    name: 'gulp-round',
    path: '/#/gulp',
    viewport: TABLET,
    fits: true,
    expect: '[data-testid="gulp-hud"]',
    prep: async (page) => {
      await page.getByTestId('gulp-play').click();
      await page.waitForSelector('.gulp-canvas canvas', { timeout: 20000 });
      await page.waitForTimeout(6000);
    },
  },
  {
    // A round on a big monitor: the mini map grows with the screen.
    name: 'gulp-round-monitor',
    path: '/#/gulp',
    viewport: MONITOR,
    fits: true,
    expect: '[data-testid="gulp-minimap"]',
    prep: async (page) => {
      await page.getByTestId('gulp-play').click();
      await page.waitForSelector('.gulp-canvas canvas', { timeout: 20000 });
      await page.waitForTimeout(6000);
    },
  },
  {
    // The phone menu must leave PLAY clear of the arcade's own bottom bar.
    name: 'gulp-phone',
    path: '/#/gulp',
    viewport: PHONE,
    fits: true,
    expect: '[data-testid="gulp-play"]',
    prep: async (page) => {
      await page.waitForSelector('.gulp-canvas canvas', { timeout: 20000 });
      await page.waitForTimeout(2000);
    },
  },
];

/**
 * The mirror's tracker is lazy: ~23 MB of WASM and models on first use, then
 * a few frames before the mask settles on the face. Tuck the panel away so
 * the shot is the head, not the chips.
 */
async function waitForMask(page) {
  await page.getByTestId('mirror-video').waitFor();
  await page.waitForSelector('[data-testid="effects-canvas"]', { timeout: 30000 });
  await page.waitForSelector('[data-testid="effects-loading"]', { state: 'detached', timeout: 60000 });
  await page.getByTestId('mirror-controls-toggle').click();
  await page.waitForTimeout(2500);
}

/**
 * Every shot runs with this roster already in localStorage: the gate would
 * otherwise block each game flow before it starts. Klara is signed in with a
 * little history so the landing's Ticket Booth has something to show; the
 * `player-gate` shot flips activeId to null to capture the gate itself.
 * History stays within ~24h so its labels render as the stable "today"/
 * "yest." instead of churning absolute dates on every regeneration.
 */
const NOW = Date.now();
const SEED_ROSTER = {
  activeId: 'seed-klara',
  users: [
    {
      id: 'seed-rio',
      profile: { name: 'Rio', points: 2150, wins: 18, losses: 9 },
    },
    {
      id: 'seed-klara',
      profile: {
        name: 'Klara',
        points: 1240,
        wins: 12,
        losses: 5,
        history: [
          { code: 'AB12', game: 'chess', opponent: 'Rio', result: 'win', pointsEarned: 100, finishedAt: NOW - 2 * 3600e3 },
          { code: 'CD34', game: 'battleship', opponent: 'Papa', result: 'loss', pointsEarned: 25, finishedAt: NOW - 5 * 3600e3 },
          { code: 'EF56', game: 'battleship', opponent: 'Flora', result: 'win', pointsEarned: 145, finishedAt: NOW - 26 * 3600e3 },
        ],
      },
    },
    {
      id: 'seed-flora',
      profile: { name: 'Flora', points: 980, wins: 9, losses: 6 },
    },
  ],
};

/**
 * Risk has no harness page: the board only exists once a campaign is under way,
 * and getting there means claiming 42 lands and deploying every army — well
 * over a hundred taps. So drive it from inside the page and stop on the attack
 * phase, which is the state worth looking at (the stepper mid-way, the rail
 * populated, a real spread of colours).
 */
async function playRiskToAttack(page) {
  const help = page.getByTestId('risk-help-close');
  if (await help.count()) await help.click();
  await page.getByTestId('count-3').click();
  await page.getByTestId('risk-start').click();

  await page.evaluate(async () => {
    const turn = () => document.querySelector('[data-testid="risk-turn"]')?.textContent ?? '';
    const tick = () => new Promise((r) => setTimeout(r, 0));
    // Cycling the token list spreads the claims around the world instead of
    // handing one general a solid continent.
    for (let i = 0; i < 600 && !/attacks/i.test(turn()); i++) {
      const tokens = document.querySelectorAll('[data-testid^="token-"]');
      if (tokens.length === 0) break;
      tokens[i % tokens.length].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await tick();
      // Placing ends on a button, not a tap, once every army is down.
      const done = document.querySelector('[data-testid="end-reinforce"]');
      if (done && !done.disabled) {
        done.click();
        await tick();
      }
    }
  });
  // Leave a land selected, so the shot shows the brass marching-ants
  // highlight and its glowing targets — the state a mid-attack table sees.
  await page.evaluate(async () => {
    const tick = () => new Promise((r) => setTimeout(r, 0));
    for (const tk of document.querySelectorAll('[data-testid^="token-"]')) {
      tk.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await tick();
      if (document.querySelector('.risk-terr.sel')) return;
    }
  });
  await page.getByTestId('risk-turn').waitFor();
  // The plaque drops in on a spring; let it land.
  await page.waitForTimeout(700);
}

function saveIfChanged(file, buffer) {
  const name = path.basename(file);
  const existing = fs.existsSync(file) ? fs.readFileSync(file) : null;
  if (!existing) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buffer);
    console.log(`  new:       ${name}`);
    return 'new';
  }
  if (!existing.equals(buffer)) {
    fs.writeFileSync(file, buffer);
    console.log(`  updated:   ${name}`);
    return 'updated';
  }
  console.log(`  unchanged: ${name}`);
  return 'unchanged';
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit', ...opts });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)),
    );
  });
}

/** Poll until the preview server answers, rather than sleeping a guessed amount. */
async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`preview server never came up at ${url}`);
}

/**
 * A real face for Chromium's fake camera, which plays a y4m on a loop as the
 * device. The portrait becomes a still 640×480 feed — scaled to fit, padded
 * to the frame, rotated first for the tilt variant — written once per run to
 * the OS temp directory. A portrait that isn't there, or an ffmpeg that
 * isn't, is a clear failure rather than a quiet fall-back to the test pattern.
 */
function cameraFeed(kind) {
  const portrait = process.env.MIRROR_PORTRAIT;
  if (!portrait) return null;
  if (!fs.existsSync(portrait)) throw new Error(`MIRROR_PORTRAIT not found: ${portrait}`);
  const out = path.join(os.tmpdir(), `arcade-mirror-${kind}.y4m`);
  const tilt = kind === 'portrait-tilt' ? 'rotate=14*PI/180:fillcolor=black,' : '';
  const fit = 'scale=640:480:force_original_aspect_ratio=decrease,pad=640:480:(ow-iw)/2:(oh-ih)/2:black';
  try {
    execFileSync(
      'ffmpeg',
      ['-y', '-loglevel', 'error', '-loop', '1', '-i', portrait, '-vf', `${tilt}${fit},format=yuv420p`, '-r', '15', '-t', '2', out],
      { stdio: 'inherit' },
    );
  } catch (err) {
    throw new Error(`could not turn ${portrait} into a camera feed — is ffmpeg installed? (${err.message})`);
  }
  return out;
}

/**
 * The camera when no portrait is asked for: ten identical frames of dark
 * grey, as raw YUV, so the glass is still and the same on every machine. No
 * ffmpeg needed — a y4m is a one-line header and bare planes.
 */
function blankFeed() {
  const w = 640;
  const h = 480;
  const out = path.join(os.tmpdir(), 'arcade-mirror-blank.y4m');
  const frame = Buffer.concat([
    Buffer.from('FRAME\n'),
    Buffer.alloc(w * h, 40), // Y: near-black glass
    Buffer.alloc((w * h) / 2, 128), // U and V: no colour
  ]);
  const frames = Array.from({ length: 10 }, () => frame);
  fs.writeFileSync(out, Buffer.concat([Buffer.from(`YUV4MPEG2 W${w} H${h} F15:1 Ip C420\n`), ...frames]));
  return out;
}

/** One browser per engine and camera feed, launched on first use and reused. */
function browserPool() {
  const browsers = new Map();
  return {
    get(engine, feed) {
      const key = `${engine}:${feed ?? ''}`;
      if (!browsers.has(key)) {
        browsers.set(
          key,
          engine === 'webkit'
            ? webkit.launch({ executablePath: process.env.PW_WEBKIT || undefined })
            : chromium.launch({
                executablePath: process.env.PW_CHROMIUM || undefined,
                args: [
                  // ANGLE gives the 3D scenes a real GL backend headless; without
                  // it the chess/battleship/racer canvases fall back to their
                  // error placeholder.
                  '--use-gl=angle',
                  '--use-angle=default',
                  '--enable-unsafe-swiftshader',
                  // A camera that is always there and always the same: the Magic
                  // Mirror opens straight into the glass, and without one every
                  // shot of it would be the "check the camera permission" door.
                  '--use-fake-ui-for-media-stream',
                  '--use-fake-device-for-media-stream',
                  `--use-file-for-fake-video-capture=${feed ?? blankFeed()}`,
                ],
              }),
        );
      }
      return browsers.get(key);
    },
    async close() {
      for (const b of browsers.values()) await b.then((browser) => browser.close()).catch(() => {});
    },
  };
}

/** What `fits` measures: how far the page scrolls past its viewport, each way. */
function overflow() {
  const d = document.documentElement;
  return { down: d.scrollHeight - d.clientHeight, across: d.scrollWidth - d.clientWidth };
}

async function main() {
  const filters = process.argv.slice(2);
  const shots = filters.length
    ? SHOTS.filter((s) => filters.some((f) => s.name.includes(f)))
    : SHOTS;

  if (shots.length === 0) {
    console.error(`No shot matches ${filters.join(', ')}. Known shots:`);
    for (const s of SHOTS) console.error(`  ${s.name}`);
    process.exitCode = 1;
    return;
  }

  // Made up front, so a bad portrait fails before the build rather than after.
  const feeds = {};
  for (const kind of new Set(shots.map((s) => s.camera).filter(Boolean))) feeds[kind] = cameraFeed(kind);

  console.log('Building (with the battle harness)…');
  await run('npx', ['vite', 'build'], { env: { ...process.env, BUILD_HARNESS: '1' } });

  console.log(`Serving dist on ${BASE}…`);
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
  });

  const browsers = browserPool();
  const failures = [];
  try {
    await waitForServer(BASE);

    console.log(`Capturing ${shots.length} shot(s) into docs/screenshots/`);
    const tally = { new: 0, updated: 0, unchanged: 0, looked: 0, skipped: 0, failed: 0 };

    for (const shot of shots) {
      for (const engine of shot.engines ?? ['chromium']) {
        const label = engine === 'webkit' ? `${shot.name}.webkit` : shot.name;
        if (shot.camera && !feeds[shot.camera]) {
          console.log(`  skipped:   ${label} (set MIRROR_PORTRAIT to a photo for a face)`);
          tally.skipped += 1;
          continue;
        }
        const viewport = shot.viewport ?? TABLET;
        let page;
        try {
          const browser = await browsers.get(engine, shot.camera ? feeds[shot.camera] : null);
          page = await browser.newPage({
            viewport,
            deviceScaleFactor: shot.scale ?? 2,
            // Screenshots are documentation, not a motion demo — and the arcade
            // gates its animations on this, so shots come out settled.
            // (Effects shots opt out with `motion`: an explosion held still is no explosion.)
            reducedMotion: shot.motion ? 'no-preference' : 'reduce',
          });
          const roster =
            shot.seed === 'signedOut' ? { ...SEED_ROSTER, activeId: null } : SEED_ROSTER;
          await page.addInitScript((state) => {
            try {
              localStorage.setItem('arcade.users.v1', JSON.stringify(state));
            } catch {
              /* storage blocked — the gate will show instead */
            }
          }, roster);
          await page.goto(`${BASE}${shot.path}`, { waitUntil: 'networkidle' });
          if (shot.prep) await shot.prep(page);

          // The checks: a shot of the wrong page, or of a page that scrolls
          // where it mustn't, fails here. The picture is still taken, to the
          // temp directory, so what went wrong can be seen.
          const problems = [];
          if (shot.expect && (await page.locator(shot.expect).count()) === 0) {
            problems.push(`expected ${shot.expect} on the page and it isn't there`);
          }
          if (shot.noSideScroll && !shot.fits) {
            const over = await page.evaluate(overflow);
            if (over.across > 0) problems.push(`scrolls ${over.across}px across at ${viewport.width}px wide`);
          }
          if (shot.fits) {
            const over = await page.evaluate(overflow);
            if (over.down > 0 || over.across > 0) {
              problems.push(
                `does not fit ${viewport.width}×${viewport.height}: scrolls ${over.down}px down, ${over.across}px across`,
              );
            }
          }

          // `selector` crops to one element — useful when the thing under
          // review is a canvas inside a wide layout and a full-page shot
          // renders it tiny.
          const target = shot.selector ? page.locator(shot.selector) : page;
          const buffer = await target.screenshot(
            shot.selector ? {} : { fullPage: shot.fullPage ?? false },
          );
          if (problems.length) {
            const file = path.join(os.tmpdir(), 'arcade-shots-failed', `${label}.png`);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, buffer);
            throw new Error(`${problems.join('; ')} — see ${file}`);
          }
          if (shot.camera) {
            // Someone's face: a picture to look at now, not one to commit.
            const file = path.join(os.tmpdir(), 'arcade-shots', `${label}.png`);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, buffer);
            console.log(`  look at:   ${file}`);
            tally.looked += 1;
            continue;
          }
          tally[saveIfChanged(path.join(OUT, `${label}.png`), buffer)] += 1;
        } catch (err) {
          const why = String(err.message ?? err).split('\n')[0];
          console.log(`  FAILED:    ${label} — ${why}`);
          failures.push(`${label}: ${why}`);
          tally.failed += 1;
        } finally {
          await page?.close().catch(() => {});
        }
      }
    }

    console.log(
      `Done — ${tally.new} new, ${tally.updated} updated, ${tally.unchanged} unchanged` +
        (tally.looked ? `, ${tally.looked} outside the repo` : '') +
        (tally.skipped ? `, ${tally.skipped} skipped` : '') +
        (tally.failed ? `, ${tally.failed} FAILED` : '') +
        '.',
    );
    if (failures.length) {
      console.error(`\n${failures.length} shot(s) failed:`);
      for (const f of failures) console.error(`  ${f}`);
      if (failures.some((f) => f.includes("Executable doesn't exist"))) {
        console.error('\nInstall the missing browser with: npx playwright install webkit (or chromium)');
      }
      process.exitCode = 1;
    }
  } finally {
    await browsers.close();
    server.kill();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  if (String(err).includes("Executable doesn't exist")) {
    console.error('\nInstall the browser with: npx playwright install chromium');
    console.error('Or point PW_CHROMIUM at an existing Chromium binary.');
  }
  process.exitCode = 1;
});
