# Rainbow Racer → riders, creatures, and stars

**What the family asked for:** the girls want a Mario-Kart-like. The first
brainstorm distilled it to "items and chaos" plus a track. Then (2026-08-23)
the lead designer got specific, and her design is better than our first draft:

> Can it be an animal that's not on a car? You're not a car — you're **on an
> animal**. Or if you're an animal, then you can go by yourself. If I were a
> fairy, I could fly alone; if I were a princess, I couldn't fly alone,
> 'cause I can't fly. And there's **stars** — if you collect those you can
> get a **bigger animal**, or you can get **stronger** — you just get a
> faster bonus. But not like a magnet, not with tools — **with your body**.

Three pillars fall straight out of that:

1. **No cars.** You ride a creature, or you *are* one.
2. **Who you are decides how you race.** A princess needs a mount (she can't
   fly alone); a fairy flies by herself; an animal runs on its own legs.
3. **Powers live in your body.** Stars are the only pickup that matters:
   collect them and your creature grows bigger / you get faster. No tools,
   no gadgets, and — by name — no magnets. This *replaces* the item-box
   roster from the first draft (Bubble Trap and Rainbow Magnet are cut;
   Sparkle Boost survives in spirit as the star speed bonus, because a burst
   of speed is something your body does).

**The plan in one line:** grow the existing game in place — racers and stars
first (in the arena it already has), then AI rivals, then a Rainbow Road
track mode, then shared-device play — so every phase is a release the girls
can play that week.

## What we're building on (stronger than it looks)

Rainbow Racer is already a real-time racing game, not a board game:

- A tested, tuned driving model (`domain/kart.ts`) — cruise/boost/brake,
  speed-scaled steering, fence bounce — deliberately gentle so a young child
  can steer. Touch steering and keyboard both work today. Crucially, the
  model is **body-agnostic**: it moves a point with heading and speed, and
  doesn't care whether the thing drawn on top is a kart, a unicorn, or a
  fairy. Swapping cars for creatures is a render-layer change, not a physics
  rewrite.
- **Real-time P2P netcode** (`domain/race.ts`, `net/`) — the hard part of any
  racing game, already solved in miniature: host owns the world, guest
  mirrors it via one full snapshot + compact deltas, positions stream ~20 Hz
  with smoothing, reconnects re-sync from a fresh snapshot, and
  `isRacerMsg` validates everything inbound.

What it isn't yet: it's an open coin arena, not a track. No racer characters,
no stars, no growth, no AI, no two-kids-one-screen.

Two structural observations shape everything below:

1. What the girls described is really **Mario Kart's battle mode** (arena +
   powers + scrum) — which is the shape the code already has. The track is
   battle mode's sibling, not its replacement.
2. **Stars and growth attach to racers, never to the arena**, so everything
   built in phases 1–2 transfers to the track unchanged in phase 3.

## The racers

A small roster of characters, each an answer to "how do you move?":

- **Riders** — a princess on a unicorn (or pony). Two beings, one racer:
  the creature runs, the rider steers. The mount is what grows.
- **Solo creatures** — an animal racing on its own legs. It *is* the body
  that grows.
- **Flyers** — a fairy who flies alone. Flying is a *look*, not a shortcut:
  a hover-bob above the ground on the same racing line, same speed rules,
  same rails. The moment flying skips part of the course, the race stops
  being fair, and fairness between a six-year-old and a parent is the whole
  game.

Per house rules, the roster is **mockups first**: ~3 labelled character-style
options as local HTML pages before we build, and the girls christen every
racer. (Cloud Kingdom already gives us the palette: unicorns, rainbows,
cloud sea.)

## Phase 1 — Stars and growing (in today's arena)

Stars spawn and sync exactly like coins do (they're just another entity in
the host-owned world; `WorldDelta` grows `spawned`/`removed` arrays for stars
and a growth-state field per racer). Stars are rarer than coins and they
don't score — they feed your body:

