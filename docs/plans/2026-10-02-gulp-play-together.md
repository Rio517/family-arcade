# Gulp Universe: play together

**Product direction:** several people play the same Gulp Universe round, each
on their own device, in the same city, against each other and the computer
holes. They join through the party's *Play together*. The first version is two
iPads on the same home Wi-Fi; three or four devices come after that.

**Recommendation:** the host's device runs the round. Each guest builds the
same city from the round's seed, steers its own hole on its own screen (as
Rainbow Racer does), and reports where the hole is. The host decides
everything else: what is eaten, scores, computer holes, police, attacks,
power-ups, rebuilding and the clock. It sends every guest the holes' state
plus an ordered list of what happened, 20 times a second.

Status: decided 2026-10-02 (see Decisions). Building.

## Current state

### Devices: two, everywhere

The party and peer layers connect exactly two devices.

- `GameConnection` holds a single channel (`src/shared/net/peer.ts:82`). It
  sends only on that channel (`peer.ts:126-132`) and refuses a second live
  connection as a stranger (`peer.ts:155-171`). When the channel closes, the
  guest redials and the host waits (`peer.ts:274-282`). Channels are reliable
  and ordered (`peer.ts:14-18`). NAT traversal uses STUN only
  (`peer.ts:73-78`).
- The party is one presence link with one friend. `theirName` holds a single
  name (`src/shared/party/PartyContext.tsx:47`) and is set by that friend's
  `hello` (`PartyContext.tsx:207-208`). `openTable` tells the one guest
  (`PartyContext.tsx:313-326`). The remembered party is one code and one role
  (`party.ts:16-22`), and the party door knows one `friend`
  (`usePartyDoor.ts:19-24`).
- Voice and video are one call (`src/shared/net/media.ts:42`).
- The written scope says the same thing. ADR 0003 connects "the two devices"
  (`docs/adr/0003-serverless-peer-to-peer-multiplayer.md:13`), and the players
  design says "Parties stay two devices. Every online game is two-player"
  (`docs/ideas/players-and-party.md:290-291`).
- Gulp is listed as one player (`src/games/gulp/index.ts:16-17`).

Three or four devices need four changes. The host must accept several guests
in a star, where each guest links only to the host. The party must hold a list
of members. Every guest must hear the table. Each guest needs a seat token so
a reconnect gets its own hole back. Guest code stays as it is: a guest still
dials one host. Phase 3 below covers this.

### How Rainbow Racer syncs in real time

| Question | Racer today |
|---|---|
| Who decides what | Each device flies its own kart. The host owns coins, stars, scores, power tiers and the finish (`src/games/racer/net/protocol.ts:4-8`, `domain/race.ts:8-17`). |
| What is sent | `pos` (x, y, z, heading, speed) both ways (`protocol.ts:50-59`). The host also sends a full `world` snapshot at race start and on every channel open, then `worldDelta` messages with only what changed (`protocol.ts:10-16`, `components/Track3D.tsx:99-104`, `net/useRacerNet.ts:125-128`). |
| Rates | `pos` about 20 times a second (`Track3D.tsx:130-135`). World deltas at most every 80 ms when something changed, plus a 1 s keep-alive (`race.ts:55-58`, `race.ts:371-377`). |
| Smoothing | The other kart eases toward its last reported spot, `k = 1 - 0.001^dt` (`race.ts:273-285`). There is no buffer and no extrapolation. |
| Validation | `isRacerMsg` is the single choke point. It checks types, finite numbers, a 64-item array cap and the winner index (`protocol.ts:81-84`, `protocol.ts:138-177`). The guest's reported position is trusted with no speed or bounds check (`protocol.ts:155-156`). The host ignores world claims from the guest (`useRacerNet.ts:155-166`). |
| Drops | The HUD shows a reconnect note (`Track3D.tsx:222-223`). The guest redials. On reopen both sides say `hello`. A guest that says `inRace` gets a world snapshot and the race carries on; a fresh guest gets a new start (`useRacerNet.ts:132-143`). There is no timeout and no forfeit. |
| Computer racers | None in a two-device race (`race.ts:196`). |
| Encoding | PeerJS's default, BinaryPack (`node_modules/peerjs/dist/bundler.mjs:1465-1468`). Whole numbers pack small. Any fractional number packs as a 9-byte double (`peerjs-js-binarypack/dist/binarypack.mjs:254`). Messages over 16,300 bytes are split into chunks. |

