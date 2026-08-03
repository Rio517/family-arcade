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
4. PROVE UI IN A BROWSER: \`npm run shots\` builds, serves, and screenshots into
   docs/screenshots/. Screenshots in a PR get committed with the change.
5. OFFLINE INVARIANT: no runtime downloads — no CDN fonts, no fetched models,
   no remote images. Bundle assets through Vite so they hash into dist/.
6. DETERMINISM: seeded LCGs for anything generated that affects appearance or
   tests. No Math.random in scene or game code.
7. ACCESSIBILITY FLOOR: interactive elements get data-testid and a keyboard
   path; dialogs close on Escape (useDismissOnEscape); animations sit behind
   prefers-reduced-motion; SVG icons, never emoji; pronouns default to they/them.
8. Big visual changes are pitched as mockups first — the family picks, then
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
