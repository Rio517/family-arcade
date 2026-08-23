# Caribbean Career — Isolated Game Branch Design

**Date:** 2026-08-23  
**Status:** Approved by standing user direction  
**Branch:** `codex/caribbean-game`  
**Worktree:** `/Users/marioflores/code/arcade/.worktrees/caribbean-game`  
**Base:** fresh replay of the reviewed Caribbean commits on `origin/main`  
**Primary references:** [`game-design.md`](../../games/caribbean-career/game-design.md), [`poc-review.md`](../../games/caribbean-career/poc-review.md), and [`2026-08-23-caribbean-five-minute-vertical-slice.md`](../plans/2026-08-23-caribbean-five-minute-vertical-slice.md)

## Decision

Build the game entirely on the isolated `codex/caribbean-game` branch and do
not merge or push it without Mario's later approval. Preserve
`codex/caribbean-poc` and `codex/caribbean-naval-battle` as reviewed reference
points. The production module starts at `src/games/caribbean/`; it does not
runtime-import code from `src/games/caribbean-poc/`.

This is a deliberate local-only exception to the repository's usual
one-feature/one-branch lifetime because Mario explicitly requested one isolated
whole-game branch. Control the stale-branch risk at every milestone boundary:
fetch `origin/main`, inspect `git cherry`, rebase the unpushed game branch onto
the latest `origin/main`, rerun the complete repository gate, and create no
merge commits. If the branch is ever pushed for review, stop using it for new
features and recut subsequent work from the then-current `origin/main` as the
repository rules require.

The first playable production milestone is a satisfying two-to-four-minute
naval duel using the existing optimized sloop on both sides. After that passes,
grow the same HTML/React entry into the smallest complete career loop:

```text
naval duel
  → port decisions and simple market/rumour
  → strategic sailing and encounter
  → battle result and capture
  → fleet/shipyard payoff
  → save/resume and complete five-minute slice
```

This order differs from a conventional shell-first build because battle feel is
the largest remaining product risk. It does not skip the campaign foundations:
stable content IDs, deterministic inputs, and the event contracts needed by the
battle are created before the production battle page.

## Why this approach

### Chosen: production battle-first lab

Create a production `Caribbean Career` module with a harness entry that can
start directly at a seeded naval encounter. It uses production domain and
presentation boundaries from day one. Later screens wrap the same module; the
harness remains a reproducible quality and screenshot surface.

Benefits:

- validates the riskiest experience before building many menus;
- avoids polishing code that must later be discarded;
- gives deterministic tests and visual evidence a permanent home;
- lets the decision UI grow incrementally without coupling rules to React; and
- preserves the simple 2004-inspired feel while adding only layers proven to
  improve the loop.

### Rejected: keep extending the POC

The POC is valuable evidence but combines prototype state, presentation, and
fixture context. Extending it would create a second migration and make save and
campaign integration harder.

### Rejected: build every port/campaign screen before battle

This lowers technical sequencing risk but delays the central product answer:
whether sailing, positioning, broadsides, damage, and capture are enjoyable for
several minutes rather than several screenshots.

## Experience boundaries

### Product promise for this branch

The branch must eventually prove one compact story:

1. Begin in Bridgetown in 1675.
2. Hear one plain rumour about the Red Jackdaw.
3. Buy or sell one thing and understand provisions as months remaining.
4. Sail east using a readable trade wind.
5. Identify and engage the target.
6. Win through hull pressure/surrender or disable/boarding-ready tactics.
7. Resolve a captured ship with a good recommended choice.
8. Return to Bridgetown, manage the prize, and resume after reload.

The first milestone proves step 6 in isolation. Each later milestone adds the
minimum surrounding decisions needed to reach the complete story.

Load-bearing slice facts are fixed here as well as in the references: the only
port is Bridgetown; the only target is the Red Jackdaw; the only ship class is
the sloop; the market has provisions, tools/common goods, luxuries,
sugar/molasses, tobacco/dyewood, and powder/arms; the port has seven stable
activities; and the production naval scene uses a maximum of two active hero
ships in this slice.

### Simplicity rules

