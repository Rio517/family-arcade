# Gulp Universe: feedback tracker

Every piece of feedback on Gulp Universe and where it stands. The game stays
local until the release step at the end of this list.

Status: **done** (built and checked), **check** (built, still to verify in the
browser), **doing** (in progress), **todo**, **decide** (needs the owner).

## Open now

| Feedback | Status | Notes |
| --- | --- | --- |
| Fuel truck (fight-back option) should burn the mouth | done | It now crashes into any hole it reaches, whatever the size. The hole shrinks, and the mouth chars and throws flames for 3 s. |
| Garbage truck turns the mouth a poopy colour, then fades | done | New `garbagetruck` kind. Parked too often (20–70 per map): make it rarer. The strength follows truck size against mouth size, so a giant barely shows it. |
| Ice cream turns the mouth ice-cream coloured, then fades, scaled to mouth size | done | The ice-cream cart and the new `icecreamvan`. The van is parked too often: make it rarer. |
| People: Gulp City's are more fun | check | Chunky toys now: big head, six hairstyles, dot eyes, smile; police with cap and baton. Check in play. |
| Right-side HUD info sometimes overlaps | done | Stats and buttons in their own rows (two rows on phones); the power countdown badge moved to the hole's left, clear of the combo. |
| The message window is sometimes too narrow and needs more side padding | done | Banner, news and hint share one bottom stack: full width available, more side padding, no overlaps. |
| Flicker: warehouse blue door, top of the leaning tower, bus door | done | The model kit lifts flush details off the faces they sit on, for every model. A test keeps it that way; the few flush faces left are hidden inside their models. |
| Frame rate is a little jittery | done | Models are built ahead in spare frame time (a mid-play build stalled a frame for up to 90 ms), effect shaders are compiled up front, HUD updates are capped at 10 a second, and 120 Hz screens that keep missing frames hold a steady 60. Measured afterwards: no frame over 11 ms of JavaScript, frame gaps 16.7–19.8 ms. |
| Audit individual assets for performance | done | Houses are ~30% of every map's triangles (1,816 each, up to 728 of them); street clutter (lamps, bins, planters, bikes, hydrants, cones) ~25%. About 220–290k triangles are in view. |
| Awkward building placements | done | Placement audit across all four maps, with tests for the rules found. |
| Grass texture still has hard slices | done | A texture bug cut patches off at the tile edge; the countryside is now one continuous surface. |
| Stadium not flat on the ground, with a light gap | check | Paved apron and plinth added. Verify in the game. |
| Dev-only asset gallery comparing each asset with the smallest mouth that eats it | done | `/preview-gulp.html` (`?kind=` and `?tier=` filters, test-mouth slider). |
| Cottages and villas (little and big houses) | doing | Approved and connected; placing them in towns, suburbs and the countryside. |
| Airport over a 4×4 block area | doing | Runway, taxiway, terminal, jets, control tower. |
| Compare with Gulp City | doing | Reference shots are in the session scratchpad (`gulp-ref/`). |
| Benchmark the points available in Gulp City | doing | Play it and record the score over time against ours. |
| Finish the fun audit | todo | Includes the gaps in the park textures. |
| Performance audit, then publish to GitHub Pages | todo | The very last step, after everything above. |

## Performance cuts (owner's picks)

- **No shadows from small street clutter** (lamps, bins, hydrants, planters, cones, bikes, mailboxes): done. Vehicles keep their soft blob shadow only; a per-frame rule was wrongly turning their full shadows back on.
- **Simpler small sidewalk items:** doing. Roughly half the triangles each, keeping the look from the play camera.
- Not chosen: simpler houses in the distance, and fewer items per block.

## Done

### The game
- Our own version of Gulp City's mechanics, at a similar level of graphics; no copied files.
- Named Gulp Universe.
- Town, City, Megalopolis and Region maps; the hole grows through levels up to giant infrastructure; speed scales slightly with size.
- The main screen picks map size and duration; everything else is under Options.
- Power-ups (faster, double score), on or off. They time out, show a countdown, and make the hole glow.
- Fight-back option, on or off:
  - the chemical plant shrinks you
  - fuel trucks
  - a bomber with bomb rings you can see coming and dodge
  - in Region, a military base with tanks and helicopters
- The city regenerates as an option; construction starts as a low-value site and grows into a building.
- News strip, e.g. when a new stadium is built.
- Ice-cream "Yum!"; healthy food gives a health bonus.
- Buildings wobble when you are too small, harder the closer you are to fitting (none at about 30% of the size, a lot at 90%).
- Combo counter and bonuses.
- Mouth size follows the footprint: a street lamp fits a small mouth, and a van fits at level 3.
- Points follow swallow size; the level ladder has middle steps (vans, little houses, big houses).
- Twelve real wonders:
  - none in Town, 1 in City, 2 in Megalopolis, 3 in Region
  - dealt without repeats until the whole set is used
  - the demo shows all of them
- People flee from the hole and walk back. There are dogs and dog walkers, and people sitting on benches.
- Police come for the child's hole after a lot of eating. They investigate and wave batons, no guns, whatever the fight-back option. Their cars are edible.
- Playgrounds in plazas, a kids' park, a dog park.
- Stadiums and malls take a double lot, with a parking lot beside them. Mall roof cars sit on wheels.
- Mountains and wind turbines only in the countryside. Maps beyond Town open into countryside, with a warning near the edge.
- Wider bases for wind turbines, the TV tower, towers and skyscrapers.
- Minimap coloured by the points still standing.
- Pause on the space bar, plus a visible pause button.
- Zoom with the mouse wheel and the + and − keys.

### Look and feel
- Softer, chunkier buildings; the school bus kept.
- A denser city: buildings side by side, denser parks, smaller squares, a larger Town.
- Smaller eyes; subtler street lines; distinct sidewalks.
- Jitter passes: car wheel wells, easing, people turning, a smoother demo camera.
- Shadows fitted to the view, so none appear late. Vehicles use soft blob shadows.
