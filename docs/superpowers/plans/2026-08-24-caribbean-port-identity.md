# Caribbean Port Identity Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Bridgetown a historically grounded painted harbour, use the site-wide player identity in campaign setup, remove the behaviorless career-length choice, and make every Market interaction visually stable.

**Architecture:** Extend the existing game-neutral profile through its normalizer and pure transitions, then pass an immutable active-player snapshot into Caribbean setup without changing campaign save schemas. Add one local decorative art component beneath the approved port shell, stabilize Market status/layout without changing trade rules, and extend the existing deterministic real-route evidence gate to measure the new asset and geometry contracts.

**Tech Stack:** TypeScript 5.6, React 18, React Router 6, CSS, Vitest, Testing Library, Playwright, Sharp, Vite 5, localStorage-backed profile/campaign persistence, ImageGen-generated local raster art.

**Spec:** `docs/superpowers/specs/2026-08-24-caribbean-port-identity-design.md`

## Global Constraints

- Work only on `codex/caribbean-game`; do not merge, push, rebase, fetch, or touch `main`.
- Preserve the already-approved campaign journal/event/save schemas and all existing campaign bytes.
- Keep the exact supported-screen predicate: width `>= 960`, height `>= 600`, and width `>= height`; no phone/portrait implementation.
- Keep every visible production text size at least `14px`, every active target at least `44x44` CSS px, full keyboard focus, and zero horizontal overflow.
- Keep the exact seven port actions and order; Set Sail remains visible and disabled.
- Keep the six fixed-price goods, unlimited supply, one provisions resource expressed as months, and one Red Jackdaw rumour.
- New site-wide profiles and normalized legacy profiles default to `he/him`; never infer pronouns from a name.
- Authored generic prose may continue to use `they/them`; the persisted player-profile product default is explicitly `he/him`.
- New campaign setup omits career length and creates `adventure`; existing `voyage` and `legend` saves remain valid.
- Use one original local Bridgetown image with no remote runtime dependency, readable text, modern symbols, fantasy, neon, steampunk, or skull-poster imagery.
- The historical art is decorative; gameplay information remains semantic text.
- Market geometry may drift at most `1` CSS pixel before/during/after all 36 legal goods/action combinations; focus must remain on the activated control through pending and resolved states.
- Normal production must still exclude the Battle Lab harness, Caribbean naval GLB, naval scene, and battle CSS; `BUILD_HARNESS=1` must remain green.
- Every production change follows strict RED -> GREEN TDD, named mutation proof, an exact scoped commit, and a fresh independent review before the next task.
- Browser evidence uses the real `/#/caribbean` route, Web Locks, localStorage, and the existing deterministic platform-boundary overrides.
- Evidence is additive and versioned from Task 1 onward. It must retain and fail closed on every
  existing browser, route, build, viewport, fixture, Web Locks, journey,
  accessibility, request, failure, isolation, recovery, screenshot, and
  determinism field while adding `schemaVersion: 2`, `profileIdentity`, `art`,
  and `marketStability`.
- Schema v2 has an exact staged discriminator. Task 1 writes
  `packagePhase: 'profile'` with verified Booth identity and exact
  `not-yet-observed` setup/Market/art branches; Task 2 advances to `setup`, Task
  3 to `market`, Task 4 to `art`, and Task 5 to `complete`. The import-safe
  evaluator rejects any phase/branch mismatch, unknown field, or premature true
  claim. Thus every intermediate metrics commit is valid and fail closed.
- Before Task 1, create the ignored package ledger
  `.superpowers/sdd/2026-08-24-caribbean-port-identity/progress.md`. Each task
  writes its ignored `task-N-report.md`; each fresh reviewer writes
  `task-N-review.md` and round-suffixed reports when needed.
- Every visible UI task runs focused tests, typecheck, `npm run check`, the full
  Vitest suite, normal build, real `caribbean:port-check`, harness build, and
  diff checks serially. Stage the screenshot/metrics bytes owned by that task;
  never leave evidence updates for an unrelated later commit.
- For clean TypeScript builds use `tsc -b --force` or move only the two known
  project `.tsbuildinfo` files into a `mktemp -d` directory; never delete caches
  broadly.

## Plan Approval Gate

Before Task 1 production work, a fresh read-only reviewer must approve this
specification and plan with zero BLOCKER/MAJOR/MINOR findings. Then commit the
immutable execution target:

```bash
git add docs/superpowers/specs/2026-08-24-caribbean-port-identity-design.md \
  docs/superpowers/plans/2026-08-24-caribbean-port-identity.md
git commit -m "docs(caribbean): plan port identity polish"
```

Create the ignored progress ledger after that commit and record the approved
plan commit hash before the first RED. No production edit starts earlier.

---

### Task 1: Add Site-wide Player Pronouns

**Files:**

- Modify: `src/shared/profile/profile.ts`
- Modify: `src/shared/profile/profile.test.ts`
- Modify: `src/shared/profile/useProfile.ts`
- Modify: `src/shared/profile/users.test.ts`
- Modify: `src/app/PlayerBooth.tsx`
- Create: `src/app/PlayerBooth.test.tsx`
- Modify: `src/shared/profile/player.css`
- Modify: `src/app/styles/app.css`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `scripts/caribbean-port-check.mjs`
- Create: `scripts/lib/caribbean-port-identity-evidence.mjs`
- Create: `scripts/lib/caribbean-port-identity-evidence.test.mjs`
- Modify: `docs/screenshots/caribbean-port/metrics.json`
- Create: `docs/screenshots/caribbean-port/player-profile-desktop.png`

**Interfaces:**

- Consumes: existing `Profile`, `normalizeProfile`, `defaultProfile`, `useProfile`, and users-store normalizer contracts.
- Produces:

  ```ts
  export const DEFAULT_PRONOUNS = 'he/him';
  export function normalizePronouns(value: unknown): string;
  export function pronounCodePointLength(value: string): number;
  export function setPronouns(profile: Profile, pronouns: string): Profile;

  export interface Profile {
    name: string;
    pronouns: string;
    // existing fields unchanged
  }

  export interface UseProfile {
    profile: Profile;
    setName(name: string): void;
    setPronouns(pronouns: string): void;
    // existing methods unchanged
  }
  ```

- Storage remains `arcade.users.v1`; missing/invalid profile pronouns normalize additively.
- Task 1 also owns the schema-v2 scaffold:

  ```ts
  type PendingEvidence = { status: 'not-yet-observed' };
  type ProfileOnlyEvidence = {
    status: 'profile-only'; defaultPronouns: 'he/him';
    boothProfilePersisted: true; setup: 'not-yet-observed';
  };
  // packagePhase 'profile' requires ProfileOnlyEvidence plus pending art/market.
  ```