Gulp can reuse the racer's patterns for its hook shape, its hello/start/resync
handshake, its single validation choke point, and local steering with host
authority over everything else.

### What a Gulp round holds

The rules are pure and take `rng` (`src/games/gulp/domain/world.ts:8-10`).
The renderer reads the `World` and plays the events it is handed
(`three/scene.ts`, `sync`). It already draws from any hole's point of view,
through its `follow` index, so a guest's screen can follow its own hole.

| State | Size late in a round | Who changes it | How a guest gets it |
|---|---|---|---|
| City layout | 2,870 (Town) to 9,955 (Region) things | Nobody after the start | Built from the seed and the dealt wonders |
| Holes (position, size, score, lives, timers) | 5 to 9 | Every frame | Each tick, all holes |
| Eaten things | Up to about 9,500 of the city by the end | Host | `eat` / `crumb` events, by id |
| Rebuilt things and parked police cars | Up to about 600 new things | Host (`rebuild.ts`, `police.ts`) | `rebuild` / `park` events with the full new thing |
| Regrown small things | 7.5 a second at most (`rebuild.ts:15-16`) | Host | `regrow` events, by id |
| People and dogs | 209 to 435 | Walk every frame; eaten and returned by the host | Walked locally on the guest; `eat` and `back` events from the host |
| Police | 4 at a time at most (`police.ts:36-43`) | Host | Each tick |
| Attacks (tanker, bomber, tanks, helicopters, shells) | A few units | Host | Each tick, plus `boom` / `incoming` / `hurt` events |
| Power-ups | 2 at most (`powerups.ts:22`) | Host | Each tick |
| Clock and status | 1 | Host | Each tick |
| Building lots and the regrow queue | Host only | Host | Not sent; the guest never rebuilds |

Every guest can build the identical city. `createWorld` builds the city first
from the round's `rng` (`world.ts:144`). In a headless run, the same seed
produced the same city and the same people every time. There are two catches.
The game passes `Math.random` today (`components/GulpPage.tsx:103`), so a
shared round needs `seededRng(seed)`. The round's wonders come from a deck
stored on each device (`storage/settings.ts:61-68`), so the host must send the
dealt list instead of each device dealing its own.

### Is the simulation deterministic enough for lockstep?

No. These are the measured results:

- Same seed, fixed 1/60 s steps and the same inputs: identical after 60 s,
  on one JavaScript engine.
- The same 60 s stepped at 60 Hz on one device and 120 Hz on another: the
  holes end up as far as 351 units apart, with different scores and a
  different set of things standing. The game steps by the real frame gap,
  between 0 and 50 ms (`components/GulpStage.tsx:168-169`). On fast screens it
  holds to 60 frames a second (`GulpStage.tsx:161-168`). Two devices therefore
  take different steps.
- One random stream drives the computer holes, rebuilding, people, police and
  attacks (`world.ts:110`), so one difference spreads to everything.
- `Math.exp`, `Math.pow`, `Math.hypot` and `Math.atan2` are not required to
  give bit-identical results across browser engines. The arcade runs on
  Safari (JavaScriptCore) and Chrome (V8).

A host-authoritative round avoids all of these.

### Message sizes and rates

These counts come from headless rounds of the real rules (Node 20, Apple M4).
A bot steered the child the way the rival brain does, at skill 0.6, as in
`domain/testing.ts` `play`. The rounds ran at 60 steps a second, with power-ups,
fight-back and rebuilding on and Medium difficulty. Events were counted in
50 ms windows, one window per tick. Byte figures apply this plan's encoding,
quantised whole numbers, to the measured counts. They estimate the payload;
no encoder exists yet.

