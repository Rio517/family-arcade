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

The Storybook branch is not used. Today's Classic and Modern navies are the
starting point, and every option below is built from the real game behind an
address parameter, so it can be played in a production build on an iPad.
Without a parameter the game is exactly today's.

**Outcome:** Pending. The page to review is
[battle-arcade.html](./battle-arcade.html) (opens from disk).

## Try it

On the iPad (a production build served over Tailscale), or any build:

| What | Address |
|---|---|
| Today | `#/play?look=today&fx=today` |
| Start screens A, B, C | `#/play?look=a`, `?look=b`, `?look=c` |
| Effects A (arcade), B (cinematic) | `#/play?fx=a`, `?fx=b` |
| Mix one effect into a package | `#/play?fx=a&water=b` (also `fire=`, `boom=`) |
| Everything at once | `#/play?look=a&fx=a` |

Once a parameter is given, a small **Pitch** switcher sits in the bottom-left
corner: it flips the start screens and the effects on the device itself, and
the choice holds for the browser tab (Menu and back keeps it). `bar=0` hides
the switcher. Play a game against Deckhand Bobble to see the guns.

## Start screens (`?look=`)

The lobby (both doors, the captain ladder, the join form), the fleet screen
and the placing screen. Each look adds a title and a three-step strip (Fleet,
Place, Battle), bigger primary buttons, and navy cards that show the five
ships of each navy instead of their names alone. The flow, the buttons and
what they do are unchanged.

- **A, Night Ops.** A sonar console: near-black navy, phosphor green and
  cyan, a sweeping radar scope beside a pixel-type SHIP BATTLE, "PRESS START".
- **B, Neon Harbor.** The arcade's Midnight Carnival at sea: a neon-tube sign
  hung with marquee bulbs over dark harbour water, ticket-stub doors
  ("ADMIT TWO", "ADMIT ONE"), candy-bright buttons.
- **C, Battle Station.** Gunmetal plates and rivets, yellow-and-black hazard
  stripes, red alarm lights either side of the title, "INSERT COIN TO FIRE".

## Effects (`?fx=`)

Each package changes the deck fires, the hits and misses, and the sea; the
guns come with either.

| | Today | A, arcade | B, cinematic |
|---|---|---|---|
| Fire on a damaged ship | Small crossed flame cards | The same small fire as crisp cel-shaded tongues that lick and flicker, with rising embers, a warm glow on the deck and a smoke wisp | A soft, roaring blaze with a heavier smoke column |
| A hit | Sparks on the board | After Gulp's booms: a flash, a fireball cooling from yellow to red, a shock ring on the water, star sparks, debris that splashes into the sea, smoke; "HIT!" and "SUNK!" pop on the radar | The same layers, heavier and realistic, with a flash of light on the water |
| A sinking | Sparks | A bigger blast, then a chain of blasts down the hull | As A, cinematic |
| A miss | Droplets | A column of spray, droplets and rings spreading on the water | Taller spray |
| The sea | A dark square of swell | **Night Ops:** contour lines of the swell like a sonar chart, the targeting grid glowing in the water, a sonar ping sweeping out every few seconds | **Moonlit Swell:** a rolling sea (Gerstner waves), flecks of whitecap, the moon's glitter path, a night sky with stars; it reaches the horizon |

## The guns

On every shot, with Watch the shots on:

1. **Our shot.** The target cell on the radar locks on. The next ship in our
   fleet that is still afloat trains every main gun on the bearing of the
   target (the enemy's waters lie beyond our horizon, so each column has its
   own bearing), raises the barrels, and fires in a ripple: a muzzle flash,
   smoke, the barrels running back. The shells arc away over the horizon,
   then one drops onto the radar cell and the hit or miss shows there.
2. **Their shot.** A warning ring tightens on our water, a shell comes in
   over the horizon, and the blast or the splash plays on our fleet.

- **Skip:** while a shot plays, a tap anywhere (or Escape) shows the result at
  once. The blast still plays; only the wait is skipped.
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
`Destroyer_Main_*_Yaw`, `Shokaku_Gun_*_Yaw`, the U-boat's `Deck_Gun_Yaw`,
`Kirov_Main_Gun_Yaw`, `Type055_Main_Gun_Yaw`, `Hobart_Main_Gun_Yaw`, the
Ford's `Carrier_CIWS_*_Pivot`), so no Blender work was needed. Their
`*_Elevation` nodes sit at the model's origin, so a hinge is inserted at
each gun's breech at load for elevation and recoil. The Virginia has no gun;
it fires a missile out of a deck hatch.

## Cost and speed

Measured on a Mac at iPad size (1180×820, DPR 2), Chromium on Metal, the
harness playing an exchange of fire on a loop for 14 s
(`node scripts/perf-battle-fx.mjs`):

| | p50 | p95 | p99 | max | frames over 33 ms | peak draw calls |
|---|---|---|---|---|---|---|
| Today | 10.3 ms | 25.6 ms | 27.3 ms | 28 ms | 0 | 996 |
| A | 10.2 ms | 18.4 ms | 27.2 ms | 27 ms | 0 | 1106 |
| B | 10.4 ms | 26.1 ms | 27.3 ms | 27 ms | 0 | 1157 |
| Today, CPU 4× slower | 11.5 ms | 26.2 ms | 27.3 ms | 63 ms | 7 | 996 |
| A, CPU 4× slower | 11.3 ms | 26.1 ms | 28.4 ms | 49 ms | 5 | 1110 |
| B, CPU 4× slower | 11.3 ms | 25.9 ms | 32.9 ms | 52 ms | 8 | 1137 |

The effects add about 11% (A) and 15% (B) to the peak draw calls. The frame
times are within run-to-run noise of today's: the unthrottled p95 moved
between 18 and 26 ms from one run to the next for every option, today's
included. Nothing was simplified to get there. Not yet verified on an iPad.

## Where the pieces are

- Start screens: `src/games/battleship/components/look/`, `styles/looks.css`.
- Effects: `src/games/battleship/components/three/fx/` (fire, booms, water,
  guns), the radar's blasts in `components/BoardFX.tsx`.
- Shot playback and the skip: `src/games/battleship/state/shotPlayback.ts`.
- The address parameters and the setting: `src/games/battleship/state/pitch.ts`.
- Screenshots: `docs/screenshots/bs-look-*` and `bs-fx-*`, from
  `npm run shots -- bs-look bs-fx`; the effects harness is
  `preview-guns.html` (`?fx=a&demo=1` plays on a loop).
