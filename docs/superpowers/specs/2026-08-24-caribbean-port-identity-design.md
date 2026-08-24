# Caribbean Port Identity and Player Defaults

**Date:** 2026-08-24  
**Status:** Approved  
**Branch:** `codex/caribbean-game`

## Context

The production Bridgetown package is functionally sound and independently
approved, but direct play exposed four presentation problems:

1. Career length asks the player to choose Adventure, Voyage, or Legend even
   though the current campaign has no time-limit mechanic and the values do not
   change play.
2. Caribbean setup defaults to `Captain` and `they/them` instead of using the
   signed-in arcade player.
3. Bridgetown is drawn mostly with abstract gradients and course lines. The
   interaction design is modern, but the scene reads as futuristic rather than
   a seventeenth-century Caribbean port.
4. Market rows move when a trade begins or resolves because per-row reason
   content and scrollbar geometry change.

The intent is a focused identity and stability pass before strategic sailing.
It must preserve the approved simple port model and modern usability.

## Product Direction

Use a historically grounded painted harbour as the emotional layer and retain
the modern interface as the control layer. The result should feel like a
contemporary remaster of a classic pirate game, not a themed enterprise
dashboard and not a parchment-heavy simulation UI.

The historical layer supplies ships, warehouses, fortifications, water,
tropical light, and lived-in port atmosphere. The interface supplies clear
type hierarchy, compact actions, reliable focus, readable status, and restrained
motion.

## Goals

- Make Bridgetown immediately read as a Caribbean pirate port in 1675.
- Keep the seven-action port menu and existing information architecture.
- Use the signed-in player's name as the recommended captain name.
- Store pronouns once in the site-wide player profile, defaulting to `he/him`.
- Stop presenting career length as a meaningful choice before it has mechanics.
- Eliminate visible Market movement during and after every trade action.
- Retain the exact `960x600` landscape minimum and all accessibility floors.
- Preserve deterministic browser evidence and normal/harness bundle isolation.

## Non-goals

- No strategic sailing, encounter generation, retirement clock, or naval handoff.
- No new ports, commodities, stock simulation, morale rules, or provision types.
- No redesign of naval battle UI.
- No full parchment/wood skeuomorphic theme.
- No migration of existing campaign journals.
- No changes to existing campaign captain identity after a campaign is created.

## Decision 1: Remove the False Career-Length Choice

The setup screen will omit the career-length selector and create new campaigns
with the existing `adventure` default. The domain union and validator remain
unchanged so existing Voyage and Legend saves continue to load and display.

The strategic-sailing package will reintroduce the choice only after each value
has an exact mechanical duration. At that point the UI must show the duration
and consequence in plain language rather than only a title.

This avoids inventing explanatory copy for mechanics that do not exist.

## Decision 2: Site-wide Player Pronouns

### Profile contract

Add `pronouns: string` to the game-neutral `Profile` contract.

- `defaultProfile()` returns `he/him`.
- `normalizeProfile()` returns a trimmed valid stored value or `he/him` for old,
  missing, malformed, blank, or overlong values.
- Pronouns remain free text with a maximum of 24 Unicode code points.
- Both profile editors count Unicode code points rather than UTF-16 units, so
  24 astral characters are accepted and a 25th is rejected with a visible,
  programmatically associated error. Native `maxLength` is not the contract.
- Add a pure `setPronouns(profile, value)` transition. A blank edit restores the
  default `he/him`; it does not create an empty persisted identity.
- Keep the existing users storage key. This is an additive, normalizer-owned
  profile evolution rather than a destructive migration.

The default is a product default, not an inference from the player's name.

### Profile UI

The Ticket Booth becomes the authoritative place to edit site-wide name and
pronouns. The existing Rename action becomes a compact Edit profile flow with
both fields. New player creation uses `he/him` unless edited later. Switching
players switches both values.

The Party continues to use the same profile name. It need not display or send
pronouns over the peer protocol in this package.

### Caribbean setup

`CaribbeanPage` reads the active profile and passes an immutable identity
snapshot into `CampaignSetup`.

- Captain name initially equals the active profile name, falling back to
  `Captain` only for an impossible signed-out defensive state.
- Captain name remains editable for role-playing and does not rename the arcade
  profile.
- Pronouns initially equal the site-wide profile pronouns.
- The setup labels them as shared player pronouns and saves edits back to the
  player profile when the commission is submitted.