- [ ] **Step 1: Write profile contract RED tests**

  Add tests before production edits:

  ```ts
  expect(defaultProfile().pronouns).toBe('he/him');
  expect(normalizeProfile({ name: 'Mario' }).pronouns).toBe('he/him');
  expect(normalizeProfile({ name: 'Mario', pronouns: ' she/her ' }).pronouns).toBe('she/her');
  expect(normalizeProfile({ name: 'Mario', pronouns: '' }).pronouns).toBe('he/him');
  expect(normalizeProfile({ name: 'Mario', pronouns: 'x'.repeat(25) }).pronouns).toBe('he/him');
  expect(normalizeProfile({ name: 'Mario', pronouns: 7 }).pronouns).toBe('he/him');
  expect(setPronouns(defaultProfile(), '  they/them ')).toMatchObject({ pronouns: 'they/them' });
  expect(setPronouns(defaultProfile(), '   ')).toMatchObject({ pronouns: 'he/him' });
  expect(normalizePronouns('😀'.repeat(24))).toBe('😀'.repeat(24));
  expect(normalizePronouns('😀'.repeat(25))).toBe('he/him');
  expect(pronounCodePointLength('😀'.repeat(24))).toBe(24);
  ```

  Add a users normalizer test proving two stored users retain independent
  pronouns and switching the active ID does not rewrite either profile.

- [ ] **Step 2: Run the focused RED gate**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run \
    src/shared/profile/profile.test.ts \
    src/shared/profile/users.test.ts
  ```

  Expected: FAIL because `Profile.pronouns`, `DEFAULT_PRONOUNS`,
  `normalizePronouns`, and `setPronouns` do not exist.

- [ ] **Step 3: Implement the pure profile boundary**

  In `profile.ts`, normalize by Unicode code points and do not mutate inputs:

  ```ts
  export const DEFAULT_PRONOUNS = 'he/him';

  export function pronounCodePointLength(value: string): number {
    return [...value].length;
  }

  export function normalizePronouns(value: unknown): string {
    if (typeof value !== 'string') return DEFAULT_PRONOUNS;
    const clean = value.trim();
    return clean.length > 0 && pronounCodePointLength(clean) <= 24
      ? clean
      : DEFAULT_PRONOUNS;
  }

  export function setPronouns(profile: Profile, pronouns: string): Profile {
    return { ...profile, pronouns: normalizePronouns(pronouns) };
  }
  ```

  Add `pronouns` to `defaultProfile()` and `normalizeProfile()` while leaving all
  other normalization and legacy-device migration behavior unchanged.

- [ ] **Step 4: Bind `setPronouns` through `useProfile`**

  Import the pure transition and expose a stable callback:

  ```ts
  const setPronouns = useCallback((pronouns: string) => {
    setProfileState(pureSetPronouns(getProfileSnapshot(), pronouns));
  }, []);
  ```

  Return it alongside the existing profile actions.

- [ ] **Step 5: Write Player Booth RED tests**

  Add tests proving:

  - active ticket visibly shows `he/him` for a normalized legacy profile;
  - `Edit profile` opens name and pronoun fields with stable test IDs;
  - saving `Morgan` + `they/them` persists both values and closes the form;
  - blank pronouns save as `he/him`;
  - exactly 24 astral Unicode code points save, while a 25th edit is rejected
    without relying on native `maxLength` and exposes `Use 24 characters or fewer`;
  - switching players changes the displayed pronouns;
  - controls retain visible labels, `44px` minimum static CSS, all visible Booth
    copy is at least `14px`, and the two-field editor fits without overflow at
    the narrow Booth viewport and `1440x900`.

  Required IDs:

  ```text
  booth-edit-profile
  booth-profile-name
  booth-profile-pronouns
  booth-profile-save
  ```

- [ ] **Step 6: Run the Player Booth RED gate**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run src/app/PlayerBooth.test.tsx
  ```

  Expected: FAIL because the booth still exposes only Rename and no pronouns.

- [ ] **Step 7: Implement the compact profile editor**

  Replace only the `rename` mode with `edit-profile`. Maintain separate
  `draftName` and `draftPronouns`; use `setName` and `setPronouns` on one submit.
  Do not set `maxLength=24`: use the shared tested
  `pronounCodePointLength(value)`, retain the last valid value when a user
  attempts a 25th code point, and expose the associated error. Normalize again
  at the persistence boundary for programmatic callers.
  Show the active pronouns beneath the ticket name and helper copy:

  ```text
  Shared across every arcade game.
  ```

  New-player creation remains one-field and inherits `he/him` from
  `defaultProfile()`. Do not add pronouns to Party peer messages.

  Update both `player.css` and the Booth layout rules in `app.css`; bring all
  existing and new visible Booth copy to `14px` or greater and all controls to
  `44px` or greater. Update `AGENTS.md` and `CLAUDE.md` so authored prose may
  still default to `they/them` while the persisted product profile defaults to
  `he/him`.

- [ ] **Step 8: Run GREEN, browser, and mutation gates**

  Run the two focused commands, then all visible-task gates serially:

  ```bash
  mise exec node@20 -- npm run typecheck
  mise exec node@20 -- npx tsc -b --force
  mise exec node@20 -- npm run check
  mise exec node@20 -- npx vitest run
  mise exec node@20 -- npm run build
  mise exec node@20 -- npm run caribbean:port-check
  BUILD_HARNESS=1 mise exec node@20 -- npm run build
  git diff --check
  ```

  Mutation probes, one at a time and restored immediately:

  1. remove the legacy fallback -> the missing-pronoun test fails;
  2. share one pronoun across users -> the switching test fails;
  3. make Edit profile change only the name -> the persistence test fails.

  The real route captures `player-profile-desktop.png` at `1440x900` and
  measures every Booth label/control for the `14px`/`44px` floors and horizontal
  containment. Before writing evidence, capture a missing-module RED for the
  import-safe evaluator, implement the exact v2 retained-v1 schema plus
  `packagePhase: 'profile'`, and mutation-test a missing retained section,
  unknown field, wrong phase, and premature Market/art success. Inspect the PNG
  at original resolution. Write
  `.superpowers/sdd/2026-08-24-caribbean-port-identity/task-1-report.md`.

- [ ] **Step 9: Commit and review Task 1**

  Run changed-file lint and `git diff --check`, inspect the exact diff, then
  commit the implementation:

  ```bash
  git add src/shared/profile/profile.ts src/shared/profile/profile.test.ts \
    src/shared/profile/useProfile.ts src/shared/profile/users.test.ts \
    src/app/PlayerBooth.tsx src/app/PlayerBooth.test.tsx \
    src/shared/profile/player.css src/app/styles/app.css AGENTS.md CLAUDE.md \
    scripts/caribbean-port-check.mjs \
    scripts/lib/caribbean-port-identity-evidence.mjs \
    scripts/lib/caribbean-port-identity-evidence.test.mjs \
    docs/screenshots/caribbean-port/metrics.json \
    docs/screenshots/caribbean-port/player-profile-desktop.png
  git commit -m "feat(profile): add shared pronouns"
  ```

  Request a fresh Task 1 review of the commit. Fix every
  BLOCKER/MAJOR/MINOR through a new RED and separate correction commit, then
  obtain a zero-finding re-review before Task 2 begins.

---

### Task 2: Use Player Identity in Caribbean Setup

