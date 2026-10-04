# Ship Battle: a darker arcade

**Requirement, in the owner's words (lightly edited):** "Revert the Storybook
look (tiles, pegs): I don't like the new UI. I liked the little fire we had.
I'd prefer it to stay cooler; it's probably people who like battling rather
than classic players looking for a board game. Main areas:

- make that fire nicer;
- improve the hit so it looks more fun, like an explosion (maybe borrow from
  the Gulp game);
- improve the game-start user interface, which kind of sucks. I want a cool,
  darker ship experience, but blended a little with the playfulness of the
  arcade: a darker arcade;
- the water could have been cooler;
- I'd like to move towards ships rotating their guns and shooting on hits,
  with a skip option so you don't have to watch the animation every time."

**Requirements from playing it on the iPad:**

- one exchange of fire must never read as our own ships shooting at
  themselves: our shells go toward the enemy, to the right, and their answer
  comes visibly later, in their own colour;
- a shell's trail is a proper trail, not a chain of blobs;
- carriers have no guns: they launch planes;
- the enemy's side looks like dark water;
- a ship that is sunk is seen going down in 3D.

The Storybook branch is not used. Today's Classic and Modern navies are the
starting point, and every option below is built from the real game behind an
address parameter, so it can be played in a production build on an iPad.
Without a parameter the start screens are look C and the effects are the picked set (below).

**Outcome:** start screens **C, Battle Station**, now the default. Its
computer door, the level keys and Fast Start are steel blue instead of red:
red stays on the alarm lights. Starting a game takes two taps, and every fleet
sails in one standard colour (see Start screens below). Effects: **B,
cinematic**, with **A's sea** (Night Ops, at half its first speed) and A's
sonar water on the radar (calmer), the **HIT!, SUNK! and MISS words** on the
radar, and the guns on. Watch the shots is on by default, and off when the
device asks for reduced motion. A and today's effects stay behind `?fx=`.
The page to review is
[battle-arcade.html](./battle-arcade.html) (opens from disk).

## Try it

On the iPad (a production build served over Tailscale), or any build:

| What | Address |
|---|---|
| The picked effects (the default) | no parameter, or `#/play?fx=default` |
| Today | `#/play?look=today&fx=today` |
| Start screens A, B, C | `#/play?look=a`, `?look=b`, `?look=c` |
| Effects A (arcade), B (cinematic) | `#/play?fx=a`, `?fx=b` |
| Mix one effect into a package | `#/play?fx=a&water=b` (also `fire=`, `boom=`) |
| Everything at once | `#/play?look=a&fx=a` |

Once a parameter is given, a small **Pitch** switcher sits in the bottom-left
corner: it flips the start screens and the effects on the device itself, and
the choice holds for the browser tab (Menu and back keeps it). `bar=0` hides
the switcher. Play a game at level 1 (Deckhand Bobble) to see the guns.

## Start screens (`?look=`)

The lobby, the join form and the placing screen. Each look adds a title and
a two-step strip (Place, Battle) and bigger primary buttons.

**The start is two taps.** The lobby has a **Ships** switch, Classic or
Modern, remembered on the device, and two doors:

```
SHIP BATTLE
Ships:  [ CLASSIC ]  [ modern ]
+- PLAY TOGETHER ----+  +- PLAY THE COMPUTER -------+
| [ CREATE A GAME ]  |  | Pick a level              |
| [ JOIN WITH CODE ] |  | [ 1 ] [ 2 ] [ 3 ] [ 4 ]   |
|                    |  | Easy  Fair  Sharp  Boss   |
+--------------------+  +---------------------------+
```

- Tapping a level goes straight to placing ships. The levels are the four
  computer captains in order: Deckhand Bobble (1, Easy), Bosun Marlin (2,
  Fair), Captain Wake (3, Sharp), Admiral Grimtide (4, Boss). The lobby shows
  the number and the word; the names appear in the game, in the battle log and
  on the result.
- Create a game, Join with a code and, in a party, Play Ship Battle with
  *name* also go straight to placing once connected.
- There is no fleet screen and no captain ladder. The ships choice sits on the
  lobby; the placing screen is the first screen of a game.
- **One fleet colour.** Every fleet is Aqua Corps blue: ours, the opponent's
  and the computer's. There is no colour shop. Points are still earned and
  shown on the player's ticket. The `hello` message still carries a `skinId`
  (the standard one) and accepts any string, so a device on an older build can
  play; whatever arrives is drawn in the standard colour. Colours stored in a
  profile are left alone and unused.
- **The placing screen holds still.** Every row in Your ships is the same
  height placed or not, and the status line keeps room for two lines, so
  placing a ship moves nothing below it.

- **A, Night Ops.** A sonar console: near-black navy, phosphor green and
  cyan, a sweeping radar scope beside a pixel-type SHIP BATTLE, "PRESS START".