- One active enemy and one ship class.
- Full or reefed sail; no manual sail trim.
- Round, chain, and grape are the only ammunition choices.
- One provisions resource, primarily displayed as months remaining.
- One direct rumour and one clearly stated next action.
- One port and six cargo categories.
- Boarding ends at a boarding-ready capture result. There is no fencing
  minigame in this branch.
- No dance, relationships, treasure, stealth, army combat, crafting, detailed
  food/water, warehouses, loans, or multiplayer.
- Port conquest remains in the long-term design but is not part of this branch's
  five-minute proof.

## Milestone 1 — Production naval duel

### Start and finish

The Battle Lab opens with a short encounter card stating objective, wind, ships,
and controls. Starting the encounter produces a deterministic mirror-sloop
battle. A normal successful duel lasts two to four minutes; restarting with the
same seed reproduces its canonical result under the same commands.

The battle ends in exactly one of:

- `surrender`: a ship yields before automatic destruction;
- `boarding-ready`: the player has disabled and closed with a surviving prize;
- `sunk`: hull reaches zero;
- `escaped`: a ship crosses the engagement boundary while moving outward; or
- `separated`: a time/position limit ends the encounter without a prize.

The result page explains the decisive facts. `boarding-ready` proceeds to a
capture-summary fixture until the real capture milestone lands; it never opens
a sword-fighting sequence.

### Tactics

Two tactics must be meaningfully viable:

1. **Pressure and surrender.** Round shot damages hull and cannon. A badly
   damaged or under-crewed opponent may strike its colours before sinking.
2. **Disable and capture.** Chain shot reduces sails; grape reduces crew at
   close range. Boarding-ready requires a surviving target, low relative speed,
   close range, and explicit sail/crew disadvantage gates.

The player may still fire without an aim lock. Optional aim assistance shows a
broadside arc and timing cue, never an invisible damage bonus.

### Handling and wind

- Heading `0` means bow toward world `+Z`.
- Physical port is `+X`; physical starboard is `-X`.
- A/left turns to port; D/right turns to starboard.
- Q fires port; E fires starboard.
- Full sail provides speed. Reefed sail lowers speed and improves turning.
- A polar curve makes the wind readable without requiring sailing terminology.
- Hull, sail, crew, and cannon damage alter relevant performance rather than
  merely filling four bars.

One production unit test binds these facts together: at heading `0`, port is
`+X`, starboard is `-X`, A/negative rudder increases heading toward port, and
D/positive rudder decreases heading toward starboard. Cardinal vector tests
then cover `0`, `π/2`, `π`, and `-π/2`.

### Opponent

The opponent is deterministic and legible, with explicit states:

- close distance;
- gain weather position;
- seek broadside;
- fire;
- recover/reload;
- disengage; and
- surrender.

It uses chain against healthy sails at useful range, grape only when close and
capture pressure is rational, and round otherwise. It does not receive hidden
durability or accuracy multipliers. Debug mode exposes its current state and
desired heading so failures can be diagnosed.

### Feedback

Every important rule produces a semantic event. Presentation maps those events
to pooled effects and original procedural audio:

- cannon flash, recoil, smoke, and discharge;
- hit, splash, rig damage, and debris;
- reload-ready feedback by physical side;
- sail/handling degradation;
- surrender bell and struck colours; and
- a concise result explanation.

The renderer may add cosmetic particles but never decides hits or outcomes.

## Growing HTML decision surface

Create `preview-caribbean-game.html` as a development harness that loads the
real production module. It is built only under `BUILD_HARNESS=1`, loads
`@shared/styles/tokens.css`, and wraps its root in `.app`, matching the existing
`preview-b.html` harness contract so it neither ships accidentally nor produces
misleading screenshots. Its initial home is a restrained HTML decision screen
with labelled entries for Battle Lab and the future career loop. It is not a
static throwaway mockup: React components, production CSS tokens, and domain
adapters are progressively connected behind it.

Growth order:

1. Battle briefing, battle, and result.
2. Bridgetown port menu with seven original-style activities: Governor's House
   (stub), Tavern (functional), Market (functional), Shipyard (stub until
   capture), Divide Shares (stub), Captain's Log (functional), and Set Sail
   (functional once navigation lands).
