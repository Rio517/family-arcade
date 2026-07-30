---
name: audit
description: Run the Family Arcade codebase audit — a fresh forward-looking sweep of the current code: health checks, per-dimension review, small fixes applied directly, the rest filed as findings in the PR.
---

# The Family Arcade codebase audit

A fresh sweep of the codebase as it stands today. No history, no report
archive — every run starts from zero and judges only the current code. The
deliverable is a PR: small fixes committed, everything else written up as
findings in the PR body. Keep it honest — an audit that only says nice
things is a wasted audit.

## Phase 0 — Baseline

1. `git fetch origin main` and start from a fresh branch `claude/audit-YYYY-MM-DD`.
2. Record for the PR body: commit SHA, game count (`src/app/registry.ts`),
   test count (`npx vitest run`), build result + bundle sizes
   (`npm run build`, note the large-chunk warnings), and `npx tsc --noEmit`.

## Phase 1 — Dimensions

Review each dimension; for parallel coverage use Explore/general-purpose
subagents (one per dimension) and verify anything they flag yourself before
reporting it. Dimensions:

1. **Correctness** — domain rules modules (`src/games/*/domain`): edge cases,
   invariants (event-log replay purity, "longer log wins" consequences,
   seeded-randomness determinism). Try to construct a failing input for
   anything suspicious; a finding without a reproducible scenario is
   PLAUSIBLE, not CONFIRMED — label it.
2. **Test coverage** — every game's rules module has direct unit tests; every
   user-facing flow has at least one UI test. List untested flows concretely
   ("Risk fortify has no test"), not as percentages.
3. **Offline/PWA integrity** — no runtime fetches to external hosts, all
   assets precached, `registerType`, manifest identity, base-path correctness.
4. **Accessibility** — reduced-motion gating on animations, focus-visible on
   interactive elements, aria-labels on icon-only buttons, tap-target sizes
   on phone.
5. **Performance** — bundle split still sound (three.js lazy chunk shared,
   not duplicated), per-frame allocations in render loops, scene disposal on
   unmount (no leaked WebGL contexts across theme switches). Then go game by
   game — every game in the registry gets its own pass (replay/derivation
   cost as logs grow, re-render structure per action, canvas/3D loop cost,
   storage write frequency) with an honest "worth fixing" vs "fine at family
   scale" verdict per finding.
6. **Consistency** — code follows the module layout, registry pattern,
   testid conventions, per-theme CSS scoping; no game imported by shared/.
7. **Dead weight** — orphaned components, unused CSS blocks, stale screenshots
   in `docs/screenshots/` no longer referenced anywhere, stale scratch/preview
   files.
8. **Code quality & simplicity** — readability and naming (variables, test
   names that state behaviour); deeply nested branching that wants early
   returns or lookup tables; components doing too many jobs vs healthy module
   size; real duplication worth unifying vs healthy independence between game
   modules — and the reverse: abstractions that couple things which should
   stay independent (premature generics, one-caller config objects). Judge
   both directions; don't recommend deduplication for its own sake.
9. **Security** — threat model is a malicious remote peer and untrusted
   stored data, not a server. Wire-message validation depth in every
   protocol.ts (types, ranges, log-length bounds, no prototype pollution);
   peer-supplied strings never reach innerHTML; localStorage parses are
   try/caught and validated so crafted saves can't brick boot; no external
   scripts/CDNs; calculator.html inline JS stays injection-free. Weigh
   findings against the family-game threat model honestly.

## Phase 2 — Verify in the browser

Boot the production build in headless chromium (paths + WebGL flag in
CLAUDE.md) and smoke the arcade end to end: landing renders, each registry
game opens, chess 2D/3D + each theme loads without console errors, a save
appears in the Save Station and resumes. Console errors found here are
findings even if tests pass.

## Phase 3 — Fix / file split

- **Fix in this audit branch** (safe, mechanical, < ~20 lines each): dead
  code removal, missing aria-labels, missing reduced-motion gates, stale
  files. Keep each fix its own commit.
- **File as findings** (anything behavioural, architectural, or judgement-y):
  goes in the PR body with severity (high/medium/low), a concrete scenario,
  and a suggested owner-decision where relevant.

## Phase 4 — PR

Nothing gets committed except the fixes themselves — no report file. Push the
branch and open a PR titled "Audit YYYY-MM-DD: <one-line verdict>" whose body
carries the whole audit:

```
Baseline: commit <sha> · N games · N tests passing · build OK/warnings · tsc clean.

## Fixed in this audit
- ...

## Open findings
- [HIGH|MED|LOW] <area>: <one-line claim> — <scenario> (CONFIRMED|PLAUSIBLE)
```

Follow the CLAUDE.md git workflow — the owner merges fast.
