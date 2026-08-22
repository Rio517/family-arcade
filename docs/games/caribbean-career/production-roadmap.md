# Caribbean Career — structured production roadmap

## 0. How to use this plan

This is the execution map for turning the approved design and naval POCs into a
shipping single-player game. It deliberately optimizes for a market-worthy
vertical slice before broad content production. Every phase has inputs, exact
work packages, tests, and an exit gate. A phase is not complete because its
code exists; it is complete when the player-facing acceptance criteria are
observably true.

### Product target

- Installable offline web game inside the family arcade.
- Primary device: iPad-class tablet in landscape; supported: desktop and phone.
- Three career lengths: Adventure, Voyage, Legend.
- First public-quality milestone: a complete Adventure career.
- Original identity, assets, prose, rules values, and interface.
- Caribbean circa 1655–1720 with documented/composite/invented content labels.

### Critical path

```text
production schema
  → port/economy loop
  → strategic sailing/encounter
  → production naval battle
  → capture/fleet/shipyard
  → five-minute vertical slice gate
  → career clock/shares/retirement
  → world traffic/politics
  → boarding/conquest
  → relationships/quests/treasure
  → historical chapters/content
  → Adventure release candidate
```

Art research, audio, historical sourcing, and accessibility run alongside the
critical path, but content volume must not outrun a proven loop.

## 1. Production architecture

Create a production module at `src/games/caribbean/`; do not rename the POC in
place. The POC remains a harness and evidence record until each idea earns a
production implementation.

```text
src/games/caribbean/
  content/
    chapters.ts          fixed historical changes and pacing
    locations.ts         ports and settlements
    ships.ts             class data and fitting slots
    characters.ts        specialists, rivals, relationships
    leads.ts             authored commissions/rumours/stories
  domain/
    types.ts             canonical serializable state
    clock.ts             calendar and career-length pacing
    captain.ts           talent, age condition, legacy
    crew.ts              count, morale, specialists
    fleet.ts             flagship, transfer, capture, sale
    economy.ts           markets, cargo, provisions/months
    diplomacy.ts         standing, war, commission legality
    world.ts             ports, traffic, consequences
    navigation.ts        wind, heading, pursuit, arrivals
    encounters.ts        strategic encounter resolution
    naval/               fixed-step battle, AI, replay
    boarding/            crew advantage and duel rules
    quests.ts            leads, fragments, relationship state
    shares.ts            divide-shares reset and retirement
  state/
    useCaribbean.ts      application coordinator
    selectors.ts         UI-ready derived values only
  storage/
    schema.ts            versioned save format
    persistence.ts       autosave/migration/recovery
  components/
    setup/               captain/chapter/length/accessibility
    overworld/           sailing HUD and encounter cards
    port/                stable port menu and activities
    fleet/               shipyard, transfer, capture decision
    battle/              naval HUD and results
    boarding/            duel
    log/                 leads, maps, standing, career
    retirement/          shares, legacy, epilogue
  three/
    shared/              loaders, pooling, adaptive quality
    overworld/           map/ships/weather scene
    port/                harbour diorama
    naval/               production battle scene
    treasure/            focused landing scene
  assets/
    ships/ characters/ ports/ audio/
  styles/
    tokens.css           Caribbean-specific semantic tokens
    *.css
  index.ts
tools/caribbean-assets/
  ships/                 one reproducible folder per class
  reports/               generated budgets and node checks
content/caribbean/
  source-ledger.csv      source/license/confidence/access date
  representation-log.md
```

### State invariants

- Domain modules import no React, DOM, Three.js, storage, audio, or network.
- Canonical state is JSON-serializable and versioned.
- One seeded RNG state belongs to each simulation stream; no `Math.random()`.
- The calendar advances only through named domain events.
- Rendering may interpolate but never decides hits, prices, standing, morale,
  or outcomes.
- Content IDs are stable and saves store IDs, never copied display prose.
- Every state transition emits a small typed event suitable for autosave,
  recap, debugging, and deterministic replay.

## 2. Phase A — product and content foundations

**Goal:** remove legal, content, schema, and device ambiguity before production
features accumulate.

### A1. Identity and IP boundary

