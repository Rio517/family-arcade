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
- **C, Arcade.** A light arcade cabinet: cream laminate with an orange trim,
  burnt-orange numbers, a 70s sunset ring round the clock and sunset stripes
  under the leaderboard and level, domed push-buttons, an LED level meter
  and the map on a little CRT. Name tags are retro signs with an orange
  offset shadow.
- **D, Mochi.** The soft East Asian look of pastel mobile games: puffy cream
  pieces with a soft inner shade and a diffuse shadow, a faint washi grain,
  sakura pink for the player's row, matcha green for the level, rank badges
  as red seal stamps, a cloud speech bubble and pastel points with a plum
  edge.

## What each costs

All four are CSS and canvas drawing for the look. The layout and the
components stay, apart from the counters `GulpHud.tsx` stops rendering.

| | `gulp.css` | `canvasTextures.ts` | `effects.ts` | Other |
|---|---|---|---|---|
| A | A light layer and a lip on every piece; the Pause shine behind `prefers-reduced-motion` | Tag: gradient, lip, highlight. Bubble: lip instead of an outline | Points: a coloured side and a shine | — |
| B | White edge, shadow, grain as an inline SVG, three tilts | A white edge round the tag and bubble | A white edge round the points | `holeView.ts`: the label sprites grow a little to fit the edge |
| C | Panels, stripes, push-buttons, LED meter, CRT map: the most CSS of the four | Sign tag with an offset shadow | Striped sunset fill on the points | — |
| D | Soft shading, washi grain as an inline SVG, seal badges | Cream tag, cloud bubble | Pastel fill with a plum edge | — |

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

Pending.