| Round | Events a second (median / 99th pct / max) | Most events in one tick | Tick size, typical | Largest tick |
|---|---|---|---|---|
| Town, 5 holes, 3 min, child reaches level 11 | 24 / 48 / 55 | 10 | about 170 B | about 250 B |
| Megalopolis, 7 holes, 5 min, level 17 | 38 / 101 / 109 | 13 | about 240 B | about 330 B |
| Region, 9 holes, 6 min, level 20 | 50 / 167 / 202 | 19 | about 310 B | about 460 B |
| Megalopolis, child made a level-20 giant at 60 s | 27 / 241 / 544 | 428 | about 240 B | about 3 KB (about 8 KB as JSON) |
| Region, same giant | 34 / 227 / 455 | 403 | about 300 B | about 2.8 KB |

- The Region round's events were 10,955 eats, 4,133 rebuilds, 1,871 crumbs,
  1,747 regrows and 452 people eaten.
- Sustained traffic is 5 to 8 KB a second for each guest. Home Wi-Fi carries
  several megabytes a second, so bandwidth is not a constraint.
- The constraint is bursts on the single reliable, ordered channel. A giant
  swallowing a block produces about 400 events in one tick. That tick is still
  well under one 16 KB chunk.
- Sending the whole city instead of the seed would cost 370 KB (Town) to
  1.3 MB (Region) of JSON per round.
- A guest rejoining a late Region round needs to know which of about 10,000
  city things still stand: a 1.25 KB bitset. It also needs up to 600 added
  things at about 26 B each, plus holes and people. That totals about 20 KB.
  As naive JSON with a list of eaten ids it is 50 to 80 KB.
- A guest sends its own position and steering 20 times a second: about 25 B
  each time.

### Performance evidence

Nothing has been measured on an iPad or in WebKit. Frame time on the iPad is
listed as future work (`docs/ideas/gulp-levels-and-unlocks.md:145`). These
facts are known:

- **The sim step is cheap.** `stepWorld` took a median of 0.10 ms, a 99th
  percentile of 0.24 ms and a maximum of 0.5 ms for a 9-hole Region round. The
  worst single step in any run was 0.9 ms (Megalopolis). That is Node on an M4.
  An iPad CPU three to four times slower still leaves the sim near 1 ms of a
  16.7 ms frame.
- **Rendering sets the frame rate late in a round.** A Chrome trace of a
  level-17 round had the graphics process busy 92% of the time. The game's own
  JavaScript took about 6 ms a frame
  (`docs/mockups/rounds/20261001-far-models/README.md:3-8`).
- **Chromium with a 4x CPU throttle**, the stand-in for an older iPad
  (`scripts/perf-gulp.mjs:160-162`), at level 20: p50 22.4 ms, p95 34.8 ms,
  no frames over 50 ms (commit 3e33aa9). The budget is p95 45 ms throttled and
  25 ms unthrottled (`scripts/perf-gulp.mjs:236-237`). The script runs by hand;
  it is not a CI gate.
- Other measured steps: level-17 Region on a Mac, typical frame 10.3 ms and no
  frames over 33 ms in 40 s (b66acc4). Half-eaten Megalopolis, 1.05M
  triangles and about 365 draws a frame (d41b393). `three/perf.test.ts` guards
  triangle counts per map without timing.

The host's added work is small next to its own rendering: encoding about
300 B 20 times a second, reading a guest's position 20 times a second, and
running one fewer computer brain for each human seat. A guest renders the
same city as a solo player, so its cost is the solo cost. The open risk is the
host's render frame on the oldest iPad that will host. A hitch on the host
delays every guest's ticks. Phase 1 measures this before anything else.

## Architecture

### Roles

- **Host:** runs the one real `World` with `stepWorld`. It steers its own hole
  from its own input and places each guest's hole where the guest reported it,
  with a speed clamp. Then it runs eating, scoring, computer holes, police,
  attacks, power-ups, rebuilding, people and the clock.
