# Working on the Family Arcade

The guide for anyone changing this repo, and for the coding agent working
with them (Claude Code, Codex or another). It holds the architecture
invariants, the git workflow, how to verify a change and the design map.
`CONTRIBUTING.md` is the front door for a first game; `docs/README.md` says
where every kind of doc goes.

## Who this is for

A real family plays this every week: children who love unicorns and rainbows,
space and 3D, and parents with a taste for retro (70s orange, neon signs).
Kid-facing copy is warm and playful; nothing needs a manual. Big visual
changes are pitched as **mockups first** (a local HTML page with ~3 labelled
options), built only after the family picks.

**Mockups** live in `docs/mockups/`: each pitch is a round in
`docs/mockups/rounds/YYYYMMDD-<topic>/` (README front matter, a pick page
with today's design and "none of these", its assets; the write-up records
which option was chosen; nothing is overwritten). Approved screens go in
`screens/`. In `docs/mockups/`, `npm start` serves the shelf on port 4330,
`npm run shots` captures the rounds and `npm run index` regenerates
`index.html`.

**How to write docs here.** Use product terms: the requirement and the
decision, not the person who voiced it. Describe the current state and what
comes next. Do not narrate how the work got here or what an earlier attempt
looked like — `git log` and merged PRs already hold that, and a doc that
repeats it goes stale. Write plainly. Avoid rhetorical constructions such as
"not just X but Y", and do not stack three examples where one is enough.

## Architecture invariants (do not break)

- **Games are modules.** `src/games/<id>/` with `domain/` (pure rules, no
  DOM/network/storage), `components/`, `state/`, `storage/`, `styles/`.
  `src/app/registry.ts` is the ONLY place that lists games — the landing page
  prints a ticket per registry entry automatically. Shared code lives in
  `src/shared/`; shared never imports a game. `npm run new-game -- <id>
  "<Title>"` scaffolds a playable starter from `scripts/templates/game/` and
  makes the registry, icon, colour, shot and poster edits; CI scaffolds one on
  every PR, so a change to a shared API the templates use must update them
  too. The walk-through is `docs/development/adding-a-game.md`;
  `CONTRIBUTING.md` is the front door for outside contributors.
- **Event-sourced multiplayer.** Chess and Ship Battle derive all state by
  replaying an ordered log; online peers reconcile by "longer log wins".
  Consequences: undo/rewind are LOCAL-ONLY; custom starting positions are
  LOCAL-ONLY; never make an online feature that rewrites history.
- **Offline PWA, with one deliberate map exception.** No CDN fonts, fetched 3D
  models, or remote images. The Caribbean real map intentionally loads
  approved OpenFreeMap vector tiles/glyphs at runtime, uses a repository-owned
  style, and shows a clear network-unavailable state. **The map stays online.**
  Bundled PMTiles and tile-extraction pipelines are a closed decision: the cost
  is out of proportion to the payoff, and the approach already failed in
  another project. Do not propose it or accept a plan that reintroduces it.
  3D is procedural three.js geometry (lathe/
  extrude/cones/canvas textures generated in code). three.js loads via
  `React.lazy` so 2D players never download it; chess and battleship share that
  chunk.
- **Determinism.** Seeded LCGs for any generated scenery/randomness that
  affects appearance or tests (starfields, clouds, hull plates, dice bags).
- **Accessibility floors.** Every animation is gated behind
  `prefers-reduced-motion`; interactive elements get `data-testid`, a keyboard
  path, and visible `:focus-visible` states; every dialog closes on Escape via
  `@shared/ui/useDismissOnEscape`; text is 14px or larger; icons are SVG, never
  emoji. Authored prose about people defaults to they/them, while persisted
  product profiles default to he/him. `npm run check` enforces the JSX side of
  this — if you must silence a jsx-a11y rule, do it per-line with a comment
  saying why, never globally.

## Git & PR workflow (the #1 source of wasted work)