- Submission computes `normalizePronouns(draftPronouns)` exactly once and passes
  that same value to both profile persistence and campaign creation. Blank,
  whitespace-only, malformed, or overlong programmatic input therefore creates
  neither a split identity nor an exception. The captain snapshot is likewise
  `draftName.trim() || 'Captain'`.
- The resulting campaign copies the chosen name and pronouns into its journal.
  Later profile changes never rewrite an existing campaign.

## Decision 3: Painted Bridgetown Under a Modern Interface

### Asset

Create one original production-owned raster illustration with ImageGen. Before
generation, write a cited visual-reference note from museum/archive sources for
period vessels, waterfront warehouses, and Bridgetown fortifications. The art
review must cover both historical plausibility and representation:

- Bridgetown harbour, Barbados, circa 1675;
- view from or just above the waterfront;
- sloops and square-rigged merchant vessels, timber quays, stone warehouses,
  modest fortifications, palms, humid trade-wind atmosphere;
- warm late-afternoon Caribbean light;
- painterly historical-adventure illustration with believable materials;
- no readable text, flags with modern symbols, fantasy architecture, neon,
  steampunk machinery, or cinematic skull imagery;
- no foreground or identifiable people, caricatures, or anonymous enslaved
  labour used as scenery; distant unidentifiable harbour silhouettes are the
  maximum human presence;
- landscape composition with the primary town/ship detail right of centre and
  quieter water/sky behind the left-side content region.

Promote a visually inspected, optimized local WebP into
`src/games/caribbean/assets/`. Record every generation/edit prompt,
generated-source identity/output hint, dimensions, byte size, SHA-256,
deterministic centre-crop command and tool version, historical review,
representation review, and production status in the Caribbean asset ledger.
Reject and regenerate until those reviews pass; no arbitrary one-edit limit
applies. No remote runtime dependency is allowed.

### Port composition

The image fills the port viewport behind every menu/activity state. CSS adds a
stable dark maritime gradient and local content scrim for text contrast. The
image remains decorative and non-interactive.

Remove the abstract faux skyline/course geometry as the dominant scene. Retain
only a restrained brass registration line where it helps align the modern
action dock.

Modern controls remain:

- compact top status rail;
- readable central heading/activity region;
- ordered seven-action bottom dock;
- clear focus rings and 44px targets;
- existing Avenir/condensed/monospace roles.

To reduce the futuristic impression, cyan is an accent rather than a luminous
surface. Panels use deep ink/navy transparency, sailcloth text, and brass rules.
Avoid glassy blur on large surfaces where it obscures the painting.

### Responsive crop

Use `object-fit: cover` or equivalent background sizing with explicit focal
positions for `1440x900`, `1180x820`, `1024x768`, and exact `960x600`.
No portrait/phone composition is required; unsupported screens continue to show
the existing focused size notice without mounting the campaign.

## Decision 4: Stable Market Geometry

The Market must not move when a trade starts, resolves, fails, or changes which
actions are available.

### State presentation

- Keep quote legality derived from the current canonical state.
- Do not replace every row's reason text with `Trade is being saved` while busy.
- Expose one persistent Market-level polite status line and stable
  `aria-busy` container with exact states: idle is empty; saving announces
  `Saving trade.`; success announces `Cargo ledger updated.`; failure announces
  `Trade was not saved.`.
- Keep action-specific disabled explanations available to assistive technology.
- Keep a stable, always-mounted visual reason slot per row with a bounded
  two-line geometry.
- Preserve focus on the activated control when the state updates. Because a
  native-disabled button loses focus in Chromium, the activated action uses a
  managed retained-focus state: it remains a real button with `aria-disabled`
  and synchronous pointer/keyboard guards through pending and resolved states;
  unrelated illegal actions may remain natively disabled. Once focus leaves,
  the retained action can return to ordinary native-disabled semantics.
- The controller reports a closed presentation outcome (`applied` or
  `not-applied`) so the Market never claims success for consent, conflict,
  unavailable storage, or a rejected save. This does not alter domain events.

### Layout

- Reserve identical row/status block size before, during, and after a trade.
- Add `scrollbar-gutter: stable` to the Market stage.
- Do not use animations or transforms to conceal layout movement.
- Continue allowing only the middle stage to scroll at `960x600`; the status
  rail and seven-action dock remain fixed.

### Acceptance measurement

A real-browser stability probe uses a separate clean campaign from the canonical
two-event evidence journey. It drives all 36 goods/actions (six goods times Buy
1, Buy 5, Max, Sell 1, Sell 5, Sell all) through legal real UI sequences. For
each it captures the Market stage, all six row rectangles, action-strip
rectangles, `clientWidth`, `scrollWidth`, scroll offsets, status, and focused
element before click, during the pending save, and after resolution. Maximum
geometry drift is 1 CSS pixel; computed horizontal overflow
`max(0, scrollWidth - clientWidth)` is zero for the stage and relevant
containers; focus remains on the activated action even when Max or Sell all
becomes illegal after resolution.