- **Guest:** keeps a mirror `World`, built from the seed. It moves its own hole
  locally with the same `move()` the rules use (`world.ts:296-324`, exported).
  That move uses the host's word on size, speed boost and stun. The guest eases
  other holes toward their latest reported state, as the racer does
  (`race.ts:273-285`). It applies the host's events to its props, people and
  holes, and hands the same `WorldEvent`s to the unchanged scene, so things
  fall, rise and explode on both screens.
- **Seats:** the host is seat 0. Guests take seats 1 to 3. Computer holes take
  the seats after them.

### Starting a round

1. The host and guest share a lobby (below). The host sends `start` with the
   seed, map, difficulty, length, the three switches, the dealt wonders and
   the seat list (names, colours, human or computer).
2. Every device calls `createWorld(seededRng(seed), …)` with the same seat
   list, so the random stream is used in the same order. Each device shows the
   existing "building the city" card (`GulpStage.tsx:187-189`).
3. Each guest sends `ready`. The host starts the 3-2-1 when every guest is
   ready, or after 20 s; a guest that is not ready by then joins when it is.

### On the wire

The racer's hook shape applies: `src/games/gulp/net/useGulpNet.ts` wraps a
`GameConnection` with the prefix `gulp-v1-`. Fast-changing data lands in refs,
not React state.

| Message | Direction | When | Contents |
|---|---|---|---|
| `hello` | both | each channel open | name, colour, seat token, `inRound` |
| `lobby` | host to guest | each settings change | map, difficulty, length, switches, seats |
| `pick` | guest to host | colour change | colour |
| `start` | host to guest | round start | seed, options, wonders, seats, your seat |
| `ready` | guest to host | city built | none |
| `pos` | guest to host | 20 a second | seq, x, z, vx, vz, input x, input z |
| `tick` | host to guest | 20 a second | seq, elapsed, status, every hole, power-ups, police, attacks, the events since the last tick, and once a second a checksum of standing things |
| `snapshot` | host to guest | channel reopen, rejoin, checksum mismatch | standing bitset, added things, holes, people, power-ups, police, attacks, clock |
| `over` | host to guest | round end | final standings |
| `again` | guest to host | results card | none |

- Numbers travel as whole numbers. Positions are in hundredths of a unit and
  timers in tenths of a second. BinaryPack packs a fraction as a 9-byte double.
- Events travel as short tuples. `eat`, `crumb` and `regrow` refer to a thing
  by id. `rebuild` and `park` carry the new thing's id, kind, variant,
  position, turn and height scale, and `makeProp` fills in the rest
  (`domain/catalog.ts:361-383`). People eaten use their own ids, which start at
  1,000,000 (`people.ts:47`). Police swallowed use negative ids
  (`police.ts:55`, `police.ts:88`). The mirror keeps every thing it has ever
  seen by id, so a regrown thing comes back as the same object.
- A guest can tell when its own hole was swallowed and came back: the host
  counts the hole's respawns. When that count changes, the guest snaps its
  hole to the host's position instead of easing it.
- `isGulpMsg` is the single choke point. It accepts at most 12 holes and at
  most 2,000 events per tick. Every number must be finite, every id a whole
  number, every kind a known kind and every seat in range. The host clamps a
  guest's reported move to that hole's top speed (`growth.ts` `speedOf`, with
  power-ups) and keeps it on land. The host ignores any world claim a guest
  sends.

### People on the guest

People walk set loops (`people.ts:155-227`). Streaming 435 positions 20 times
a second would cost more than everything else combined. The guest walks them
locally with eating and returning turned off. The host's `eat` event removes a
person, and a `back` event (id, block, place on the loop) returns one, because
the host picks the return spot with the round's random stream
(`people.ts:229-247`). A person can flee a little differently on each screen.
That is visible only up close and does not affect scores.

### Domain changes for several children

Today's rules assume one child. These places change, and with one child each
behaves as it does now:

