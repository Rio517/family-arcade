# Gulp Universe: levels and unlocks

**Product direction:** give players a reason to play the next round. Add
levels with goals, things to earn, and progress that carries over between
rounds. This applies to both the family arcade and Chompville, the
standalone release for CrazyGames and its own site. They run the same game
code. In the family arcade, free play keeps every map open.

## Current state

- **Maps:** four, all open.

  | Map | Round | Rivals | Notes |
  |---|---|---|---|
  | Town | 3 min | 4 | |
  | City | 4 min | 5 | |
  | Megalopolis | 5 min | 6 | |
  | Region | 6 min | 8 | Includes countryside |

- **Round settings:** easy, medium and hard; short, long and endless rounds. Power-ups, the city fighting back, and rebuilding can each be turned on or off.
- **Growing:** inside a round the mouth grows from eating traffic cones to eating mountains. Level 14 is the giant.
- **Things to eat:** 90 kinds, plus 14 wonders dealt from a deck so each round shows new ones.
  - **Healthy food:** fruit stands and hay bales give a health bonus.
  - **The chemical plant:** shrinks whoever eats it.
- **Looks:** 10 colour skins, all free.
- **Saved between rounds:** the top five scores per map and difficulty. Nothing else carries over.

On CrazyGames this is the main gap. New games are shown to a small audience
first, and the games people return to get promoted. In this genre, progress
that carries over between rounds is what brings players back.

## Layer 1: campaign levels

A Chompville map of short levels, grouped into four districts that follow
the existing maps in order: Town, City, Megalopolis, Region. Each district
has about ten levels.

**A level is a recipe** on the existing engine:

- the map and a fixed seed
- the time limit
- the rivals and their difficulty
- which systems are on: power-ups, fight-back, rebuilding
- one goal
- three star thresholds

**Goal types:**

| Goal | Example |
|---|---|
| Reach a size | Reach level 9 |
| Clear the map | Eat 60% of the town |
| Eat a target | Swallow the Eiffel Tower |
| Win | Finish first |
| Survive | Last two minutes with the army out |
| Count | Eat 30 cars |
| Hunt | Swallow two rival holes |

**Stars:**

- Meeting the goal earns one star.
- Meeting it by a margin earns the second and third. Depending on the level, the margin is a higher score, more of the map eaten, or less time.
- Stars open the next district.

**Teaching order:** each early level introduces one idea, and later levels
combine them. A draft of the Town district:

1. **First bites:** reach level 2. No rivals.
2. **Clean plate:** eat half the town.
3. **Company:** finish first against two easy rivals.
4. **Power-ups:** reach level 5 with power-ups on.
5. **Combos:** score a big combo.
6. **Wonder hunt:** swallow the town's wonder.
7. **Eat your greens:** eat 10 healthy foods.
8. **Hazard:** reach level 7 with the chemical plant in the way.
9. **The army:** survive two minutes with the city fighting back.
10. **Top hole:** finish first on medium with everything on.

**Fair star thresholds:** the game rules are pure and seeded. A bot can
therefore play every level hundreds of times without a screen, and those
results set the thresholds. The family playtests after that.

## Layer 2: coins and collections

Every round pays coins. The amount comes from the score, plus a bonus for
the goal and for each new star.

- **Wonder Book:** an album of the 14 wonders. Swallowing a wonder for the first time adds its card, with a short fact about the real building. Each full page unlocks a look.
- **Mouth looks:** more than colours.
  - Patterns, such as rainbow, galaxy and lava.
  - Different eyes.
  - Toppers on the rim, such as a crown, a unicorn horn and an astronaut helmet.
  - Trails.

  Looks are earned with coins, stars and badges. An example badge is "ate the airport".
- **Power upgrades (open decision):** small capped boosts, such as starting one size bigger or a 10-second-longer round. In this genre they are the strongest reason to come back. They also change the balance, so they come only after the levels are tuned.

## Layer 3: new worlds

Each world needs a new set of things to eat, which makes worlds the most
expensive layer. Add one per milestone. The family picks each world from
mockups. Candidates: Candy Land, Moon Base, Beach, Snow, Dinosaurs.

## Family arcade and Chompville

| | Family arcade | Chompville |
|---|---|---|
| Campaign and collections | Yes | Yes |
| Free-play maps | All open | Open as each district is cleared |
| Ads | None | An ad between levels; an optional ad to double coins or try a look for one round |
| Progress saved | On the device | On the player's CrazyGames account |

## Roadmap

Each step is one PR and leaves the game playable.

1. **One copy of the code.** Chompville and the family arcade share the game module, so the two cannot drift apart. This includes the Chompville rename.
2. **Saved progress.**
   - Coins, stars and unlocks have a pure rules module and a store behind the platform layer.
   - The end-of-round screen pays out.
3. **Campaign, district 1.**
   - The level recipe format.
   - The Town district.
   - The level map, goals and stars.
   - Mockups of the level map and the end-of-round screen come first, for the family to pick from.
   - Bot runs set the star thresholds.
4. **Wonder Book and the looks shop.**
   - Mockups come first.
   - Then the CrazyGames hooks, and a test launch there.
5. **More content.**
   - Districts 2 to 4.
   - The first new world.
   - A daily challenge.

## Skills for each part

| Skill | Use |
|---|---|
| Gameplay systems | District plans, level recipes, fun checks per level |
| Game UI designer | Level map, end-of-round screen, shop, Wonder Book |
| Image generator | Wonder Book cards, mouth patterns, level-map art, CrazyGames cover images |
| 3D generator | Rim toppers and the main things to eat in new worlds, bundled with the game |
| Audio generator | Coin, star and unlock sounds |
| QA and release | Bot playthroughs of every level, production build checks |
| Debug and profiler | Frame time on the iPad for each new world |

## Name: Chompville

- **Games and apps:** no game or app uses the name. Searched: the App Store, Google Play, Steam, itch.io, CrazyGames, Poki and Roblox.
- **Domains:**
  - chompville.com is registered and parked for sale. The price is not known.
  - chompville.io, .game, .gg, .app and .net show as unregistered.
- **Trademarks:** not yet searched. The next step is a search in USPTO, EUIPO and WIPO, classes 9 (software) and 41 (entertainment).
- **Social accounts:**
  - "Chompville" is a nickname used by Florida Gators fans, and @chompville on X is a Gators fan account.
  - The Instagram and YouTube handles are taken.
  - TikTok and GitHub look free.

## Open decisions

1. **First big piece:** the campaign or the looks shop. Recommendation: the campaign.
2. **Power upgrades:** later, after the levels are tuned, or never.
3. **Campaign in the family arcade:** recommendation: yes. Free play stays fully open there.
4. **Domain:** chompville.io or chompville.game, or a price check on the .com. Decide after the trademark search.