## Architecture and Data Flow

```text
usersStore -> active Profile(name, pronouns)
       |                 |
       |                 +-> Party name (unchanged)
       +-> PlayerBooth edit profile
       +-> CaribbeanPage identity snapshot
                         |
                         +-> CampaignSetup prefill
                         +-> createCampaign captain snapshot

local painted harbour asset -> PortPage decorative layer
campaign journal -> Market quotes -> one persisted trade
                                -> stable presentation slots
```

The site-wide profile remains game-neutral. Caribbean imports the public
profile hook but the shared profile layer never imports Caribbean code.

## Error Handling and Compatibility

- Malformed legacy pronouns normalize to `he/him` without preventing sign-in.
- Profile persistence failure retains the existing safe storage behavior; it
  must not create a profile/campaign pronoun mismatch or block campaign
  creation with the already-normalized value.
- A blank/invalid profile name keeps existing validation behavior.
- Existing campaigns and saves are byte-compatible because campaign state and
  event schemas do not change.
- Existing `voyage` and `legend` campaign values remain valid even though new
  setup no longer offers them.
- Image load failure falls back to the existing dark maritime gradient with all
  controls functional and readable.
- Trade failures remain non-mutating and announce a stable reason without
  changing row geometry.

## Accessibility

- Site-wide pronouns use a visible label, helper text, and 44px input/control
  height.
- The historical image is decorative; essential information stays in text.
- Text remains at least 14px and meets WCAG AA contrast against the worst tested
  image crop through the local scrim.
- Market busy state uses `aria-busy`; one persistent polite live region
  announces save state without replacing the node.
- Disabled action explanations remain programmatically associated; retained
  `aria-disabled` actions are guarded for pointer and keyboard activation.
- Reduced-motion mode has no image pan/zoom or entrance animation.
- Keyboard order, Escape behavior, modal inertness, and restored focus from the
  approved package remain unchanged.

## Testing and Evidence

### Profile and setup

- Old profile JSON without pronouns normalizes to `he/him`.
- Blank/malformed/overlong pronouns normalize safely.
- The shared profile/setup input boundary accepts exactly 24 Unicode code
  points (including astral characters), rejects 25, and never relies on native
  UTF-16 `maxLength` behavior.
- Switching site-wide users switches pronouns.
- Editing profile pronouns persists and updates subscribers.
- Campaign setup prefills active profile name/pronouns.
- Captain-name override does not rename the profile.
- Pronoun edit updates the profile and new campaign snapshot.
- Existing campaign resume does not adopt later profile changes.
- Career-length selector is absent; new campaigns use `adventure`; legacy
  Voyage/Legend saves remain valid.

### Market stability

- Unit tests preserve exact quotes/events and busy duplicate suppression.
- Component tests keep the status/live-region nodes persistent.
- Browser geometry tests cover the exact set of 36 action IDs and all 108
  before/pending/resolved samples.
- Pending, applied, and not-applied paths preserve the status-node identity,
  `aria-busy`, reason associations, and activated focus.
- A static CSS contract mutation catches removal of `scrollbar-gutter: stable`;
  browser evidence independently catches real geometry or overflow drift.

### Art and visual review

- Production bundle emits the local optimized image and requests no remote URL.
- Asset hash/bytes/dimensions, generation identity, prompts, preparation command
  and tool version match the ledger; a cited visual-reference document and
  explicit historical/representation reviews are present.
- Normal port, each activity, Market, setup, recovery, exact `960x600`, and
  image-failure fallback are inspected at original resolution.
- Browser evidence records text contrast samples, no clipping/overlap, target
  size, font size, overflow, image load, focal visibility, and Market drift.
- Evidence uses a versioned additive schema: every existing browser, route,
  build, viewport, fixture, Web Locks, journey, accessibility, request,
  failure, isolation, recovery, screenshot, and determinism channel remains
  fail-closed, with new profile-identity, art, and Market-stability sections.
- Human and physical-device evidence remains explicitly unobserved unless a
  human performs it.

## Delivery Boundary

This package ends with the polished setup/profile/Bridgetown presentation and
stable Market. It does not enable Set Sail. After zero-finding independent
review, the next package remains deterministic strategic sailing and the
encounter/naval-return loop.