| Rule | Today | Change |
|---|---|---|
| Round setup | one `player` (`world.ts:142-166`); park start for that child (`world.ts:208-218`) | a list of children, each with its own start park on Easy and Medium |
| Steering | one `input` (`world.ts:221`, `world.ts:255`) | one input per child; guest holes placed from reports, skipping `move()` |
| Round end | the one child out of lives, or every rival out (`world.ts:262-278`) | every child out, or every computer hole out; time as now |
| Police | follow the one child; one shared count (`world.ts:280`, `police.ts:36-43`, `holes.ts:179`) | a count for each child; officers stand round the child who called them |
| Power-ups | placed near the child (`powerups.ts:34`) | near a randomly chosen child |
| Rebuilding | nearest lot to the child (`rebuild.ts:237`) | nearest to each child in turn |
| Rival kindness | measured against the child (`rivals.ts:77-86`); hunting and food rules (`rivals.ts:179`, `rivals.ts:214`) | measured against the trailing child; the same rules apply to every child |
| Easy protection | computer holes never swallow the child (`holes.ts:202-204`) | also covers child against child (open decision 1) |
| Feedback and results | "me" is hole 0 (`components/feedback.ts:46`, `GulpPage.tsx:214`) | "me" is this device's seat; `hudOf` already takes a seat (`components/round.ts:111`) |

The solo rules and their balance tests stay green. The rival brain's balance
simulations in `rivals.test.ts` guard the solo feel.

### Drops and rejoin

- **A guest's link drops:** the guest's HUD says it is reconnecting and the
  guest redials (`peer.ts:274-282`). On the host, that hole stops where it was
  and cannot be swallowed while it waits. After 20 s a computer brain steers it
  so the round stays lively, and the brain hands it back when the guest
  returns. On reopen the guest says `hello` with `inRound` and its seat token,
  and gets a `snapshot`. That is the racer's resync with a bigger payload.
- **The host's link drops:** guests freeze on the last tick and show "Waiting
  for {host}". The host cannot be replaced: only the host holds the computer
  holes' brains, the lots and the regrow queue. If the host does not return
  within 60 s, the guest gets a results card with the last standings and the
  note "The round ended early".
- **The host's screen sleeps or the app is put away:** the round pauses for
  everyone, because the host's frame loop is the round's clock. A screen wake
  lock during a shared round makes this rarer. Guests show the same waiting
  card.
- **Checksum:** once a second the tick carries the number of standing things
  and a sum of their ids. A mismatch makes the guest ask for a `snapshot`. This
  catches mirror bugs in the family's hands as well as in tests.

## Alternatives considered

**Lockstep.** Every device runs the full round and only inputs travel. The
messages are the smallest possible. The round's steps depend on frame timing,
one random stream drives everything, and math functions can differ between
browser engines (all measured or cited above). Lockstep would need a
fixed-step loop with render interpolation and an input delay for every player.
The slowest device would set the pace for all. A resync path would still be
needed for drops, and a desync is invisible until the cities disagree.
Rejected.

**Host steers every hole from guest input.** The guest sends only its stick.
The host moves all holes, and the guest draws what the host says. This is the
simplest and most consistent option. Steering would wait a round trip plus a
tick, about 70 to 120 ms on home Wi-Fi, on top of the hole's own easing
(`world.ts:303-306`). The racer moves locally for this reason
(`protocol.ts:4-5`). Kept as the fallback: `pos` carries the stick too, so the
host can switch a guest to input mode without a protocol change.

**Separate rounds from one seed.** Each device plays its own round and only
scores travel. It is cheap, but the cities disagree at the first bite, so it
is not a shared round.

**A relay or game server.** A server would allow play between homes and more
players, and would take load off the host iPad. ADR 0003 rules out a server
to run and pay for. Out of scope.

**Every device linked to every other (a mesh).** This is unnecessary because
the host is the authority. A star gives each guest one link.

**Stream the whole world.** The city alone is 0.37 to 1.3 MB of JSON. The seed
plus events covers it in kilobytes.

## Product flow

