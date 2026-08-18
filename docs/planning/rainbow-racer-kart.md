# Rainbow Racer → a Mario-Kart-like

**What the family asked for:** the girls want a Mario Kart. When we asked what
the *heart* of Mario Kart is for them, the answer was **items and chaos** —
and they play every which way: each on her own device, sharing one tablet,
and alone. A track to race on is wanted too.

**The plan in one line:** grow the existing game in place — items first (in
the arena it already has), then AI rivals, then a Rainbow Road track mode,
then shared-device play — so every phase is a release the girls can play that
week.

## What we're building on (stronger than it looks)

Rainbow Racer is already a real-time kart game, not a board game:

- A tested, tuned driving model (`domain/kart.ts`) — cruise/boost/brake,
  speed-scaled steering, fence bounce — deliberately gentle so a young child
  can steer. Touch steering and keyboard both work today.
- **Real-time P2P netcode** (`domain/race.ts`, `net/`) — the hard part of any
  kart game, already solved in miniature: host owns the world, guest mirrors
  it via one full snapshot + compact deltas, kart positions stream ~20 Hz
  with smoothing, reconnects re-sync from a fresh snapshot, and
  `isRacerMsg` validates everything inbound.

What it isn't yet: it's an open coin arena, not a track. No items, no laps,
no AI, no two-kids-one-screen.

Two structural observations shape everything below:

1. What the girls described is really **Mario Kart's battle mode** (arena +
   items + scrum) — which is the shape the code already has. The track is
   battle mode's sibling, not its replacement.
2. **Items and AI must attach to karts, never to the arena**, so everything
   built in phases 1–2 transfers to the track unchanged in phase 3.

## Phase 1 — Item chaos (in today's arena)

Item boxes spawn and sync exactly like coins do (they're just another entity
in the host-owned world; `WorldDelta` grows `spawned`/`removed` arrays for
boxes and an effect-state field per kart). You hold one item at a time; a big
friendly button (or spacebar, or a second finger) uses it.

Starter roster — rainbow-flavoured mischief, nothing violent, names to be
ratified by the girls:

- **Sparkle Boost** — a self speed burst (temporary boost-speed override).
- **Bubble Trap** — drop it behind you; a rival who touches it bobs helplessly
  in a bubble for a couple of seconds. (Our banana.)
- **Rainbow Magnet** — nearby coins fly to you for a few seconds.

**The kindness rule** (also Mario Kart's own secret): mystery-box rolls are
weighted by score gap — whoever's behind draws the stronger items. This is
what makes kid-vs-parent races end in the right upsets.

All item logic lives in a new pure `domain/items.ts` (no DOM, injected RNG,
unit-tested like `kart.ts`). The host resolves pickups, hits, and effect
timers for both karts; the guest renders what the deltas say. Effect visuals
respect `prefers-reduced-motion`.

## Phase 2 — AI rivals

Seeded policy karts (per [ADR 0009](../adr/0009-computer-players-without-llms.md):
computer players are deterministic domain policies, not LLMs): steer toward
the nearest coin or box, a little wander so they feel alive, use items on a
simple heuristic that prefers targeting the leader. Solo becomes you + two or
three rivals; head-to-head can add AI so a race feels busy.

The host simulates AI karts and ships their positions inside the existing
world-delta stream (~12/s); the guest smooths them exactly as it already
smooths the remote human. Scores grow from `[host, guest]` to one entry per
seat.

**Honest boundary:** more than two *human* racers stays out of scope — the
peer layer is deliberately single-guest (see `shared/net/peer.ts`). AI karts
are how a race gets crowded.

## Phase 3 — Rainbow Road (the track)

A second mode next to the arena in the setup screen: **Battle Arena** /
**Rainbow Road**.

- The track is a closed spline extruded into a rainbow-striped ribbon
  floating over the cloud sea — procedural, seeded, offline (no model
  downloads), and squarely on theme with the unicorn Cloud Kingdom look.
- Racing becomes track-relative: project each kart onto the spline for
  progress, checkpoints at spline fractions, lap counting, first to N laps
  wins. Coins line the road (as in Mario Kart) rather than filling a disc.
- **Rails, not cliffs**: the ribbon gets glowing edge rails reusing the
  arena's fence-bounce math. Falling off Rainbow Road is funny exactly once
  when you're six; being bumped back on keeps everyone racing.
- Karts, items, AI, and the netcode carry over untouched (AI follows the
  spline tangent with a per-rival offset as its racing line).
- **Mockups first, per house rules**: the road's look (ribbon style, sky,
  rails, start arch) gets ~3 labelled options as local HTML before we build.

## Phase 4 — Two girls, one tablet

Same-screen play: split touch zones (left half steers one kart, right half
the other) or WASD-vs-arrows on a keyboard.

- In the **arena** this is cheap: one wide camera frames the whole disc.
- On the **track** it means split-screen (two viewports, two renders per
  frame) — real GPU cost on a family tablet, so we measure before promising.
  That's why this phase is last and decided on evidence.

## Cross-cutting

- **Protocol:** every new message shape goes through `isRacerMsg` with the
  same length caps and validators the audit hardened; a small protocol
  version constant in `hello` lets a mid-update device pair fail into a
  friendly "one of you needs a refresh" instead of a corrupt race.
- **Determinism:** item spawns, AI decisions, and track generation all run on
  injected seeded RNGs, so races are unit-testable and replays don't drift.
- **Testing:** each phase leads with pure-domain tests (`items.ts`, `ai.ts`,
  `track.ts` are all DOM-free by construction), plus the jsdom fallback
  pattern and a screenshot in `docs/screenshots/` for every visual change.
- **Shipping rhythm:** one phase = one or a few PRs, each leaving the game
  playable. No long-lived feature branch.

## Open questions (for the family, mostly)

1. Item roster and names — the three above are a starting bid; the girls
   should christen them (and veto or invent).
2. Battle-mode scoring once items exist: still first-to-N coins, or do
   bubble hits score too?
3. How many Rainbow Road layouts at launch — one great track, or a couple of
   seeded variants?
4. AI difficulty: fixed and friendly, or a picker (pony / racer / rainbow
   legend)?