PRs are merged **quickly, often mid-session and without warning**, using
**rebase merges** (sometimes squash), and `main` moves several times an hour.
Therefore:

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
5. Deleting remote branches is the maintainer's job, on the GitHub Branches
   page.
6. PR bodies: lead with what the family asked for; include screenshots as
   `https://raw.githubusercontent.com/family-arcade/family-arcade/<sha>/docs/screenshots/<file>.png`
   pinned to the pushed commit. A PR written with a coding agent ends with
   that agent's attribution footer.

## Verification protocol (every change)

1. `npm run gates` — the one gate to run and quote. It runs the three below
   (`npm run check`, `npx vitest run`, `npm run build`), parses the real
   numbers, compares them with `gates-baseline.json` and prints ONE
   `GATES ok|FAIL · …` line: paste that line verbatim in your report, never
   a count from memory. `npm run gates -- --update-baseline` after an
   intended change; say in the commit why it moved. All three clean:
   - `check` = typecheck + ESLint (with jsx-a11y and react-hooks, cached under
     `node_modules/.cache/eslint`) + knip dead-code. Both CI workflows run it
     before the tests. Gates run vitest beside check-then-`vite build`.
   - The REAL typecheck is `npm run typecheck` (`scripts/typecheck.mjs`):
     TypeScript 7 (the `typescript7` dev dependency, native, about a second)
     over `tsconfig.app.json` and `tsconfig.node.json`, clean every time with
     `--composite false`, so no `*.tsbuildinfo` can hide an error. `typescript`
     stays on 5.x only because typescript-eslint needs its API. Bare
     `npx tsc --noEmit` is a silent no-op here (solution-style tsconfig). Don't
     add `baseUrl` back: TypeScript 7 removed it (paths are `./src/...`).
     `npm run build` = typecheck + `vite build`.
   - ESLint has 60-odd *warnings* from eslint-plugin-react-hooks v6's
     React-Compiler-readiness rules. They're deliberately not errors — see the
     rationale in `eslint.config.js`. Don't "fix" them by rewriting the
     game-loop refs; that pattern is intentional.
2. **Prove UI changes in a real browser** — `npm run shots`. It builds, serves
   `dist` on its own port, waits for a real health response, and screenshots
   each view into `docs/screenshots/` (writing only files whose bytes changed).
   - `npm run shots -- battle` filters to one shot while iterating.
   - Add a view by appending to `SHOTS` in `scripts/screenshots.mjs`.
   - `preview-b.html` is the mid-battle harness, built only under
     `BUILD_HARNESS=1` (which `shots` sets) so it never ships in the PWA. It's
     how you reach the Ship Battle board without playing a whole game.
   - In the cloud sandbox, point `PW_CHROMIUM` at
     `/opt/pw-browsers/chromium-*/chrome-linux/chrome`. Locally, Playwright's
     own browsers are used (`npx playwright install chromium webkit` once).
   - **A shot is evidence once you have opened it and said what you see.** A
     file that changed is not a check. Open every shot the change touched
     and name what it shows — the thing you changed, nothing clipped, no
     scrollbar, the right page.
   - **Shots can fail, so make them.** A shot takes `expect` (a selector that
     must be on the page) and `fits` (the page must not scroll at that
     viewport); a run with a failed shot exits non-zero and keeps the failed
     picture in the temp directory. Give a new view an `expect`; give a
     layout that must fill a screen `fits` at the sizes that matter.
   - **Measure at the size the request names.** The sizes that exist here:
     phone 430×932, iPad 1180×820 landscape, laptop 1920×1080, monitor
     2560×1440 (`PHONE`, `TABLET`, `LAPTOP`, `MONITOR`). A layout that
     "uses the whole screen" is checked at the monitor sizes with `fits`,
     not eyeballed on the iPad shot.
   - **The family plays on WebKit.** Shots are Chromium unless a shot lists
     `engines: ['chromium', 'webkit']`. WebKit drops colour where canvas
     alpha is 0 and Chromium does not; anything drawn on a canvas over the
     page (overlays, particles, blend modes) is checked in both, and the
     `.webkit.png` is committed beside the Chromium one.
   - **Cascade questions are answered on the build, never the dev server.**
     Vite dev injects stylesheets in import order and the build concatenates
     them in another; a rule can win on one and lose on the other. `shots`
     serves the build. For specificity work, so should you.
   - **Mask and head-pose work uses a face.** The fake camera is a still,
     dark frame. Set `MIRROR_PORTRAIT=<photo>` and the `mirror-face` shots
     put a real head through the real tracker, straight and tilted; they are
     written to the temp directory (a photo is not documentation) and the
     run prints where. Judge fit, size, and tilt direction there, never on
     the harness silhouettes alone.