**Files:**

- Modify: `src/games/caribbean/components/CaribbeanPage.tsx`
- Modify: `src/games/caribbean/components/CaribbeanPage.test.tsx`
- Modify: `src/games/caribbean/components/setup/CampaignSetup.tsx`
- Modify: `src/games/caribbean/components/setup/CampaignSetup.test.tsx`
- Modify: `src/games/caribbean/styles/production.css`
- Modify: `src/games/caribbean/caribbean.integration.test.tsx`
- Modify: `docs/games/caribbean-career/README.md`
- Modify: `scripts/caribbean-port-check.mjs`
- Modify: `scripts/lib/caribbean-port-identity-evidence.mjs`
- Modify: `scripts/lib/caribbean-port-identity-evidence.test.mjs`
- Modify: `docs/screenshots/caribbean-port/metrics.json`
- Modify: selected `docs/screenshots/caribbean-port/*.png`

**Interfaces:**

- Consumes: Task 1 `Profile.name`, `Profile.pronouns`, and
  `useProfile().setPronouns`; existing `CaribbeanController.start` and unchanged
  `CreateCampaignOptions`.
- Produces:

  ```ts
  export interface CampaignSetupIdentity {
    playerName: string;
    pronouns: string;
    savePronouns(pronouns: string): void;
  }
  ```

- New campaign options remain `{ name, pronouns, talent, length: 'adventure' }`.

- [ ] **Step 1: Write setup identity and career-length RED tests**

  Add component and real-page tests proving:

  ```ts
  expect(screen.getByLabelText('Captain name')).toHaveValue('Mario');
  expect(screen.getByLabelText('Player pronouns')).toHaveValue('he/him');
  expect(screen.queryByLabelText('Career length')).not.toBeInTheDocument();
  ```

  Submit an edited captain name `Red Morgan` and pronouns `they/them`; expect:

  ```ts
  expect(controller.start).toHaveBeenCalledWith({
    name: 'Red Morgan',
    pronouns: 'they/them',
    talent: 'navigation',
    length: 'adventure',
  });
  expect(savePronouns).toHaveBeenCalledWith('they/them');
  ```

  Prove editing captain name does not call the profile `setName`. Prove an
  existing `voyage`/`legend` save still renders its original summary label.
  Add a table of blank, whitespace, malformed programmatic values, 24 astral
  code points, and 25 astral code points. In every submit row compute one
  normalized value and assert exact equality between the `savePronouns` argument
  and `controller.start(...).pronouns`. Assert blank/invalid becomes `he/him`,
  never `they/them` and never throws. Simulate profile persistence failure and
  prove campaign creation still receives the same normalized value.

- [ ] **Step 2: Run the setup RED gate**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run \
    src/games/caribbean/components/setup/CampaignSetup.test.tsx \
    src/games/caribbean/components/CaribbeanPage.test.tsx
  ```

  Expected: FAIL because setup still defaults to `Captain`, `they/them`, and
  renders Career length.

- [ ] **Step 3: Pass the active profile through `CaribbeanPage`**

  `ControllerPage` calls `useProfile()` and constructs a stable identity object
  from `profile.name`, `profile.pronouns`, and `setPronouns`. Pass that object to
  `CampaignSetup`; do not pass it to `PortPage`, recovery, controller, or domain.

- [ ] **Step 4: Implement setup behavior**

  Initialize the editable captain name from `identity.playerName.trim() ||
  'Captain'` and pronouns from the normalized identity value, so the defensive
  signed-out/blank case visibly starts as Captain rather than waiting for submit.
  Relabel the pronoun field `Player pronouns`, add helper text `Shared across
  every arcade game`. Apply the same Unicode code-point input guard and
  accessible overlength error as the Booth. On submit compute exactly once:

  ```ts
  const normalizedPronouns = normalizePronouns(draftPronouns);
  const captainName = draftName.trim() || 'Captain';
  try { identity.savePronouns(normalizedPronouns); } catch { /* campaign still uses it */ }
  await start({ name: captainName, pronouns: normalizedPronouns, talent, length: 'adventure' });
  ```

  Remove `LENGTHS` and the career-length `<select>`. Submit the exact literal
  `length: 'adventure'`. Change introductory copy so it no longer claims every
  field carries a recommended choice. Update the career README to state that
  only Adventure is currently offered; Voyage/Legend are compatibility values
  until their duration mechanics ship.

- [ ] **Step 5: Extend the real integrated journey**

  Seed the active profile as `Mario` + `he/him`; assert setup prefill, create the
  campaign, and verify the persisted campaign captain snapshot. Then change the
  site-wide pronouns and resume; assert the existing journal remains unchanged.

- [ ] **Step 6: Run GREEN and mutation gates**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run \
    src/games/caribbean/components/setup/CampaignSetup.test.tsx \
    src/games/caribbean/components/CaribbeanPage.test.tsx \
    src/games/caribbean/caribbean.integration.test.tsx
  mise exec node@20 -- npm run typecheck
  mise exec node@20 -- npx tsc -b --force
  mise exec node@20 -- npm run check
  mise exec node@20 -- npx vitest run
  mise exec node@20 -- npm run build
  mise exec node@20 -- npm run caribbean:port-check
  BUILD_HARNESS=1 mise exec node@20 -- npm run build
  git diff --check
  ```

  Mutation probes:

  1. restore `Captain` -> real-page prefill fails;
  2. omit `savePronouns` -> profile persistence fails;
  3. restore the Career length select -> absence test fails;
  4. replace `adventure` with `legend` -> exact options test fails.

  Capture and inspect the refreshed `setup-desktop.png`; metrics must prove the
  name/pronoun prefill, exact shared normalized snapshot, no career-length
  control, 14px text, 44px controls, and zero overflow. Advance only the exact
  evidence discriminator to `packagePhase: 'setup'`: profile identity becomes
  fully verified while Market/art remain `not-yet-observed`; add wrong-phase
  evaluator RED/GREEN coverage. Write
  `.superpowers/sdd/2026-08-24-caribbean-port-identity/task-2-report.md`.

- [ ] **Step 7: Commit and review Task 2**

  After the gates pass, inspect and commit the exact Task 2 scope:

  ```bash
  git add src/games/caribbean/components/CaribbeanPage.tsx \
    src/games/caribbean/components/CaribbeanPage.test.tsx \
    src/games/caribbean/components/setup/CampaignSetup.tsx \
    src/games/caribbean/components/setup/CampaignSetup.test.tsx \
    src/games/caribbean/styles/production.css \
    src/games/caribbean/caribbean.integration.test.tsx \
    docs/games/caribbean-career/README.md \
    scripts/caribbean-port-check.mjs \
    scripts/lib/caribbean-port-identity-evidence.mjs \
    scripts/lib/caribbean-port-identity-evidence.test.mjs \
    docs/screenshots/caribbean-port
  git commit -m "fix(caribbean): use player identity in setup"
  ```

  Request a fresh Task 2 review. Every substantive finding receives a new RED,
  a separate fix commit, and a zero-finding re-review before Task 3 begins.

