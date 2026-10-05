# Simulation, physics and feel: lessons from the arcade games

Rules proven in the arcade's games (Gulp, and the standalone vehicle and
vending games built from arcade-game-starter), October 2026. Each has a
guard test. Read the guard test before copying a number: the numbers are
tuned for the game they came from. The vehicle examples below come from a
standalone truck-racing game that is not in this repo; copy its approach,
not a path.

## Stepping and determinism

**Fixed step, bounded catch-up.** Pure 1/60 s steps. Clamp a frame's `dt`
to 1/20 s, run at most 3 steps per frame, keep the fractional remainder and
drop the rest. A background tab must never replay as a burst of collisions.
Guard: a test that advances in 1/60 s steps and checks the clamp.

**Seed everything, order everything, freeze it.** Persist the RNG state in
the world, sort entities and contact pairs by id, and break ties by a written
rule. "Same seed" is not enough if iteration order can differ between host and
guest. Before changing rules, freeze old behaviour as a golden test of seeded,
scripted rounds. Guard: `src/games/gulp/domain/solo.golden.test.ts`.

## Input to motion

**Digital in, analog inside.** Keys and touch buttons are on/off, so a skill
window like "55–75% throttle" is unreachable unless the rules smooth the
input. One game eases throttle up over 0.55 s and down over 0.45 s, with
target speed `top × √throttle`. A short release or pulsing then lands in the
band. Show that state on a meter. Guard: a terrain test on the band.

**Strict to enter, lenient to hold.** Ask for precision on entry, then let
normal corrective steering keep the state (hysteresis). Ruts stalled trucks
for the steering needed to follow their own bend until the hold band was
widened to 50–85%. Guard: rut cases in the terrain test.

## Contact and collision

**Long bodies are two circles, not one.** One disc wide enough for the sides
lets noses sink 1 m into the truck ahead. One disc long enough for the nose
holds trucks a metre apart side by side. Use two circles on the centreline
(radius = half the width plus a skin; offset so the nose reaches half the
length plus the skin). Use the same shape for pairs, barriers and AI
clearance, and derive it from the model's real footprint. The skin was
0.09 m. Guards: a contact test, and a test that fails if a model's footprint
drifts 10 cm or more from the rules' table.

**Push and damage are separate decisions.** Always resolve the overlap. Give
damage only above a closing-speed threshold, from any direction (side-only
damage made rear ramming free), and at most once per pair per cooldown
(above 30% of top speed, 1.5 s). Guard: a crush test.

## Barriers and recovery

**Ordinary input must undo ordinary failure.** Push out of a barrier, keep the
sliding part of the velocity, and turn a nose pressed into a wall along it.
Holding gas alone frees every truck in about 1 s, with no reversing.
Cancelling forward velocity every step pinned trucks, because steering has no
grip at zero speed. Guard: a barrier test.

**Prove "never stuck" with a pose sweep, not a repro.** Enumerate body types
× wall pieces × approach angles × steering × input, and assert escape under a
hard limit (4,394 poses per truck, slowest 1.07 s). The one pose a player
reported is never the only stuck pose.

## AI traffic and fairness

**Difficulty is policy, never physics.** AI drives through the player's
smoothing and terrain rules. Only pace, route appetite, boost use and mercy
differ. A hidden speed bonus makes behaviour illegible and untestable.

**A truck behind must not move an AI's line.** Rivals counted trucks up to
about 6 m behind them in their passing plan. A tailgater made them swerve
4.8 m off the racing line, so ramming won 14 of 14 races without touching
anyone. Keep a truck behind in the plan only if it is the one the AI is
already passing.

**A parked player is a first-class test case.** Pick one passing side per
encounter and keep it. Stop at a geometry-derived gap. When stopping, cut the
throttle immediately: smoothed throttle let the AI creep on at 2.5 m/s. Back
off with opposite lock. Guard: a parked-player matrix in the bot tests (30
races, no contact).

**Mercy follows relative progress.** Ease an AI leader by how far ahead it
is, more on Easy. Gulp's Easy rivals never hunt the child, and Hard hunts only
when level. Guard: `src/games/gulp/domain/rivals.test.ts`.

## Balance by bots

**Persona bots are standing tests, not one-off sims.** Run the real rules
with a careful, a casual and a sloppy persona (with decision delays). Assert
completion windows, first reward, no softlock and repeatability.

**Gate the degenerate strategy head-on.** For every exploit the design
forbids (ramming, farming, a shortcut that always wins), run it against the
intended play across seeds. Assert it wins no more often and is no faster.
The ramming chase gate does this against passing. When the exploit wins,
trace one seed before tuning: ramming looked like a contact-tuning bug, and
was an AI planning bug.

**Thresholds come from distributions.** Two stars near the casual bot's
median, three near the steady bot's 65th percentile, rounded to readable
numbers.

## Tuning

- **One source for tunables.** Keep a test asserting the code matches the
  design's balance CSV key for key.
- **Ramp, don't pick one rate.** Gulp rebuilds at 50% pace rising to 100%
  over 300 s, and its raise gap shortens from 0.25 s to 0.03 s. Every single
  constant was wrong at one end of the round.
- **Tutorial progress is a fact of world state**, so reloads and
  out-of-order play cannot desynchronise it.

## Shared code: not yet

No physics code is shared yet, on purpose. Vehicle contact and barriers
exist in one game only. Copy from there into a new vehicle game, and extract
a kit when a second game uses them. Worth extracting now, if a game asks:
deterministic-run test helpers (repeat, serialise, frozen inputs) and bot
report quantiles. Runners and bot policies stay game-specific.
