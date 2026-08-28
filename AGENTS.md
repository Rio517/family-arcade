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
  `src/shared/` and never imports a game.
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
npm run check      # tsc -b, eslint (incl. jsx-a11y), knip dead-code
npx vitest run
npm run build      # the real typecheck; delete stray *.tsbuildinfo first
```

UI changes also need a real browser: `npm run shots` builds, serves, and
screenshots into `docs/screenshots/`. Commit the screenshots with the change.

## Tidewave-first workflow

- For application, UI, and TypeScript work, try the project Tidewave MCP before
  falling back to generic inspection tools. Use it for source-aware discovery,
  runtime evaluation, logs, and real-player browser interactions.
- Reuse the Tidewave-enabled server on `127.0.0.1:5178`; do not start a second
  Vite server or disturb unrelated servers on other ports. If Tidewave browser
  control is disconnected, open `http://127.0.0.1:5178/tidewave` in the user's
  main Chrome profile and reconnect it.
- Tidewave complements Playwright rather than replacing it. Use Playwright MCP
  and the committed screenshot harnesses for repeatable viewport, DOM,
  geometry, network, and visual-regression evidence.
- If Tidewave is unavailable, say so explicitly, preserve the running-server
  state, and continue with the normal source and test tools when possible.

## Shell rules

One logical operation per command — no `&&`, `||`, or `;` chaining. Pipes are
fine. A PreToolUse hook enforces this for Claude Code; other agents should
follow it anyway so tool logs stay readable. Chaining inside `package.json`
scripts is exempt.