---

### Task 3: Stabilize Every Market Interaction

**Files:**

- Modify: `src/games/caribbean/components/port/Market.tsx`
- Modify: `src/games/caribbean/components/port/Market.test.tsx`
- Modify: `src/games/caribbean/components/port/Tavern.tsx`
- Modify: `src/games/caribbean/components/port/Tavern.test.tsx`
- Modify: `src/games/caribbean/components/port/PortPage.test.tsx`
- Modify: `src/games/caribbean/components/setup/CampaignSetup.test.tsx`
- Modify: `src/games/caribbean/components/recovery/RecoveryPanel.test.tsx`
- Modify: `src/games/caribbean/styles/port.css`
- Modify: `src/games/caribbean/state/useCaribbean.ts`
- Modify: `src/games/caribbean/state/useCaribbean.test.tsx`
- Modify: `scripts/caribbean-port-check.mjs`
- Modify: `scripts/lib/caribbean-port-identity-evidence.mjs`
- Modify: `scripts/lib/caribbean-port-identity-evidence.test.mjs`
- Modify: `docs/screenshots/caribbean-port/metrics.json`
- Modify: selected `docs/screenshots/caribbean-port/*.png`

**Interfaces:**

- Consumes: existing `quoteTrade`, `marketTradeDraft`, `MarketProps`, and
  deterministic production browser gate.
- Produces:

  ```ts
  export type CampaignDispatchOutcome =
    | { kind: 'applied'; eventId: number }
    | { kind: 'not-applied' };

  // CaribbeanController.dispatch returns Promise<CampaignDispatchOutcome>.
  // MarketProps.onTrade and TavernProps.onAccept use the same return type;
  // Tavern deliberately ignores the result, while Market announces it.
  ```

  ```ts
  export interface EvidenceRect {
    x: number;
    y: number;
    width: number;
    height: number;
  }

  export interface MarketGeometrySample {
    phase: 'before' | 'pending' | 'resolved';
    actionTestId: string;
    stage: EvidenceRect;
    rows: readonly EvidenceRect[];
    actionStrips: readonly EvidenceRect[];
    stageClientWidth: number;
    stageScrollWidth: number;
    rowsClientWidth: number;
    rowsScrollWidth: number;
    actionStripWidths: readonly {
      testId: string; clientWidth: number; scrollWidth: number;
    }[];
    scrollLeft: number;
    scrollTop: number;
    focusedTestId: string | null;
    status: '' | 'Saving trade.' | 'Cargo ledger updated.' | 'Trade was not saved.';
    ariaBusy: boolean;
  }
  ```

  ```js
  export function validateMarketStability(samples, maxDrift = 1) {
    // returns { ok: true, maxDrift } or { ok: false, errors }
  }

  const EVIDENCE_CARGO_IDS = Object.freeze([
    'provisions', 'tools', 'luxuries', 'sugar-molasses',
    'tobacco-dyewood', 'powder-arms',
  ]);
  export const EXPECTED_MARKET_ACTION_IDS = EVIDENCE_CARGO_IDS.flatMap((cargoId) => [
    'buy-1', 'buy-5', 'buy-max', 'sell-1', 'sell-5', 'sell-all',
  ].map((action) => `market-${cargoId}-${action}`)).sort();
  ```

- [ ] **Step 1: Write component RED tests for persistent status geometry**

  Add tests proving:

  - every cargo row always renders one `.caribbean-market-reasons` slot;
  - one persistent `data-testid="caribbean-market-status"` polite live region
    remains the same DOM node across idle -> busy -> resolved rerenders;
  - the stable Market container exposes `aria-busy=false -> true -> false` and
    exact idle/saving/success/failure copy;
  - `busy` guards buttons but does not replace each action's quote-derived
    reason with `Trade is being saved`;
  - duplicate clicks while busy still dispatch once;
  - controller dispatch returns `applied` only after publishing the exact event
    and `not-applied` for busy, no journal, consent, conflict, unavailable
    persistence, stale ownership, and rejected save paths;
  - successful, not-applied, and rejected `onTrade` calls clear local pending
    ownership and announce truthful status;
  - the activated button retains focus while pending and after resolution even
    when Max or Sell all becomes illegal; it uses `aria-disabled` plus
    synchronous click/Enter/Space guards until blur, while unrelated illegal
    controls retain native disabled behavior;
  - focusable button identity and all existing draft/quote assertions remain.
  Update every typed `CaribbeanController` fixture in PortPage, CampaignSetup,
  and RecoveryPanel tests to return `{ kind: 'not-applied' }`; the forced
  `tsc -b --force` gate must prove there is no stale `Promise<void>` mock.

- [ ] **Step 2: Capture component RED**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run \
    src/games/caribbean/components/port/Market.test.tsx \
    src/games/caribbean/components/port/Tavern.test.tsx \
    src/games/caribbean/state/useCaribbean.test.tsx
  ```

  Expected: FAIL because `CampaignDispatchOutcome`/typed applied results, empty
  reason slots, the persistent Market live region, truthful status, and retained
  focus behavior do not exist; Tavern/controller fixture compatibility is part
  of the same captured RED boundary.

- [ ] **Step 3: Implement stable Market state presentation**

  First make `CaribbeanController.dispatch` return the closed
  `CampaignDispatchOutcome` without changing event/save semantics. Return
  `applied` only when the candidate journal is actually published; all early
  holds, consent/conflict/failure branches return `not-applied`. Tavern may
  continue ignoring this result.

  Keep `actionView` quote-derived. Render each reason container unconditionally,
  keep one persistent Market container/status node, and use exact copy:

  ```tsx
  <section data-testid="caribbean-market" aria-busy={phase === 'saving'}>
    <p data-testid="caribbean-market-status" aria-live="polite">
      {phase === 'idle' ? '' : phase === 'saving' ? 'Saving trade.'
        : phase === 'success' ? 'Cargo ledger updated.'
        : 'Trade was not saved.'}
    </p>
  </section>
  ```

  Wrap `onTrade` locally as an exact `idle | saving | success | failure` state
  machine. Use `finally` so rejection cannot leave local ownership latched.
  Retain the activated test ID/ref through pending and resolved states. A
  retained action that would otherwise become native-disabled remains a guarded
  `aria-disabled` button until blur; its click and Enter/Space handlers no-op.
  Focusing a different action after settlement clears the old retained action
  and success/failure status to `idle`, giving every next `before` sample exact
  empty status without a timer. Pending is always `Saving trade.`; resolved is
  exactly success or failure.
  Preserve the current-state re-quote immediately before dispatch. Do not change
  prices, deltas, or event shape.

- [ ] **Step 4: Lock CSS geometry**

  Use the existing compact desktop budget and add:

  ```css
  .caribbean-port-stage--market { scrollbar-gutter: stable; }
  .caribbean-market-row { min-block-size: 72px; }
  .caribbean-market-reasons { block-size: 32px; overflow: hidden; }
  .caribbean-market-status { min-block-size: 20px; }
  ```

  Adjust only Market-scoped gaps/padding as needed to retain at least `8px`
  declared vertical clearance at `1440x900`. At `960x600`, only the middle stage
  may scroll. Do not reduce the `14px` text or `44px` controls.

- [ ] **Step 5: Write the import-safe geometry evaluator RED**

  Tests must fail closed on:

  - missing/non-array phases, rows, or action strips;
  - NaN, infinite, negative width/height, or malformed rectangles;
  - missing before/pending/resolved sample for one action;
  - any row/stage/action-strip coordinate or size drift above `1px`;
  - missing/non-finite/negative `clientWidth` or `scrollWidth`, or
    `scrollWidth - clientWidth > 0` for the stage, goods container, or any of
    the six action strips;
  - nonzero `scrollLeft` or `focusedTestId !== actionTestId` in any of the
    before/pending/resolved phases;
  - wrong/missing `ariaBusy` or exact status copy in any phase;
  - fewer or more than six rows;
  - a changing action-strip count.

  Require the exact sorted set of 36 stable action IDs and exactly 108 samples.
  Reject a duplicate ID even when the total count is correct. A Vitest-side
  parity test compares import-safe `EVIDENCE_CARGO_IDS` with production
  `CARGO_IDS`; the Node-executed `.mjs` never imports TypeScript directly.

  The exact `1px` boundary passes and `1.01px` fails.

- [ ] **Step 6: Run evaluator RED, then implement GREEN**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run scripts/lib/caribbean-port-identity-evidence.test.mjs
  ```

  Expected: FAIL resolving the missing module. Implement a pure, import-safe
  evaluator with no browser/server/build side effects, then rerun to GREEN.