- **Joining:** the two devices are in a party (PartyBar, *Play together*).
  The host opens Gulp Universe. The menu shows *Play Gulp with {friend}*,
  which calls `party.openTable('gulp')`. The guest's pill lights up with
  *{host} opened Gulp Universe*; one tap opens Gulp, and `usePartyDoor` seats
  them. Both screens then show a shared lobby. A guest who opens Gulp first
  knocks, and the host's pill says so, as in the racer
  (`racer/components/RacerSetup.tsx:137-220`). Without a party, Gulp is solo
  exactly as now.
- **Seats and computer holes:** people take computer seats, so each map keeps
  today's number of holes: Town 5, City 6, Megalopolis 7, Region 9
  (`domain/city.ts:39-43`). The city stays as busy as it is tuned to be, and
  the host runs one fewer brain for each person.
- **Map and difficulty:** the host picks the map, difficulty, length and the
  three switches on today's menu. The guest's lobby shows the host's choices
  as they change and lets the guest pick a colour. A colour already taken goes
  to the next free one among the 10 skins.
- **During the round:** a shared round cannot be paused. The pause button
  opens *Keep going* and *Leave round*, and the host also gets *End round* in
  an endless round. The scoreboard shows every hole, children and computer, as
  now. Every child's hole wears its name (`three/holeView.ts:387`).
- **Results:** every device shows the same standings, from the host's final
  tick. The *Your round* tiles come from this device's hole. The host's
  *Play again* starts a new round for everyone with a new seed. The guest's
  *Play again* asks the host, as the racer's rematch does
  (`useRacerNet.ts:167-170`).
- **Someone drops:** see *Drops and rejoin*. Only seats that were in the round
  at the start can rejoin it. A newcomer waits for the next round.
- **Scores and points:** each device records only its own ticket, as the
  racer does (`docs/ideas/players-and-party.md:258-276`). The round goes into
  that device's family board (`storage/scores.ts:27`) with an optional
  `together` flag, which shows a small badge. `recordResultFor` credits a win
  when that hole finished first among all holes, with the friends' names as
  the opponent. The text is "Computer holes" today (`GulpPage.tsx:244-251`).

## Phases

The days below are focused working days for one developer with agents,
including tests and review. Each phase is playable when it ships.

### Phase 1: two iPads, one shared round (about 9 days, three PRs)

The smallest version the family can play: two devices on the same Wi-Fi, a
full round on any map and difficulty, a link blip that resumes, and results
on both screens.

1. **Baseline (half a day).** Add a development-only frame-time readout,
   showing frame ms and sim ms, and record late-game Megalopolis and Region on
   the oldest iPad that will host. This is the number Phase 1 must not make
   worse.
2. **Several children in one round (2 days, PR 1a).** Files:
   `domain/world.ts`, `holes.ts`, `police.ts`, `powerups.ts`, `rebuild.ts`,
   `rivals.ts`, `people.ts` (cosmetic walking), and their tests. Make every
   change in the table above. Write the tests first: two children in one
   round; police for the second child; Easy protection between children;
   standings; a reported-position hole clamped to its top speed. The existing
   suites stay unchanged and green.
3. **Wire and mirror (2.5 days, PR 1b).** Files: `src/games/gulp/net/protocol.ts`
   (messages, `isGulpMsg`), `net/codec.ts` (quantise and pack),
   `domain/mirror.ts` (build from `start`, apply `tick`, `snapshot` and events,
   and return `WorldEvent`s with real things). The key test is replay
   equivalence. Run a seeded three-minute round with two children and a
   level-20 giant, encode every tick, and decode it into a mirror. At every
   tick the mirror's standing ids, holes, people alive, power-ups, police and
   attacks must match the host's. The largest encoded tick must stay under
   16 KB. A second test drops a range of ticks, applies a `snapshot`, and
   checks the mirror matches again.
