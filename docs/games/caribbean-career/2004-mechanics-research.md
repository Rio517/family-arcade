# *Sid Meier's Pirates!* (2004 PC) mechanics audit

## Why this audit exists

The reference game feels simple because it presents a small vocabulary across
many activities, not because the underlying simulation is empty. Our biggest
risk is adding visible logistics, diplomacy, or role-playing systems that bury
the fast loop the player remembers. This audit separates the original's
player-facing rules from its hidden machinery.

Primary reference: the patched 2004 PC version. Platform-specific motion
controls and later mobile simplifications are out of scope.

## Source hierarchy

1. **Official:** [PC game manual hosted by Steam](https://cdn.steamstatic.com/steam/apps/3920/manuals/manual.pdf?t=1568748025).
2. **Contemporary:** [GameSpot review](https://www.gamespot.com/reviews/sid-meiers-pirates-review/1900-6114066/),
   [prototype design diary](https://www.gamespot.com/articles/sid-meiers-pirates-designer-diary-4/1100-6109151/),
   and [realism design diary](https://www.gamespot.com/articles/sid-meiers-pirates-designer-diary-2/1100-6102516/).
3. **Observed detail:** [Wolfwood's PC mechanics guide](https://gamefaqs.gamespot.com/pc/915017-sid-meiers-pirates/faqs/34143).
4. **Designer context:** [2004 Sid Meier interview, republished in 2024](https://spillhistorie.no/2024/04/24/interview-with-sid-meier-from-2004/).

Exact formulas from a player guide are useful forensic evidence, not an
authoritative specification. We preserve the shape of the decision and create
our own independently tuned values.

## The original loop

The recurring loop was:

> choose a lead → sail with the wind → identify a ship or port → trade, fight,
> or talk → gain gold, rank, crew, maps, specialists, or social access → repair
> and provision → pursue the next lead → periodically divide the plunder.

No one activity needed to support the whole game. Sailing connected short
bursts of trade, gunnery, fencing, dancing, treasure search, and conversation.
Failure normally cost time, resources, position, or opportunity rather than
ending the campaign. This made the game forgiving without making decisions
meaningless.

## What the player actually managed

| Surface | Original behaviour | Complexity lesson for us |
| --- | --- | --- |
| Time | Calendar advances while sailing and during major actions; age gradually reduces physical performance | One calendar, one aging condition; do not add fatigue schedules |
| Gold | Trade, prizes, rewards, and treasure feed a shared haul | Keep gold legible; avoid loans, currencies, and upkeep invoices |
| Provisions | A single cargo category, translated into **months remaining** for the current crew | Preserve this exact readable presentation |
| Crew | Needed to sail and fight; a large unhappy crew consumes provisions and pressures the captain to divide loot | Show crew count plus one morale word |
| Morale | A documented/observed five-step state: Very Happy, Happy, Content, Unhappy, Mutinous | Keep the state; hide the full formula |
| Fleet | Up to eight captured ships, one active flagship | Fleet management is welcome complexity because ships are the fantasy |
| Damage | Hull, sail, crew, and cannon losses affect the battle and the prize | Damage should change tactics, not just reduce a health bar |
| Standing | Separate national relationships, letters of marque, ranks, and promotions | Keep four separate standings but label legality before an attack |
| Fame | Career achievements roll into final score and retirement | One Legacy score with a readable breakdown |

### Morale audit

Yes, morale was in the original. The observed model reacts to time since the
last division of plunder, crew size relative to accumulated loot, difficulty,
and crew-related advantages. The interface does not ask the player to optimize
those terms individually. It says how the crew feels, then lets provisions,
loot, victories, and the decision to divide shares carry the meaning.

**Our rule:** show one of five states and short causal hints such as “share is
growing thin” or “victory has lifted the crew.” Never expose a morale equation,
daily ration slider, wage ledger, or separate loyalty/fatigue/hunger meters.

### Provisions audit

Provisions were in the original and were intentionally broad. Consumption was
primarily a crew-and-time pressure. The key UI was the conversion from cargo
units to estimated duration.

**Our rule:** store provision units internally, display “3.4 months,” warn at
one month, and let ports replenish with one action. Water, spoilage, disease,
food types, and ration policies stay out of the first production release.

## Sailing and the Caribbean map

The player directly steered on a compressed Caribbean map. Wind made headings
matter, land constrained routes, visible traffic created opportunities, and
named ports provided anchors. The map was not a click-to-fast-travel menu.

Observed world traffic included merchants, treasure or payroll vessels,
military ships, raiders, pirates, immigrant and provision ships, governors,
invasions, and pirate hunters. Ships were both opportunities and news about
the world. Cities could change wealth or nationality because traffic arrived,
was intercepted, or attacked.

**Preserve:** tactile heading choice, persistent wind direction, visible ship
roles, fast identification, and one-sentence consequences.

**Do not preserve literally:** exact city list, map art, encounter values,
traffic spawn probabilities, route graph, or original text.

## Ports

The port interface was a stable activity hub rather than a free-roaming city.
Its functional menu included:

- Governor: rank, letters of marque, national missions, introductions.
- Tavern: recruit, hear a lead, meet specialists or named contacts.
- Merchant: buy and sell cargo.
- Shipwright: repair, sell, and upgrade ships.
- Divide the plunder: settle the voyage and reset crew pressure.
- Status/log: review leads, maps, standing, and career progress.
- Sail away.

The wording and presentation changed by context, but the verbs stayed
predictable. That predictability is a major part of the remembered simplicity.

**Our translation:** Governor's House, Tavern, Market, Shipyard, Divide Shares,
Captain's Log, and Set Sail. A compact 3D port diorama supplies atmosphere;
the menu supplies function. No walking to vendors.

## Trading

The original used a short commodity list, port-specific prices, limited cargo
space, and events or specialists that affected value. Trading was a reason to
notice geography and fill spare hold capacity, not a standalone spreadsheet.

**Our translation:** six categories—provisions; tools and common goods;
luxuries; sugar and molasses; tobacco and dyewood; powder and arms. Prices show
both the number and a qualitative cue: Cheap, Fair, or Expensive. Cannon stays
separate because it is also a ship fitting. No crafting, warehouse, futures,
tax declaration, or multi-currency economy.

## Ships and fleet management

The original shipped a large roster (27 observed variants) arranged into
families. Each ship traded off speed, turning, best point of sail, capacity,
minimum/maximum crew, cannon capacity, and durability. Captured vessels could
join a fleet of up to eight, and the player selected a flagship.

Ship management supported:

- changing and renaming the flagship;
- inspecting speed, turning, capacity, crew and gun ranges;
- moving cargo, cannon, and crew;
- selling or abandoning ships;
- repairing hull and sails;
- installing discrete upgrades; and
- deciding whether a captured vessel was worth slowing the fleet.

Observed upgrade effects covered tighter turns, higher speed, more crew,
stronger hull, longer range, and better gunnery, plus ammunition capability.

**Our initial fittings:** Careened Hull, Fine Canvas, Expanded Berths,
Reinforced Timbers, Fine-Grain Powder, Matched Guns, and ammunition lockers for
round, chain, and grape shot. Names and numerical balance are original.

**Design inference:** start production with six distinct ship classes, not 27.
Variants can follow only when silhouette, role, and economic choice justify
them.

## Naval combat

The original naval battle was a real-time arena with simple steering, sail
control, broadside timing, wind, terrain or shoals, three ammunition choices,
damage, surrender, escape, sinking, and boarding. The player normally focused
on one enemy even when the strategic encounter represented a fleet.

The memorable tactical triangle was:

- **Round shot:** reliable hull and cannon damage.
- **Chain shot:** tears sails, lets a faster ship control range or force a
  boarding approach.
- **Grape shot:** reduces crew and prepares a favourable boarding action.

Broadside firing made orientation itself the aiming mechanic. The player read
wind, closure, reload, enemy bow, and which side was loaded without using a
complex reticle.

**Our translation:** deterministic 2D physics at sea level, rendered with 3D
heel, pitch, roll, recoil, wake, splashes, smoke, cloth, and damage. Controls:
turn, full/reefed sail, port/starboard fire, and ammunition select. Target
length 2–4 minutes. Higher difficulty improves AI use of wind, range, and
ammunition instead of inflating health.

## Boarding and sword fighting

The original used paired, readable fencing moves rather than freeform action
combat. Crew advantage and naval preparation mattered before the duel. Attacks
and counters pushed a combatant through space toward surrender; the presentation
showed a fight around the principals without making the player command troops.

**Our translation:** thrust/parry, slash/jump, chop/duck, and taunt; choose a
rapier, cutlass, or longsword before the fight. Position is the main state—no
health bar, stamina meter, skill tree, combo notation, or loot rarity. Target
30–60 seconds, with timing and input assists.

## Social play, missions, and treasure

Governors, relatives, tavern contacts, and romantic interests supplied rank,
introductions, rumours, criminals, rival pirates, maps, gifts, and relationship
progress. The famous dance scene was one expression of courtship, not the
underlying progression itself.

**Our translation:** Acquainted → Friendly → Close → Devoted, advanced through
visits, favours, gifts, and a few meaningful choices. Candidates are inclusive
and have compact authored stories. Dancing is explicitly deferred.

Rumours stay plain and actionable: a named target, place, direction, or recent
event appears in the log. Treasure maps use two or three fragments and clear
coastline/landmark clues, followed by a focused landing search rather than a
survival map.

## Dividing shares and retirement

The original division of plunder was a structural reset, not a decorative
score screen. The observed PC rule sells all but one chosen ship, adds the sale
value to the haul, pays the captain a difficulty-dependent percentage, pays and
dismisses the crew, advances about seven months, and lets the player recruit a
small fresh crew or retire. It resolves morale pressure and turns a long career
into distinct voyages.

**Our rule:** retain that shape exactly. Values and prose are independently
tuned. The screen must warn clearly which ship will be kept and what will be
sold before confirmation.

## Simplicity audit: what not to add

| Tempting layer | Why it harms this game now | Where the depth belongs instead |
| --- | --- | --- |
| Water, food types, spoilage | Turns one elegant voyage clock into chores | Better port prices and route risk |
| Crew salaries, job assignments | Makes every capture an accounting session | Specialists as passive named bonuses |
| Faction influence currency | Duplicates standing and rank | Clear legal status per action |
| Character XP tree | Competes with ship progression | One starting talent, specialists, aging |
| Port ownership/buildings | Converts a roaming career into management | Consequential conquest and reconquest |
| Open-world port walking | Travel time between the good decisions | Small diorama plus stable port menu |
| Tactical land army mode | A second full game before the first is proven | Harbor fight plus commandant duel |
| Complex rumour graph | Hides the next adventure behind bookkeeping | One-line leads in a sortable log |

## Independent-expression boundary

Game rules and high-level ideas can inspire an original game, while exact
creative expression cannot. The United States Copyright Office's
[games guidance](https://www.copyright.gov/register/tx-games.html) distinguishes
the idea/method of play from protectable text and artwork. This is a product
boundary, not legal advice.

We will not reuse the title, logos, character names, story, dialogue, city
descriptions, interface composition, icons, maps, music, sound, animations,
models, textures, numeric tables, source code, or marketing language of the
2004 game. All content and assets are independently authored, and third-party
inputs require a source-and-license ledger.