- [ ] **Step 7: Extend the real browser gate with a separate Market probe**

  Use a separate context/page/storage namespace so canonical evidence remains
  exactly `market-traded`, `lead-accepted`. For each of the six goods, start a
  clean real campaign and drive this sequence so every action is legal:

  ```text
  Buy 1 -> Sell 1 -> Buy 5 -> Sell 5 -> Buy maximum -> Sell all
  ```

  This yields all 36 stable action IDs and 108 before/pending/resolved samples.
  For each action, deliberately hold the Web Lock callback long enough to sample
  `pending`, then release and sample `resolved`. Record rectangles, widths,
  overflow, status, busy state and focus. Use `validateMarketStability` before
  evidence can be written.
  Advance the exact staged schema to `packagePhase: 'market'`: profile and
  Market branches are verified while art remains `{ status:
  'not-yet-observed' }`. Wrong-phase and premature-art mutations must fail.

- [ ] **Step 8: Run browser RED -> GREEN and mutations**

  Run the prescribed command. If sandbox loopback returns `EPERM`, rerun only
  the same command with scoped escalation:

  ```bash
  mise exec node@20 -- npm run caribbean:port-check
  ```

  Required mutations, restored immediately:

  1. remove `scrollbar-gutter` -> import-safe static CSS contract fails (do not
     claim deterministic browser drift unless an explicit overflow-threshold
     fixture demonstrates it);
  2. restore per-row busy reasons -> persistent reason/status test fails;
  3. allow `1.01px` -> boundary evaluator test fails;
  4. native-disable the activated resolved Sell all/Max -> Chromium focus gate fails;
  5. report `applied` on conflict -> failure-announcement/controller test fails.

- [ ] **Step 9: Run full gates, commit, and review Task 3**

  Run focused tests, typecheck, check, full Vitest, normal build, browser gate,
  harness build, and diff check serially. Inspect every changed screenshot at
  original resolution and write
  `.superpowers/sdd/2026-08-24-caribbean-port-identity/task-3-report.md`, then
  inspect the exact scope and commit:

  ```bash
  mise exec node@20 -- npm run check
  mise exec node@20 -- npx tsc -b --force
  mise exec node@20 -- npx vitest run
  mise exec node@20 -- npm run build
  mise exec node@20 -- npm run caribbean:port-check
  BUILD_HARNESS=1 mise exec node@20 -- npm run build
  git diff --check
  ```

  ```bash
  git add src/games/caribbean/components/port/Market.tsx \
    src/games/caribbean/components/port/Market.test.tsx \
    src/games/caribbean/components/port/Tavern.tsx \
    src/games/caribbean/components/port/Tavern.test.tsx \
    src/games/caribbean/components/port/PortPage.test.tsx \
    src/games/caribbean/components/setup/CampaignSetup.test.tsx \
    src/games/caribbean/components/recovery/RecoveryPanel.test.tsx \
    src/games/caribbean/styles/port.css \
    src/games/caribbean/state/useCaribbean.ts \
    src/games/caribbean/state/useCaribbean.test.tsx \
    scripts/caribbean-port-check.mjs \
    scripts/lib/caribbean-port-identity-evidence.mjs \
    scripts/lib/caribbean-port-identity-evidence.test.mjs \
    docs/screenshots/caribbean-port
  git commit -m "fix(caribbean): stabilize market interactions"
  ```

  Request a fresh Task 3 review. Correct every finding in a separate TDD fix
  commit and obtain a zero-finding re-review before Task 4 begins.

---

### Task 4: Add the Painted Bridgetown Harbour

**Files:**

- Create: `src/games/caribbean/assets/bridgetown-1675.webp`
- Create: `src/games/caribbean/components/port/PortBackdrop.tsx`
- Create: `src/games/caribbean/components/port/PortBackdrop.test.tsx`
- Modify: `src/games/caribbean/components/port/PortPage.tsx`
- Modify: `src/games/caribbean/components/port/PortPage.test.tsx`
- Modify: `src/games/caribbean/styles/port.css`
- Create: `scripts/prepare-caribbean-art.mjs`
- Create: `scripts/lib/caribbean-port-art.test.mjs`
- Create: `docs/games/caribbean-career/bridgetown-asset-report.json`
- Create: `docs/games/caribbean-career/bridgetown-visual-reference.md`
- Modify: `docs/games/caribbean-career/README.md`
- Modify: `scripts/caribbean-port-check.mjs`
- Modify: `scripts/lib/caribbean-port-identity-evidence.mjs`
- Modify: `scripts/lib/caribbean-port-identity-evidence.test.mjs`
- Modify: selected `docs/screenshots/caribbean-port/*.png`
- Modify: `docs/screenshots/caribbean-port/metrics.json`

**Interfaces:**

- Consumes: ImageGen skill/tool, Sharp, existing PortPage shell and theme tokens.
- Produces:

  ```tsx
  export function PortBackdrop(): JSX.Element;
  ```

  ```ts
  interface BridgetownAssetReport {
    asset: 'src/games/caribbean/assets/bridgetown-1675.webp';
    source: 'OpenAI ImageGen';
    generatedSourceIdentity: string;
    generatedOutputHint: string | null;
    prompts: readonly string[];
    width: 1920;
    height: 1080;
    /** Exact positive stat size of the promoted WebP. */
    bytes: number;
    /** Exact 64-character lowercase SHA-256 of the promoted WebP. */
    sha256: string;
    format: 'webp';
    quality: 84;
    optimizationCommand: string;
    sharpVersion: string;
    crop: { fit: 'cover'; position: 'center' };
    /** Normalized x/y/width/height of the selected town/ship subject. */
    subjectRoi: readonly [number, number, number, number];
    historicalReview: 'pass';
    representationReview: 'pass';
    productionStatus: 'promoted';
  }
  ```

  The actual `bytes` and `sha256` are computed from the selected asset before
  commit; they are not guessed.

