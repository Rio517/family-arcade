# Caribbean Port UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved Bridgetown port concept: aligned and legible commission fields, a stable chart-led port stage, icon-led full-hit activity tiles, clearer prerequisite states, a roomier Market, and non-jarring Tavern transitions.

**Architecture:** Keep campaign state and event behavior unchanged. Reshape the existing React presentation layer around a fixed-height stage shell and a deterministic, code-native Caribbean chart whose visible marks derive only from existing Red Jackdaw state. Preserve the existing `caribbean-port-check.mjs` evidence boundary, its hash-aware `saveIfChanged` publication, and its setup/port/market/tavern captures; extend assertions to cover the new geometry and truthful chart states.

**Tech Stack:** React 19, TypeScript, CSS, Vitest + Testing Library, Playwright-backed Caribbean port evidence harness.

**Spec:** `docs/designs/2026-08-26-caribbean-port-battle-ui-design.md`

## Global Constraints

- Preserve the existing campaign schema, reducer, persistence, and event semantics.
- Use inline/code-native SVG only; no runtime downloads and no invented playable ports.
- Keep every interactive target at least 44px and all required text at least 14px.
- Preserve exact focus restoration, Escape dismissal, and screen-reader descriptions.
- The same content anchor and stage geometry must survive every port tab.
- Existing screenshot files change only through `scripts/caribbean-port-check.mjs`; identical bytes remain untouched.

---

### Task 1: Align and strengthen the captain commission

**Files:**
- Modify: `src/games/caribbean/components/setup/CampaignSetup.test.tsx`
- Modify: `src/games/caribbean/styles/production.css`

- [ ] Add a failing CSS contract test requiring 16px labels, exact 48px input/select block size, common vertical alignment, and a 17px Start Career label.
- [ ] Run `npx vitest run src/games/caribbean/components/setup/CampaignSetup.test.tsx` and confirm the new contract fails against the current 14px/unequal control rules.
- [ ] Update only the commission form typography, row alignment, control sizing, and CTA sizing in `production.css`; retain validation/help layout and 44px minimum targets.
- [ ] Rerun the focused test and confirm it passes.
- [ ] Temporarily restore the old label/control sizes and confirm the new row fails, then restore the implementation.

### Task 2: Add the truthful Caribbean chart

**Files:**
- Create: `src/games/caribbean/components/port/CaribbeanChart.tsx`
- Create: `src/games/caribbean/components/port/CaribbeanChart.test.tsx`
- Modify: `src/games/caribbean/components/port/PortPage.tsx`
- Modify: `src/games/caribbean/components/port/PortPage.test.tsx`
- Modify: `src/games/caribbean/styles/port.css`

- [ ] Write failing tests for a chart with exact Bridgetown, current-ship, and Red Jackdaw marks; unavailable lead shows no route, accepted lead shows the authored east-by-north route, and completed lead remains clearly historical.
- [ ] Add accessibility tests that the SVG is decorative while equivalent route/state copy remains exposed in the surrounding UI.
- [ ] Run the focused chart and PortPage tests and observe the missing component/state failures.
- [ ] Implement `CaribbeanChart` from `RED_JACKDAW_VOYAGE` and `redJackdawView(state)` only. Do not add decorative cities or imply new destinations.
- [ ] Place the chart in the stable port stage alongside the current activity surface without changing campaign actions.
- [ ] Add CSS for the brass chart frame, sea grid, route line, ship/contact marks, and responsive 960px/600px minimum layout.
- [ ] Rerun the focused tests and mutation-check removal of the lead-state route guard.

### Task 3: Build icon-led full-hit port actions and a stable stage

**Files:**
- Create: `src/games/caribbean/components/port/PortActionIcon.tsx`
- Create: `src/games/caribbean/components/port/PortActionIcon.test.tsx`
- Modify: `src/games/caribbean/components/port/PortMenu.tsx`
- Modify: `src/games/caribbean/components/port/PortMenu.test.tsx`
- Modify: `src/games/caribbean/components/port/PortPage.tsx`
- Modify: `src/games/caribbean/components/port/PortPage.test.tsx`
- Modify: `src/games/caribbean/styles/port.css`

