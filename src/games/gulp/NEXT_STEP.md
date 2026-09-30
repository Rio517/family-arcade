# Gulp Universe: feedback tracker

Every piece of feedback on Gulp Universe and where it stands. The game stays
local until the release step at the end of this list.

Status: **done** (built and checked), **check** (built, still to verify in the
browser), **doing** (in progress), **todo**, **decide** (needs the owner).

## Second release

| Feedback | Status | Notes |
| --- | --- | --- |
| The mouth should be a real 3D hole, like Gulp City's; fire and poop should follow its shape | done | The mouth cuts the ground away and a funnel of throat goes down into the dark; things fall into it; messes are painted on the walls. |
| Skyscrapers pop up: building site, then a taller building site, then the skyscraper | done | New `tallsite` (frame and tower crane) between the site and every tower or skyscraper. |
| Bombs should come faster, but attacks come too often | done | The bomber flies in faster and its bombs land sooner; attacks come every 20–32 s. |
| On Hard with fight-back, a hit should make you smaller | done | A hit keeps 85% of your size on Easy, 75% on Medium, 60% on Hard. |
| Better explosions | done | Flash, cooling fireball, shock ring, sparks, debris, lingering smoke, scorch mark. |
| A house shakes when you are at its edge, but not when you are right under it | done | See-through buildings over the hole now shake too. |
| "Yuck!" when you swallow a garbage truck | done | |
| Cars (a fuel truck, police) come out of nowhere on screen; a police car appeared from nowhere | done | Attacks and police start well out of sight and drive in. Parked police cars were never drawn at all: fixed. |
| The menu camera should move at a moderate pace, no quick pans | done | Steady glide to the nearest unseen showpiece, a rest there, no sideways drift. |
| Use the player's name like Rainbow Racer, part of the site's player management | done | The site's "Playing as · Switch player" line heads the menu; the name labels your hole and leaderboard row; bests and results are kept per player. |
| Playgrounds together, with a basketball court or picnic tables nearby | done | One soft surface per playground; beside it a court with two hoops, picnic tables, or open lawn. |
| Map edge is all water: continue the green, water on one or two sides, a port on big maps | done | Sea to the north (and one more side on bigger maps); green to the horizon elsewhere; a port with cranes, ships, containers and warehouses on Megalopolis and Region. |
| Farms only at the edges, none in Town | done | Farms are countryside only. |
| Maps a little bigger | done | Town 8 blocks a side, City 10; wider countryside. |
| No edge warning where water already shows the edge | done | The warning shows only near a side with no sea. |

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
| Cottages and villas (little and big houses) | done | Cottages across Town and the suburbs, villa blocks at the edge of town, both in the countryside; rebuilt when eaten. |
| Airport over a 4×4 block area | done | Region: runway with numbers, taxiways, terminal and tower, two jets, hangars, radar. |
| Compare with Gulp City | done | Ours levels up sooner and has the minimap and a richer points spread; theirs has a far more dramatic rival leaderboard, and our level 4 drags (about 140 s). Both are open tuning items below. |
| Benchmark the points available in Gulp City | done | Their rivals reach 35–60k in 2 minutes; ours stay under 3k in 4. |
| Finish the fun audit | todo | Includes the gaps in the park textures. |
| Performance audit, then publish to GitHub Pages | done | Lighthouse (mobile) blocking time on the menu 5.2 s → 0.9 s; published. |
| Level 4 lasts too long | todo | About 140 s at level 4 in a City round (from the benchmark). |
| Rival leaderboard feels flat next to Gulp City's | todo | Their rivals' totals climb far higher; consider a late-round surge for show. |

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
