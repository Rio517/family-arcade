# AGENTS.md

The durable working agreements for this repo live in **[CLAUDE.md](./CLAUDE.md)**
— architecture invariants, the git/PR workflow, the verification protocol, jsdom
testing gotchas, and the design-system map. Read that file first; it applies to
every agent, not just Claude Code.

What's queued right now lives in **[NEXT_STEP.md](./NEXT_STEP.md)**.

## The short version

- **Games are modules.** `src/games/<id>/` with `domain/` (pure rules — no DOM,
  network, or storage), `components/`, `state/`, `storage/`, `styles/`.
  `src/app/registry.ts` is the only place that lists games. Shared code lives in
  `src/shared/` and never imports a game. `npm run new-game -- <id> "<Title>"`
  scaffolds a starter game from `scripts/templates/game/`; the templates use
  shared APIs, so changing one means updating them (CI scaffolds on every PR).
- **Offline PWA, with one deliberate exception.** Bundle assets through Vite;
  never fetch fonts, models, or images from a URL. The Caribbean real map loads
  approved vector tiles/glyphs from OpenFreeMap at runtime, uses a repository-
  owned style, and shows an explicit network-unavailable state. Never replace
  that decision with bundled PMTiles or a tile-extraction pipeline.
- **Event-sourced multiplayer.** State is derived by replaying an ordered log;
  peers reconcile by "longer log wins". Undo and custom starting positions are
  local-only — never ship an online feature that rewrites history.
- **Determinism.** Seeded LCGs for generated scenery and randomness. No
  `Math.random` where it affects appearance or tests.
- **Accessibility floor.** Keyboard path for every interactive element,
  `data-testid` on interactive elements, dialogs close on Escape
  (`useDismissOnEscape`), animations behind `prefers-reduced-motion`, SVG icons
  rather than emoji, 14px minimum font size. Authored prose defaults to
  they/them for people; the persisted player profile defaults to he/him.

## Verification (all three, every change)

```
npm run gates      # the one gate to run and quote: paste its GATES line verbatim
```

It runs, and fails on a regression against `gates-baseline.json`:

```
npm run check      # tsc -b, eslint (incl. jsx-a11y), knip dead-code
npx vitest run
npm run build      # the real typecheck; delete stray *.tsbuildinfo first
```

UI changes also need a real browser: `npm run shots` builds, serves, and
screenshots into `docs/screenshots/`. Commit the screenshots with the change.
A shot counts once you have opened it and said what it shows. Give new views
an `expect`, give screen-filling layouts `fits` at `LAPTOP` and `MONITOR`,
check canvas overlays in WebKit too (`engines`), and answer CSS cascade
questions on the build — the dev server orders stylesheets differently.
Details in CLAUDE.md, verification step 2.

## Tidewave-first workflow

- For application, UI, and TypeScript work, try the project Tidewave MCP before
  falling back to generic inspection tools. Use it for source-aware discovery,
  runtime evaluation, logs, and real-player browser interactions.
- Reuse the Tidewave-enabled server on `127.0.0.1:5178`; do not start a second
  Vite server or disturb unrelated servers on other ports. If Tidewave browser
  control is disconnected, hand the owner `http://127.0.0.1:5178/tidewave` to
  open and reconnect; never open their browser yourself.
- Tidewave complements Playwright rather than replacing it. Use Playwright MCP
  and the committed screenshot harnesses for repeatable viewport, DOM,
  geometry, network, and visual-regression evidence.
- If Tidewave is unavailable, say so explicitly, preserve the running-server
  state, and continue with the normal source and test tools when possible.

## Shell rules

Chaining with `&&` is fine. Never `rm -rf`: it stalls on a prompt. Delete
files one by one.

## Studio standards (5 October 2026)

- **Art:** Blender is the default for anything sculpted, rigged, UV-mapped or with baked shading. Simple parametric props may be code. Systems (terrain, water, sky, particles, UI, placement) are code. Run the studio's `render-validate` before any GLB counts as delivered. No freelancers or paid art packs. Concept art is drawn at the real game camera.
- **Mockups:** the shared standard is `docs/mockups/` with `screens/` (the spec) and `rounds/YYYYMMDD-<topic>/` (README front matter, a pick page with today's design and "none of these"; nothing is overwritten). Run `npm start`, `npm run shots`, `npm run index`. This repo's shelf port is 4330.
- **Showing a round:** the shelf is running first. Start `npm start` in `docs/mockups` in the background on this repo's port, then `curl` the round's URL for a 200. The message to Mario is one picture (the ask) plus one line with the round's network URL. The server dies with the session that started it, so the next session that shows a round starts it again.
- **Browsers:** all automation is headless. Never open the owner's browser (no `open http://...`, no Claude in Chrome) unless asked; hand over the URL.
- **Blender:** short headless jobs (`blender -b`), at most three at once. The interactive MCP only when the owner is watching.
- **Working with the owner:** when asked for research or plans, build nothing until told to go. Show results as old work next to new work.
- **Knowledge:** the `studio-handbook` skill holds the current answers; add findings there.
