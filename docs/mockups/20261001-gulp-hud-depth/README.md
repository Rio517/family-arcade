# Gulp Universe: controls with depth

**Product direction:** the controls over a round should look like pieces of
the toy city they float over. Today they are flat: single-colour pills, dark
glass or plain white, with no light on them and one hard shadow at most. The
city under them is chunky, rounded and glossy.

**What stays:** where every piece sits, its size, its words, the colours that
carry meaning (the player's row and Pause in yellow, the first place's gold
badge), the 14px text floor and a visible keyboard focus ring. Each option
changes how the pieces are made.

## The options

- **A, Toy plastic.** Moulded pieces lit from above: a glossy highlight
  across the top, a darker lip underneath and a soft shadow on the city.
  Buttons press down onto their lip. Name tags and the speech bubble are
  plastic too, and points become block numbers with a side and a shine. Pause
  has a slow shine that is off under reduced motion.
- **B, Sticker.** Die-cut stickers: a thick white edge, a soft shadow that
  lifts each piece off the city, a faint paper grain and a vinyl sheen. The
  player's row, the clock, the level badge and Pause sit at a slight tilt.
  Name tags, the bubble and points get the same white edge.
- **C, Arcade.** Cabinet panels: dark bevels with an orange trim, amber
  numbers that glow, a 70s sunset ring round the clock, domed push-buttons
  for sound and Pause, an LED level meter and the map on a little CRT. Name
  tags become small neon signs in each hole's colour. It matches the
  arcade's landing page.

## What each costs

All three are CSS and canvas drawing. `GulpHud.tsx` and the other components
need no change, and the layout stays as it is.

| | `gulp.css` | `canvasTextures.ts` | `effects.ts` | Other |
|---|---|---|---|---|
| A | A light layer and a lip on every piece; the Pause shine behind `prefers-reduced-motion` | Tag: gradient, lip, highlight. Bubble: lip instead of an outline | Points: a coloured side and a shine | — |
| B | White edge, shadow, grain as an inline SVG, three tilts | A white edge round the tag and bubble | A white edge round the points | `holeView.ts`: the label sprites grow a little to fit the edge |
| C | Panels, push-buttons, LED meter, CRT map: the most CSS of the three | Neon tag: coloured outline and glow | Striped sunset fill on the points | — |

For every option:

- **Play together** is the shared Party control. It changes only inside
  Gulp, through a `body:has(.gulp-root) .party-pill` rule in `gulp.css`, the
  way `risk.css` restyles it for the Risk table.
- **Explore** shows only on the development server; it is styled in
  `gulp.css` like everything else.
- The pieces not on the page take the same look in the same change: banners,
  breaking news, power-up cards, the combo, danger pointers, the countdown,
  the edge warning, and the pause and results cards.
- Shadows and glows painted on a canvas need the WebKit check (shots with
  `engines: ['chromium', 'webkit']`), since WebKit drops colour where canvas
  alpha is 0. C's neon tags lean on this most.
- B puts white text on the player's tag. Light hole colours (Lemon, Sky,
  Mint) need dark text there.

**On a phone** the level pill overlaps the right end of the leaderboard's
second and third rows today. All three options keep that layout, so the
overlap stays; moving the level pill on phones is a separate change.

## The page

[hud-depth.html](./hud-depth.html) opens from disk. Pick a look (Current, A,
B, C; keys 1 to 4, arrows to step) and a screen (iPad 1180×820, laptop
1920×1080, phone 430×932), one at a time or all four side by side. Each frame
is scaled to fit and says by how much. **Up close** shows every piece at its
iPad size over the city, with the buttons pressed and with keyboard focus,
and the name tags, speech bubbles and points in each look.

The game frames are captures of a City round with the controls and name tags
hidden. The controls over them are HTML rebuilt from `gulp.css`, and the
in-city labels are HTML copies of the canvas drawings, sized to match.
[today-ipad.webp](./today-ipad.webp) is the same moment with the game's own
controls, for checking Current against. The "Sign in" chip in that picture
is the development toolbar, which is not part of the game.

## Outcome

Pending.