- **A1.1** Select an original working title and reserve a package/route ID.
- **A1.2** Write a prohibited-expression checklist covering reference title,
  characters, prose, UI layouts, map art, music, numbers, and marketing copy.
- **A1.3** Add `content/caribbean/source-ledger.csv` with columns: asset/content
  ID, source URL, creator/institution, license, access date, confidence,
  transformation, reviewer, release status.
- **A1.4** Record license copies for every non-original input; allow only
  approved public-domain/CC0/compatible sources.
- **A1.5** Commission legal review before public marketing or monetization.

**Exit:** every existing and planned content source has an owner and allowed
use; branding cannot be mistaken for the reference game.

### A2. Device and quality baseline

- **A2.1** Define supported Safari/Chromium versions and minimum iPad hardware.
- **A2.2** Add a real-device profiling checklist: cold load, warm load, 10-minute
  thermal run, orientation change, background/resume, offline launch, low
  battery, reduced motion, VoiceOver, keyboard, and touch.
- **A2.3** Set measured budgets: production naval scene ≤120 draw calls and
  ≤100k visible triangles; each hero ship ≤100 KB preferred/250 KB hard gate;
  adaptive DPR 1.0–1.75; 50 FPS sustained minimum on target iPad.
- **A2.4** Define save reliability: autosave after resolved event; two rotating
  local snapshots; malformed/newer save fails safely; zero progress loss after
  tab background within a resolved state.

**Exit:** one written device matrix, one connected target iPad, and a repeatable
profile capture.

### A3. Historical content governance

- **A3.1** Create documented/disputed/composite/invented labels.
- **A3.2** Create the first-location source packet for the vertical-slice port.
- **A3.3** Add explicit representation checks from `historical-framework.md` to
  narrative review templates.
- **A3.4** Identify external historical and sensitivity reviewers and the
  milestones at which they review—not after all content is written.

**Exit:** the vertical-slice port, goods, residents, and political context have
sources, confidence notes, and representation review ownership.

## 3. Phase B — canonical game state and saves

**Goal:** a stable deterministic campaign shell that can survive feature growth.

### B1. Types and constructors

- **Files:** `domain/types.ts`, `domain/createCampaign.ts`, tests.
- **B1.1** Define `CampaignStateV1`: identity, settings, clock, location/mode,
  captain, crew, fleet, cargo, gold, standings, world, leads, relationships,
  legacy, RNG streams, and last event ID.
- **B1.2** Define explicit modes: `port`, `sailing`, `encounter`, `naval`,
  `capture`, `boarding`, `treasure`, `shares`, `retired`.
- **B1.3** Add constructors for all three career lengths and five talents.
- **B1.4** Validate impossible states at boundaries: no flagship, negative cargo,
  over-capacity, unknown IDs, invalid clock, duplicated specialist.

**Tests:** table-driven literal fixtures for all start choices; malformed input
rejection; same seed equality; no shared mutable defaults.

**Exit:** every legal new campaign serializes, validates, and rehydrates exactly.

### B2. Versioned persistence

- **Files:** `storage/schema.ts`, `persistence.ts`, `persistence.test.ts`.
- **B2.1** Save envelope: version, game build, timestamp, checksum, payload.
- **B2.2** Primary plus previous snapshot; write-then-verify before pointer swap.
- **B2.3** Migration registry beginning at V1.
- **B2.4** Corrupt-save recovery UI with preserve/export option; never silently
  overwrite unreadable data.
- **B2.5** Integrate the arcade Save Station through the registry contract.

**Exit:** kill/reload/background simulations preserve the last resolved event;
corrupt primary restores the prior snapshot.

### B3. Event and replay contract

- **Files:** `domain/events.ts`, `domain/replay.ts`, tests.
- **B3.1** Give every transition a monotonically increasing event ID and seed.
- **B3.2** Store concise semantic events, not frame-by-frame positions.
- **B3.3** Add a debug export containing initial seed, content version, and event
  stream for bug reproduction without personal data.

**Exit:** a 15-minute scripted campaign replays to byte-equivalent canonical
state.

## 4. Phase C — port, market, provisions, and one lead

**Goal:** make the game's simplicity visible before building the sea around it.

### C1. Port hub