- **B, Neon Harbor.** The arcade's Midnight Carnival at sea: a neon-tube sign
  hung with marquee bulbs over dark harbour water, ticket-stub doors
  ("ADMIT TWO", "ADMIT ONE"), candy-bright buttons.
- **C, Battle Station.** Gunmetal plates and rivets, yellow-and-black hazard
  stripes, red alarm lights either side of the title, "INSERT COIN TO FIRE";
  the chosen ships on a yellow plate, the level keys and Fast Start in steel
  blue. **Picked.**

## Effects (`?fx=`)

**Played by default:** B's fire, blasts and shell trails; A's sea in the
fleet view; A's sonar water on the radar, calmer than first drawn; the
HIT!, SUNK! and MISS words on the radar; the guns on. `?fx=a`, `?fx=b`,
`?fx=today` and `fire=`, `boom=`, `water=` still play the other options, and
the Pitch switcher's Picked button returns to the default.

Each package changes the deck fires, the hits and misses, the sea and the
radar's water; the guns come with either, drawn in the package's style. The
radar's HIT!, SUNK! and MISS words show with A and B.

| | Today | A, arcade | B, cinematic |
|---|---|---|---|
| Fire on a damaged ship | Small crossed flame cards | The same small fire as crisp cel-shaded tongues that lick and flicker, with rising embers, a warm glow on the deck and a smoke wisp | A soft, roaring blaze with a heavier smoke column |
| A hit | Sparks on the board | After Gulp's booms: a flash, a fireball cooling from yellow to red, a shock ring on the water, star sparks, debris that splashes into the sea, smoke; "HIT!" and "SUNK!" pop on the radar | The same layers, heavier and realistic, with a flash of light on the water; "HIT!" and "SUNK!" pop too |
| A sinking | Sparks | A bigger blast, then a chain of blasts down the hull | As A, cinematic |
| A miss | Droplets | A column of spray, droplets and rings spreading on the water; "MISS" pops | Taller spray; "MISS" pops |
| The sea | A dark square of swell | **Night Ops:** contour lines of the swell like a sonar chart, the targeting grid glowing in the water, a sonar ping sweeping out every nine seconds; the whole sea runs at half its first speed | **Moonlit Swell:** a rolling sea (Gerstner waves), flecks of whitecap, the moon's glitter path, a night sky with stars; it reaches the horizon |
| The radar's water | A flat navy grid | A dark teal sonar sea under the grid: faint, widely spaced range rings and phosphor crest lines drifting slowly (a loop takes 44 s); the sweep as today | A plain night-blue sea: a long, low swell and sparse glints, both from seeded noise, drifting different ways; the sweep softened |
| Shell trails | No guns | A bright head, a crisp streak that tapers and fades, a short puff of smoke left hanging | A smaller head, a finer streak, more smoke that hangs longer |

## The guns

The enemy lies to the east: off the right of the fleet view in its default
camera. Our shells are white-gold and theirs red-orange. On every shot, with
Watch the shots on:

1. **Our shot (1.1 s).** The target cell on the radar locks on. The next ship
   in our fleet that is still afloat trains every main gun east, on the
   bearing of the target (each row and column of the enemy's waters has its
   own), raises the barrels, and fires in a ripple: a muzzle flash, smoke,
   the barrels running back. The shells climb steeply away and leave the
   frame over the board's right edge, well above our own ships. Then one
   drops onto the radar cell from the west and the hit or miss shows there.
   On the carrier's turn it launches planes instead: two or three roll down
   the flight deck in a short ripple, lift off, climb and turn away east out
   of the frame, each drawing a contrail. The Classic carrier (Shōkaku) flies
   propeller fighters built in code; the Modern one (Ford) flies copies of
   the jet parked on its own deck.
2. **The beat (0.9 s).** Our result holds on the radar before their answer
   starts; 2 s after we sink a ship, while it goes down there.
3. **Their shot (1.35 s).** A warning ring tightens on our water alone for
   0.45 s; then their shell comes in through the right of the frame, high
   and steep, and the blast or the splash plays on our fleet. While their
   carrier is afloat, every third attack of theirs (counting from their
   second) is a dive bomber instead: it dives out of the east, lets its bomb
   go and pulls away over our fleet. Which attacks come by plane is fixed by
   the log, so a replay shows the same.

**Sinkings.**

- **Theirs, on the radar.** When we sink a ship, its 3D model appears over
  its own cells (a see-through canvas laid on the grid), lists, goes down by
  one end with the other rising, and slips under in white water, bubbles, a
  foam ring and an oil slick; after 2.6 s the radar shows its sunk mark. The
  enemy is drawn in the player's own navy: the game log does not carry the
  opponent's pick.
- **Ours, in the fleet view.** A lost ship lists, settles and goes down by
  one end over 3.2 s, then rests as a dark wreck low in the water,
  smouldering, so the fleet still shows what was lost.