- [ ] **Step 1: Research the visual basis, read ImageGen, and generate**

  First browse authoritative museum/archive sources and write
  `bridgetown-visual-reference.md` with direct citations for period Caribbean
  vessels, waterfront warehouses, and Bridgetown fortification/harbour form.
  Prefer Barbados Museum/archive collections, Royal Museums Greenwich, British
  Library, Library of Congress, Rijksmuseum, or national archives. Record the
  historical limits plainly. Add a representation gate: no foreground or
  identifiable people, caricature, or enslaved labour as anonymous scenery.

  The main implementer then reads `/Users/marioflores/.codex/skills/.system/imagegen/SKILL.md`
  completely, announces its use, and generates an original image with this
  initial locked prompt:

  ```text
  Wide historical-adventure matte painting of Bridgetown harbour, Barbados,
  circa 1675, viewed from slightly above the timber waterfront. Working port
  with a graceful sloop and restrained square-rigged merchant vessels, timber
  quays, stone and timber warehouses, modest English fortifications, palms and
  humid trade-wind haze, warm late-afternoon Caribbean sunlight, believable
  weathered materials, painterly realism, sophisticated classic pirate-game
  atmosphere. Landscape 16:9 composition. Keep the left third and upper-left
  relatively calm with open water and sky for readable UI; concentrate town,
  rigging and ship detail right of centre. No readable words, no logos, no
  modern flags or symbols, no fantasy buildings, no skull motif, no neon, no
  steampunk, no cinematic poster text, no border, no interface elements. No
  foreground or identifiable people, no caricature, and no anonymous labour as
  scenery; at most distant unidentifiable harbour silhouettes.
  ```

  Inspect each result at original resolution. Reject/regenerate if rigging,
  hulls, architecture, horizon, perspective, period identity, historical review
  or representation review fails. Record every actual generation/edit prompt
  and the final source identity/output hint. There is no arbitrary one-edit cap;
  do not patch raster art with Python.

- [ ] **Step 2: Write the art preparation script and asset RED test**

  `scripts/prepare-caribbean-art.mjs` accepts explicit input/output paths, uses
  Sharp `rotate()`, `resize(1920, 1080, { fit: 'cover', position: 'center' })`,
  removes metadata, and writes WebP quality `84` with no network access.

  The import-safe test reads the production file and report and asserts:

  - exact `1920x1080` WebP metadata;
  - file size is positive and below `900_000` bytes;
  - computed SHA-256/bytes equal the report;
  - source is `OpenAI ImageGen` and status is `promoted`;
  - generated-source identity is non-empty; output hint is retained when the
    tool supplies one and may otherwise be null; prompts include `Bridgetown`,
    `1675`, representation constraints, and every actual edit prompt;
  - exact optimization command, Sharp version and centre-crop contract match;
  - cited visual-reference document exists and both reviews are `pass`;
  - no remote URL appears in the report or CSS.

  Capture RED before asset/report/script exist.

- [ ] **Step 3: Optimize, report, and make the asset gate GREEN**

  Run the preparation script against the selected generated source, compute
  `sha256` and byte length from the production WebP, write the exact report, then
  run:

  ```bash
  mise exec node@20 -- npx vitest run scripts/lib/caribbean-port-art.test.mjs
  ```

- [ ] **Step 4: Write PortBackdrop RED tests**

  Require:

  - one decorative `<img alt="" aria-hidden="true">` with a local Vite URL;
  - stable `data-testid="caribbean-port-art"` and containing layer;
  - loaded state after `load` and fallback state after `error`;
  - no text/interaction/landmark role;
  - failure retains the CSS gradient and all PortPage controls;
  - one backdrop across menu, Market, Tavern, and Log rerenders.

- [ ] **Step 5: Implement `PortBackdrop` and wire PortPage**

  Import the WebP locally and render the backdrop as PortPage's first child.
  Keep load/failure presentation state local to the component; do not place it
  in campaign state or browser persistence.

- [ ] **Step 6: Implement historical-modern CSS composition**

  Add a fixed absolute art layer with `object-fit: cover`, explicit focal
  positions at the four supported viewports, and layered ink/sailcloth scrims.
  Keep status rail/stage/dock above it. Remove the abstract faux skyline blocks;
  keep one thin brass registration line. Reduce broad cyan surfaces and avoid
  large backdrop blur while keeping current typography, control order, focus,
  and density.

  Use CSS custom properties for art focal X/Y so crop tests can assert exact
  supported values. The fallback class uses the existing gradient only. Keep
  measured text on an explicit fully opaque ink backplate (for example
  `#07151d`) so contrast is defined independently of raster pixels, while
  leaving the harbour visibly dominant elsewhere.

  The browser computes the source-to-render transform exactly for
  `object-fit: cover` plus centre positioning. Transform the report's normalized
  `subjectRoi` into each art container, intersect it with the visible container,
  and require at least 70% of the ROI area visible at every supported viewport.
  This is the focal mutation oracle; no visual claim rests on a CSS token alone.

  For contrast, enumerate the exact status-rail, stage-heading/copy and dock text
  selectors; require an opaque computed background and calculate WCAG contrast
  from computed foreground/background colors (`>= 4.5`). For clipping/overlap,
  enumerate the Party pill, rail facts, stage heading/copy, Back control, seven
  port actions and all 36 Market actions. Require each leaf's
  `scrollWidth <= clientWidth`, `scrollHeight <= clientHeight`, viewport
  containment, and zero pairwise intersection among non-ancestor interactive
  rectangles. The intentionally vertically scrolling middle stage is excluded
  only from the leaf `scrollHeight` rule, never from horizontal overflow.

- [ ] **Step 7: Run focused GREEN and visual mutation gates**

  Run:

  ```bash
  mise exec node@20 -- npx vitest run \
    src/games/caribbean/components/port/PortBackdrop.test.tsx \
    src/games/caribbean/components/port/PortPage.test.tsx \
    scripts/lib/caribbean-port-art.test.mjs
  mise exec node@20 -- npm run typecheck
  mise exec node@20 -- npx tsc -b --force
  ```

  Mutations:

  1. replace asset import with remote URL -> offline test fails;
  2. remove fallback class -> fallback test fails;
  3. remove `alt=""` -> decorative semantics test fails;
  4. restore the faux skyline -> static design-contract test fails;
  5. move focal position to hide the town at `960x600` -> browser focal test fails.

  Then run the full visible-task gate serially:

  ```bash
  mise exec node@20 -- npm run check
  mise exec node@20 -- npx vitest run
  mise exec node@20 -- npm run build
  mise exec node@20 -- npm run caribbean:port-check
  BUILD_HARNESS=1 mise exec node@20 -- npm run build
  git diff --check
  ```