- **Files:** `components/port/PortPage.tsx`, `PortMenu.tsx`, `styles/port.css`.
- **C1.1** Build the seven fixed activities in the approved order.
- **C1.2** Support pointer, keyboard, controller-like focus order, Escape/back,
  and 14 px minimum text.
- **C1.3** Add a lightweight harbour backdrop using placeholder/procedural art;
  it must not block interaction or ship the full Three.js chunk until visible.
- **C1.4** Remember the last activity during a visit; reset on departure.

**Acceptance:** a first-time player identifies Market, Shipyard, Tavern, and Set
Sail without opening help; repeat repair/provision visit takes under one minute.

### C2. Market and cargo

- **Files:** `domain/economy.ts`, `components/port/Market.tsx`, tests.
- **C2.1** Implement six cargo categories and cannon separately.
- **C2.2** Derive Cheap/Fair/Expensive from port baseline and current price.
- **C2.3** Enforce gold, stock, and fleet capacity atomically.
- **C2.4** Offer `+1`, `+5`, `Max`, `Sell 1`, `Sell 5`, `Sell all` with predicted
  gold and capacity before confirmation.
- **C2.5** Show provisions as exact months remaining after every quantity change.

**Tests:** insufficient gold, insufficient stock, exact capacity boundary,
multi-ship capacity, buy/sell round trip, provisions derivation for crew sizes,
zero provisions, qualitative price thresholds.

**Acceptance:** no action can silently discard cargo; months remaining updates
within the same interaction and is the dominant logistics number.

### C3. Simple rumour and log

- **Files:** `domain/quests.ts`, `components/port/Tavern.tsx`,
  `components/log/CaptainsLog.tsx`, tests.
- **C3.1** Add one deterministic target rumour with vessel, origin, destination,
  age, and optional expiration.
- **C3.2** Present one sentence and one next action; pin it to the log.
- **C3.3** Sort active leads by actionable distance/expiry without nested trees.

**Acceptance:** a player can repeat the rumour's target and destination after
closing the Tavern.

## 5. Phase D — strategic sailing and encounter handoff

**Goal:** connect port decisions to a tactile Caribbean route.

### D1. Navigation domain

- **Files:** `domain/navigation.ts`, `clock.ts`, tests.
- **D1.1** Implement fixed-step heading, prevailing wind polar, sail speed,
  coastline collision, arrival radius, and optional course-hold assist.
- **D1.2** Consume provisions and advance calendar from simulated voyage time.
- **D1.3** Derive destination bearing, ETA range, months remaining, and warning.
- **D1.4** Pause all clocks in menus/backgrounded tab.

**Tests:** east/west asymmetry, tacking progress, coast block, exact arrival,
career-length time scaling, provision warning, pause/background determinism.

### D2. Overworld scene

- **Files:** `three/overworld/OverworldScene.ts`, components and styles.
- **D2.1** Render compressed original coastline data with no copied map art.
- **D2.2** Use the same optimized sloop GLB and runtime batching path.
- **D2.3** Add wind rose/streamlines, destination bearing, wake, day tint, and
  visible traffic silhouettes.
- **D2.4** Lazy-load Three.js, adapt DPR, pool traffic labels, and provide a
  non-WebGL fallback map.
- **D2.5** Support touch rudder/course hold and keyboard input.

**Acceptance:** the player understands why westbound is easier; target iPad
holds 50 FPS with 12 traffic ships and coastline.

### D3. Encounter selection

- **Files:** `domain/encounters.ts`, `components/overworld/EncounterCard.tsx`.
- **D3.1** Reveal role/flag first and exact class/cargo threat at close range.
- **D3.2** Show commissioned/illegal/friendly-fire status before Attack.
- **D3.3** Offer pursue, avoid, hail, or enter battle where valid.
- **D3.4** Serialize exact strategic context into naval battle input.

**Acceptance:** no hostile action occurs without a legality label and explicit
confirmation for illegal/friendly targets.

## 6. Phase E — production naval combat

**Goal:** turn the POC into a complete 2–4 minute battle without losing clarity.

### E1. Domain hardening

- **Files:** `domain/naval/*` migrated conceptually from POC, not copied blindly.
- **E1.1** Define class-specific mass, turn, polar, hull/sail/crew/gun maxima.
- **E1.2** Separate volley accuracy from per-projectile visuals; one deterministic
  volley result drives pooled visual balls/splashes.
