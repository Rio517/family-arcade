---
name: audit
description: Run the recurring Family Arcade codebase audit — health checks, per-dimension review, comparison against the previous audit report, small fixes applied, findings PR'd.
---

# The Family Arcade codebase audit

A repeatable, comparable audit. Each run produces a dated report committed to
`docs/audits/` so successive audits can diff against the last one. Follow the
phases in order; keep the report honest — an audit that only says nice things
is a wasted audit.

## Phase 0 — Baseline

1. `git fetch origin main` and start from a fresh branch `claude/audit-YYYY-MM-DD`.
2. Record: commit SHA, game count (`src/app/registry.ts`), test count
   (`npx vitest run`), build result + bundle sizes (`npm run build`, note the
   large-chunk warnings), and `npx tsc --noEmit`.
3. Read the newest report in `docs/audits/` (if any). Its "Open findings"
   section is this run's starting checklist — verify each one as fixed,
   still-open, or obsolete.

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
   user-facing flow shipped this cycle has at least one UI test. List
   untested flows concretely ("Risk fortify has no test"), not as percentages.
3. **Offline/PWA integrity** — no runtime fetches to external hosts, all
   assets precached, `registerType`, manifest identity, base-path correctness.
4. **Accessibility** — reduced-motion gating on new animations, focus-visible
   on new interactive elements, aria-labels on icon-only buttons, tap-target
   sizes on phone (Risk map territories are a known weak spot).
5. **Performance** — bundle split still sound (three.js lazy chunk shared,
   not duplicated), per-frame allocations in render loops, scene disposal on
   unmount (no leaked WebGL contexts across theme switches).
6. **Consistency** — new code follows the module layout, registry pattern,
   testid conventions, per-theme CSS scoping; no game imported by shared/.
7. **Dead weight** — orphaned components, unused CSS blocks, stale screenshots
   in `docs/screenshots/` no longer referenced by any PR-worthy doc, stale
   scratch/preview files.

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
  goes in the report with severity (high/medium/low), a concrete scenario,
  and a suggested owner-decision where relevant.

## Phase 4 — Report

Write `docs/audits/YYYY-MM-DD.md`:

```
# Audit YYYY-MM-DD (commit <sha>)
Baseline: N games, N tests passing, build OK/warnings, tsc clean.
Since last audit (YYYY-MM-DD): <resolved findings> / <regressions>.

## Fixed in this audit
- ...

## Open findings
- [HIGH|MED|LOW] <area>: <one-line claim> — <scenario> (CONFIRMED|PLAUSIBLE)

## Watchlist
- <things not wrong yet but trending — bundle growth, test gaps, etc.>
```

Commit report + fixes, push the branch, open a PR titled
"Audit YYYY-MM-DD: <one-line verdict>" summarising fixed vs open counts.
Follow the CLAUDE.md git workflow — the owner merges fast.