- [ ] **Step 8: Inspect real browser visuals at original resolution**

  Extend the prescribed evidence capture, then inspect every port screenshot at
  original size with `view_image`, including normal image and forced image-error
  fallback at `1440x900`, `1180x820`, `1024x768`, and `960x600`.

  Record a two-pass critique:

  1. hierarchy, period identity, ship/town crop, contrast, control readability;
  2. simplification—remove any effect, line, blur, panel, or copy that competes
     with the art without carrying gameplay meaning.

  Iterate CSS/art only for concrete observed defects and recapture evidence.
  Record the sources, generation/edit history, original-resolution two-pass
  critique, historical/representation disposition, and gates in
  `.superpowers/sdd/2026-08-24-caribbean-port-identity/task-4-report.md`.
  The static server must serve `.webp` with `image/webp` and verify the emitted
  image appears in the production PWA precache. The forced failure runs in an
  isolated page that aborts only the exact Bridgetown WebP URL; that one expected
  request failure is allowlisted there, while every other request/page/console
  failure remains fatal.
  Advance metrics to exact `packagePhase: 'art'`: profile, Market, and art are
  verified and no `not-yet-observed` branch remains. Add evaluator mutations for
  a premature/incorrect phase, failed review, missing ROI, contrast below 4.5,
  overlap/clipping, and absent precache.

- [ ] **Step 9: Review and commit Task 4**

  After focused/full/static/browser/build gates, commit the implementation and
  refreshed art evidence:

  ```bash
  git add src/games/caribbean/assets/bridgetown-1675.webp \
    src/games/caribbean/components/port/PortBackdrop.tsx \
    src/games/caribbean/components/port/PortBackdrop.test.tsx \
    src/games/caribbean/components/port/PortPage.tsx \
    src/games/caribbean/components/port/PortPage.test.tsx \
    src/games/caribbean/styles/port.css \
    scripts/prepare-caribbean-art.mjs \
    scripts/lib/caribbean-port-art.test.mjs \
    docs/games/caribbean-career/bridgetown-asset-report.json \
    docs/games/caribbean-career/bridgetown-visual-reference.md \
    docs/games/caribbean-career/README.md \
    scripts/caribbean-port-check.mjs \
    scripts/lib/caribbean-port-identity-evidence.mjs \
    scripts/lib/caribbean-port-identity-evidence.test.mjs \
    docs/screenshots/caribbean-port
  git commit -m "feat(caribbean): paint Bridgetown harbour"
  ```

  Request a fresh Task 4 review of that commit. Any finding receives a new RED,
  a separate correction commit, and a fresh re-review before Task 5 begins.

---

### Task 5: Prove the Identity and Art Package End to End

**Files:**

- Modify: `scripts/caribbean-port-check.mjs`
- Modify: `scripts/lib/caribbean-port-identity-evidence.mjs`
- Modify: `scripts/lib/caribbean-port-identity-evidence.test.mjs`
- Modify: `docs/screenshots/caribbean-port/metrics.json`
- Modify: selected `docs/screenshots/caribbean-port/*.png`
- Modify: `docs/games/caribbean-career/README.md`
- Create: `.superpowers/sdd/2026-08-24-caribbean-port-identity/task-5-report.md` (ignored)

**Interfaces:**

- Consumes: Tasks 1–4, the real routed production page, real profile/users
  localStorage, real campaign persistence/Web Locks, local Bridgetown art, and
  the existing deterministic evidence journey.
- Produces: final deterministic evidence and cumulative zero-finding review for
  `1f7482e..HEAD` plus this plan/spec.

- [ ] **Step 1: Expand the fail-closed evidence schema RED**

  Upgrade the current exact evidence object additively to schema v2. The
  evaluator must retain and validate every v1 section and field—not merely the
  three new sections—and reject unknown/missing/malformed fields:

  ```ts
  interface PortIdentityMetricsV2 {
    schemaVersion: 2;
    packagePhase: 'complete';
    browser: { name: 'Chromium'; version: string };
    route: '/#/caribbean';
    build: 'normal production (BUILD_HARNESS unset)';
    viewports: Record<
      'setupDesktop' | 'profileDesktop' | 'portDesktop' |
      'portTabletLandscape' | 'portCompactLandscape' | 'artFallback' |
      'minimumSupported' | 'minimumWidth' | 'minimumHeight' | 'largePortrait',
      {
        name: string; width: number; height: number; dpr: 1;
        orientation: 'landscape' | 'portrait'; expectedSupported: boolean;
        controllerMounted: boolean; noticeVisible: boolean;
        noticeFocused: boolean; minimumFontPx: number;
        minimumTargetWidthPx: number; minimumTargetHeightPx: number;
        undersizedTargets: readonly {
          testId: string; width: number; height: number;
        }[];
        occludedTargets: readonly { testId: string; label: string }[];
        partyObscured: boolean; horizontalOverflowPx: number;
      }
    >;
    fixtures: {
      nowProvided: readonly number[]; seedsProvided: readonly number[];
      uuidsProvided: readonly string[]; nowConsumed: readonly number[];
      seedsConsumed: readonly number[]; uuidsConsumed: readonly string[];
    };
    webLocks: {
      realNavigatorLocks: true;
      calls: readonly { name: 'caribbean:campaign:writer'; mode: 'exclusive' }[];
    };
    journey: {
      finalEventCount: 2;
      eventTypes: readonly ['market-traded', 'lead-accepted'];
      saveChecksum: string; replayVerified: true;
    };
    accessibility: {
      minimumMeasuredFontPx: number; minimumMeasuredTargetWidthPx: number;
      minimumMeasuredTargetHeightPx: number; horizontalOverflowPx: number;
    };
    requests: {
      externalCount: 0; failedCount: 0; requestedPaths: readonly string[];
    };
    failures: {
      console: readonly never[]; page: readonly never[];
      requests: readonly never[]; external: readonly never[];
    };
    isolation: {
      previewHtmlAbsent: true; caribbeanGlbAbsent: true; glbRequested: false;
      previewResourceRequested: false; moduleMarkersAbsent: true;
      battleCssAbsent: true;
    };
    recovery: {
      quarantineKey: string; quarantineVerified: true;
      exportedCorruptRawVerified: true; recoveredChecksum: string;
      recoveryReloaded: true;
    };
    screenshots: readonly [
      'setup-desktop.png', 'port-desktop.png', 'market-desktop.png',
      'tavern-desktop.png', 'captains-log-desktop.png',
      'recovery-desktop.png', 'port-minimum-supported.png',
      'minimum-screen-width.png', 'minimum-screen-height.png',
      'minimum-screen-large-portrait.png', 'port-tablet-landscape.png',
      'port-compact-landscape.png', 'port-art-fallback.png',
      'player-profile-desktop.png',
    ];
    determinism: {
      cleanRuns: 2; metricsByteIdentical: true; screenshotsByteIdentical: true;
    };
    profileIdentity: {
      status: 'verified';
      defaultPronouns: 'he/him';
      setupNamePrefilled: true;
      setupPronounsPrefilled: true;
      campaignSnapshotPreserved: true;
      careerLengthControlAbsent: true;
      newCampaignLength: 'adventure';
    };
    art: {
      status: 'verified';
      loaded: true;
      localRequest: true;
      naturalWidth: 1920;
      naturalHeight: 1080;
      fallbackVerified: true;
      precached: true;
      historicalReview: 'pass';
      representationReview: 'pass';
      focalVisibleAt: readonly ['1440x900', '1180x820', '1024x768', '960x600'];
      minimumSubjectRoiVisibleFraction: number; // finite and >= 0.7
      minimumTextContrast: number; // finite and >= 4.5
      overlapCount: 0;
      clippingCount: 0;
      /** Must equal the 64-character lowercase hash in the asset report. */
      sha256: string;
    };
    marketStability: {
      status: 'verified';
      sampleCount: 108;
      actionIds: readonly string[]; // deep-equals EXPECTED_MARKET_ACTION_IDS
      maxDrift: number; // finite, non-negative, and <= 1
      horizontalOverflow: 0;
      focusPreserved: true;
      busyStatesVerified: true;
      statusesVerified: true;
    };
  }
  ```

  The validator locks the committed v1 fixture/channel semantics as well as all
  new fields. Missing, extra, wrong-type, NaN, non-local, false, wrong-default,
  malformed failure arrays, a changed action-ID set, or over-bound values fail.
  Add mutations removing every top-level section and changing representative
  nested fields in each retained and new section.