- Collecting stars fills a **star meter**. At each threshold your creature
  **grows a size tier** — visibly bigger, a notch faster. Bigger is also
  heavier: bumping into a smaller racer nudges them aside (the gentle bonk —
  our chaos, done with bodies instead of shells).
- The top tier is **temporary** — it glows, then fades back one tier after a
  while, so the lead changes hands and races stay swingy instead of
  snowballing.
- **The kindness rule** (Mario Kart's own secret, reworded for stars):
  star spawns and meter gains are weighted by score gap — whoever's behind
  grows faster. This is what makes kid-vs-parent races end in the right
  upsets.

All growth logic lives in a new pure `domain/stars.ts` (no DOM, injected
RNG, unit-tested like `kart.ts`). The host resolves pickups, thresholds, and
decay timers for every racer; the guest renders what the deltas say. Growth
visuals respect `prefers-reduced-motion` (a size change is a resize, not a
mandatory sparkle storm).

## Phase 2 — AI rivals

Seeded policy racers (per [ADR 0009](../adr/0009-computer-players-without-llms.md):
computer players are deterministic domain policies, not LLMs): steer toward
the nearest coin or star, a little wander so they feel alive, with a simple
heuristic that prefers chasing stars when behind. Solo becomes you + two or
three rivals; head-to-head can add AI so a race feels busy.

The host simulates AI racers and ships their positions inside the existing
world-delta stream; the guest smooths them exactly as it already smooths the
remote human. Scores grow from `[host, guest]` to one entry per seat.

**Honest boundary:** more than two *human* racers stays out of scope — the
peer layer is deliberately single-guest (see `shared/net/peer.ts`). AI
racers are how a race gets crowded.

## Phase 3 — Rainbow Road (the track)

A second mode next to the arena in the setup screen: **Cloud Meadow** /
**Rainbow Road**.

- The track is a closed spline extruded into a rainbow-striped ribbon
  floating over the cloud sea — procedural, seeded, offline (no model
  downloads), and squarely on theme.
- Racing becomes track-relative: project each racer onto the spline for
  progress, checkpoints at spline fractions, lap counting, first to N laps
  wins. Coins line the road; stars sit at the fun corners.
- **Rails, not cliffs**: the ribbon gets glowing edge rails reusing the
  arena's fence-bounce math. Falling off Rainbow Road is funny exactly once
  when you're six; being bumped back on keeps everyone racing.
- Racers, stars, growth, AI, and the netcode carry over untouched (AI
  follows the spline tangent with a per-rival offset as its racing line).
  The fairy hover-bobs over the same ribbon everyone else runs on.
- **Mockups first, per house rules**: the road's look (ribbon style, sky,
  rails, start arch) gets ~3 labelled options as local HTML before we build.

## Phase 4 — Two girls, one tablet

Same-screen play: split touch zones (left half steers one racer, right half
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
- **Determinism:** star spawns, growth decay, AI decisions, and track
  generation all run on injected seeded RNGs, so races are unit-testable and
  replays don't drift.
- **Testing:** each phase leads with pure-domain tests (`stars.ts`, `ai.ts`,
  `track.ts` are all DOM-free by construction), plus the jsdom fallback
  pattern and a screenshot in `docs/screenshots/` for every visual change.
- **Shipping rhythm:** one phase = one or a few PRs, each leaving the game
  playable. No long-lived feature branch.

## Open questions (for the family, mostly)

1. **The roster.** Which racers at launch — princess-on-unicorn, a fairy, a
   pony racing solo? The girls pick and name them.
2. **How does "bigger" happen?** Does your animal grow — or do you hop onto
   a bigger friend at each tier (pony → horse → something magnificent)?
   Her words allow both readings; her call.
3. **Bumping.** Should big racers nudge little ones aside (the gentle bonk),
   or is bigger only about speed?
4. **Stars vs coins.** Coins stay the score and stars feed growth (our
   starting bid) — or should stars do both jobs?
5. How many Rainbow Road layouts at launch — one great track, or a couple of
   seeded variants?
6. AI difficulty: fixed and friendly, or a picker (pony / racer / rainbow
   legend)?