- **E1.3** Implement cannon loss, crew reload/handling effects, sail damage,
  shoals/coast boundaries, surrender willingness, boarding range, escape, and
  nightfall/separation.
- **E1.4** Add easiest-mode arc/timing assist and independent steering assist.
- **E1.5** Improve AI states: close, gain weather position, seek broadside,
  choose ammunition, disengage, surrender, exploit crippled target.

**Tests:** mutation-resistant tests for every damage branch, simultaneous hits,
reload at zero crew/cannon, surrender before sink, escape direction, shoal
penalty, AI decision tables, deterministic command replay at multiple frame
delivery rates.

### E2. Renderer and effects

- **E2.1** Promote the POC sea/camera with adaptive quality tiers.
- **E2.2** Pool all smoke, flash, ball, splash, wake, and debris resources.
- **E2.3** Add model-node animation only where it changes understanding: rudder,
  sail damage visibility, broadside recoil, lowered/shot-away canvas.
- **E2.4** Add damage decals/variants without unique runtime textures per hit.
- **E2.5** Cinematic entry/result shots yield to tactical camera before input.
- **E2.6** Add low-motion mode, camera-shake toggle, flash reduction, and pause.

**Budget gate:** ≤120 calls, ≤100k visible triangles, no unbounded allocations
after warm-up, 50 FPS sustained on target iPad during simultaneous broadsides.

### E3. Battle HUD and audio

- **E3.1** Product typography floor 14 px; controls ≥44 px; port/starboard shape
  and position remain redundant with colour.
- **E3.2** Show only hull, sails, crew, reload, ammo, sail state, wind, objective.
- **E3.3** Add original cannon, rig, hull, sea, crew, and music assets with
  subtitles/visual equivalents for critical cues.
- **E3.4** Independent master/music/effects sliders and mute persist globally.

**Play gate:** five naïve players can fire the useful side and explain round,
chain, and grape after one battle; at least two viable tactics produce captures.

## 7. Phase F — capture, fleet, and shipyard vertical slice

**Goal:** pay off the battle with the game's most important progression choice.

### F1. Fleet domain

- **Files:** `domain/fleet.ts`, `ships.ts`, tests.
- **F1.1** Up to eight ships; exactly one flagship; stable IDs and names.
- **F1.2** Crew/cannon/cargo redistribution with minimum crew and capacity.
- **F1.3** Strategic speed derives from flagship/fleet burden using a clearly
  documented original formula.
- **F1.4** Sell/abandon guards prevent losing the last ship or critical items.

### F2. Capture resolution

- **Files:** `components/fleet/Capture.tsx`, selectors, tests.
- **F2.1** One screen for cargo, cannon, crew/specialist, and keep/abandon.
- **F2.2** `Take recommended` prioritizes provisions, unique specialist/map,
  better ship, then value per capacity.
- **F2.3** Compare prize against flagship and slowest fleet ship.
- **F2.4** Preview final fleet capacity/speed before confirm.

**Tests:** all capacity boundaries; unique item never silently discarded;
eight-ship cap; damaged prize; insufficient sailing crew; recommended choice
fixtures reviewed by hand.

### F3. Shipyard and fittings

- **F3.1** Repair hull/sails, sell, rename, make flagship, redistribute, refit.
- **F3.2** Implement the approved six fittings and ammunition lockers.
- **F3.3** Show before/after performance and exact price; no rarity colours.
- **F3.4** The POC sloop is the only authored class until the slice passes.

### F4. Five-minute vertical-slice gate

Scripted path:

1. Start at one port with 3.4 months provisions.
2. Hear a direct rumour about the Red Jackdaw.
3. Buy provisions or useful trade cargo.
4. Set sail and steer with the trade wind.
5. Identify and pursue the target.
6. Fight with round/chain/grape and win by surrender/boarding readiness.
7. Resolve prize cargo and keep/abandon choice.
8. Return to port, repair/refit or sell.

**Exit evidence:** 10 observed sessions, median time to sea <90 seconds, ≥80%
complete without instruction, ≥70% correctly explain their capture decision,
zero save loss/crash, target iPad frame gate, and a qualitative “would play the
next voyage” signal. If the loop is not compelling, stop content expansion and
fix it.

