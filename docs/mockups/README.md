# Mockups

The mockup shelf: one round per pitch in `rounds/YYYYMMDD-<topic>/`, approved
screens in `screens/`, and a generated `index.html` that lists every round
with its status, question and pick. Never hand-edit the index; it is rebuilt
from each round's `README.md` front matter.

```
npm install
npm start          # http://localhost:4330, live reload, rebuilds the index
npm run index      # rebuild index.html only
npm run shots      # headless screenshots of open rounds into shots/
```

The scripts live in `.shelf/` (see `.shelf/VERSION`). The pick page template
is in `.shelf/pick-template/`.

`AGENTS.md` requires big visual changes to be pitched as mockups first, with
about three labelled options, and built only after the family picks. A round
keeps the options, the choice and what was set aside.

## What goes in a round

- `README.md`: front matter (`title`, `question`, `status` open, picked,
  built or parked, `picked`, `tested_with`, `date`), then the requirement,
  each option, which one was picked and why, and where it ended up.
- The page, opening directly from disk. Link screenshots with relative paths
  (`../../../screenshots/foo.png`); an absolute `file:///Users/...` path stops
  working as soon as the file moves.
- Any images the page needs, beside the page.
- Rounds are not edited after the pick. Names: `YYYYMMDD-<topic>` in kebab
  case, no `-v2` suffixes.

## Two rules

- **Build the pitch from real components.** Render the production components
  behind an opt-in prop, Today beside Proposed, as a `preview-*.html` harness
  built only under `BUILD_HARNESS=1`. Generated art tends to drift from the
  product and shifts the review onto details that were never in question.
- **Write the pitch for whoever opens the folder next.** A note addressed to
  one agent in one session is out of date as soon as that session ends.