3. Screenshots that go in a PR live in `docs/screenshots/` and are committed
   WITH the change. Re-running `shots` also rewrites views whose pixels only
   drift (3D scenes, gradients): compare before committing, and restore the
   ones that did not really change with `git checkout --`.
4. **Test harness pages must load `@shared/styles/tokens.css`** and wrap in
   `.app` — a harness without the design system once produced misleading
   white-background screenshots.
5. If a merged change doesn't show on a device, the deploy is
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
  rainbows), galaxy (Comet Guard vs Nebula Fleet starships over a starfield).
  Theme = data (`ScenePalette`, 2D piece art) + small builders; per-theme page
  chrome is scoped CSS under `.chess-theme-<id>` overriding shared tokens.
- Risk: "The War Room" (`risk.css`) — mahogany/brass/parchment, serif display.
- Icons: line-style SVGs in `src/shared/ui/icons.tsx`, `currentColor`, no emoji.

## Agent tooling in the repo

- **Skills** (`.claude/skills/`): `arcade-game-playbook`, the working pattern
  for building, tuning and shipping a game (read it before game work), and
  `audit`, a fresh sweep of the current code that fixes the small stuff and
  files the rest as findings in a PR. Any agent can read them as plain
  Markdown.
- **Permissions** (`.claude/settings.json`): routine commands (npm scripts,
  vitest, tsc, eslint, knip, everyday git except push, `gh pr`, `gh run`)
  run without a prompt; force-push, remote branch deletion, `npm publish`
  and `rm -rf` ask first. Personal additions go in
  `.claude/settings.local.json`, and personal notes for Claude Code in
  `CLAUDE.local.md`; git ignores both.
- **Node:** 20, pinned in `mise.toml` and `.nvmrc`. A newer Node fails
  hundreds of jsdom tests; `npm run gates` switches to the pinned version
  through mise, and a bare `vitest` under the wrong Node stops with one line
  saying so.

### Tidewave (optional: the live app for an agent)

The `tidewave()` Vite plugin serves an MCP server from the dev server:
`npm run dev:tidewave` on `127.0.0.1:5178`. `.mcp.json` (Claude Code) and
`.codex/config.toml` (Codex; the project must be trusted) point at
`http://127.0.0.1:5178/tidewave/mcp`.

- The tools exist only while that server runs, and a session looks for them
  when it starts. Start the server first, or reconnect afterwards.
- `--strictPort` is intentional: if another process owns 5178, startup fails
  instead of moving to a port that no longer matches `.mcp.json`. Reuse a
  running server; don't start a second Vite server or stop unrelated ones.
- Use it for source-aware discovery, runtime evaluation, logs and real-player
  interactions. Committed evidence still comes from the harnesses
  (`npm run shots`, `caribbean:port-check`, `caribbean:naval-check`).
- The plugin turns itself off in `vite build`; the string `tidewave` appears
  nowhere in `dist/`. Re-check that after upgrading the plugin: a dev tool in
  the bundle would break the offline invariant.
