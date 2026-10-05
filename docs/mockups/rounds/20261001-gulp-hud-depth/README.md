---
title: Gulp controls with depth
question: Gulp's round controls look flat; how do we give them depth?
status: built
picked: D
tested_with: family
date: '2026-10-01'
---
# Gulp Universe: controls with depth

**Product direction:** the controls over a round should look like pieces of
the toy city they float over, and the pieces that stay up all round should
take as little of the screen as they can. Today the controls are flat:
single-colour pills, dark glass or plain white, with no light on them and one
hard shadow at most.

**What every option does:**

- **Less room for the permanent pieces.** The leaderboard becomes one tray
  with slim rows, 220 px wide instead of 250 and about a third less area
  on an iPad. The clock, level, buttons and map keep today's size.
- **No star or hole counters.** The results card still counts wonders and
  holes swallowed.
- **Points for swallowing a hole.** Swallowing a hole already scores 10
  points plus a quarter of the swallowed hole's size, twice that with double
  points. Nothing shows it today: the banner says "You swallowed Nom Nom!"
  and the points go on the score unseen. Every option adds the points to
  that banner ("+25 points" in the pictures) and gold points rising over
  the hole.
- **A clear top row on phones.** Today the level pill overlaps the right
  end of the leaderboard's second and third rows. The narrower tray and a
  shorter level meter clear it.

**What stays:** where every piece sits, its words, the colours that carry
meaning (the player's row and Pause in yellow, gold for first place, green
for good news), the 14px text floor and a visible keyboard focus ring.

## The options

- **A, Toy plastic.** Moulded pieces lit from above: a glossy highlight, a
  darker lip underneath and a soft shadow on the city. The leaderboard tray
  is tinted see-through plastic with the player's row as a yellow key.
  Buttons press down onto their lip. Points become block numbers with a side
  and a shine. Pause has a slow shine that is off under reduced motion.
- **B, Sticker.** Die-cut stickers: a thick white edge, a soft shadow that
  lifts each piece off the city, a faint paper grain and a vinyl sheen. The
  player's row, the clock, the level badge and Pause sit at a slight tilt.
- **C, Arcade.** A light arcade cabinet: cream laminate with a thin orange
  trim, burnt-orange numbers, a slim 70s sunset ring round the clock, domed
  push-buttons, an LED level meter and the map on a little CRT. Name tags are
  retro signs with an orange offset shadow.
- **D, Coin-op.** A happy arcade with thin edges. Cream pieces with a thin
  ink outline and a small hard drop. A rainbow marquee stripe tops the
  leaderboard, and the top three ranks are gold, silver and bronze coins.
  The clock is a red marquee sign ringed with bulbs that flash, and the
  swallow banner is a purple one. The level meter is a rainbow of LED
  segments, sound and Pause are round arcade buttons, and the hint carries a
  joystick. Digits are pixel-style (Press Start 2P, a 1 KB digits-only
  subset) and words are a chunky rounded Japanese font (M PLUS Rounded 1c
  Black, a 7 KB Latin subset), both bundled so the PWA stays offline. The bulbs stay lit, without flashing,
  under reduced motion.

## What each costs

All four are CSS and canvas drawing for the look; D also bundles two small fonts and a joystick icon. The layout and the
components stay, apart from the counters `GulpHud.tsx` stops rendering.

| | `gulp.css` | `canvasTextures.ts` | `effects.ts` | Other |
|---|---|---|---|---|
| A | A light layer and a lip on every piece; the Pause shine behind `prefers-reduced-motion` | Tag: gradient, lip, highlight. Bubble: lip instead of an outline | Points: a coloured side and a shine | — |
| B | White edge, shadow, grain as an inline SVG, three tilts | A white edge round the tag and bubble | A white edge round the points | `holeView.ts`: the label sprites grow a little to fit the edge |
| C | Panels, push-buttons, LED meter, CRT map | Sign tag with an offset shadow | Striped sunset fill on the points | — |
| D | Marquee stripe and bulbs (flashing behind `prefers-reduced-motion`), coins, LED meter, arcade buttons | Tag and bubble in the new font | Coin points in pixel digits | The two font files (OFL), loaded with `@font-face` inside Gulp only; a joystick icon in `icons.tsx` |

The changes every option shares:

- The tray, the narrower phone layout and the dropped counters are
  `gulp.css` and `GulpHud.tsx`.
- Points for swallowing a hole are game code, needed whichever look is
  picked: the swallow event carries what it scored (`domain/holes.ts`), the
  banner gains the points line (`components/feedback.ts`, `GulpHud.tsx`),
  and the points rise over the hole (`three/scene.ts`).
- **Play together** is the shared Party control. It changes only inside
  Gulp, through a `body:has(.gulp-root) .party-pill` rule in `gulp.css`, the
  way `risk.css` restyles it for the Risk table.
- **Explore** shows only on the development server and is styled in
  `gulp.css`.
- The pieces not on the page take the same look in the same change: the
  other banners, breaking news, power-up cards, the combo, danger pointers,
  the countdown, the edge warning, and the pause and results cards.
- Shadows and glows painted on a canvas need the WebKit check (shots with
  `engines: ['chromium', 'webkit']`), since WebKit drops colour where canvas
  alpha is 0.
- B puts white text on the player's tag. Light hole colours (Lemon, Sky,
  Mint) need dark text there.

## The page

[hud-depth.html](./hud-depth.html) opens from disk. Pick a look (Current, A
to D; keys 1 to 5, arrows to step) and a screen (iPad 1180×820, laptop
1920×1080, phone 430×932), one at a time or all side by side. Each frame is
scaled to fit and says by how much. **Up close** shows every piece at its
iPad size over the city, with the buttons pressed and with keyboard focus,
the swallow banner, and the name tags, speech bubbles and points in each
look.

The game frames are captures of a City round with the controls and name tags
hidden. The controls over them are HTML rebuilt from `gulp.css`, and the
in-city labels are HTML copies of the canvas drawings, sized to match.
[today-ipad.webp](./today-ipad.webp) is the same moment with the game's own
controls, for checking Current against. The "Sign in" chip in that picture
is the development toolbar, which is not part of the game.

## Outcome

**Chosen: D, Coin-op**, with the clock and level digits centred and no
coins beside the points. It is built in the game together with the changes
every option shares. Two details differ from the page:

- The game bundles a fuller subset of the word font (Latin letters with
  accents and common punctuation, 17 KB) so every name and message draws in
  it. The digits font is renamed Gulp Pixel, as the licence asks of a
  modified copy of Press Start 2P.
- The swallow banner wins the banner spot over the level-up a swallow often
  brings; the level badge shows the new level anyway.
