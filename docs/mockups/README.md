# Mockups

One folder per pitch, named `YYYYMMDD-<topic>/`. Each folder holds the
write-up, the HTML page the family looked at, and any images the page needs.

`CLAUDE.md` requires big visual changes to be pitched as mockups first, with
about three labelled options, and built only after the family picks. The
pitches are kept here so a later session can see the options, the choice, and
what was set aside.

| Pitch | Asked for | Outcome |
|-------|-----------|---------|
| [20260830-game-previews](./20260830-game-previews/) | A way to sell a game before anyone signs in | **B, poster strip** — shipped |
| [20260831-party-ui](./20260831-party-ui/) | Visual design is fine; the UX needs work | 6 of 10 shipped in [#145](https://github.com/Rio517/family-arcade/pull/145) |
| [20261001-far-models](./20261001-far-models/) | Smooth late-game play; simpler buildings from high up, shown before they go in | Detailed models stay; the simpler ones looked less friendly in play |
| [20261001-gulp-hud-depth](./20261001-gulp-hud-depth/) | Gulp's round controls look flat; give them depth | D, Coin-op: built |
| [20261002-gulp-play-together](./20261002-gulp-play-together/) | How up to four children join and play one Gulp round, each on their own device | Pending |

## What goes in a pitch folder

- `README.md` — the requirement, each option, which one was picked and why,
  and where it ended up. Record the outcome when it lands.
- `<name>.html` — the page. It should open directly from disk. Link
  screenshots with relative paths (`../../screenshots/foo.png`); an absolute
  `file:///Users/...` path stops working as soon as the file moves.
- Any images the page needs, beside the page.

## Two rules

- **Build the pitch from real components.** Render the production components
  behind an opt-in prop, Today beside Proposed, as a `preview-*.html` harness
  built only under `BUILD_HARNESS=1`. Generated art tends to drift from the
  product and shifts the review onto details that were never in question.
- **Write the pitch for whoever opens the folder next.** A note addressed to
  one agent in one session is out of date as soon as that session ends.
