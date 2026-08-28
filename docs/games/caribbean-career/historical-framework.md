# Historical framework: Caribbean, 1655–1720

## Intent

Historical texture should make routes, loyalties, ports, and ships easier to
understand. It should not turn human suffering into an optimization resource
or claim documentary precision for a compressed adventure game.

The world is inspired by real geography and chronology. Captains, relationship
stories, rivals, treasure trails, most local incidents, and exact economic
values are fictional. News cards distinguish fixed history from campaign
consequences.

## Three chapters

### 1. Frontier war and buccaneering, 1655–1671

England's seizure of Jamaica in 1655 makes the western Caribbean a volatile
frontier. European powers hold islands and ports unevenly, private violence is
often tolerated, and governors use raiders while denying responsibility.

Game texture: lightly defended settlements, commissions matter, small sloops
and barques dominate early careers, Spanish shipping is tempting but dangerous,
and Port Royal grows as a base for trade and privateering.

### 2. Trade, smuggling, and imperial consolidation, 1671–1697

Peace settlements do not end illicit trade or violence, but official tolerance
for buccaneers changes. Plantation trade grows, navies and fortified ports
matter more, and private captains navigate a narrower gap between commission,
smuggling, and piracy. The 1692 earthquake transforms Port Royal.

Game texture: richer convoys, more patrols, sharper legal consequences, port
prosperity swings, and a fixed historical news event that changes Port Royal's
services and visual state without erasing player progress.

### 3. War, privateering, and suppression, 1702–1720

The War of the Spanish Succession renews commissioned raiding. After the war,
unemployed mariners and privateers contribute to the period popularly called
the Golden Age of Piracy, while governments coordinate more aggressively
against pirates.

Game texture: larger armed merchants, wartime letters of marque, valuable
targets, then stronger pirate hunters and fewer legal refuges. A Legend career
can span the transition; shorter careers use one chapter at higher density.

## Powers and legal status

The strategic layer tracks Spain, England/Britain, France, and the Dutch
Republic. Each has an independent standing and current war/peace relationships.
Before hostile action, the UI states one of:

- **Commissioned:** covered by the player's current authority against a wartime
  enemy.
- **Illegal:** an act of piracy or unauthorized aggression with a predictable
  standing consequence.
- **Friendly fire:** aggression against the issuing power or an ally, with a
  severe warning.

