# Gulp Universe: the round's HUD on a phone

**Requirement:** on a phone, every score in the leaderboard is readable, and
no piece of the HUD covers another, at the common phone widths (375, 393 and
430px) and with the longest likely names and scores.

**Today:** the phone tray is 140px wide and shares the top row with the clock,
the level meter, and the sound and pause buttons.

- At 375 and 393px wide, the clock and the level meter sit on top of the tray.
  In a real round on a 393px phone, the clock covers the scores from the start
  (`real-round-393.webp`).
- Score digits are square pixel glyphs, so "9,999" is 67.5px wide. The tray
  leaves 61px for the name and the score together. Every score of 1,000 or more
  is cut off at every difficulty, and Medium rounds end at about 4,000 to
  5,000. With the lives shown (Medium and Hard), three digits are cut off as
  well.
- At 375 and 393px, two power-ups running overlap the level meter.
- The iPad tray (220px) fits every case, and no option changes the iPad.

## Options

All three make the phone tray 200px wide, which fits "9,999" beside the rank
coin, a name of at least three letters, and the lives (or OUT). Each one moves a
different piece to make room.

- **A, clock on the right (recommended).** The tray stays top left. The clock,
  the level meter and the power-ups line up down the right side, under the
  buttons. The child's own rank and score stay in the corner they hold on every
  screen, and the round's time and power-ups share one column. The clock is no
  longer centred, while on iPad it is.
- **B, tray under the clock.** The clock and the level meter keep the middle of
  the top row, as on iPad. The tray drops about 90px, below them on the left,
  and the power-ups sit beside it on the right. The top row matches iPad, the
  tray sits a little closer to the hole, and the top left corner is empty.
- **C, tray at the bottom.** The top row holds the clock, the level meter and
  the buttons. The tray moves to the bottom left, level with the mini map, and
  the messages sit above both. The top is the calmest of the three. A thumb
  dragging near the bottom left covers the tray, and this is the biggest change
  from iPad. The tray clears the arcade's Play together button by 8px.

## How the options were checked

The pictures are a production build of the real HUD and 3D city
(`preview-gulp-hud.html`, built under `BUILD_HARNESS=1`). Each option is the
phone layout rules in `src/games/gulp/styles/phone-hud-options.css`, switched
on with `?o=a`, `b` or `c`. The round is held still with the longest likely
values: a rival named "Captain Crumbs" at 9,999, both power-ups running, and
the player fourth, so the tray shows its tallest version.

A script measured every piece at 375×812, 393×852 and 430×932 in Chromium and
WebKit. In both engines, today overlaps and cuts off scores at every width,
and A, B and C have no overlaps and no cut-off scores at any width.

## What it costs

About ten lines in the phone block of `gulp.css`, with no component changes.
The chosen option's rules move from the harness stylesheet into `gulp.css`, and
the harness stylesheet and the `?o=` switch go. A phone shot at 375 and 430
then checks that the pieces don't overlap and that the scores aren't cut off,
so the shot fails if a later change breaks the layout.

## The page

[phone-hud.html](./phone-hud.html) opens from disk. It shows today and the
three options side by side, and the width buttons switch all four pictures
between 375, 393 and 430. The names in the pictures are examples.

## Outcome

**Pending.** The family picks A, B or C.
