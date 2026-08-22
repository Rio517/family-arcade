# Caribbean Career — game design specification

## Experience promise

You are the captain of a small ship in a changing Caribbean. Every few minutes
you make a story: out-sail a patrol, bring scarce tools to a struggling port,
take a richer flagship, earn a commission, follow a coastline on a torn map,
help someone you care about, or decide that the crew has earned its share.

The game is not about surviving a dashboard. It is about choosing which
opportunity to chase and living with what that choice changes.

## Pillars

1. **Readable adventure.** A new situation should be understood in one glance.
2. **Ships are the progression.** Capturing, fitting, and arranging ships is
   the richest management layer.
3. **Wind makes geography matter.** Navigation is a tactile choice, not a
   loading screen.
4. **A living world speaks plainly.** Simulation produces consequences and
   leads, not administrative work.
5. **History supplies context, not permission for exploitation.** The setting
   acknowledges power and violence while preserving human agency.

## Start of game

The player chooses:

- name, appearance, pronouns, and optional background;
- starting talent: Fencing, Gunnery, Navigation, Charm, or Medicine;
- historical chapter or a recommended chronological start;
- career length; and
- difficulty/accessibility profile.

### Career lengths

| Mode | Target | Calendar/content tuning | Intended use |
| --- | --- | --- | --- |
| Adventure | 30–60 min | Fast leads, generous travel scale, early retirement threshold | One sitting, family introduction |
| Voyage | 2–3 hr | Standard pacing and breadth | Default complete career |
| Legend | 8–12 hr | Full chapter transitions, slower rise, longer rival arcs | Persistent campaign |

All modes contain sailing, trade, relationships, ship fitting, naval combat,
treasure, rank, and retirement. No “short mode” removes the game's identity.

## Strategic sailing

The player steers a stylized ship directly across a compressed Caribbean. A
wind rose shows direction and strength; sail trim is automatic at this layer.
The chosen destination supplies a bearing, not autopilot. A forgiving assist
can hold a course or suggest tacks.

Visible vessels advertise role through silhouette, flag, heading, and a short
label. Closing range reveals exact type, power, and legal status. The player can
pursue, avoid, hail, or enter port. Time, provisions, world traffic, and
historical events advance through one deterministic simulation clock.

Dynamic ship roles: merchant, provision, governor, immigrant, payroll, troop,
raider, invasion, treasure, privateer/pirate, and pirate hunter. Their arrivals
or losses can alter prices, prosperity, defense, and rumours.

## Port loop

Arrival opens a 3D harbour diorama behind one consistent activity menu:

1. **Governor's House** — commissions, promotion, political missions,
   introductions, and current diplomatic context.
2. **Tavern** — recruit, hear one or two concise leads, meet specialists or
   story contacts.
3. **Market** — buy/sell six cargo categories with price cues and hold impact.
4. **Shipyard** — repair, refit, sell, rename, switch flagship, and manage the
   fleet.
5. **Divide Shares** — preview and confirm the end-of-voyage settlement.
6. **Captain's Log** — leads, maps, relationships, standing, fleet, career.
7. **Set Sail** — leave immediately.

Most visits should take 20–60 seconds. The menu preserves position after a
transaction, uses explicit results, and never makes the player traverse a 3D
town to reach a button.

## Economy and provisions

Cargo: provisions; tools and common goods; luxuries; sugar and molasses;
tobacco and dyewood; powder and arms. Each row shows quantity, unit price,
Cheap/Fair/Expensive, total hold usage, and a one-tap buy/sell amount. Cannon
occupies capacity but uses a separate fitting control.

Provisions are intentionally one resource. The HUD derives **months remaining**
from current provisions and crew. It gives a clear warning below one month and
a critical warning below half a month. Running out reduces morale and speed,
then forces the captain toward the nearest viable port; it should create a
story, not silently end a career.

## Captain, crew, and morale

The starting talent is the only conventional character build. There is no XP
tree. Experience is expressed through better ships, promotions, contacts,
specialists, wealth, maps, and the player's growing mastery.

Passive specialists: Navigator, Gunner, Carpenter, Sailmaker, Cook, Surgeon,
and Quartermaster. Only one of each applies. Their card states a single direct
effect and where they were found.

Morale states: Very Happy, Happy, Content, Unhappy, Mutinous. Hidden inputs may
include recent victories/losses, available loot per crew member, months since
division, provisions, crowding, captain talent, and specialists. The player
sees at most two plain causes. At Mutinous, desertion or a forced share warning
occurs before harsher consequences.

