# Mockups

One folder per pitch: `YYYYMMDD-<topic>/`, holding everything that pitch was
made of — the write-up, the HTML page the family actually looked at, and any
images it needs.

`CLAUDE.md` says big visual changes are pitched as mockups first, ~3 labelled
options, built only after the family picks. This is where those pitches live
afterwards, so a later session can see what was offered, what was chosen, and
what was rejected — without digging through a conversation.

| Pitch | Asked for | Outcome |
|-------|-----------|---------|
| [20260830-game-previews](./20260830-game-previews/) | A way to sell a game before anyone signs in | **B, poster strip** — shipped |
| [20260831-party-ui](./20260831-party-ui/) | "Design is ok, but UX could be improved" | 6 of 10 shipped in [#145](https://github.com/Rio517/family-arcade/pull/145) |

## The shape of a pitch folder

- `README.md` — what was asked for, what each option was, what the family
  picked and why, where it ended up. Write the outcome in when it lands; a
  pitch with no recorded outcome is the thing this folder exists to prevent.
- `<name>.html` — the page itself. Open it straight off disk. Reference
  screenshots as **relative** paths (`../../screenshots/foo.png`) — an
  absolute `file:///Users/...` path breaks for everyone including a later you.
- Images the pitch generates or needs, beside the page.

Two rules learned the hard way:

- **Real components beat drawn ones.** The strongest review page renders the
  actual production components behind an opt-in prop (Today beside Proposed),
  built only under `BUILD_HARNESS=1` as a `preview-*.html` harness. Generated
  art drifts from the product — see 20260831-party-ui for what that cost.
- **Don't leave a pitch as a private handoff note.** Notes addressed to a
  specific agent ("read this before you start") go stale the moment that
  session ends. Write the pitch for whoever opens the folder next.