- [ ] **Step 2: Extend the real route journey**

  Seed one site-wide player, verify setup prefill, edit pronouns, start the real
  campaign, and assert exact profile/campaign snapshots. Preserve the canonical
  two-event trade/rumour/reload/recovery journey. Run the separate 36-action
  Market stability probe and forced-art-failure page without contaminating the
  canonical save.

- [ ] **Step 3: Capture deterministic evidence twice**

  Update screenshots:

  ```text
  setup-desktop.png
  port-desktop.png
  market-desktop.png
  tavern-desktop.png
  captains-log-desktop.png
  recovery-desktop.png
  port-minimum-supported.png
  ```

  Add:

  ```text
  port-tablet-landscape.png       (1180x820)
  port-compact-landscape.png      (1024x768)
  port-art-fallback.png           (1440x900)
  player-profile-desktop.png      (1440x900)
  ```

  Keep the three unsupported warning captures. Assert the two clean runs produce
  byte-identical metrics and PNGs before writing changed bytes.

- [ ] **Step 4: Inspect every image and write the product critique**

  Inspect all evidence at original resolution. Confirm the harbour is visibly
  historical and pirate-era without cliché; modern controls are legible and no
  longer futuristic; town/ship focal detail survives every supported crop;
  setup identity is clear; Market does not move; fallback remains usable; Set
  Sail remains clearly unavailable. Record physical-device and human evidence
  as `not yet observed` unless actually performed. Write the exact evidence and
  critique to
  `.superpowers/sdd/2026-08-24-caribbean-port-identity/task-5-report.md`.

- [ ] **Step 5: Run the clean-room engineering gate serially**

  Run each command separately:

  ```bash
  mise exec node@20 -- npm run check
  mise exec node@20 -- npx tsc -b --force
  mise exec node@20 -- npx vitest run
  mise exec node@20 -- npm run build
  mise exec node@20 -- npm run caribbean:port-check
  BUILD_HARNESS=1 mise exec node@20 -- npm run build
  git diff --check
  git status --short
  ```

  Expected: check passes with only the documented baseline warnings, all tests
  pass, normal/harness builds pass, browser evidence passes, and status contains
  only intended Task 5 evidence/docs files.

- [ ] **Step 6: Commit final evidence**

  Commit the deterministic evidence before cumulative review so the reviewer
  audits an immutable target:

  ```bash
  git add scripts/caribbean-port-check.mjs \
    scripts/lib/caribbean-port-identity-evidence.mjs \
    scripts/lib/caribbean-port-identity-evidence.test.mjs \
    docs/screenshots/caribbean-port \
    docs/games/caribbean-career/README.md
  git commit -m "test(caribbean): verify port identity polish"
  ```

- [ ] **Step 7: Run a fresh cumulative independent review**

  Reviewer reads the full spec, this plan, all task reports/reviews, and exact
  cumulative diff from `1f7482e`. Required topics:

  - backward-compatible profile normalization and per-user isolation;
  - site-wide pronoun ownership and campaign snapshot behavior;
  - removal of false career-length choice without invalidating legacy saves;
  - unchanged campaign/event/storage/writer/recovery contracts;
  - exact Market trade atomicity and measured layout/focus stability;
  - art provenance, local-only asset, period plausibility, crop, fallback, and
    contrast, plus the cited visual basis and representation review;
  - `960x600`/portrait gate, 14px/44px/overflow/focus/accessibility;
  - real-route deterministic evidence and fail-closed metrics;
  - normal/harness/naval dependency isolation;
  - modern usability plus pirate-era identity without extra management.

  Any BLOCKER, MAJOR, or MINOR returns to its owning task for a new RED test and
  separate correction commit. Repeat until a fresh re-review has zero findings.

  Leave the tracked worktree clean after any required fix/re-review cycle. Do
  not merge or push.

## Package Exit Criteria

The package is complete only when all statements are true:

1. Legacy and new site-wide profiles resolve a valid pronoun value, defaulting
   to `he/him`, and users retain independent name/pronoun identities.
2. Caribbean setup prefills the active player name/pronouns, allows a captain
   name override, saves pronouns site-wide, and snapshots both into the new
   campaign without rewriting existing campaigns.
3. Career length is absent from new setup and new campaigns use `adventure`;
   legacy Voyage and Legend saves remain valid and correctly labelled.
4. Bridgetown uses one inspected, local, hashed, optimized, provenance-recorded
   1920x1080 historical harbour image with no remote runtime request.
5. Port UI stays modern, compact, readable, keyboard accessible, and recognizably
   pirate-era at all supported landscape viewports; image failure is functional.
6. Every legal Market action preserves stage/row/action geometry within `1px`,
   keeps horizontal overflow at zero, retains focus, and emits the same exact
   canonical trade event as before.
7. The real routed browser proves profile, setup, asset, Market, save/recovery,
   exact viewports, fonts/targets/overflow, and deterministic evidence twice.
8. Normal production remains isolated from Battle Lab/naval assets while the
   harness build remains intact.
9. Focused/full tests, check, normal/harness builds, browser evidence, task
   reviews, and cumulative zero-finding review all pass.

## Next Package After Approval

Design and implement the complete repeatable loop: Bridgetown -> Set Sail ->
deterministic Caribbean travel -> encounter choice -> existing naval battle ->
campaign outcome -> return to port. Keep prize fleets, romance, conquest,
multi-port economies, and deeper morale deferred until that loop is excellent.