3. Tavern rumour, Captain's Log, Market, and Set Sail.
4. Strategic sailing, target reveal, and legal encounter handoff.
5. Capture comparison and recommended resolution.
6. Shipyard/fleet decisions and return to port.
7. Setup, save/resume/recovery, and arcade registration.

Unavailable activities remain visible with one-sentence explanations; they do
not lead to blank panels. The menu retains position and keeps port visits under
one minute after the first visit.

## Architecture

### Production module

```text
src/games/caribbean/
  content/       stable authored definitions and IDs
  domain/        pure deterministic campaign/economy/navigation/naval/fleet rules
  components/    accessible React screens and HUDs
  state/         orchestration and transient simulation sessions
  storage/       versioned snapshots, checksums, and recovery
  three/         disposable overworld/naval renderer adapters
  audio/         semantic-event-driven audio adapters
  styles/        scoped production styles
```

Domain modules import no React, DOM, Three.js, storage, audio, or network APIs.
Canonical state is versioned JSON. Randomness uses explicit unsigned 32-bit LCG
state; domain code never calls `Math.random`, `Date.now`, or browser APIs.
The `content/`, `three/`, and `audio/` folders are additive game-specific
extensions to the repository's required domain/components/state/storage/styles
module shape; they do not weaken the dependency direction.

### State flow

```text
input intent
  → pure command validation/resolution
  → typed semantic event
  → deterministic reducer / canonical state
  → React snapshot
  → Three.js and audio adapters
  → autosave after resolved campaign events
```

Frame positions, pointer samples, particles, and camera motion never enter the
campaign journal. A naval session is transient but created from a serialized
`NavalBattleInput`; its final `NavalOutcome` becomes exactly one campaign event.
There is no multiplayer desynchronization in this single-player slice. If a
debug replay/checkpoint assertion or runtime invariant detects canonical drift,
the session pauses, records a diagnostic, and offers a deterministic restart
from its serialized `NavalBattleInput`; it never guesses forward or writes the
invalid result into the campaign journal.

### POC reuse policy

Reuse measured concepts, source assets, and hand-derived tests. Copy and adapt
the optimized sloop asset into the production asset location with provenance.
Do not runtime-import POC files or treat POC state as save-compatible.
Provenance is recorded in `content/caribbean/source-ledger.csv` with source
commit SHA, asset path, author/tool, transformation, license/ownership status,
and review state; Blender sources and rebuild instructions remain linked from
the ledger.

## Presentation direction

Keep the existing Caribbean POC identity—brass wind rose, turquoise water,
warm horizon, compact ships, readable wakes—but improve feedback and hierarchy
before adding expensive art. The current sloop remains the only hero model for
the complete vertical slice.

The interface stays modern, clean, and spacious. Use brass and nautical texture
as restrained accents inside a contemporary information hierarchy; do not turn
the shell into a parchment-heavy imitation of the 2004 game's menus. Historical
character belongs primarily in ships, locations, weather, names, and systems.

Priorities:

1. readable ship orientation, range, and physical broadside side;
2. damage and reload feedback;
3. camera composition across tablet landscape and desktop;
4. pooled smoke, spray, impact, and rig effects;
5. original procedural battle audio; and
6. measured shader/model polish only after the duel is tactically satisfying.

Primary device is iPad-class tablet landscape; desktop is supported. Phones and
tablet portrait are intentionally unsupported. Below 960×600 CSS pixels, show a
clear rotate/use-a-larger-screen notice and do not run a hidden simulation.
Use adaptive DPR and quality tiers; do not hide performance problems by cutting
the sloop silhouette.

## Accessibility and failure behavior

- All actions have keyboard and touch paths with 44×44 CSS pixel targets.
- Interactive elements have stable `data-testid` hooks, and icons are authored
  SVG components rather than emoji.
- Production text is at least 14 CSS pixels.
- Side labels and feedback never rely on screen-left, colour alone, or camera
  orientation.