## 8. Phase G — voyage structure, morale, shares, and retirement

### G1. Calendar and aging

- Implement the five age conditions and career-length pacing multipliers.
- Advance only through sailing and named large time costs.
- Surface age changes as infrequent narrative moments, not constant decay.

### G2. Morale

- Hidden inputs: share pressure, provisions, crowding, victory/loss, specialists.
- Output exactly five states and at most two causal hints.
- Mutinous state gives recoverable warning/desertion before a career-ending
  consequence.

### G3. Divide shares

- Sell all but one explicitly selected ship; preview every sale.
- Add sales to haul; captain percentage by original difficulty tuning; pay and
  dismiss crew; retain small fresh crew; advance roughly seven months.
- Offer New Voyage or Retire only after a reversible confirmation step.

### G4. Legacy and epilogue

- One score with breakdown: rank, wealth, ships, relationships, treasure,
  rivals, discoveries, world consequences.
- Authored epilogue assembled from achieved facts; no generative runtime text.

**Exit:** an Adventure career starts, divides shares, and retires in 30–60
minutes with no dead-end state.

## 9. Phase H — living world, trade, and politics

### H1. Ports and traffic

- Begin with four slice-tested ports, then expand to 16–20 major ports.
- Add smaller pirate, Maroon, Indigenous, and mission settlements only with
  sourced, reviewed content and distinct agency.
- Purposeful traffic events alter prosperity, defense, price, or leads.
- Report each consequence in one useful sentence; hide simulation internals.

### H2. Diplomacy

- Four standings; war matrix; letters of marque; automatic ranks/promotions.
- Governor House shows current legal opportunities and consequences.
- No spendable reputation, prize-court paperwork, or faction skill trees.

### H3. Economy balance

- Deterministic scenario simulations across 100 seeded careers.
- Guard against dominant infinite routes, provision traps, and prize-only gold.
- Validate all three career lengths rather than shrinking one universal clock.

**Exit:** traffic visibly changes at least one player decision per voyage without
requiring the player to manage the simulation.

## 10. Phase I — boarding duel and port conquest

### I1. Boarding advantage

- Inputs: crew, morale, naval damage, specialists, approach, ship size.
- Crew battle is automatic and communicates advantage without troop commands.

### I2. Duel domain and renderer

- Thrust/parry, slash/jump, chop/duck, taunt; rapier/cutlass/longsword.
- Position/push is the only main state; 30–60 seconds.
- Assist profiles: wider timing, move hints, auto-defense, reduced motion.
- Deterministic opponent personas and fair anticipation tells.

### I3. Port conquest

- Harbor fight reuses naval systems plus fort batteries.
- Landing resolves crew advantage into commandant duel.
- Result: ransom, stores, or commissioned allegiance change.
- No port ownership/administration; NPC reconquest remains possible.

**Exit:** conquest feels like a culmination of ship/crew preparation, not an
unrelated minigame or strategy-management pivot.

## 11. Phase J — relationships, rivals, quests, and treasure

### J1. Relationships

- Inclusive authored candidates; Acquainted/Friendly/Close/Devoted.
- Visits, kept promises, favours, gifts, and meaningful response choices.
- No beauty rank, personality-stat test, gender restriction, or procedural
  romance dialogue. Dancing remains deferred.

### J2. Rivals

- Six fictional captains, each with sailing doctrine, silhouette, motive,
  relationship to one region/faction, and possible non-lethal resolution.
- Recurrence is state-driven and cannot spam consecutive encounters.

### J3. Quest structure

- Commissions, personal stories, treasure maps, rumours.
- One next action, optional expiry, concise log entry.
- One shorter captain-background story replaces repetitive family kidnappings.

### J4. Treasure

- Two or three fragments add coast/settlement/landmark information.
- Focused 2–5 minute 3D landing/search scene.
- No survival, crafting, open jungle, stealth, or random combat gauntlet.

**Exit:** at least one relationship, rival, and treasure arc spans multiple
voyages and survives divide-shares timing cleanly.

## 12. Phase K — chapters and complete content

### K1. Historical chapter engine

- Fixed events alter controller, service, traffic, or visual state through news
  cards; they never erase player inventory or active story progress.