Aging is one condition: Excellent, Fine, Good, Fair, Weathered. It changes
fencing reaction windows, recovery, and retirement scoring gradually. No
injury slots, disease catalogue, sleep, hunger, or fatigue.

## Fleet management

The fleet holds at most eight vessels and one flagship. Each ship card shows:

- class, name, role summary, and comparative size;
- crew now and safe/minimum/maximum range;
- cannon now and maximum;
- cargo used/capacity;
- hull and sails;
- top speed, turn response, and best wind angle; and
- installed fittings.

Actions: make flagship, rename, repair, refit, sell, abandon, redistribute crew,
redistribute cannon, and redistribute cargo. Suggested balancing can resolve a
captured prize in one action; an advanced panel allows exact transfer.

Flagship statistics control tactical battle. The slowest retained vessel and
fleet load affect strategic pursuit. This creates the essential capture choice:
a valuable prize can also be a burden.

### Capture resolution

After victory the player sees both ships and four questions in one flow:

1. take cargo;
2. take cannon;
3. recruit willing crew or a specialist; and
4. keep this ship or abandon it.

“Take recommended” must be a good default. It never discards a uniquely better
ship, map, specialist, or critical provisions without a warning.

## Naval combat

### Structure

A battle is a dedicated real-time 3D scene lasting 2–4 minutes. It inherits
wind, weather, approximate coastline, time of day, ships, crew, damage, cannon,
and ammunition from the strategic encounter. The domain simulation runs on a
fixed deterministic timestep in a horizontal plane. Rendering adds sea motion
without changing hit logic.

Most battles have one active opponent. Escorts may appear as distant context,
arrive sequentially, or create an occasional two-target encounter, but the game
never becomes fleet RTS micromanagement.

### Controls

- Turn port/starboard: keyboard A/D or arrows; large touch rudder buttons.
- Sail setting: Full or Reefed. Full is faster; Reefed turns and controls range
  better and is safer in squalls.
- Fire port/starboard broadside: Q/E or large side-specific touch buttons.
- Ammunition: round, chain, or grape; selection persists until changed.

The easiest profile provides aim timing, broadside arc highlight, and auto-side
selection. Higher difficulty sharpens enemy sailing and shot choice, reduces
assist, and tightens reaction windows. It does not multiply enemy durability.

### Wind and movement

Each class has a polar response curve rather than a single speed. A ship moving
across or somewhat downwind performs well; pointing close into the wind loses
drive. Reefing reduces top speed but improves turn authority. Hull damage
reduces speed modestly; sail damage reduces drive strongly; insufficient crew
slows reload and handling.

### Gunnery

A broadside can fire only when loaded and a target intersects its lateral arc.
The player may fire without a lock; assists explain good timing. Shot travels
physically across the domain plane, with dispersion based on range, crew,
specialist, fittings, and damage.

| Ammunition | Best use | Weakness |
| --- | --- | --- |
| Round | Hull and cannon at most ranges | Less control over escape or boarding odds |
| Chain | Sails and mobility at close/medium range | Weak hull effect |
| Grape | Crew at close range | Rapidly loses effect with range |

The result can be sink, surrender, boarding, escape beyond the engagement
boundary, or nightfall/separation. Damaged enemies should sometimes surrender
before destruction so capturing ships remains central.

### 3D presentation

The ship's authoritative x/z position and yaw come from the domain. Visual y,
pitch, roll, heel, sail flex, recoil, wake, spray, smoke, and debris are
interpolated effects. This prevents visual beauty from destabilizing replay or
tests.

Performance target: smooth iPad-class WebGL2 at an adaptively capped pixel
ratio. Use optimized GLB, Meshopt, instanced scenery, pooled particles, simple
water, culling, LOD where measured, and no runtime downloads.

## Boarding duel

Boarding odds begin with surviving crew, morale, specialists, ship damage, and
the tactical approach. Crew fights around the principals automatically. The
player controls one readable duel:

- thrust ↔ parry;
- slash ↔ jump;
- chop ↔ duck; and
- taunt trades safety for positional pressure.

Rapier is quick, cutlass balanced, longsword slower with stronger push. Space
between duelists is the status display. A fighter forced to the edge surrenders
or falls back; there is no health/stamina/combo UI. Input remapping, larger
windows, move hints, and an auto-defense option are available.