- Reduced motion disables shake, bob, rapid particles, and dramatic camera
  moves without changing simulation.
- Separate toggles cover aim assist, steering assist, shake, flashes, and audio.
- Every dialog closes on Escape through the shared dismissal helper.
- WebGL failure presents an HTML summary and safe return/retry action; it never
  destroys the pre-battle state.
- Invalid or unreadable saves preserve the previous snapshot and offer recovery
  or export instead of silent overwrite.

## Verification strategy

### Every implementation task

1. Write the narrow failing test first.
2. Record the expected RED failure.
3. Implement the smallest production change.
4. Run focused tests and self-review.
5. Run an independent task review.
6. Commit one reviewable task.

### Repository gate

Run all three required repository commands on every completed package:

```text
npm run check
npx vitest run
npm run build
```

UI tasks also run the real screenshot/browser harness and commit changed
evidence. The existing jsdom WebGL warnings are not treated as browser proof.

### Naval quality gate

- deterministic replay across 60 Hz, 30 Hz, and irregular frame delivery;
- cardinal-heading port/starboard tests and physical control tests;
- two viable scripted tactics against the normal opponent;
- median deterministic normal duel within the two-to-four-minute target;
- bounded renderer allocations after warm-up;
- no console, request, or asset failures;
- at most 120 draw calls and 100,000 visible triangles;
- sustained 50 FPS on the target iPad before calling naval combat production
  ready; and
- a human can explain why the battle ended.

The early naval play gate uses three observed sessions with no personal data:
at least two of three players leave the briefing and fire a useful broadside
within 60 seconds without instruction; all three can name the decisive outcome
fact after the result; median completed-battle time is two to four minutes; and
at least two of three choose an immediate rematch. Missing target-device or
human evidence remains labelled incomplete rather than replaced with agent
opinion.

The draw-call and triangle caps apply independently to every active 3D scene.
Port and decision screens are HTML, and the overworld scene is disposed before
the naval renderer is created, so scene budgets are never justified by assuming
two renderers remain resident together.

### Complete-slice gate

The final branch must run the seeded port → sea → battle → capture → shipyard →
resume journey without test-only victory switches. It records browser/device
evidence and a small observed playtest protocol before any merge recommendation.
The complete-slice play gate expands to ten observed sessions: median time to
sea under 90 seconds, at least 8/10 complete without instruction, at least 8/10
fire a useful broadside after feedback, at least 7/10 explain the capture choice,
zero crashes or resolved-state save loss, and a credible majority elects to
continue the voyage.

## Autonomous execution and review

Mario delegated routine choices to the recommended option. The agent may create
commits and mockup/harness files on `codex/caribbean-game`, run local servers,
tests, Blender scripts, browser checks, subagent reviews, and read-only external
reviews. It must not merge, push, publish, purchase services, or modify main.

Claude CLI review uses non-interactive plan mode so the reviewer can inspect and
criticize without editing. External review is advisory: findings are verified
against the code and tests before adoption.

Stop for user input only if work requires:

- merge, push, deployment, purchase, or outside-repository changes;
- a security/privacy decision;
- a contradiction that changes the product promise;
- target-device or human play evidence that cannot be truthfully substituted;
  or
- a genuinely destructive action.

## Deferred scope

Do not add during this branch:

- boarding swordplay;
- dancing;
- romance/relationships;
- treasure hunts;
- port conquest implementation;
- a second ship class or final ship-art overhaul;
- detailed historical chapters;
- network multiplayer, accounts, analytics, or monetization; or
- final marketing name and launch art.

These remain documented future opportunities. Port conquest specifically stays
in the game vision but waits until the five-minute loop earns expansion.

## Completion

This branch is ready for a merge decision only when:

1. the production naval duel is enjoyable and readable for two-to-four minutes;
2. both surrender and boarding-ready tactics work;
3. the five-minute career loop is deterministic, saveable, and recoverable;
4. capture and ship management provide an understandable progression payoff;
5. repository, browser, and available device gates are recorded honestly; and
6. an explicit final review recommends `proceed`, `revise-loop`, or `stop`.

Until then, the branch remains isolated and main remains untouched.