- **Skip:** while a shot plays, the beat holds or a ship goes down on the
  radar, a tap anywhere (or Escape) shows the result at once. The blast
  still plays; only the wait is skipped.
- **Reduced motion:** no shells or planes fly; the enemy ship is simply
  sunk on the radar, a lost ship of ours is placed at rest as a wreck, and
  the radar's water is still.
- **Watch the shots: On/Off** sits beside the battle log and is remembered
  per device. Off, every result shows the moment it happens, as today. It is
  off by default when the device asks for reduced motion.
- The game never waits on the picture. The opponent plays at its own pace,
  and a shot that lands while another plays waits its turn. Skipping changes
  only what is drawn; the game log is never touched (tests hold this). On
  the last shot, the battle stays up until the final blast has played, then
  the result shows.
- On a phone, the screen follows the shell: the radar for our shots, the
  fleet for theirs.

**The models already had turrets.** Every shipped ship GLB keeps its weapons
as named pivots (`Turret_Main_1_Yaw` on the Iowa, `Cruiser_Main_*_Yaw`,
`Destroyer_Main_*_Yaw`, the U-boat's `Deck_Gun_Yaw`, `Kirov_Main_Gun_Yaw`,
`Type055_Main_Gun_Yaw`, `Hobart_Main_Gun_Yaw`), so no Blender work was
needed. Their `*_Elevation` nodes sit at the model's origin, so a hinge is
inserted at each gun's breech at load for elevation and recoil. The Virginia
has no gun; it fires a missile out of a deck hatch. The carriers fly planes:
the Ford's deck jet (`Aircraft_01` and its canopy) is cloned, sharing the
model's geometry and materials; the Shōkaku's model carries no aircraft, so
its planes are three.js geometry built in code.

## Cost and speed

Measured on a Mac at iPad size (1180×820, DPR 2), Chromium on Metal, the
harness playing an exchange of fire on a loop for 14 s
(`node scripts/perf-battle-fx.mjs`):

| | p50 | p95 | p99 | max | frames over 33 ms | peak draw calls |
|---|---|---|---|---|---|---|
| Today | 13.7 ms | 27.2 ms | 27.3 ms | 28 ms | 0 | 996 |
| A | 14.1 ms | 27.1 ms | 27.3 ms | 44 ms | 1 | 1034 |
| B | 14.8 ms | 27.2 ms | 27.3 ms | 28 ms | 0 | 1039 |
| Today, CPU 4× slower | 12.9 ms | 27.1 ms | 35.5 ms | 65 ms | 14 | 996 |
| A, CPU 4× slower | 13.3 ms | 27.2 ms | 43.1 ms | 57 ms | 24 | 1033 |
| B, CPU 4× slower | 13.1 ms | 27.1 ms | 43.6 ms | 73 ms | 27 | 1039 |

The effects add about 4% to the peak draw calls: a shell's trail is three
draw calls (head, streak, smoke) whatever its length. Unthrottled, the frame
times match today's. With the CPU slowed 4×, A and B run about ten more
frames over 33 ms than today in the 14 s, and a longer p99. Those frames
fall where a shot starts or lands (the battle screen re-renders and the
fleet is rebuilt, as today, but a watched exchange has more of those
moments) and while a ship goes down on the radar, which draws in its own
small WebGL canvas for those 2.6 s. Run to run, today's own count moved
between 11 and 17. The picked default (`?fx=default`), measured the same way
in two later runs, is about as fast as today unthrottled (p99 26 ms, 0 to 2
frames over 33 ms, 1036 peak draw calls). With the CPU 4× slower the counts
swing with what else the Mac is doing: 91 frames over 33 ms against today's
22 on a busy machine, 29 against today's 48 on a quieter one. The desktop
can't settle it; `?fps` on an iPad will. Not yet verified on an iPad.

## Where the pieces are

- Start screens: `src/games/battleship/components/look/`, `styles/looks.css`.
  Look C's labels sit on the middle of their capitals (DIN Condensed's ride
  high): `look/capCentre.ts` measures the face the device draws, and
  `node scripts/check-text-centre.mjs <running build>` checks every box in
  pixels in Chromium and WebKit.
- Effects: `src/games/battleship/components/three/fx/` (fire, booms, water,
  guns, tracers for the shell trails and contrails, planes), the radar's
  blasts and falling shells in `components/BoardFX.tsx`, its dark water in
  `styles/pitch.css`, its sinking ships in `components/RadarSinking.tsx` and
  `three/RadarSinkScene.ts`.
- Shot playback, the beat, which attacks come by plane, and the skip:
  `src/games/battleship/state/shotPlayback.ts`.
- The address parameters and the setting: `src/games/battleship/state/pitch.ts`.
- Screenshots: `docs/screenshots/bs-look-*` and `bs-fx-*`, from
  `npm run shots -- bs-look bs-fx`; the effects harness is
  `preview-guns.html` (`?fx=a&demo=1` plays on a loop).
