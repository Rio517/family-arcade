#!/usr/bin/env node
/**
 * SessionStart hook — inject this repo's most-forgotten rules into context.
 *
 * CLAUDE.md is loaded every session but skimmed. These are the handful of
 * rules that sessions have actually broken, in the order they cost time.
 * Keep this short: it competes for attention with everything else.
 */

const CONTEXT = `Family Arcade — critical session rules (read before any tool call):

1. GIT: the owner merges PRs within minutes, mid-session, using rebase merges.
   One feature = one branch cut fresh from origin/main. Before EVERY push:
   \`git fetch origin main\`, then \`git cherry origin/main <your-commits>\` — a
   \`-\` prefix means it already landed and you must re-cut a branch and
   cherry-pick. Never stack on merged history. Never create merge commits on
   a PR branch.
2. NEVER chain shell commands with \`&&\`, \`||\`, or \`;\` — one logical operation
   per Bash call. Pipes are fine. The no-compound-commands.mjs PreToolUse hook
   blocks you. (npm-script chaining inside package.json is exempt.)
3. VERIFY: \`npm run check\` (tsc + eslint + knip), \`npx vitest run\`, and
   \`npm run build\` must all be clean. The real typecheck is the \`tsc -b\` in
   build — delete stray *.tsbuildinfo before trusting it.
4. TIDEWAVE FIRST: for application, UI, and TypeScript work, confirm and use
   the project Tidewave MCP for source-aware inspection, runtime evaluation,
   logs, and real-player interactions. Reuse port 5178; if browser control is
   disconnected, connect /tidewave in the user's main Chrome profile. Keep
   Playwright for repeatable viewport, DOM, network, and screenshot evidence.
5. PROVE UI IN A BROWSER: \`npm run shots\` builds, serves, and screenshots into
   docs/screenshots/. Screenshots in a PR get committed with the change.
6. OFFLINE INVARIANT: no CDN fonts, fetched models, or remote images. The sole
   exception is the Caribbean map's approved OpenFreeMap vector tiles/glyphs:
   keep its style local, show an explicit network-unavailable state, and never
   add PMTiles or a tile-extraction pipeline.
7. DETERMINISM: seeded LCGs for anything generated that affects appearance or
   tests. No Math.random in scene or game code.
8. ACCESSIBILITY FLOOR: interactive elements get data-testid and a keyboard
   path; dialogs close on Escape (useDismissOnEscape); animations sit behind
   prefers-reduced-motion; SVG icons, never emoji; pronouns default to they/them.
9. Big visual changes are pitched as mockups first — the family picks, then
   you build.

Canonical references: CLAUDE.md (durable rules) · NEXT_STEP.md (what's queued)
`;

process.stdin.on('data', () => {});
process.stdin.on('end', () => {});

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: CONTEXT,
    },
  }),
);