- [ ] Add failing tests for seven deterministic SVG action icons, full-tile hit targets, exact ordered labels, and Tavern attention expressed by its icon rather than visible Set Sail instructions.
- [ ] Add failing PortPage layout tests requiring one stable stage class across menu/Market/Tavern/Log and a shared proportional top anchor rather than Market-only compression.
- [ ] Add a focus regression proving programmatic activity focus does not render the visible blue focus ring; keyboard focus remains visible through `:focus-visible`.
- [ ] Run focused tests and observe the icon/stage/focus failures.
- [ ] Implement `PortActionIcon` with simple line SVGs for governor, tavern, market, shipyard, shares, log, and sailing.
- [ ] Reshape each menu button as icon + action label + compact state line, with the complete tile still the button and Tavern attention on the Tavern icon.
- [ ] Remove `caribbean-port-stage--market` layout branching; make the shared activity shell reserve consistent heading/content/footer areas and put the close button at the bottom as literal `Done` for every activity.
- [ ] Change the heading selector from `:focus` to `:focus-visible` and retain focus restoration semantics.
- [ ] Rerun tests and mutation-check removal of the stable-stage assertion and full-hit button structure.

### Task 4: Stabilize Tavern and clarify unavailable shares

**Files:**
- Modify: `src/games/caribbean/components/port/Tavern.tsx`
- Modify: `src/games/caribbean/components/port/Tavern.test.tsx`
- Modify: `src/games/caribbean/components/port/DivideShares.tsx`
- Create: `src/games/caribbean/components/port/DivideShares.test.tsx`
- Modify: `src/games/caribbean/styles/port.css`

- [ ] Add failing Tavern tests that the action/status slot remains the same element and height before, during, and after Mark on chart.
- [ ] Add failing Divide Shares tests for a static prerequisite panel: `Voyage required`, `Not available until after a profitable voyage`, and plain-language settlement value without `role="alert"`.
- [ ] Run the focused tests and observe layout/markup failures.
- [ ] Implement a persistent Tavern action slot that swaps button/status content without collapsing or moving the page.
- [ ] Implement the static warning-style shares prerequisite card and remove the ambiguous “return with prize money” framing.
- [ ] Style both components with the stronger signal red `#e55243`, 14px minimum supporting copy, and stable reserved geometry.
- [ ] Rerun tests and mutation-check removal of the slot minimum block size and prerequisite eyebrow.

### Task 5: Give Market breathing room and remove redundant success noise

**Files:**
- Modify: `src/games/caribbean/components/port/Market.tsx`
- Modify: `src/games/caribbean/components/port/Market.test.tsx`
- Modify: `src/games/caribbean/components/port/PortPage.test.tsx`
- Modify: `src/games/caribbean/styles/port.css`

- [ ] Add failing tests for an inset market frame, at least 20px inline padding, stronger red expensive/critical cues, a reserved silent status region, and bottom `Done` ordering.
- [ ] Retain the current contract that successful trades do not announce “Cargo ledger updated.”; add an explicit assertion that only saving/failure states populate the live region.
- [ ] Run focused Market/PortPage tests and observe the spacing/color failures.
- [ ] Update Market/frame CSS without changing quote calculations, button guards, focus retention, or trade dispatch.
- [ ] Ensure the table occupies the stable stage without the former special Market stage geometry and the close button follows the ledger at the shell footer.
- [ ] Rerun focused tests and mutation-check the market inset/padding contract.

### Task 6: Extend automated browser evidence and capture the port UI

**Files:**
- Modify: `scripts/caribbean-port-check.mjs`
- Modify: `scripts/lib/caribbean-campaign-victory-browser.node-test.mjs`
- Modify only through the evidence gate if bytes change: `docs/screenshots/caribbean-port/setup-desktop.png`
- Modify only through the evidence gate if bytes change: `docs/screenshots/caribbean-port/port-desktop.png`
- Modify only through the evidence gate if bytes change: `docs/screenshots/caribbean-port/market-desktop.png`
- Modify only through the evidence gate if bytes change: `docs/screenshots/caribbean-port/tavern-desktop.png`
- Modify only through the evidence gate if bytes change: `docs/screenshots/caribbean-port/port-minimum-supported.png`
- Modify only through the evidence gate if bytes change: `docs/screenshots/caribbean-port/port-tablet-landscape.png`
- Modify only through the evidence gate if bytes change: `docs/screenshots/caribbean-port/port-compact-landscape.png`

- [ ] Add failing evidence assertions for exact 48px commission controls, stable activity top/height across port/Market/Tavern, visible chart marks by lead state, full action-tile geometry, Market inset, 14px text floor, and no overflow.
- [ ] Add a native contract test proving `saveIfChanged` keeps an identical screenshot untouched and changes only genuinely different bytes (reuse the production helper/boundary rather than duplicating capture logic).
- [ ] Run the relevant fast native/browser selection and confirm the new assertions fail before implementation or pass only after the UI changes.
- [ ] Run `npm run check`, `npx vitest run`, `npx tsc -b --force`, and `npm run build`.
- [ ] Run the port UI slice or full port check serially, inspect all changed PNGs at original resolution, and verify only hash-changed evidence files appear in status.
- [ ] Stage only the port source/tests/evidence owned by this plan and commit with `feat(caribbean): build chart-led port interface`.
