# Kny-Flores Family Arcade — working agreements for AI sessions

This repo is a family game console (PWA on GitHub Pages) built almost entirely
through AI pair sessions. This file captures what past sessions learned the
hard way. Read it before touching anything.

## Who this is for

A real family plays this every week: daughters who love unicorns and rainbows,
a son who loves Star Wars and 3D and suggests features, and parents with a
taste for retro (70s orange, neon signs). Kid-facing copy is warm and playful;
nothing needs a manual. Big visual changes are pitched as **mockups first**
(a local HTML page with ~3 labelled options), built only after the family
picks. Each pitch keeps its own folder, `docs/mockups/YYYYMMDD-<topic>/`,
holding the write-up, the page, and its assets. The write-up records which
option was chosen. `docs/README.md` says where every other kind of doc goes;
read it before adding a folder.

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
  `src/shared/`; shared never imports a game.
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

1. `npm run check`, `npx vitest run`, `npm run build` — all clean.
   - `check` = `tsc -b` + ESLint (with jsx-a11y and react-hooks) + knip
     dead-code. Both CI workflows run it before the tests.
   - The REAL typecheck is the `tsc -b` inside `npm run build`: bare
     `npx tsc --noEmit` is a silent no-op here (solution-style tsconfig), and
     `tsc -b`'s incremental cache can hide errors — before trusting a build,
     delete stray `*.tsbuildinfo` files like CI's clean room would (two type
     errors shipped this way once).
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
     own browser is used (`npx playwright install chromium` once).
3. Screenshots that go in a PR live in `docs/screenshots/` and are committed
   WITH the change.
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

## Harness enforcement (not just docs)

`.claude/settings.json` carries a read-mostly permission allowlist (npm
scripts, vitest, tsc, eslint, knip, read-only git and gh) so routine work
doesn't prompt; force-push, remote branch deletion, and `rm -rf` stay gated.
Three hooks back the rules that sessions actually broke:

- `.claude/hooks/no-compound-commands.mjs` (PreToolUse) blocks `&&`/`||`/`;`
  chaining. Pipes, `$(...)`, and heredocs are fine. npm-script chaining inside
  `package.json` is exempt — the rule is about tool calls.
- `.claude/hooks/session-critical-rules.mjs` (SessionStart) injects the short
  rules block. Edit it when a rule changes; keep it short or it stops working.
- `.claude/hooks/tidewave-autostart.mjs` (SessionStart) starts the Tidewave dev
  server on port 5178 when nothing is listening, and reports it either way.
  See the Tidewave section below.

Per-machine additions go in `.claude/settings.local.json` (gitignored), not the
shared file.

## Tidewave (in-browser agent tooling)

`.mcp.json` (Claude-compatible clients) and project-scoped
`.codex/config.toml` (Codex clients) both point at
`http://127.0.0.1:5178/tidewave/mcp`, served by the `tidewave()` Vite plugin.
Port 5178 is reserved for this repository's Tidewave-enabled development
server; a separate Caribbean proof-of-concept may use 5173 and must not be
stopped or mistaken for this worktree.

Start the correctly pinned server with:

```sh
npm run dev:tidewave
```

`--strictPort` is intentional: if another process owns 5178, startup fails
instead of silently moving to a port that no longer matches `.mcp.json`.

Three consequences worth knowing:

- **It only works while `npm run dev:tidewave` is running.** The MCP server is
  the dev server. With no dev server there are no Tidewave tools, and the
  session shows it disconnected.
- **A SessionStart hook starts it for you.** `.claude/hooks/tidewave-autostart.mjs`
  checks port 5178 at session start. If nothing answers it runs
  `npm run dev:tidewave` detached, logging to `arcade-tidewave.log` in the
  system temp directory; if the port already answers it does nothing. When it
  has to start the server, it tells the session to say so, because MCP servers
  are read at session start and the tools only appear after a reconnect. If it
  cannot start the server it says that instead of staying quiet.
- **MCP servers are read at session start.** Installing or changing one has no
  effect until the coding-agent session restarts. The project must be trusted
  for Codex to read `.codex/config.toml`. Start the server first, then
  restart/reconnect the session.
- **Use Tidewave first for application, UI, and TypeScript work.** Confirm the
  MCP connection, then use Tidewave for source-aware discovery, runtime
  evaluation, logs, and real-player interactions before reaching for generic
  inspection tools. If browser control reports that no browser is connected,
  open `http://127.0.0.1:5178/tidewave` in the user's main Chrome profile and
  reconnect it. Do not open a different Chrome profile for Tidewave work.
- **Reuse the server on port 5178.** Do not start another Vite server when the
  Tidewave server is already running, and do not stop or repurpose unrelated
  servers on other ports. If Tidewave is unavailable, report that explicitly,
  preserve the current server state, and continue with source/tests when the
  task permits.
- **Tidewave complements, rather than replaces, Playwright.** Use the connected
  Playwright MCP for repeatable viewport, DOM, geometry, console, network, and
  screenshot review. Committed regression evidence still belongs in the
  Playwright/Vitest harnesses (`npm run shots`, `caribbean:port-check`, and
  `caribbean:naval-check`).

The plugin self-disables for `vite build`; the string `tidewave` appears nowhere
in `dist/`, so nothing reaches the installed PWA. Re-check that if the plugin is
ever upgraded — a dev tool leaking into the bundle would break the offline
invariant and add weight for every player.

## Recurring rituals

- `/audit` (see `.claude/skills/audit/`) — a fresh forward-looking sweep of
  the current code: run it when asked, fix the small stuff directly, put the
  rest as findings in the PR body. No report files, no audit history.
- After any PR is opened, tell the owner; they merge fast, so re-check state
  before follow-up pushes (see workflow above).