4. **The hook and the screens (3 days, PR 1c).** Files:
   `net/useGulpNet.ts` (+ tests with a mocked `GameConnection`, as the chess
   integration tests do), `GulpPage.tsx`, `GulpStage.tsx` (solo and host step
   the world; a guest steps the mirror), `GulpMenu.tsx` (lobby states),
   `GulpHud.tsx` (reconnect note), `feedback.ts` (this device's seat),
   `storage/scores.ts` (`together`), `index.ts` (players 1 to 2, facts). Wire
   up the lobby, start, ready, pos, tick and snapshot on reopen. Then add
   *Leave round*, the shared results and the credits.
5. **On two iPads (1 day).** Play a Megalopolis Medium round with fight-back,
   then a long Region round as a stress run. Compare host frame time with the
   baseline. Check that steering and eating feel right on the guest.

### Phase 2: two devices, finished (about 4 to 5 days)

- A computer brain takes over a guest's hole after 20 s away and hands it
  back on return.
- The host-left waiting card and the early-ended results.
- *Play again* from either side, and *End round* in endless rounds.
- A screen wake lock on the host during a shared round.
- Screenshot states for the lobby, the waiting card and the shared results,
  using the party-states gallery pattern.
- Adjust only if the Phase 1 device test asks for it:
  - Show the guest's own small bites at once, before the host confirms.
  - Pack the holes block of the tick as one `ArrayBuffer` if encoding shows
    in the host's frame.

### Phase 3: three or four devices (about 8 to 10 days)

- **Shared net (2 to 3 days):** a host side that accepts up to three guests,
  keyed by peer id. It sends to one guest or all, and reports opens and closes
  per guest. It turns away newcomers past the seat limit, and once a round has
  started it accepts only seat tokens it knows. Two-device games keep today's
  `GameConnection` unchanged. Tests use mocked PeerJS, as in `peer.test.ts`.
- **The party for several (3 to 4 days):** a member list with names relayed by
  the host, the table told to every guest, knocks from any guest, and a
  PartyBar that shows everyone. Voice and video stay a two-device call. A new
  ADR replaces the "two devices" scope in ADR 0008 and the players design.
- **Gulp for four (2 to 3 days):** seats 0 to 3, colours, start parks, the
  results list, a tick to each guest, and a test with three or four real
  devices. Host traffic is three times one guest's, about 20 KB a second.

## Risks

1. **The host iPad's late-game frame time is unmeasured.** Chromium with a 4x
   throttle runs p95 34.8 ms at level 20. On a slow host every guest's world
   lags, because ticks leave from the host's frame loop. Mitigation: the Phase 1
   baseline comes first, and the oldest iPad that fails it does not host.
2. **The mirror can drift from the host.** One missed event leaves a building
   standing on one screen that is gone on the other. Mitigation: the
   replay-equivalence test, the once-a-second checksum, and a snapshot on
   mismatch.
3. **Connectivity and the host's screen.** The round depends on the public
   PeerJS broker and STUN with no TURN relay (ADR 0003), so same Wi-Fi is the
   supported case. If the host's iPad locks or switches apps, the round stops
   for everyone. Mitigation: Phase 1 targets the same Wi-Fi; the wake lock and
   the waiting card come in Phase 2.
4. **Guest feel.** A guest's own bites land a tick or two after the hole
   covers them. Hole-against-hole calls use positions 50 to 100 ms old.
   Mitigation: the Phase 1 device test decides whether Phase 2 adds early
   bites; the input-only mode is the fallback.
5. **Solo balance.** The kindness, police and rebuild changes touch tuned
   rules. Mitigation: with one child each rule behaves as now, and the
   existing balance tests stay unchanged.

## Decisions

1. **Children can swallow each other on Medium and Hard, never on Easy.**
   This extends today's Easy rule, where computer holes never swallow the
   child.
2. **Up to four devices.** Phase 3 is part of the build, not a later choice.
   The shared host for several guests is built alongside Phase 1, so the
   Gulp protocol and screens are made for four seats from the start, and two
   devices are the first thing tested.
3. **The arcade only.** `src/games/gulp/net` stays free of party imports
   except the lobby, so a code-entry door can be added later for the
   standalone release.