The distinction reflects the historical importance of commissions without
simulating prize courts, insurance, customs declarations, or paperwork. The
[Library of Congress overview of pirates, privateers, and maritime law](https://blogs.loc.gov/law/2020/05/pirates-privateers-and-civil-war-maritime-laws/)
is the baseline reference.

## Ports and settlements

Production should begin with roughly 16–20 major ports plus smaller pirate,
Maroon, Indigenous, and mission settlements. Real locations use documented
names and approximate positions; their buildings, residents, dialogue, and
services are original abstractions.

Each location exposes only four strategic facts:

- controller;
- prosperity: Struggling, Modest, Thriving, or Rich;
- defense: Open, Guarded, Fortified, or Formidable; and
- current opportunities: market, shipyard stock, recruits, and leads.

Simulation events can change these states. The player receives a single useful
sentence—“A provision convoy reached Curaçao; food is cheap”—rather than the
underlying economy ledger.

Port Royal deserves a designed historical arc. UNESCO's
[archaeological ensemble nomination](https://whc.unesco.org/en/list/1595/)
provides an authoritative orientation; it should not be used to romanticize
the city as only a pirate playground.

## Trade and labour boundary

Maritime trade connected food, timber, manufactured goods, arms, luxury goods,
and plantation commodities. It also depended centrally on the violent
exploitation and forced movement of enslaved people. A light adventure game
cannot honestly reproduce that economy by quietly turning people into cargo.

Therefore:

- people are never commodities, inventory units, market modifiers, or “rescue
  cargo”;
- the transatlantic slave trade is not a profitable player activity;
- sugar, molasses, tobacco, and dyewood descriptions acknowledge coerced labour
  where relevant without graphically exploiting it;
- humanitarian or resistance stories focus on people with names, agency, and
  consequences, not collectible virtue points;
- Maroon communities are autonomous political actors, not generic wilderness
  bandits; and
- Indigenous Caribbean people are living communities and legacies, not ruins
  that exist to award treasure.

The [Smithsonian Caribbean Indigenous Legacies Project](https://global.si.edu/success-stories/caribbean-indigenous-legacies-project-celebrating-taino-culture)
is an orientation source. Narrative work involving specific communities needs
additional expert or sensitivity review before release.

## Wind, weather, and geography

Persistent easterly trade winds are the map's main physical rule. The
[NOAA explanation of trade winds](https://oceanservice.noaa.gov/facts/tradewinds.html)
supports a simplified prevailing east-to-west flow with local and seasonal
variation. This makes westbound passages easier, eastbound passages tactical,
and island lee sides meaningful without a meteorology simulation.

Player-facing weather states stay compact: Clear, Fresh, Squall, and Storm.
Weather affects visibility, wind strength, sail risk, and encounter escape.
Hurricanes can exist as rare chapter events after the core loop is proven; no
barometer, sail-by-sail rigging, or storm survival meters.

The map keeps recognizable island relationships but compresses distance so a
useful decision occurs every 30–60 seconds. Coastlines are simplified for
navigation and performance, never copied from the reference game's map.

## Ships, weapons, and readable authenticity

Ship identity is based on role and silhouette, not museum-perfect rigging.
Initial candidates:

| Class | Career role | Readable silhouette |
| --- | --- | --- |
| Canoe / periagua | Local scout, special encounters | Very low narrow hull, paddles or small sail |
| Sloop | Fast hunter and starter | One mast, fore-and-aft sail, long bowsprit |
| Barque / barca longa | Light trader or raider | Small versatile rig, fuller hold |
| Brigantine | Balanced armed trader | Two masts, more square canvas |
| Frigate | Fast warship and late-career flagship | Long low gun deck, three-mast rhythm |
| Galleon / large merchantman | Rich slow target | High stern, deep belly, heavy battery |

The POC sloop is an art-pipeline standard, not a claim that one rig represents
every decade. Its form language draws on late-seventeenth/early-eighteenth
century small sailing craft: a fine shallow hull, one mast, gaff-like mainsail,
headsail, bowsprit, working deck, stern tiller, and a few light carriage guns.
The final model pass requires references from a maritime museum or documented
reconstruction and records intentional simplifications.

Cannon use round shot against hull and guns, chain shot against rigging and
canvas, and grape at close range against crew. The Queen Anne's Revenge project
provides useful primary archaeological context for
[ship history](https://www.qaronline.org/history/ships-journey) and
[cannon](https://www.qaronline.org/blog/2018-04-01/artifact-month-cannon).
Numbers and damage curves remain original game balance.

## People and roles

The roster should reflect the region's mixed populations without making every
character a modern spokesperson. Women and men can captain, trade, govern,
fight, navigate, heal, and form relationships. Specific historical figures may
appear only when the story can handle the evidence and uncertainty; fictional
characters are the default.

Anne Bonny and Mary Read demonstrate that women at sea are not inherently an
anachronism, while surviving records are fragmentary and sensationalized. The
[Library of Congress account of Anne Bonny's life and trial](https://blogs.loc.gov/law/2024/07/the-life-and-trial-of-anne-bonny/)
is a useful warning against converting legend into confident biography.

## History content pipeline

Every historical event, location, faction description, ship label, and public
figure receives:

1. a source link and access date;
2. a confidence label: documented, disputed, or invented/composite;
3. a note explaining compression or divergence;
4. representation review where affected communities are central; and
5. a gameplay justification—history that does not improve understanding or
   consequence does not enter as trivia.

Recommended foundational reading includes the Library of Congress
[Golden Age of Piracy guide](https://guides.loc.gov/golden-age-of-piracy),
[Buccaneers of America primary text](https://www.loc.gov/item/02017956/),
the National Park Service overview of
[maritime trade](https://www.nps.gov/articles/maritimehistory.htm), and the BnF
guide to [French Caribbean geopolitics](https://heritage.bnf.fr/france-ameriques/en/geopolitics-french-caribbean-1635-1789).