## Port conquest

Port conquest stays because it makes ship progression and politics culminate.
It reuses proven mechanics:

1. Enter a 3D harbour battle against fort batteries and a defending vessel.
2. Survive or silence enough defenses to land.
3. Resolve crew advantage through a short commandant sword duel.
4. Choose ransom, plunder stores, or—only with a valid wartime commission—set a
   new allegiance.

The player does not own, build, tax, or administer ports. An NPC force can
reconquer one later, generating a lead and consequence.

## Relationships, rivals, and leads

Relationship stages: Acquainted, Friendly, Close, Devoted. Progress comes from
returning, keeping promises, choosing supportive responses, finding a personal
item, or completing a favour. There are no appearance tiers, personality-stat
exams, jealousy spreadsheet, or gender restrictions. Dancing is deferred.

Six fictional rival captains recur across sailing, rumours, battles, and
relationships. Each needs a different sailing doctrine, visual identity,
motive, and possible non-lethal resolution.

The log holds four lead types:

- commissions;
- personal stories;
- treasure maps; and
- rumours.

Every lead has one next action and an optional expiration warning. Rumours use
direct language such as “The *Golden Finch* left Barbados for Martinique two
days ago.” They are not nested clue graphs.

The captain's personal background supplies one shorter authored thread rather
than repeating a chain of kidnapped relatives.

## Treasure

A treasure trail uses two or three map fragments. Each fragment adds a coast,
settlement, or distinctive landmark. Once the area is known, the player lands
in a small 3D search space and matches the diagram to terrain. The scene should
last 2–5 minutes. No hunger, crafting, large jungle, stealth system, random
combat gauntlet, or pixel-hunting.

## Divide shares and end a career

The confirmation screen:

- selects exactly one ship to retain;
- lists every other ship and sale value;
- adds those values to the voyage haul;
- shows captain and crew shares;
- explains that the crew will disperse and roughly seven months will pass; and
- offers Start a New Voyage or Retire.

Retirement converts rank, wealth, ships, relationships, treasure, rivals,
discoveries, and major world consequences into one Legacy score plus an
authored epilogue. The score is transparent but not a 126-point replica of the
reference game.

## Visual direction

**Theme:** sunlit maritime diorama, not sepia “pirate parchment.” Water and sky
carry broad saturated colour; materials are tactile and slightly stylized;
brass and signal paint direct attention.

**Palette:** Deep Sound `#062b3a`, Trade Wind `#4ec5c1`, Sunlit Sail `#f1d6a1`,
Powder Smoke `#d7d2c6`, Signal Vermilion `#d94b3d`, Brass `#c79a45`, Night Ink
`#07151d`.

**Type:** an offline bundled or system serif with maritime editorial character
for large headings; a highly legible system sans for telemetry and controls.
No runtime webfont.

**Signature motif:** a live brass wind rose whose streamlines extend into the
water and make the prevailing wind spatially visible. It is functional, not a
decorative compass pasted onto a panel.

**Battle composition:** full-bleed sea; thin top rail for opponent, wind, and
objective; lower command deck for ship condition, ammunition, and large touch
controls. UI avoids covering either broadside arc.

## Accessibility and family use

- Full keyboard and remappable controls; touch targets at least 44 CSS pixels.
- Non-colour indicators for damage, ammunition, standing, and price.
- Subtitles and independent music/effects controls.
- Reduced motion removes camera shake, bob, cloth flutter, and rapid particles
  while preserving rules.
- Aim, steering, duel timing, and reading assists are independent options.
- Pause freezes simulation immediately.
- Short modes contain the full fantasy and autosave after every resolved event.

## Explicit deferrals

Dancing, stealth, tactical army combat, port ownership, crew job assignment,
food/water types, crafting, warehouses, loans, detailed wounds/disease,
procedural relationship dialogue, online multiplayer, and live-service economy
are outside the first production scope. A deferment is not a promise; it needs
play evidence and a new design review.

## Success measures

- A first-time player can leave port and fire a useful broadside without a
  manual.
- At least two valid tactics—disable/board and damage/surrender—work in the POC.
- Players can explain why they kept or abandoned a captured ship.
- A port visit with repairs and provisions stays under one minute after the
  first visit.
- Adventure mode produces a complete retirement story in one sitting.
- Target tablet holds the frame budget with two hero ships, coastline, water,
  projectiles, and effects.
- Historical review finds no people treated as inventory or generic obstacles.
