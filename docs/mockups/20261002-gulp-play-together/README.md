# Gulp Universe: joining a round together

**Product direction:** up to four children play one Gulp Universe round, each
on their own iPad or phone. The host opens the lobby, the others join it, and
everyone ends on one results card. The way into the round has to be clear to a
child who has never done it, on a phone and on an iPad.

**What every option does:**

- **Two ways in.** Devices already linked by the arcade's *Play together*
  party get a nudge on their pill when the host opens Gulp, and one tap opens
  the same game. For three or four devices, Gulp has a *Join with a code* door:
  the host's lobby shows its 4-letter code large and the others type it in.
- **Code letters.** A code is four letters, never I, L or O, so nothing reads
  like a 1 or a 0.
- **The host decides the round.** The host picks the map, time and difficulty
  as the menu does today. The lobby shows the code, seats 1 to 4 filling with
  names and colours, the settings, and *Start*, which stays off until someone
  has joined.
- **Colours.** Each child picks a colour. A taken colour goes to the next free
  one, and the guest is told so.
- **Seats come from the computer holes.** Each map keeps its number of holes
  (Town 5, City 6, Megalopolis 7, Region 9). Every child who joins takes a
  computer hole's place, and the lobby says how many computer holes are left.
- **Guests read, hosts change.** A guest sees the host's settings as they
  change but cannot change them.
- **A shared round cannot be paused.** *Pause* opens *Keep going* and *Leave
  round*, and the host of an endless round also gets *End round*.
- **Dropped links.** A guest whose link drops sees *Reconnecting…* and the hole
  waits where it is. If the host drops, guests see *Waiting for {host}* with
  the time left before the round ends and the scores appear.
- **Results.** One card shows every child's standing among all the holes, the
  computer holes included, and this device's own *Your round* tiles. The host's
  *Play again* starts a new round for everyone; a guest's asks the host.

**What stays:** the Coin-op look chosen in
[20261001-gulp-hud-depth](../20261001-gulp-hud-depth/) (cream pieces with a
thin ink edge, the rainbow stripe, pixel digits, arcade buttons), the bundled
fonts, text of 14px or more, visible keyboard focus, and solo play as it is.
The pictures show the menu in that look too; the menu is not restyled in the
build yet.

## The options

- **A, Panel in the menu card.** *Play together* is a strip inside today's menu
  card with two buttons, *Open a lobby* and *Join with a code*. Each lobby
  replaces the card's contents: the code, four seat rows, the settings and
  *Start*. Joining types the code with the device's own keyboard into four big
  tiles. A guest's lobby has the colour picker and a note about the colour
  swap. The results are today's results card with every hole listed.
- **B, Player select (1P to 4P).** The menu's *PLAY* becomes *1 PLAYER* and
  *2–4 PLAYERS*, with a small *Have a code? Join* button. The lobby is a
  full-screen arcade player select under a red marquee sign: four tall slots,
  1P to 4P, that say *INSERT COIN* until someone joins and *READY!* after. Joining
  is a full-screen *INSERT CODE* with big letter keys the child taps (a
  hardware keyboard works too). A host-drop is a *WAITING FOR {HOST}* screen
  with pixel-digit seconds. The results are four slot cards with rank coins.
- **C, The map is the lobby.** The door is the *Play together* pill, which opens
  a small sheet with the same two buttons. The lobby is a small map of the
  city with four start parks. Each child's hole drops onto its park, wearing
  their name, as they join, and the computer holes sit in the gaps. Choosing a
  colour changes the hole on the map straight away. Joining spins four
  slot-machine letters (up and down buttons, or type). The host-drop card shows
  the host's hole asleep, and the results are a podium.

## What each costs

All three draw with CSS and inline SVG in the Coin-op look. They share the same
lobby behaviour, which comes from the play-together plan and does not depend on
the picture: the lobby, pick and start messages, seat tokens, the code, the
reconnect and host-drop handling, and the results with several children.

| | Components | `gulp.css` | Other |
|---|---|---|---|
| A | `GulpMenu.tsx` grows a lobby view (host, join, guest) rendered inside the card; a seat row | About 120 lines; seat rows and tiles, the rest reuses the menu's own segments and colour buttons | The smallest change. *PLAY* and solo play do not change. On a phone the host lobby fills the screen, so extra switches stay behind *More options*. |
| B | A new full-screen player-select component with slot and letter-key pieces; the menu's play row changes | About 300 lines | The largest change. Every solo player sees *1 PLAYER* instead of *PLAY*. It reads most like a cabinet. |
| C | A lobby view with a map and pins; a letter-reel entry; a podium results card; a sheet on the pill | About 220 lines | A small map picture for each of the four maps, and the start-park spots for each child from the game's rules (the plan defines them for Easy and Medium). Spinning four letters takes more taps than typing, so the keyboard stays as an alternative. |

The pieces the three options share: the *Reconnecting…* banner, the
*Waiting for {host}* card and the pause card are one HUD piece each, restyled
per option. Screenshot states for each lobby view follow the party-states
gallery pattern.

## The page

[play-together.html](./play-together.html) opens from disk. Pick an option
(buttons or keys 1 to 3) and a size (Fit, Large, Full size). Each option shows
the same nine pictures at iPad 1180×820 and phone 430×932:

1. Where *Play together* starts on the Gulp menu.
2. The host's lobby, with nobody there yet (Start off) and with friends joining.
3. *Join with a code*.
4. A guest waiting in the lobby, picking a colour.
5. In a round: a guest's link dropping, the host dropping, and the pause card.
6. The shared results.

In option B the letter keys type into the code. All buttons have visible
keyboard focus. The names, scores and codes in the pictures are examples. The
city behind the pictures is the pair of round captures from the HUD pitch
(`frame-ipad.webp`, `frame-phone.webp`); the fonts are the game's two bundled
fonts (`gulp-rounded.woff2`, `gulp-pixel.woff2`, licence in `OFL.txt`).

## Outcome

**Pending.** Not yet chosen.