- Port Royal 1692 has pre/post states with sourced descriptions and respectful
  framing.
- War of Spanish Succession and later suppression alter commission/patrol rules.

### K2. Content scaling order

1. Four ports, two powers, one rival, one relationship, one treasure.
2. Eight ports, four powers, three rivals, three relationships, two treasures.
3. Full 16–20 major ports and smaller reviewed settlements.
4. Only then add ship-class variants and rare events.

Every expansion runs route, save, accessibility, and representation regression
checks. Never scale prose or models ahead of systemic playtest capacity.

## 13. Phase L — ship asset program

Use one repeatable folder and gate per class:

1. sourced reference packet and simplification note;
2. silhouette blockout;
3. six standard Blender views and 320 px sheet;
4. semantic parts and team material;
5. GLB export/optimizer report;
6. overworld, battle, and shipyard screenshots at fixed cameras;
7. real-device performance; and
8. historical/readability/art review signoff.

Next class after sloop: a visibly different large merchant/galleon target,
because it tests scale contrast and capture desire. Then brigantine, frigate,
barque, and one local small craft. Do not produce near-identical stat variants
until the six silhouettes and roles are proven.

## 14. Phase M — accessibility, offline, reliability, and release

### M1. Accessibility

- 14 px minimum production text; 44 px targets; visible focus.
- Full keyboard, touch, and remapping; VoiceOver labels/order.
- Non-colour state cues; subtitles; audio controls.
- Independent aim, steering, duel timing, reading, motion, shake, and flash
  assists. Difficulty never hides accessibility.

### M2. Offline and loading

- Production 3D chunks lazy-load by scene.
- All GLB, audio, maps, fonts, decoders, and content precached in the PWA.
- First-run progress and clear storage-size disclosure.
- Offline cold launch and battle-to-port transition tested after airplane mode.

### M3. Reliability and observability

- Error boundary returns to last resolved autosave.
- Debug export contains seed/events/build, no names unless user includes them.
- Optional privacy-preserving local metrics: completion times, failure mode,
  control assist use; no network telemetry without explicit product/privacy
  decision.

### M4. Release gates

- Fresh `npm run check`, full tests, clean build, PWA offline audit.
- Real-browser screenshots at desktop/tablet landscape/tablet portrait/phone.
- 30-minute thermal profile and memory plateau on target iPad.
- Save migration from every public version.
- Historical, representation, license, and legal reviews closed.
- Adventure career observed end-to-end with first-time players.
- No P0/P1 bugs; no known silent data loss; accessible fallback for WebGL fail.

## 15. Work discipline and decision cadence

- One fresh branch/worktree per phase-sized feature from current `origin/main`.
- TDD for domain behaviour; real browser proof for UI/Three.js; standardized
  renders for assets; source review for history.
- Review at the smallest meaningful loop: rule → screen → five-minute slice →
  voyage → career. Never wait for “all content” to test the experience.
- Maintain a decision log for changes to pillars, scope, history boundaries,
  or device budgets.
- New feature proposal must name: player problem, simpler alternative, surface
  complexity, hidden complexity, acceptance signal, and what it displaces.
- Default answer to added logistics, stats, and minigames is defer until play
  evidence shows the simple model is insufficient.

## 16. Immediate next sprint

The next sprint should contain only these deliverables:

1. **CAR-001:** production `CampaignStateV1`, constructor, validator, save round
   trip, and deterministic event contract.
2. **CAR-002:** one sourced fictionalized port data packet and stable seven-item
   port shell.
3. **CAR-003:** six-good market with provisions/months, tests, and accessible UI.
4. **CAR-004:** one direct Tavern rumour and Captain's Log entry.
5. **CAR-005:** a graybox strategic sailing scene using the optimized sloop and
   one encounter target.
6. **CAR-006:** production battle-domain migration with fixed volley results and
   one target-iPad performance run.
7. **CAR-007:** capture decision plus sloop-only shipyard/repair.
8. **CAR-008:** scripted Playwright/device journey across the complete five-minute
   loop and a 10-session playtest protocol.

The sprint ends at the vertical-slice gate. It does not add a second port,
second ship class, boarding duel, relationships, treasure, conquest, or chapter
events until the loop evidence is reviewed.
