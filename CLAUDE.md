# Kny-Flores Family Arcade — working agreements for AI sessions

This repo is a family game console (PWA on GitHub Pages) built almost entirely
through AI pair sessions. This file captures what past sessions learned the
hard way. Read it before touching anything.

## Who this is for

A real family plays this every week: daughters who love unicorns and rainbows,
a son who loves Star Wars and 3D and suggests features, and parents with a
taste for retro (70s orange, neon signs). Kid-facing copy is warm and playful;
nothing needs a manual. Big visual changes are pitched as **mockups first**
(an artifact page with ~3 labelled options), built only after the family picks.

## Architecture invariants (do not break)

- **Games are modules.** `src/games/<id>/` with `domain/` (pure rules, no
  DOM/network/storage), `components/`, `state/`, `storage/`, `styles/`.
  `src/app/registry.ts` is the ONLY place that lists games — the landing page
  prints a ticket per registry entry automatically. Shared code lives in
  `src/shared/`; shared never imports a game.
- **Event-sourced multiplayer.** Chess and Ship Battle derive all state by
  replaying an ordered log; online peers reconcile by "longer log wins".
  Consequences: undo/rewind are LOCAL-ONLY; custom starting positions are
  LOCAL-ONLY; never make an online feature that rewrites history.
- **Offline PWA.** No runtime downloads: no CDN fonts, no fetched 3D models,
  no remote images. 3D is procedural three.js geometry (lathe/extrude/cones/
  canvas textures generated in code). three.js loads via `React.lazy` so 2D
  players never download it; chess and battleship share that chunk.
- **Determinism.** Seeded LCGs for any generated scenery/randomness that
  affects appearance or tests (starfields, clouds, hull plates, dice bags).
- **Accessibility floors.** Every animation is gated behind
  `prefers-reduced-motion`; interactive elements get `data-testid` and
  visible `:focus-visible` states; pronouns for people default to they/them.

## Git & PR workflow (the #1 source of wasted work)

The owner (Rio517) merges PRs **within minutes, mid-session, without warning**,
using **rebase merges** (sometimes squash). Therefore:

1. **One feature = one branch freshly cut from `origin/main`.** Never reuse a
   designated long-lived branch for new work.
2. **Before EVERY push**: `git fetch origin main` and check
   `git cherry origin/main <your-commits>`. A `-` prefix means that commit is
   already in main → your PR merged under you.
3. **If your PR merged while you worked**: commit locally, then
   `git checkout -B <new-branch> origin/main && git cherry-pick <sha>`, push
   the NEW branch, open a NEW PR. Never stack commits on merged history — the
   push may "succeed" by resurrecting a deleted branch and orphaning the work.
4. **Never create internal merge commits** on a PR branch; rebase merging
   replays original commits and re-hits conflicts your merge resolved. If a PR
   conflicts, rebuild it as a single commit whose parent is `origin/main`.
5. `git push --delete` returns 403 in the sandbox — remote branch deletion is
   the owner's job via the GitHub Branches page. Never route around it.
6. The owner develops on main concurrently (they've added whole games —
   Magic Coins, Rainbow Racer). Expect main to move several times per hour.
7. PR bodies: lead with what the family asked for; include screenshots as
   `https://raw.githubusercontent.com/Rio517/yahtzee-calculator/<sha>/docs/screenshots/<file>.png`
   pinned to the pushed commit; end with the Claude Code attribution footer.

## Verification protocol (every change)

1. `npx tsc --noEmit` && `npx vitest run` && `npm run build` — all clean.
2. **Prove UI changes in a real browser.** Headless chromium is preinstalled:
   - executable: `/opt/pw-browsers/chromium-*/chrome-linux/chrome`
   - playwright-core: `/opt/node22/lib/node_modules/playwright/node_modules/playwright-core/index.mjs`
   - pass `--use-gl=angle` for WebGL scenes.
   Serve the production build (`npx vite preview --port 43XX`, increment the
   port each run) and screenshot the actual feature.
3. Screenshots that go in a PR are copied into `docs/screenshots/` and
   committed WITH the change.
4. **Test harness pages must load `@shared/styles/tokens.css`** and wrap in
   `.app` — a harness without the design system once produced misleading
   white-background screenshots that alarmed the owner.
5. If the owner says "I don't see the change" after a merge: the deploy is
   probably fine — the PWA service worker serves the old build until the app
   is fully closed and reopened. Check the deploy run, then explain that.

## Testing gotchas (jsdom)

- No WebGL: 3D components must catch scene-construction errors and render a
  fallback (`*-fallback` testid); tests assert the fallback.
- No `matchMedia` in some setups — guard with `typeof matchMedia === 'function'`.
- No layout: `getBoundingClientRect` returns zeros. Drag/geometry tests stub
  per-element rects keyed off `data-row`/`data-col` attributes.
- Prefer geometry math over `elementFromPoint` for drag hit-testing in app
  code too — per-element hit-tests fall into grid gaps (caused a real bug).
- `pkill -f "vite preview"` exits 144 and kills compound shell commands — run
  it isolated or tolerate the exit code.

## Design system quick map

- Landing (`src/app/`): "Midnight Carnival" — full-width striped awning,
  multicolour bulb strings, chained hanging sign with retro orange neon
  "KNY-FLORES", ticket-style game cards (colour per game via `--c`), the Save
  Station (all resumable games), the Prize Counter. Single committed dark look.
- Chess themes (`chessTheme.tsx`): classic "War Room" (leather/marble/brass,
  matches Risk), unicorn "Cloud Kingdom" (floating terrace, cloud sea,
  rainbows), galaxy (rebels vs the dark side; original-but-evocative ships).
  Theme = data (`ScenePalette`, 2D piece art) + small builders; per-theme page
  chrome is scoped CSS under `.chess-theme-<id>` overriding shared tokens.
- Risk: "The War Room" (`risk.css`) — mahogany/brass/parchment, serif display.
- Icons: line-style SVGs in `src/shared/ui/icons.tsx`, `currentColor`, no emoji.

## Recurring rituals

- `/audit` (see `.claude/skills/audit/`) — a fresh forward-looking sweep of
  the current code: run it when asked, fix the small stuff directly, put the
  rest as findings in the PR body. No report files, no audit history.
- After any PR is opened, tell the owner; they merge fast, so re-check state
  before follow-up pushes (see workflow above).
